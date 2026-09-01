/**
 * Where downloaded files live on the device.
 *
 * The Origin Private File System holds the bytes; this wraps it in the four
 * operations a download needs. Resume asks the file how big it is rather than
 * trusting a counter, so a crash mid-write cannot leave the two disagreeing.
 *
 * The interface exists because jsdom has no OPFS: tests use the in-memory
 * implementation below and exercise the same call sequence the browser does.
 */
export interface DownloadStore {
  /** Bytes already stored for this id; 0 when nothing is stored. */
  size(id: string): Promise<number>;
  /** Append to the end of the file, creating it when absent. */
  append(id: string, chunk: Uint8Array): Promise<void>;
  /** A byte range, for the service worker to answer video requests with. */
  readRange(id: string, start: number, end: number): Promise<Uint8Array>;
  remove(id: string): Promise<void>;
  list(): Promise<string[]>;
}

export interface StorageBudget {
  usedBytes: number;
  availableBytes: number;
  /** True when the browser promised not to evict this origin under pressure. */
  persisted: boolean;
}

const FILE_SUFFIX = '.mp4';

/** OPFS-backed store. Requires a browser; construct only behind a support check. */
export class OpfsDownloadStore implements DownloadStore {
  private async dir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('downloads', { create: true });
  }

  private async file(id: string, create: boolean): Promise<FileSystemFileHandle | null> {
    try { return await (await this.dir()).getFileHandle(`${id}${FILE_SUFFIX}`, { create }); }
    catch { return null; }
  }

  async size(id: string): Promise<number> {
    const handle = await this.file(id, false);
    if (!handle) return 0;
    return (await handle.getFile()).size;
  }

  async append(id: string, chunk: Uint8Array): Promise<void> {
    const handle = await this.file(id, true);
    if (!handle) throw new Error('Could not open the download file');
    // Keeping the write stream open across chunks would risk losing everything
    // buffered if the tab dies; appending per chunk trades a little speed for
    // a file that is always as long as it claims to be.
    const size = (await handle.getFile()).size;
    const writable = await handle.createWritable({ keepExistingData: true });
    await writable.write({ type: 'write', position: size, data: chunk } as unknown as FileSystemWriteChunkType);
    await writable.close();
  }

  async readRange(id: string, start: number, end: number): Promise<Uint8Array> {
    const handle = await this.file(id, false);
    if (!handle) throw new Error('No such download');
    const file = await handle.getFile();
    return new Uint8Array(await file.slice(start, end + 1).arrayBuffer());
  }

  async remove(id: string): Promise<void> {
    try { await (await this.dir()).removeEntry(`${id}${FILE_SUFFIX}`); } catch { /* already gone */ }
  }

  async list(): Promise<string[]> {
    const ids: string[] = [];
    const dir = await this.dir() as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
    for await (const name of dir.keys()) {
      if (name.endsWith(FILE_SUFFIX)) ids.push(name.slice(0, -FILE_SUFFIX.length));
    }
    return ids;
  }
}

/** Test double with the same semantics, including append-at-current-size. */
export class MemoryDownloadStore implements DownloadStore {
  private readonly files = new Map<string, Uint8Array>();

  async size(id: string): Promise<number> { return this.files.get(id)?.byteLength ?? 0; }

  async append(id: string, chunk: Uint8Array): Promise<void> {
    const existing = this.files.get(id) ?? new Uint8Array(0);
    const next = new Uint8Array(existing.byteLength + chunk.byteLength);
    next.set(existing);
    next.set(chunk, existing.byteLength);
    this.files.set(id, next);
  }

  async readRange(id: string, start: number, end: number): Promise<Uint8Array> {
    const file = this.files.get(id);
    if (!file) throw new Error('No such download');
    return file.slice(start, end + 1);
  }

  async remove(id: string): Promise<void> { this.files.delete(id); }
  async list(): Promise<string[]> { return [...this.files.keys()]; }
}

/** Whether this browser can hold downloads at all. */
export function supportsDownloads(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

/**
 * An installed PWA is the difference between files that survive and files iOS
 * quietly bins after a week, so the Downloads screen checks it before offering
 * anything.
 */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (window.navigator as { standalone?: boolean }).standalone;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || standalone === true;
}

/** Ask the browser to stop evicting us, and report what room is left. */
export async function storageBudget(): Promise<StorageBudget> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usedBytes: 0, availableBytes: 0, persisted: false };
  }
  const persisted = await navigator.storage.persisted?.().catch(() => false) ?? false;
  const granted = persisted || await navigator.storage.persist?.().catch(() => false) || false;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usedBytes: usage, availableBytes: Math.max(0, quota - usage), persisted: granted };
}
