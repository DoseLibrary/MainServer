import type { DownloadStore } from './download-store.ts';

/** A title the device is holding, or trying to. */
export interface DownloadEntry {
  /** Grant id: also the file name in the store and the offline playback id. */
  id: string;
  mediaItemId: string;
  title: string;
  subtitle?: string;
  profile: 'sd' | 'hd';
  status: 'queued' | 'preparing' | 'downloading' | 'ready' | 'paused' | 'failed';
  estimatedBytes: number;
  bytesTotal?: number;
  bytesDone: number;
  expiresAt: string;
  error?: string;
  /** Position in the queue; a season keeps its broadcast order. */
  order: number;
}

/** Persistence is injected so the queue can be tested without IndexedDB. */
export interface DownloadMetaStore {
  all(): Promise<DownloadEntry[]>;
  put(entry: DownloadEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface DownloadTransport {
  /** Current server-side state of a grant. */
  status(id: string): Promise<{ status: 'preparing' | 'ready' | 'claimed' | 'failed'; sizeBytes: number | null; error?: string | null }>;
  /** Bytes from `from` onwards; the server answers with a range. */
  fetchFrom(id: string, from: number): Promise<{ chunk: Uint8Array; total: number }>;
  /** Tell the server the device has everything, so it can drop its copy. */
  complete(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
}

export class QuotaExceededError extends Error {}

const PREPARE_POLL_MS = 3_000;

/**
 * Runs downloads one at a time.
 *
 * One transfer at a time is deliberate: phones gain nothing from parallel
 * downloads, and a single stream keeps the server's encode queue honest. The
 * queue survives the app being killed because every state change is persisted
 * and the resume offset is read back from the file itself.
 */
export class DownloadQueue {
  private inflight?: Promise<void>;
  private stopped = false;
  /** Ids dropped while a transfer was mid-flight; their writes are discarded. */
  private readonly forgotten = new Set<string>();
  private listeners = new Set<(entries: DownloadEntry[]) => void>();

  constructor(
    private readonly store: DownloadStore,
    private readonly meta: DownloadMetaStore,
    private readonly transport: DownloadTransport,
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  subscribe(listener: (entries: DownloadEntry[]) => void): () => void {
    this.listeners.add(listener);
    void this.entries().then((entries) => listener(entries));
    return () => { this.listeners.delete(listener); };
  }

  private async announce(): Promise<void> {
    const entries = await this.entries();
    for (const listener of this.listeners) listener(entries);
  }

  /** Everything the device is holding or working on, in queue order. */
  async entries(): Promise<DownloadEntry[]> {
    return (await this.meta.all()).sort((a, b) => a.order - b.order);
  }

  /** Add titles, keeping the order they were given (a season stays in order). */
  async enqueue(items: Array<Omit<DownloadEntry, 'status' | 'bytesDone' | 'order'>>): Promise<void> {
    const existing = await this.entries();
    let order = existing.length > 0 ? Math.max(...existing.map((entry) => entry.order)) + 1 : 0;
    for (const item of items) {
      await this.meta.put({ ...item, status: 'queued', bytesDone: await this.store.size(item.id), order: order++ });
    }
    await this.announce();
    void this.run().catch(() => undefined);
  }

  async pause(id: string): Promise<void> {
    const entry = (await this.entries()).find((candidate) => candidate.id === id);
    if (!entry || entry.status === 'ready') return;
    await this.meta.put({ ...entry, status: 'paused' });
    await this.announce();
  }

  async resume(id: string): Promise<void> {
    const entry = (await this.entries()).find((candidate) => candidate.id === id);
    if (!entry || entry.status === 'ready') return;
    await this.meta.put({ ...entry, status: 'queued', error: undefined });
    await this.announce();
    void this.run().catch(() => undefined);
  }

  /** Remove a download and its bytes, and tell the server to forget the grant. */
  async remove(id: string): Promise<void> {
    this.forgotten.add(id);
    await this.store.remove(id);
    await this.meta.remove(id);
    await this.transport.cancel(id).catch(() => undefined);
    await this.announce();
  }

  /**
   * Drop anything past its expiry. Runs on open, needs no connection, and
   * reports how many went so the screen can say so plainly.
   */
  async pruneExpired(now = Date.now()): Promise<DownloadEntry[]> {
    const expired = (await this.entries()).filter((entry) => new Date(entry.expiresAt).getTime() <= now);
    for (const entry of expired) {
      this.forgotten.add(entry.id);
      await this.store.remove(entry.id);
      await this.meta.remove(entry.id);
    }
    if (expired.length > 0) await this.announce();
    return expired;
  }

  /**
   * Reconcile with what the device actually holds. A browser under storage
   * pressure evicts files without asking; an entry whose bytes have vanished is
   * reported rather than left looking playable.
   */
  async reconcile(): Promise<DownloadEntry[]> {
    const evicted: DownloadEntry[] = [];
    for (const entry of await this.entries()) {
      const size = await this.store.size(entry.id);
      if (entry.status === 'ready' && size === 0) {
        await this.meta.remove(entry.id);
        evicted.push(entry);
      } else if (size !== entry.bytesDone) {
        await this.meta.put({ ...entry, bytesDone: size });
      }
    }
    if (evicted.length > 0) await this.announce();
    return evicted;
  }

  /** Stop after the current chunk; used when the app goes away. */
  stop(): void { this.stopped = true; }

  /**
   * Work the queue until nothing can progress, and hand back the same promise
   * to anyone who asks while that is happening — so awaiting `run()` always
   * means "tell me when this has settled".
   */
  run(): Promise<void> {
    if (!this.inflight) {
      this.stopped = false;
      this.inflight = this.loop().finally(() => { this.inflight = undefined; });
    }
    return this.inflight;
  }

  /**
   * One pass per round over everything actionable, in queue order. A round that
   * moves no bytes means every remaining entry is waiting on a server-side
   * encode, so the loop ends rather than spinning; the screen calls `run()`
   * again on its poll.
   */
  private async loop(): Promise<void> {
    for (;;) {
      if (this.stopped) return;
      const actionable = (await this.entries()).filter((entry) =>
        entry.status === 'queued' || entry.status === 'preparing' || entry.status === 'downloading');
      if (actionable.length === 0) return;

      let progressed = false;
      for (const entry of actionable) {
        if (this.stopped) return;
        progressed = (await this.advance(entry)) || progressed;
      }
      if (!progressed) return;
    }
  }

  /** Returns whether this entry moved: bytes written, or a settled outcome. */
  private async advance(stale: DownloadEntry): Promise<boolean> {
    // Re-read before acting: the entry may have been paused or removed while an
    // earlier transfer was in flight, and a stale copy must not resurrect it.
    const entry = (await this.entries()).find((candidate) => candidate.id === stale.id);
    if (!entry || this.forgotten.has(stale.id)) return true;
    if (entry.status === 'paused') return false;

    const save = async (next: DownloadEntry) => {
      if (this.forgotten.has(next.id)) return;
      const still = (await this.entries()).find((candidate) => candidate.id === next.id);
      if (!still || still.status === 'paused') return;
      await this.meta.put(next);
      await this.announce();
    };

    try {
      const state = await this.transport.status(entry.id);
      if (state.status === 'failed') {
        await save({ ...entry, status: 'failed', error: state.error ?? 'The server could not prepare this download' });
        return true;
      }
      if (state.status === 'preparing') {
        // The encode is still running; wait rather than hammering the server.
        if (entry.status !== 'preparing') await save({ ...entry, status: 'preparing' });
        await this.wait(PREPARE_POLL_MS);
        return false;
      }
      if (state.status === 'claimed' && (await this.store.size(entry.id)) === 0) {
        // The server has let go and the device has nothing: the copy is gone.
        await save({ ...entry, status: 'failed', error: 'This download is no longer available' });
        return true;
      }

      const from = await this.store.size(entry.id);
      const total = state.sizeBytes ?? entry.bytesTotal ?? 0;
      if (total > 0 && from >= total) {
        await this.transport.complete(entry.id).catch(() => undefined);
        await save({ ...entry, status: 'ready', bytesDone: from, bytesTotal: total });
        return true;
      }

      const { chunk, total: reported } = await this.transport.fetchFrom(entry.id, from);
      if (this.forgotten.has(entry.id)) return true;
      await this.store.append(entry.id, chunk);
      await save({ ...entry, status: 'downloading', bytesDone: from + chunk.byteLength, bytesTotal: reported });
      return chunk.byteLength > 0;
    } catch (cause) {
      const quota = cause instanceof Error && /quota|storage/i.test(cause.message);
      await save({
        ...entry,
        status: quota ? 'paused' : 'failed',
        error: quota ? 'There is not enough space left on this device' : (cause instanceof Error ? cause.message : 'Download failed'),
      });
      if (quota) throw new QuotaExceededError('Out of device storage');
      return true;
    }
  }
}
