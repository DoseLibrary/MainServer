import type { DownloadEntry, DownloadMetaStore } from './download-queue.ts';

/**
 * What the device remembers about each download: everything the Downloads
 * screen needs to render with no connection — title, artwork, expiry, and how
 * far the transfer got.
 *
 * IndexedDB rather than localStorage because a poster blob belongs in a store
 * that can hold binary, and because this survives eviction pressure better.
 */
const DB_NAME = 'dose-downloads';
const STORE = 'entries';
const OUTBOX = 'progress-outbox';

/** Playback position recorded with no connection, waiting to be sent. */
export interface OutboxEntry {
  mediaItemId: string;
  positionSeconds: number;
  watched: boolean;
  at: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'mediaItemId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the download database'));
  });
}

function run<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = work(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Download database request failed'));
    transaction.oncomplete = () => db.close();
  }));
}

export function indexedDbMetaStore(): DownloadMetaStore {
  return {
    all: () => run<DownloadEntry[]>(STORE, 'readonly', (store) => store.getAll() as IDBRequest<DownloadEntry[]>),
    put: async (entry) => { await run(STORE, 'readwrite', (store) => store.put(entry)); },
    remove: async (id) => { await run(STORE, 'readwrite', (store) => store.delete(id)); },
  };
}

/**
 * Positions recorded while offline.
 *
 * Keyed by media item so a title watched twice on a plane sends one position,
 * not a history of every ten seconds. The newest wins, which is the same rule
 * the server applies to progress it receives.
 */
export const progressOutbox = {
  async record(entry: OutboxEntry): Promise<void> {
    const existing = await run<OutboxEntry | undefined>(OUTBOX, 'readonly', (store) => store.get(entry.mediaItemId) as IDBRequest<OutboxEntry | undefined>);
    if (existing && existing.at > entry.at) return;
    await run(OUTBOX, 'readwrite', (store) => store.put(entry));
  },
  all(): Promise<OutboxEntry[]> {
    return run<OutboxEntry[]>(OUTBOX, 'readonly', (store) => store.getAll() as IDBRequest<OutboxEntry[]>);
  },
  async clear(mediaItemId: string): Promise<void> {
    await run(OUTBOX, 'readwrite', (store) => store.delete(mediaItemId));
  },
};

/**
 * Send everything recorded offline, oldest first, and forget each as it lands.
 * A failure leaves the rest queued for the next attempt.
 */
export async function flushProgressOutbox(
  send: (entry: OutboxEntry) => Promise<void>,
  outbox: Pick<typeof progressOutbox, 'all' | 'clear'> = progressOutbox,
): Promise<number> {
  const entries = (await outbox.all()).sort((a, b) => a.at - b.at);
  let sent = 0;
  for (const entry of entries) {
    try { await send(entry); await outbox.clear(entry.mediaItemId); sent++; }
    catch { break; }
  }
  return sent;
}
