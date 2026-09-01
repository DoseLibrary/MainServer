import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPrewarmedPlayback, prewarmPlayback, warmedPlayback } from './playback-prewarm';

const ID = 'movie-1';
const directPlan = { plan: { mode: 'direct', container: 'mp4', remux: false, reasons: [] }, durationSeconds: 100, stream: { url: `/api/v1/catalog/items/${ID}/stream`, direct: true } };
const hlsPlan = { plan: { mode: 'transcode', container: 'mp4', remux: false, reasons: [] }, durationSeconds: 100, stream: { url: '/stream?plan=abc', hlsUrl: `/api/v1/catalog/items/${ID}/hls/master.m3u8?plan=abc`, direct: false } };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** Let the negotiation promise and the warm-up that follows it settle. */
const settle = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

describe('playback prewarm', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { clearPrewarmedPlayback(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('negotiates once and hands the plan to the watch page', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(directPlan));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    prewarmPlayback(ID);
    prewarmPlayback(ID); // A re-render must not negotiate twice.
    await settle();

    const negotiations = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/playback'));
    expect(negotiations).toHaveLength(1);
    expect(warmedPlayback(ID)).toMatchObject({ plan: { mode: 'direct' } });
  });

  it('pulls the opening of a direct play into cache', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(directPlan));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    prewarmPlayback(ID);
    await settle();

    const opening = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/stream'));
    expect(opening).toBeDefined();
    expect((opening?.[1] as RequestInit | undefined)?.headers).toMatchObject({ Range: 'bytes=0-1048575' });
  });

  it('asks for the playlist of a transcode, which warms its first segment', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => (String(input).includes('m3u8') ? new Response('#EXTM3U', { status: 200 }) : json(hlsPlan)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    prewarmPlayback(ID);
    await settle();

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/hls/master.m3u8'))).toBe(true);
  });

  it('serves the warmed plan for repeated loads, then lets it go stale', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = vi.fn(async () => json(directPlan)) as unknown as typeof fetch;
      prewarmPlayback(ID);
      await vi.advanceTimersByTimeAsync(0);
      await settle();

      // A remount, or a switch back to source quality, must stay instant too.
      expect(warmedPlayback(ID)).toBeDefined();
      expect(warmedPlayback(ID)).toBeDefined();

      vi.advanceTimersByTime(6 * 60_000);
      expect(warmedPlayback(ID)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps quiet on a data-saving connection', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(directPlan));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const connection = { saveData: true };
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });

    prewarmPlayback(ID);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('never fails the page when negotiation does', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect(() => prewarmPlayback(ID)).not.toThrow();
    await settle();
    expect(warmedPlayback(ID)).toBeUndefined();
  });
});
