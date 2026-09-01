import { api, type PlaybackResponse } from './api';
import { detectMediaCapabilities } from './media-capabilities';

/**
 * Opening a title's page is a strong signal that it is about to be watched, so
 * the negotiation and the first bytes happen while the viewer is still reading
 * the synopsis. Clicking Play then skips a round trip, and — for a transcode —
 * finds the opening segment already encoded and cached.
 *
 * Only the default request is warmed: no quality cap, no alternate audio track.
 * Those are chosen inside the player, long after this is worth guessing at.
 */

/** A plan older than this is re-negotiated; the file may have changed underneath it. */
const FRESH_MS = 5 * 60_000;
/** A viewer browsing titles should not keep every plan they glanced at. */
const MAX_ENTRIES = 4;
/** How much of the stream's opening is pulled in; enough for the header and first frames. */
const OPENING_BYTES = 1024 * 1024;

type Entry = { response: PlaybackResponse; at: number };

const warmed = new Map<string, Entry>();
const inFlight = new Map<string, Promise<void>>();

/** Metered or data-saving connections opt out of speculative bytes. */
function speculationAllowed(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData !== true;
}

/** Pull the opening of the stream into cache so the first frames are local. */
async function warmOpening(playback: PlaybackResponse): Promise<void> {
  if (playback.stream.hlsUrl) {
    // The playlists are tiny, and asking for them makes the server encode and
    // cache segment zero while the viewer is still deciding.
    await fetch(playback.stream.hlsUrl, { credentials: 'same-origin' }).then((response) => response.text());
    return;
  }
  // A direct play answers the range from disk; a remux ignores it and pipes
  // ffmpeg from the start. Either way, reading the opening and stopping pulls
  // the file's head into the operating system's cache — and for a direct play,
  // into the browser's too. The read is capped and then abandoned, so a remux's
  // encoder is not left running for a title nobody pressed play on.
  const controller = new AbortController();
  const response = await fetch(playback.stream.url, { credentials: 'same-origin', headers: { Range: `bytes=0-${OPENING_BYTES - 1}` }, signal: controller.signal });
  const reader = response.body?.getReader();
  try {
    let read = 0;
    while (reader && read < OPENING_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value?.byteLength ?? 0;
    }
  } finally {
    controller.abort();
  }
}

/**
 * Negotiate (and start warming) playback for a title, at most once per title
 * per freshness window. Failures are silent: this is speculative work, and the
 * watch page negotiates for real anyway.
 */
export function prewarmPlayback(mediaItemId: string): void {
  if (!speculationAllowed()) return;
  const existing = warmed.get(mediaItemId);
  if (existing && Date.now() - existing.at < FRESH_MS) return;
  if (inFlight.has(mediaItemId)) return;
  const task = api.playback(mediaItemId, detectMediaCapabilities())
    .then(async (response) => {
      warmed.set(mediaItemId, { response, at: Date.now() });
      // Keep the map to the few titles a viewer moves between.
      while (warmed.size > MAX_ENTRIES) warmed.delete(warmed.keys().next().value as string);
      await warmOpening(response).catch(() => undefined);
    })
    .catch(() => { /* the watch page will negotiate for real */ })
    .finally(() => { inFlight.delete(mediaItemId); });
  inFlight.set(mediaItemId, task);
}

/**
 * The plan warmed for this title, while it is still fresh. Reusable rather than
 * consumed: the watch page may load more than once for a single visit (a
 * remount, a switch back to source quality), and each of those should be the
 * instant path too. Past the window it is dropped and the caller negotiates.
 */
export function warmedPlayback(mediaItemId: string): PlaybackResponse | undefined {
  const entry = warmed.get(mediaItemId);
  if (!entry) return undefined;
  if (Date.now() - entry.at < FRESH_MS) return entry.response;
  warmed.delete(mediaItemId);
  return undefined;
}

/** Test seam: forget everything warmed so far. */
export function clearPrewarmedPlayback(): void {
  warmed.clear();
  inFlight.clear();
}
