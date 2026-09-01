import { describe, expect, it, vi } from 'vitest';
import { DownloadQueue, type DownloadEntry, type DownloadMetaStore, type DownloadTransport } from './download-queue.ts';
import { MemoryDownloadStore } from './download-store.ts';

function memoryMeta(): DownloadMetaStore {
  const entries = new Map<string, DownloadEntry>();
  return {
    all: async () => [...entries.values()],
    put: async (entry) => { entries.set(entry.id, { ...entry }); },
    remove: async (id) => { entries.delete(id); },
  };
}

/** A server holding `size` bytes, handing them out `chunk` at a time. */
function transport(options: { size: number; chunk?: number; status?: 'preparing' | 'ready' | 'failed'; error?: string } = { size: 100 }): DownloadTransport & { completed: string[]; cancelled: string[]; ready(): void } {
  let status = options.status ?? 'ready';
  const chunkSize = options.chunk ?? options.size;
  const completed: string[] = [];
  const cancelled: string[] = [];
  return {
    completed, cancelled,
    ready() { status = 'ready'; },
    status: async () => ({ status: status as 'preparing' | 'ready' | 'failed', sizeBytes: status === 'ready' ? options.size : null, error: options.error }),
    fetchFrom: async (_id, from) => ({ chunk: new Uint8Array(Math.min(chunkSize, options.size - from)).fill(7), total: options.size }),
    complete: async (id) => { completed.push(id); },
    cancel: async (id) => { cancelled.push(id); },
  };
}

const title = (id: string, order = 0) => ({
  id, mediaItemId: `m-${id}`, title: `Title ${id}`, profile: 'sd' as const,
  estimatedBytes: 100, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), order,
});

const instant = async () => {};

describe('the download queue', () => {
  it('downloads a title to completion and tells the server to let go', async () => {
    const store = new MemoryDownloadStore();
    const server = transport({ size: 100, chunk: 40 });
    const queue = new DownloadQueue(store, memoryMeta(), server, instant);

    await queue.enqueue([title('a')]);
    await queue.run();

    const [entry] = await queue.entries();
    expect(entry).toMatchObject({ status: 'ready', bytesDone: 100, bytesTotal: 100 });
    expect(await store.size('a')).toBe(100);
    expect(server.completed).toEqual(['a']);
  });

  it('resumes from what the device already holds rather than starting over', async () => {
    const store = new MemoryDownloadStore();
    await store.append('a', new Uint8Array(60).fill(1)); // an interrupted transfer
    const server = transport({ size: 100, chunk: 100 });
    const fetchSpy = vi.spyOn(server, 'fetchFrom');
    const queue = new DownloadQueue(store, memoryMeta(), server, instant);

    await queue.enqueue([title('a')]);
    await queue.run();

    expect(fetchSpy).toHaveBeenCalledWith('a', 60);
    expect(await store.size('a')).toBe(100);
  });

  it('keeps a season in the order it was queued', async () => {
    const store = new MemoryDownloadStore();
    const queue = new DownloadQueue(store, memoryMeta(), transport({ size: 10 }), instant);

    await queue.enqueue([title('e1'), title('e2'), title('e3')]);

    expect((await queue.entries()).map((entry) => entry.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('waits while the server is still encoding instead of failing', async () => {
    const store = new MemoryDownloadStore();
    const server = transport({ size: 50, status: 'preparing' });
    const queue = new DownloadQueue(store, memoryMeta(), server, instant);

    await queue.enqueue([title('a')]);
    // One pass: the entry is marked preparing and nothing is written.
    await queue.run().catch(() => undefined);
    const preparing = (await queue.entries())[0];
    expect(preparing.status).toBe('preparing');
    expect(await store.size('a')).toBe(0);

    server.ready();
    await queue.run();
    expect((await queue.entries())[0].status).toBe('ready');
  });

  it('reports a failed encode against the entry', async () => {
    const queue = new DownloadQueue(new MemoryDownloadStore(), memoryMeta(),
      transport({ size: 0, status: 'failed', error: 'no audio stream' }), instant);

    await queue.enqueue([title('a')]);
    await queue.run();

    expect((await queue.entries())[0]).toMatchObject({ status: 'failed', error: 'no audio stream' });
  });

  it('pauses the queue when the device runs out of room, keeping what arrived', async () => {
    const store = new MemoryDownloadStore();
    vi.spyOn(store, 'append').mockRejectedValueOnce(new Error('QuotaExceededError: storage full'));
    const queue = new DownloadQueue(store, memoryMeta(), transport({ size: 100 }), instant);

    await queue.enqueue([title('a')]);
    await expect(queue.run()).rejects.toThrow(/storage/i);

    expect((await queue.entries())[0]).toMatchObject({ status: 'paused', error: expect.stringContaining('space') });
  });

  it('pauses and resumes a single title without touching the rest', async () => {
    // Held at 'preparing' so nothing finishes before the pause lands.
    const queue = new DownloadQueue(new MemoryDownloadStore(), memoryMeta(), transport({ size: 10, status: 'preparing' }), instant);
    await queue.enqueue([title('a'), title('b')]);

    await queue.pause('a');
    expect((await queue.entries())[0].status).toBe('paused');

    await queue.resume('a');
    expect((await queue.entries())[0].status).toBe('queued');
  });

  it('deletes expired downloads without needing a connection', async () => {
    const store = new MemoryDownloadStore();
    const meta = memoryMeta();
    const queue = new DownloadQueue(store, meta, transport({ size: 10 }), instant);
    await queue.enqueue([
      { ...title('old'), expiresAt: new Date(Date.now() - 1000).toISOString() },
      title('fresh', 1),
    ]);
    await store.append('old', new Uint8Array(10));

    const expired = await queue.pruneExpired();

    expect(expired.map((entry) => entry.id)).toEqual(['old']);
    expect(await store.size('old')).toBe(0);
    expect((await queue.entries()).map((entry) => entry.id)).toEqual(['fresh']);
  });

  it('notices when the browser has evicted a finished download', async () => {
    const store = new MemoryDownloadStore();
    const meta = memoryMeta();
    await meta.put({ ...title('a'), status: 'ready', bytesDone: 100, bytesTotal: 100 });
    const queue = new DownloadQueue(store, meta, transport({ size: 100 }), instant);

    // The bytes are gone from the device even though the entry says ready.
    const evicted = await queue.reconcile();

    expect(evicted.map((entry) => entry.id)).toEqual(['a']);
    expect(await queue.entries()).toHaveLength(0);
  });

  it('removing a download clears the bytes and releases the grant', async () => {
    const store = new MemoryDownloadStore();
    const server = transport({ size: 10 });
    const queue = new DownloadQueue(store, memoryMeta(), server, instant);
    await queue.enqueue([title('a')]);
    await queue.run();

    await queue.remove('a');

    expect(await store.size('a')).toBe(0);
    expect(await queue.entries()).toHaveLength(0);
    expect(server.cancelled).toEqual(['a']);
  });

  it('tells subscribers about progress as it happens', async () => {
    const queue = new DownloadQueue(new MemoryDownloadStore(), memoryMeta(), transport({ size: 100, chunk: 50 }), instant);
    const seen: string[][] = [];
    queue.subscribe((entries) => seen.push(entries.map((entry) => `${entry.id}:${entry.status}`)));

    await queue.enqueue([title('a')]);
    await queue.run();

    expect(seen[seen.length - 1]).toEqual(['a:ready']);
    expect(seen.length).toBeGreaterThan(2);
  });
});
