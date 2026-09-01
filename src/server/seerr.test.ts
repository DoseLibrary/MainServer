import { describe, expect, it, vi } from 'vitest';
import { SeerrClient, SeerrError, SeerrStateCache, apiBase, type Fetcher } from './seerr.ts';
import { createSeerrPlugin, seerrConfigured, seerrSettingsSchema } from './plugins/seerr.ts';

const CONFIG = { baseUrl: 'http://seerr:5055', apiKey: 'secret-key' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Records calls so tests can assert the URL, headers, and body sent to Seerr. */
function fetcherOf(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as Fetcher & { mock: { calls: [string, RequestInit?][] } };
}

describe('the Seerr address', () => {
  it('accepts the forms an admin actually types', () => {
    expect(apiBase('http://seerr:5055')).toBe('http://seerr:5055/api/v1');
    expect(apiBase('http://seerr:5055/')).toBe('http://seerr:5055/api/v1');
    expect(apiBase('  https://seerr.local//  ')).toBe('https://seerr.local/api/v1');
    // Pasting the API root itself must not double it.
    expect(apiBase('http://seerr:5055/api/v1')).toBe('http://seerr:5055/api/v1');
  });

  it('refuses an address that is not a URL', () => {
    expect(() => apiBase('seerr:5055')).toThrow(SeerrError);
    expect(() => apiBase('')).toThrow(/must start with http/);
  });
});

describe('SeerrClient', () => {
  it('authenticates with the API key header', async () => {
    const fetcher = fetcherOf(() => json({ version: '2.1.0' }));
    const status = await new SeerrClient(CONFIG, fetcher).serverStatus();

    expect(status).toEqual({ version: '2.1.0' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://seerr:5055/api/v1/status');
    expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('maps request rows to availability by TMDB id', async () => {
    const fetcher = fetcherOf(() => json({ results: [
      { media: { tmdbId: 11, status: 2 } },
      { media: { tmdbId: 22, status: 3 } },
      { media: { tmdbId: 33, status: 5 } },
      { media: { status: 5 } },            // no id: unusable
      { media: { tmdbId: 44, status: 99 } }, // status we do not know
      {},
    ] }));

    const states = await new SeerrClient(CONFIG, fetcher).requestedMedia();

    expect([...states]).toEqual([[11, 'pending'], [22, 'processing'], [33, 'available'], [44, 'unknown']]);
  });

  it('sends a movie request as Seerr expects it', async () => {
    const fetcher = fetcherOf(() => json({ media: { status: 2 } }, 201));
    const result = await new SeerrClient(CONFIG, fetcher).requestMedia({ mediaType: 'movie', tmdbId: 603 });

    expect(result).toEqual({ state: 'pending' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://seerr:5055/api/v1/request');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ mediaType: 'movie', mediaId: 603 });
  });

  it('asks for every season of a series, and for 4K only when told to', async () => {
    const fetcher = fetcherOf(() => json({ media: { status: 2 } }, 201));
    const client = new SeerrClient(CONFIG, fetcher);

    await client.requestMedia({ mediaType: 'tv', tmdbId: 1399, is4k: true });

    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ mediaType: 'tv', mediaId: 1399, is4k: true, seasons: 'all' });
  });

  it('names a rejected key rather than reporting a bare status code', async () => {
    const client = new SeerrClient(CONFIG, fetcherOf(() => new Response('', { status: 403 })));
    await expect(client.serverStatus()).rejects.toThrow(/rejected the API key/);
  });

  it('reports an unreachable server as unreachable', async () => {
    const client = new SeerrClient(CONFIG, fetcherOf(() => { throw new Error('ECONNREFUSED'); }));
    await expect(client.serverStatus()).rejects.toThrow(/Could not reach Seerr/);
  });

  it('does not present an HTML error page as data', async () => {
    const client = new SeerrClient(CONFIG, fetcherOf(() => new Response('<html>nope</html>', { status: 200 })));
    await expect(client.serverStatus()).rejects.toThrow(/not JSON/);
  });
});

describe('SeerrStateCache', () => {
  it('serves repeat reads from cache and refreshes once the window passes', async () => {
    let now = 1_000;
    const requestedMedia = vi.fn(async () => new Map([[1, 'pending' as const]]));
    const client = { requestedMedia } as unknown as SeerrClient;
    const cache = new SeerrStateCache(30_000, () => now);

    await cache.get(client);
    await cache.get(client);
    expect(requestedMedia).toHaveBeenCalledTimes(1);

    now += 31_000;
    await cache.get(client);
    expect(requestedMedia).toHaveBeenCalledTimes(2);
  });

  it('coalesces a burst of readers into one call', async () => {
    const requestedMedia = vi.fn(async () => new Map([[1, 'pending' as const]]));
    const client = { requestedMedia } as unknown as SeerrClient;
    const cache = new SeerrStateCache();

    await Promise.all([cache.get(client), cache.get(client), cache.get(client)]);

    expect(requestedMedia).toHaveBeenCalledTimes(1);
  });

  it('refetches after a new request, so the tile does not stay stale', async () => {
    const requestedMedia = vi.fn(async () => new Map([[1, 'pending' as const]]));
    const client = { requestedMedia } as unknown as SeerrClient;
    const cache = new SeerrStateCache();

    await cache.get(client);
    cache.invalidate();
    await cache.get(client);

    expect(requestedMedia).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure', async () => {
    const requestedMedia = vi.fn()
      .mockRejectedValueOnce(new SeerrError('down'))
      .mockResolvedValueOnce(new Map([[1, 'pending' as const]]));
    const client = { requestedMedia } as unknown as SeerrClient;
    const cache = new SeerrStateCache();

    await expect(cache.get(client)).rejects.toThrow('down');
    await expect(cache.get(client)).resolves.toEqual(new Map([[1, 'pending']]));
  });
});

describe('the Seerr plugin', () => {
  const settings = (over: Partial<Record<string, unknown>> = {}) => seerrSettingsSchema.parse({ ...CONFIG, ...over });

  it('is unconfigured until it has both an address and a key', () => {
    expect(seerrConfigured(settings())).toBe(true);
    expect(seerrConfigured(settings({ apiKey: '' }))).toBe(false);
    expect(seerrConfigured(settings({ baseUrl: '   ' }))).toBe(false);
  });

  it('keeps the API key in a password field so it is never echoed back', () => {
    const plugin = createSeerrPlugin();
    expect(plugin.fields?.find((field) => field.key === 'apiKey')?.kind).toBe('password');
  });

  it('reports the version when the connection test succeeds', async () => {
    const plugin = createSeerrPlugin(fetcherOf(() => json({ version: '2.1.0' })));
    const action = plugin.actions!.find((entry) => entry.id === 'test-connection')!;

    await expect(action.run({ settings: settings(), signal: new AbortController().signal }))
      .resolves.toEqual({ summary: 'Connected to Seerr 2.1.0.' });
  });

  it('fails the connection test loudly rather than looking configured', async () => {
    const plugin = createSeerrPlugin(fetcherOf(() => new Response('', { status: 403 })));
    const action = plugin.actions!.find((entry) => entry.id === 'test-connection')!;
    const context = { signal: new AbortController().signal };

    await expect(action.run({ settings: settings(), ...context })).rejects.toThrow(/rejected the API key/);
    await expect(action.run({ settings: settings({ apiKey: '' }), ...context })).rejects.toThrow(/Set the address and API key/);
  });

  it('is never scheduled: it has settings, not periodic work', () => {
    expect(createSeerrPlugin().run).toBeUndefined();
  });
});
