import { api } from './api';
import { indexedDbMetaStore } from './download-meta';
import { DownloadQueue, type DownloadEntry, type DownloadTransport } from './download-queue';
import { OpfsDownloadStore, supportsDownloads } from './download-store';

/** How much is asked for at a time. Small enough that a dropped connection
 * costs little, large enough that a film is not thousands of requests. */
const CHUNK_BYTES = 8 * 1024 * 1024;

/** Talks to the download endpoints on the server's terms. */
export function httpTransport(): DownloadTransport {
  return {
    async status(id) {
      const { download } = await api.downloadStatus(id);
      return { status: download.status, sizeBytes: download.sizeBytes, error: download.error };
    },
    async fetchFrom(id, from) {
      const response = await fetch(`/api/v1/downloads/${encodeURIComponent(id)}/file`, {
        credentials: 'include',
        headers: { Range: `bytes=${from}-${from + CHUNK_BYTES - 1}` },
      });
      if (!response.ok && response.status !== 206) throw new Error(`Download failed (${response.status})`);
      const total = Number(/\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1]
        ?? response.headers.get('content-length') ?? 0);
      return { chunk: new Uint8Array(await response.arrayBuffer()), total };
    },
    complete: (id) => api.completeDownload(id),
    cancel: (id) => api.cancelDownload(id),
  };
}

let queue: DownloadQueue | undefined;

/** The app's queue, created once the browser proves it can hold files. */
export function downloadQueue(): DownloadQueue | undefined {
  if (!supportsDownloads()) return undefined;
  queue ??= new DownloadQueue(new OpfsDownloadStore(), indexedDbMetaStore(), httpTransport());
  return queue;
}

/** Where the player finds a downloaded copy; the worker answers this path. */
export function offlineSource(entry: Pick<DownloadEntry, 'id'>): string {
  return `/offline/${encodeURIComponent(entry.id)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) {
    // "2 GB" rather than "2.0 GB": the tenth only earns its place when it says something.
    const shown = gb >= 10 ? gb.toFixed(0) : gb.toFixed(1).replace(/\.0$/, '');
    return `${shown} GB`;
  }
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}

/** "3 days left", or "Expires today" when that reads better. */
export function formatExpiry(expiresAt: string, now = Date.now()): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires today';
  return `${days} days left`;
}

/**
 * Start downloading a title, or every episode of a season.
 *
 * The grants are created first so the queue knows the real ids and expiry
 * dates; the encodes then run on the server while the queue waits.
 */
export async function startDownloads(mediaItemIds: readonly string[], profile: 'sd' | 'hd'): Promise<DownloadEntry[]> {
  const active = downloadQueue();
  if (!active) throw new Error('This browser cannot hold downloads');
  const grants = [];
  for (const mediaItemId of mediaItemIds) {
    const { download } = await api.requestDownload(mediaItemId, profile);
    grants.push({
      id: download.id, mediaItemId: download.mediaItemId, title: download.title,
      profile: download.profile, estimatedBytes: download.estimatedBytes, expiresAt: download.expiresAt,
    });
  }
  await active.enqueue(grants);
  return active.entries();
}
