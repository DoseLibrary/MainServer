import { api, ApiError, imageVariant, type CatalogItemDetails } from './api';

describe('api client', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('sends JSON and cookie credentials for login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: '1', username: 'filip' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    globalThis.fetch = fetchMock;

    await api.login({ username: 'filip', password: 'long-password' });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ username: 'filip', password: 'long-password' }),
    }));
  });

  it('reads local server health', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', database: 'ok' }));
    globalThis.fetch = fetchMock;
    await expect(api.health()).resolves.toEqual({ status: 'ok', database: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ credentials: 'include' }));
  });

  it('surfaces the server error message and status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(api.me()).rejects.toEqual(expect.objectContaining({
      message: 'Invalid credentials',
      status: 401,
    } satisfies Partial<ApiError>));
  });

  it('creates and deletes libraries through typed endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ library: { id: 'lib', name: 'Shows' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;

    await api.createLibrary({ name: 'Shows', kind: 'shows', rootPath: '/media/shows' });
    await api.deleteLibrary('lib');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/libraries', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/libraries/lib', expect.objectContaining({ method: 'DELETE', credentials: 'include' }));
  });

  it('creates, updates, and deletes family users through typed endpoints', async () => {
    const managed = { id: 'user', username: 'guest', role: 'member', disabled: false, createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ user: managed }, 201)).mockResolvedValueOnce(jsonResponse({ user: { ...managed, disabled: true } })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    await api.createUser({ username: 'guest', password: 'long-password', role: 'member' }); await api.updateUser('user', { disabled: true }); await api.deleteUser('user');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/users', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/users/user', expect.objectContaining({ method: 'PATCH' }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/users/user', expect.objectContaining({ method: 'DELETE' }));
  });

  it('uses encoded catalog and scan endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sections: [] }))
      .mockResolvedValueOnce(jsonResponse({ item: { id: 'movie/1', title: 'Arrival', kind: 'movie' } }))
      .mockResolvedValueOnce(jsonResponse({ scan: { id: 's1', libraryId: 'lib/1', status: 'queued' } }, 202))
      .mockResolvedValueOnce(jsonResponse({ scan: null }));
    globalThis.fetch = fetchMock;
    await api.catalogHome('lib/1'); await api.catalogItem('movie/1');
    await api.startLibraryScan('lib/1'); await api.latestLibraryScan('lib/1');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/catalog/home?libraryId=lib%2F1', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/catalog/items/movie%2F1', expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/libraries/lib%2F1/scan', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/libraries/lib%2F1/scans/latest', expect.anything());
  });

  it('searches and negotiates playback through encoded endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ query: 'arr', groups: [] })).mockResolvedValueOnce(jsonResponse({ plan: { mode: 'direct' }, stream: { url: '/stream', direct: true } }));
    globalThis.fetch = fetchMock;
    await api.catalogSearch('lib/1', 'arrival & aliens');
    await api.playback('movie/1', { containers: ['mp4'], videoCodecs: ['h264'], audioCodecs: ['aac'] });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/catalog/search?libraryId=lib%2F1&q=arrival%20%26%20aliens', expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/catalog/items/movie%2F1/playback', expect.objectContaining({ method: 'POST' }));
  });
});

function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

describe('imageVariant', () => {
  it('appends size parameters to local image URLs only', () => {
    expect(imageVariant('/api/v1/images/p.jpg', { width: 200, format: 'webp' })).toBe('/api/v1/images/p.jpg?w=200&format=webp');
    expect(imageVariant('/api/v1/images/p.jpg', {})).toBe('/api/v1/images/p.jpg');
  });

  it('never rewrites or constructs a provider hostname', () => {
    expect(imageVariant(undefined, { width: 100 })).toBeUndefined();
    const passthrough = imageVariant('https://image.tmdb.org/x.jpg', { width: 100 });
    expect(passthrough).toBe('https://image.tmdb.org/x.jpg');
    // The client must not fabricate provider URLs from local assets.
    expect(imageVariant('/api/v1/images/p.jpg', { width: 100 })).not.toContain('themoviedb');
  });
});

describe('catalogItem enrichment contract', () => {
  it('maps enriched details including local artwork and partial fields', async () => {
    const details: CatalogItemDetails = {
      id: 'm1', title: 'One', kind: 'movie', posterUrl: '/api/v1/images/p.jpg', tagline: 'Tagline', runtime: '2h 5m',
      quality: { badge: '4K HDR', resolutionLabel: '4K', dynamicRange: 'HDR10', videoCodec: 'hevc', audioCodec: 'eac3', audioChannels: '5.1' },
      genres: [{ id: 'g1', name: 'Action' }], collection: { id: 'c1', name: 'Saga', posterUrl: '/api/v1/images/c.jpg' },
      cast: [{ name: 'Actor', character: 'Hero', profileUrl: '/api/v1/images/a.jpg', order: 0 }],
      recommendations: [{ id: 'm2', title: 'Two', kind: 'movie', posterUrl: '/api/v1/images/q.jpg' }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ item: details }));
    const { item } = await api.catalogItem('m1');
    expect(item.quality?.badge).toBe('4K HDR');
    expect(item.genres?.[0]).toEqual({ id: 'g1', name: 'Action' });
    expect(item.recommendations?.[0].posterUrl).toBe('/api/v1/images/q.jpg');
    // A minimally-enriched item must still satisfy the contract.
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ item: { id: 'm3', title: 'Bare', kind: 'movie' } }));
    const bare = await api.catalogItem('m3');
    expect(bare.item.genres).toBeUndefined();
    expect(bare.item.cast).toBeUndefined();
  });
});
