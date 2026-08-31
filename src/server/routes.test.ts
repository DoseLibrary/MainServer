import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthService } from './auth-service.ts';
import { DuplicateLibraryError } from './auth-service.ts';
import { describeUserAgent, registerApiRoutes } from './routes.ts';
import type { DeviceAuthService } from './device-auth-service.ts';
import type { LibraryFilesystem } from './security.ts';
import type { ScanCoordinator } from './scanner.ts';
import type { CatalogService } from './catalog-service.ts';
import type { PluginService } from './plugin-service.ts';
import sharp from 'sharp';
import type { MetadataMatchService } from './metadata-match-service.ts';
import type { UserSettingsService } from './user-settings-service.ts';
import { UserCollectionNotFoundError, type UserCollectionsService } from './user-collections-service.ts';
import type { QueueService } from './queue-service.ts';
import type { WatchDataService } from './watch-data-service.ts';
import { HistorySourceError } from './history-sources/types.ts';
import type { HistorySources } from './routes.ts';
import { ZodError } from 'zod';

function service(overrides: Partial<Record<keyof AuthService, unknown>> = {}) {
  return {
    setupRequired: vi.fn(async () => true), setup: vi.fn(), login: vi.fn(), logout: vi.fn(),
    authenticate: vi.fn(async () => null), listLibraries: vi.fn(async () => []),
    createLibrary: vi.fn(), deleteLibrary: vi.fn(),
    listUsers: vi.fn(async () => []), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

async function appWith(auth: AuthService, scanner?: ScanCoordinator, catalog?: CatalogService, imagesDir?: string, nativeLibraryPaths = false, metadataMatch?: MetadataMatchService, settings?: UserSettingsService, userCollections?: UserCollectionsService, queue?: QueueService, watchData?: WatchDataService, historySources?: HistorySources) {
  const filesystem: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => true };
  const app = Fastify(); await app.register(cookie); await registerApiRoutes(app, auth, false, filesystem, scanner, catalog, imagesDir, nativeLibraryPaths, undefined, undefined, undefined, undefined, metadataMatch, undefined, undefined, settings, userCollections, queue, watchData, historySources); return app;
}

describe('API authorization', () => {
  it('reads and updates only the authenticated user settings', async () => {
    const auth = service({ authenticate: vi.fn(async (token?: string) => token ? ({ id: 'user-id', username: 'member', role: 'member' }) : null) });
    const settings = { get: vi.fn(async () => ({ userId: 'user-id', showCollectionGaps: false })), update: vi.fn(async (_id, patch) => ({ userId: 'user-id', ...patch })) } as unknown as UserSettingsService;
    const app = await appWith(auth, undefined, undefined, undefined, false, undefined, settings);
    const headers = { cookie: 'dose_session=token' };
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/settings', headers })).json().settings.showCollectionGaps).toBe(false);
    const response = await app.inject({ method: 'PUT', url: '/api/v1/me/settings', headers, payload: { showCollectionGaps: true } });
    expect(response.statusCode).toBe(200); expect(settings.update).toHaveBeenCalledWith('user-id', { showCollectionGaps: true });
    expect((await app.inject({ method: 'PUT', url: '/api/v1/me/settings', headers, payload: { unknown: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/settings' })).statusCode).toBe(401);
    await app.close();
  });
  it('passes the collection-gaps setting through to the catalog collection view', async () => {
    const auth = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const collection = vi.fn(async () => ({ id: 'c1', name: 'Saga', titles: [] }));
    const settings = { get: vi.fn(async () => ({ userId: 'user-id', showCollectionGaps: true })) } as unknown as UserSettingsService;
    const id = '11111111-1111-4111-8111-111111111111';
    const headers = { cookie: 'dose_session=token' };

    const gated = await appWith(auth, undefined, { collection } as unknown as CatalogService, undefined, false, undefined, settings);
    expect((await gated.inject({ method: 'GET', url: `/api/v1/catalog/collections/${id}`, headers })).statusCode).toBe(200);
    expect(collection).toHaveBeenLastCalledWith(id, true);
    await gated.close();

    const off = await appWith(auth, undefined, { collection } as unknown as CatalogService, undefined, false, undefined, { get: vi.fn(async () => ({ userId: 'user-id', showCollectionGaps: false })) } as unknown as UserSettingsService);
    await off.inject({ method: 'GET', url: `/api/v1/catalog/collections/${id}`, headers });
    expect(collection).toHaveBeenLastCalledWith(id, false);
    await off.close();
  });
  it('scopes personal collection CRUD to the caller and answers 404 for foreign collections', async () => {
    const auth = service({ authenticate: vi.fn(async (token?: string) => token ? ({ id: 'user-id', username: 'member', role: 'member' }) : null) });
    const id = '11111111-1111-4111-8111-111111111111';
    const itemId = '22222222-2222-4222-8222-222222222222';
    const collections = {
      list: vi.fn(async () => [{ id, name: 'Saga', itemCount: 1 }]),
      create: vi.fn(async () => ({ id, name: 'Saga', itemCount: 0 })),
      get: vi.fn(async () => ({ id, name: 'Saga', items: [] })),
      update: vi.fn(async () => ({ id, name: 'Renamed' })),
      remove: vi.fn(async () => undefined),
      addItem: vi.fn(async () => ({ id, name: 'Saga', items: [] })),
      removeItem: vi.fn(async () => ({ id, name: 'Saga', items: [] })),
      reorder: vi.fn(async () => ({ id, name: 'Saga', items: [] })),
    } as unknown as UserCollectionsService;
    const app = await appWith(auth, undefined, undefined, undefined, false, undefined, undefined, collections);
    const headers = { cookie: 'dose_session=token' };

    expect((await app.inject({ method: 'GET', url: '/api/v1/me/collections', headers })).json().collections).toHaveLength(1);
    expect(collections.list).toHaveBeenCalledWith('user-id');
    const created = await app.inject({ method: 'POST', url: '/api/v1/me/collections', headers, payload: { name: 'Saga' } });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/collections', headers, payload: { name: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/me/collections/${id}`, headers, payload: { name: 'Renamed' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/v1/me/collections/${id}/items`, headers, payload: { mediaItemId: itemId } })).statusCode).toBe(200);
    expect(collections.addItem).toHaveBeenCalledWith('user-id', id, itemId);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/me/collections/${id}/items`, headers, payload: { mediaItemIds: [itemId] } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/me/collections/${id}/items/${itemId}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/me/collections/${id}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/collections' })).statusCode).toBe(401);
    await app.close();

    const foreign = await appWith(auth, undefined, undefined, undefined, false, undefined, undefined, {
      get: vi.fn(async () => { throw new UserCollectionNotFoundError(); }),
    } as unknown as UserCollectionsService);
    expect((await foreign.inject({ method: 'GET', url: `/api/v1/me/collections/${id}`, headers })).statusCode).toBe(404);
    await foreign.close();
  });
  it('serves the marathon queue for the caller only', async () => {
    const auth = service({ authenticate: vi.fn(async (token?: string) => token ? ({ id: 'user-id', username: 'member', role: 'member' }) : null) });
    const itemId = '22222222-2222-4222-8222-222222222222';
    const queue = {
      list: vi.fn(async () => [{ id: itemId, title: 'One', unavailable: false }]),
      add: vi.fn(async () => [{ id: itemId, title: 'One', unavailable: false }]),
      remove: vi.fn(async () => []),
      clear: vi.fn(async () => []),
      reorder: vi.fn(async () => [{ id: itemId, title: 'One', unavailable: false }]),
      next: vi.fn(async () => ({ id: itemId, title: 'One' })),
    } as unknown as QueueService;
    const app = await appWith(auth, undefined, undefined, undefined, false, undefined, undefined, undefined, queue);
    const headers = { cookie: 'dose_session=token' };

    expect((await app.inject({ method: 'GET', url: '/api/v1/me/queue', headers })).json().items).toHaveLength(1);
    expect(queue.list).toHaveBeenCalledWith('user-id');
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/queue', headers, payload: { mediaItemId: itemId } })).statusCode).toBe(200);
    expect(queue.add).toHaveBeenCalledWith('user-id', itemId);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/queue', headers, payload: { mediaItemId: 'nope' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/me/queue', headers, payload: { mediaItemIds: [itemId] } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/me/queue/${itemId}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/me/queue', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/me/queue/next?after=${itemId}`, headers })).json().item).toMatchObject({ id: itemId });
    expect(queue.next).toHaveBeenCalledWith('user-id', itemId);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/queue' })).statusCode).toBe(401);
    await app.close();
  });
  it('exports and imports the caller watch data', async () => {
    const auth = service({ authenticate: vi.fn(async (token?: string) => token ? ({ id: 'user-id', username: 'member', role: 'member' }) : null) });
    const document = { version: 1 as const, progress: [{ match: { tmdbId: '100', title: 'One', kind: 'movie' as const }, positionSeconds: 12, watched: false }], watchlist: [], collections: [] };
    const watchData = {
      exportFor: vi.fn(async () => document),
      importDocument: vi.fn(async () => ({ matched: 1, written: 1, unmatched: [] })),
    } as unknown as WatchDataService;
    const app = await appWith(auth, undefined, undefined, undefined, false, undefined, undefined, undefined, undefined, watchData);
    const headers = { cookie: 'dose_session=token' };

    const exported = await app.inject({ method: 'GET', url: '/api/v1/me/watch-data/export', headers });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('dose-watch-data.json');
    expect(exported.json().progress).toHaveLength(1);
    expect(watchData.exportFor).toHaveBeenCalledWith('user-id');

    const imported = await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import', headers, payload: document });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().summary).toMatchObject({ matched: 1, written: 1 });
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import', headers, payload: { version: 2 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/watch-data/export' })).statusCode).toBe(401);
    await app.close();
  });
  it('imports external history through the selected source', async () => {
    const auth = service({ authenticate: vi.fn(async (token?: string) => token ? ({ id: 'user-id', username: 'member', role: 'member' }) : null) });
    const entries = [{ match: { tmdbId: '100', title: 'One', kind: 'movie' as const }, positionSeconds: 12, watched: true }];
    const watchData = { importProgress: vi.fn(async () => ({ matched: 1, written: 1, unmatched: [{ title: 'Ghost', kind: 'movie' as const }] })) } as unknown as WatchDataService;
    const plex = { id: 'plex', read: vi.fn(async () => ({ entries, errors: ['Shows: unreadable'] })) };
    const trakt = { id: 'trakt', read: vi.fn(async () => { throw new HistorySourceError('Trakt rejected the credentials', 401); }) };
    const app = await appWith(auth, undefined, undefined, undefined, false, undefined, undefined, undefined, undefined, watchData, { plex, trakt });
    const headers = { cookie: 'dose_session=token' };

    const imported = await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import/plex', headers, payload: { baseUrl: 'http://plex.local:32400', token: 'secret' } });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().summary).toMatchObject({ matched: 1, written: 1, skipped: 1, errors: ['Shows: unreadable'] });
    expect(watchData.importProgress).toHaveBeenCalledWith('user-id', entries);

    // A credential failure is a clean 4xx and nothing is written.
    const rejected = await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import/trakt', headers, payload: { clientId: 'c', accessToken: 'bad' } });
    expect(rejected.statusCode).toBe(401);
    expect(watchData.importProgress).toHaveBeenCalledTimes(1);

    expect((await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import/plex', headers, payload: { baseUrl: 'not-a-url', token: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import/kodi', headers, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import/tautulli', headers, payload: { baseUrl: 'http://t.local', apiKey: 'k' } })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/v1/me/watch-data/import/plex', payload: {} })).statusCode).toBe(401);
    await app.close();
  });
  it('streams a local trailer with ranges and returns 404 when unavailable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dose-trailer-route-')); const file = join(dir, 'trailer.mp4'); await writeFile(file, '0123456789');
    try {
      const auth = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
      const localTrailerSource = vi.fn().mockResolvedValueOnce({ localPath: file }).mockResolvedValueOnce({ localPath: file }).mockResolvedValueOnce(null);
      const app = await appWith(auth, undefined, { localTrailerSource } as unknown as CatalogService); const headers = { cookie: 'dose_session=token' }; const id = '11111111-1111-4111-8111-111111111111';
      const full = await app.inject({ method: 'GET', url: `/api/v1/media/${id}/trailer`, headers });
      expect(full.statusCode).toBe(200); expect(full.headers['content-type']).toContain('video/mp4'); expect(full.body).toBe('0123456789');
      const ranged = await app.inject({ method: 'GET', url: `/api/v1/media/${id}/trailer`, headers: { ...headers, range: 'bytes=2-5' } });
      expect(ranged.statusCode).toBe(206); expect(ranged.headers['content-range']).toBe('bytes 2-5/10'); expect(ranged.body).toBe('2345');
      expect((await app.inject({ method: 'GET', url: `/api/v1/media/${id}/trailer`, headers })).statusCode).toBe(404); await app.close();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('lists and removes admin media items for admins only', async () => {
    const adminMediaList = vi.fn(async () => ({ items: [{ id: 'm1', title: 'One', year: 2020, kind: 'movie', library: 'Movies', archived: false, archivedAt: null }], total: 1 }));
    const removeItem = vi.fn(async (id: string) => id === '11111111-1111-4111-8111-111111111111');
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const app = await appWith(admin, undefined, { adminMediaList, removeItem } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' }; const id = '11111111-1111-4111-8111-111111111111';
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/items?archived=true&sort=archivedAt&direction=desc&limit=25', headers });
    expect(list.statusCode).toBe(200); expect(list.json().total).toBe(1);
    expect(adminMediaList).toHaveBeenCalledWith(expect.objectContaining({ archived: true, sort: 'archivedAt', direction: 'desc', limit: 25 }));
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/items/${id}`, headers })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/admin/items/22222222-2222-4222-8222-222222222222', headers })).statusCode).toBe(404);
    const member = service({ authenticate: vi.fn(async () => ({ id: 'u', username: 'm', role: 'member' })) });
    const memberApp = await appWith(member, undefined, { adminMediaList, removeItem } as unknown as CatalogService);
    expect((await memberApp.inject({ method: 'GET', url: '/api/v1/admin/items', headers })).statusCode).toBe(403);
    await app.close(); await memberApp.close();
  });
  it('serves a preview sprite descriptor and 404s when none exists', async () => {
    const auth = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const previewSprite = vi.fn().mockResolvedValueOnce({ storageKey: 'sprite.jpg', columns: 5, rows: 2, interval: 10, tileWidth: 160, tileHeight: 90 }).mockResolvedValueOnce(null);
    const app = await appWith(auth, undefined, { previewSprite } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' }; const id = '11111111-1111-4111-8111-111111111111';
    const ok = await app.inject({ method: 'GET', url: `/api/v1/media/${id}/sprites`, headers });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ sprite: { src: `/api/v1/media/${id}/sprites/sheet`, columns: 5, rows: 2, interval: 10, tileWidth: 160, tileHeight: 90 } });
    expect((await app.inject({ method: 'GET', url: `/api/v1/media/${id}/sprites`, headers })).statusCode).toBe(404);
    const anonymous = await appWith(service(), undefined, { previewSprite } as unknown as CatalogService);
    expect((await anonymous.inject({ method: 'GET', url: `/api/v1/media/${id}/sprites` })).statusCode).toBe(401);
    await app.close(); await anonymous.close();
  });
  it('restricts TMDB search and single-item matching to admins', async () => {
    const matcher = { search: vi.fn(async () => [{ id: 42, title: 'Dune', year: 2021 }]), match: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', providerIds: { tmdb: '42', tmdbUserMatched: 'true' } })) } as unknown as MetadataMatchService;
    const member = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) }), undefined, undefined, undefined, false, matcher);
    expect((await member.inject({ method: 'GET', url: '/api/v1/admin/tmdb/search?type=movie&q=Dune', headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);
    await member.close();
    const admin = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'admin', role: 'admin' })) }), undefined, undefined, undefined, false, matcher);
    expect((await admin.inject({ method: 'GET', url: '/api/v1/admin/tmdb/search?type=movie&q=', headers: { cookie: 'dose_session=token' } })).json()).toEqual({ results: [] });
    expect((await admin.inject({ method: 'GET', url: '/api/v1/admin/tmdb/search?type=movie&q=Dune', headers: { cookie: 'dose_session=token' } })).json()).toEqual({ results: [{ id: 42, title: 'Dune', year: 2021 }] });
    const response = await admin.inject({ method: 'POST', url: '/api/v1/admin/items/11111111-1111-4111-8111-111111111111/match', headers: { cookie: 'dose_session=token' }, payload: { tmdbId: 42 } });
    expect(response.statusCode).toBe(200); expect(matcher.match).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 42);
    expect((await admin.inject({ method: 'POST', url: '/api/v1/admin/items/11111111-1111-4111-8111-111111111111/match', headers: { cookie: 'dose_session=token' }, payload: { tmdbId: 0 } })).statusCode).toBe(400);
    await admin.close();
  });
  it('rejects anonymous library access', async () => {
    const app = await appWith(service());
    expect((await app.inject({ method: 'GET', url: '/api/v1/libraries' })).statusCode).toBe(401);
    await app.close();
  });

  it('normalizes an admin-created library root', async () => {
    const createLibrary = vi.fn(async (value) => ({ id: 'library-id', ...value }));
    const app = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'admin', role: 'admin' })), createLibrary }));
    const response = await app.inject({ method: 'POST', url: '/api/v1/libraries', headers: { cookie: 'dose_session=token' }, payload: { name: 'Movies', kind: 'movies', rootPath: '/media/movies/' } });
    expect(response.statusCode).toBe(201);
    expect(createLibrary).toHaveBeenCalledWith(expect.objectContaining({ rootPath: '/media/movies' }));
    await app.close();
  });

  it('accepts absolute Windows library paths in native development', async () => {
    const createLibrary = vi.fn(async (value) => ({ id: 'library-id', ...value }));
    const app = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'admin', role: 'admin' })), createLibrary }), undefined, undefined, undefined, true);
    const response = await app.inject({ method: 'POST', url: '/api/v1/libraries', headers: { cookie: 'dose_session=token' }, payload: { name: 'Movies', kind: 'movies', rootPath: 'D:\\Media\\Movies' } });
    expect(response.statusCode).toBe(201); expect(createLibrary).toHaveBeenCalledWith(expect.objectContaining({ rootPath: 'D:\\Media\\Movies' }));
    await app.close();
  });

  it('returns a stable setup conflict', async () => {
    const app = await appWith(service({ setup: vi.fn(async () => { throw new Error('SETUP_COMPLETE'); }) }));
    const response = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { username: 'admin', password: 'long-enough-password' } });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('explains the production setup password requirement', async () => {
    const app = await appWith(service());
    const response = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { username: 'admin', password: 'admin' } });
    expect(response.statusCode).toBe(400); expect(response.json()).toEqual({ error: 'Username is required and password must be at least 10 characters' });
    await app.close();
  });

  it('logs out and expires the cookie', async () => {
    const logout = vi.fn(async () => undefined); const app = await appWith(service({ logout }));
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: 'dose_session=secret' } });
    expect(response.statusCode).toBe(204); expect(logout).toHaveBeenCalledWith('secret');
    expect(response.headers['set-cookie']).toContain('dose_session=;');
    await app.close();
  });

  it('forbids member mutations', async () => {
    const app = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) }));
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/libraries/11111111-1111-4111-8111-111111111111', headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);
    await app.close();
  });

  it('maps duplicate libraries to 409 without database details', async () => {
    const app = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'admin', role: 'admin' })), createLibrary: vi.fn(async () => { throw new DuplicateLibraryError(); }) }));
    const response = await app.inject({ method: 'POST', url: '/api/v1/libraries', headers: { cookie: 'dose_session=token' }, payload: { name: 'Movies', kind: 'movies', rootPath: '/media/movies' } });
    expect(response.statusCode).toBe(409); expect(response.body).not.toContain('23505');
    await app.close();
  });

  it('deletes a library and reports missing libraries', async () => {
    const deleteLibrary = vi.fn().mockResolvedValueOnce({ id: 'library-id' }).mockResolvedValueOnce(null);
    const app = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'admin', role: 'admin' })), deleteLibrary }));
    const request = { method: 'DELETE' as const, url: '/api/v1/libraries/11111111-1111-4111-8111-111111111111', headers: { cookie: 'dose_session=token' } };
    expect((await app.inject(request)).statusCode).toBe(204); expect((await app.inject(request)).statusCode).toBe(404);
    await app.close();
  });

  it('keeps user administration admin-only', async () => {
    const member = service({ authenticate: vi.fn(async () => ({ id: 'member-id', username: 'member', role: 'member' })) });
    const app = await appWith(member);
    expect((await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);
    await app.close();
  });

  it('lists sanitized users and passes the acting id to updates', async () => {
    const managed = { id: '22222222-2222-4222-8222-222222222222', username: 'kid', role: 'member' as const, disabled: false, createdAt: new Date(), updatedAt: new Date() };
    const updateUser = vi.fn(async () => ({ ...managed, disabled: true }));
    const app = await appWith(service({ authenticate: vi.fn(async () => ({ id: 'actor-id', username: 'admin', role: 'admin' })), listUsers: vi.fn(async () => [managed]), updateUser }));
    const list = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: 'dose_session=token' } });
    expect(list.statusCode).toBe(200); expect(list.body).not.toContain('password');
    const update = await app.inject({ method: 'PATCH', url: `/api/v1/users/${managed.id}`, headers: { cookie: 'dose_session=token' }, payload: { disabled: true } });
    expect(update.statusCode).toBe(200); expect(updateUser).toHaveBeenCalledWith('actor-id', managed.id, { disabled: true });
    await app.close();
  });

  it('maps duplicate usernames and account invariants to stable conflicts', async () => {
    const { DuplicateUsernameError, UserInvariantError } = await import('./auth-service.ts');
    const auth = { id: 'actor-id', username: 'admin', role: 'admin' as const };
    const app = await appWith(service({ authenticate: vi.fn(async () => auth), createUser: vi.fn(async () => { throw new DuplicateUsernameError(); }), deleteUser: vi.fn(async () => { throw new UserInvariantError('You cannot delete your own account'); }) }));
    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie: 'dose_session=token' }, payload: { username: 'guest', password: 'long-password', role: 'member' } });
    expect(duplicate.statusCode).toBe(409); expect(duplicate.body).not.toContain('23505');
    const conflict = await app.inject({ method: 'DELETE', url: '/api/v1/users/11111111-1111-4111-8111-111111111111', headers: { cookie: 'dose_session=token' } });
    expect(conflict.statusCode).toBe(409); expect(conflict.json()).toEqual({ error: 'You cannot delete your own account' });
    await app.close();
  });

  it('starts scans for admins, coalesces through the coordinator, and exposes status to members', async () => {
    const scan = { id: '33333333-3333-4333-8333-333333333333', libraryId: '11111111-1111-4111-8111-111111111111', status: 'queued' };
    const scanner = { start: vi.fn(async () => ({ scan, coalesced: false })), latest: vi.fn(async () => scan) } as unknown as ScanCoordinator;
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'actor-id', username: 'admin', role: 'admin' })) }); const app = await appWith(admin, scanner);
    const headers = { cookie: 'dose_session=token' }; const started = await app.inject({ method: 'POST', url: `/api/v1/libraries/${scan.libraryId}/scan`, headers });
    expect(started.statusCode).toBe(202); expect(scanner.start).toHaveBeenCalledWith(scan.libraryId);
    const latest = await app.inject({ method: 'GET', url: `/api/v1/libraries/${scan.libraryId}/scans/latest`, headers }); expect(latest.statusCode).toBe(200);
    await app.close();
  });

  it('searches the catalog for authenticated users and rejects blank queries', async () => {
    const groups = [{ id: 'movies', label: 'Movies', items: [{ id: 'm1', title: 'Inception', year: 2010, kind: 'movie', meta: '2h 28m' }] }];
    const search = vi.fn(async () => ({ query: 'inc', groups }));
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, { search } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' }; const id = '11111111-1111-4111-8111-111111111111';
    const ok = await app.inject({ method: 'GET', url: `/api/v1/catalog/search?libraryId=${id}&q=inc`, headers });
    expect(ok.statusCode).toBe(200); expect(ok.json()).toEqual({ query: 'inc', groups });
    expect(search).toHaveBeenCalledWith(id, 'inc');
    expect((await app.inject({ method: 'GET', url: `/api/v1/catalog/search?libraryId=${id}&q=`, headers })).statusCode).toBe(400);
    const anonymous = await appWith(service(), undefined, { search } as unknown as CatalogService);
    expect((await anonymous.inject({ method: 'GET', url: `/api/v1/catalog/search?libraryId=${id}&q=inc` })).statusCode).toBe(401);
    await app.close(); await anonymous.close();
  });

  it('validates random filters, returns a pick, and reports an empty pool', async () => {
    const randomItem = vi.fn().mockResolvedValueOnce({ id: 'm1', title: 'Arrival', kind: 'movie', year: 2016 }).mockResolvedValueOnce(null);
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, { randomItem } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' };
    const picked = await app.inject({ method: 'GET', url: '/api/v1/catalog/random?kind=movie&genre=Sci-Fi&yearMin=2000&yearMax=2020&ratingMin=7.5', headers });
    expect(picked.statusCode).toBe(200); expect(picked.json().item.id).toBe('m1');
    expect(randomItem).toHaveBeenCalledWith({ kind: 'movie', genre: 'Sci-Fi', yearMin: 2000, yearMax: 2020, ratingMin: 7.5 });
    expect((await app.inject({ method: 'GET', url: '/api/v1/catalog/random?yearMin=2025&yearMax=2020', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/catalog/random?ratingMin=11', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/v1/catalog/random', headers })).statusCode).toBe(404);
    const anonymous = await appWith(service(), undefined, { randomItem } as unknown as CatalogService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/catalog/random' })).statusCode).toBe(401);
    await app.close(); await anonymous.close();
  });

  it('lists categories and opens one for authenticated users', async () => {
    const categories = vi.fn(async () => [{ key: 'action', name: 'Action', count: 3 }]);
    const category = vi.fn(async (key: string) => key === 'action' ? { key: 'action', name: 'Action', titles: [] } : null);
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, { categories, category } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' };
    const list = await app.inject({ method: 'GET', url: '/api/v1/catalog/categories', headers });
    expect(list.statusCode).toBe(200); expect(list.json()).toEqual({ categories: [{ key: 'action', name: 'Action', count: 3 }] });
    expect(categories).toHaveBeenCalledWith(undefined);
    const opened = await app.inject({ method: 'GET', url: '/api/v1/catalog/categories/action', headers });
    expect(opened.statusCode).toBe(200); expect(opened.json()).toEqual({ category: { key: 'action', name: 'Action', titles: [] } });
    const missing = await app.inject({ method: 'GET', url: '/api/v1/catalog/categories/nope', headers });
    expect(missing.statusCode).toBe(404);
    const anonymous = await appWith(service(), undefined, { categories, category } as unknown as CatalogService);
    expect((await anonymous.inject({ method: 'GET', url: '/api/v1/catalog/categories' })).statusCode).toBe(401);
    await app.close(); await anonymous.close();
  });

  it('negotiates a playback plan from client capabilities and 404s when no file exists', async () => {
    const probe = { format: { format_name: 'mov,mp4' }, streams: [{ codec_type: 'video', codec_name: 'h264', height: 1080 }, { codec_type: 'audio', codec_name: 'ac3' }] };
    const playbackSource = vi.fn()
      .mockResolvedValueOnce({ fileId: 'f1', relativePath: 'a.mkv', durationSeconds: 8880, probe })
      .mockResolvedValueOnce(null);
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, { playbackSource } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' }; const id = '11111111-1111-4111-8111-111111111111';
    const response = await app.inject({ method: 'POST', url: `/api/v1/catalog/items/${id}/playback`, headers, payload: { containers: ['mp4'], videoCodecs: ['h264'], audioCodecs: ['aac'] } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.plan.mode).toBe('transcode');
    expect(body.plan.video).toEqual({ action: 'copy', codec: 'h264', height: 1080 });
    expect(body.plan.audio).toEqual({ action: 'transcode', codec: 'aac' });
    expect(body.stream.direct).toBe(false);
    expect(body.stream.url).toMatch(new RegExp(`^/api/v1/catalog/items/${id}/stream\\?plan=`));
    const missing = await app.inject({ method: 'POST', url: `/api/v1/catalog/items/${id}/playback`, headers, payload: {} });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('serves locally cached images and rejects traversal or missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dose-img-'));
    await writeFile(join(dir, 'poster.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, undefined, dir);
    const ok = await app.inject({ method: 'GET', url: '/api/v1/images/poster.jpg' });
    expect(ok.statusCode).toBe(200); expect(ok.headers['content-type']).toBe('image/jpeg');
    expect((await app.inject({ method: 'GET', url: '/api/v1/images/missing.jpg' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/images/..%2f..%2fetc%2fpasswd' })).statusCode).toBe(400);
    await app.close(); await rm(dir, { recursive: true, force: true });
  });

  it('resizes local images on demand and caches modern variants', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dose-img-'));
    await sharp({ create: { width: 100, height: 150, channels: 3, background: '#cc0000' } }).jpeg().toFile(join(dir, 'poster.jpg'));
    const app = await appWith(service(), undefined, undefined, dir);
    const resized = await app.inject({ method: 'GET', url: '/api/v1/images/poster.jpg?w=40&h=60&fit=cover&format=webp' });
    expect(resized.statusCode).toBe(200); expect(resized.headers['content-type']).toBe('image/webp');
    expect(await sharp(resized.rawPayload).metadata()).toMatchObject({ width: 40, height: 60, format: 'webp' });
    const cached = await app.inject({ method: 'GET', url: '/api/v1/images/poster.jpg?w=40&h=60&fit=cover&format=webp' });
    expect(cached.statusCode).toBe(200); expect(cached.rawPayload).toEqual(resized.rawPayload);
    expect((await app.inject({ method: 'GET', url: '/api/v1/images/poster.jpg?w=9000' })).statusCode).toBe(400);
    await app.close(); await rm(dir, { recursive: true, force: true });
  });

  it('direct-plays a file with HTTP range support', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dose-media-'));
    await mkdir(join(root, 'Dune'), { recursive: true });
    await writeFile(join(root, 'Dune', 'Dune.mp4'), Buffer.from('0123456789'));
    const playbackSource = vi.fn(async () => ({ fileId: 'f1', relativePath: 'Dune/Dune.mp4', rootPath: root, durationSeconds: 100, probe: {} }));
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, { playbackSource } as unknown as CatalogService);
    const headers = { cookie: 'dose_session=token' }; const id = '11111111-1111-4111-8111-111111111111';
    const full = await app.inject({ method: 'GET', url: `/api/v1/catalog/items/${id}/stream`, headers });
    expect(full.statusCode).toBe(200); expect(full.headers['accept-ranges']).toBe('bytes'); expect(full.headers['content-length']).toBe('10');
    const ranged = await app.inject({ method: 'GET', url: `/api/v1/catalog/items/${id}/stream`, headers: { ...headers, range: 'bytes=2-5' } });
    expect(ranged.statusCode).toBe(206); expect(ranged.headers['content-range']).toBe('bytes 2-5/10'); expect(ranged.body).toBe('2345');
    await app.close(); await rm(root, { recursive: true, force: true });
  });

  it('rejects an invalid transcode plan before starting ffmpeg', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dose-media-'));
    await writeFile(join(root, 'movie.mkv'), Buffer.from('media'));
    const playbackSource = vi.fn(async () => ({ fileId: 'f1', relativePath: 'movie.mkv', rootPath: root, durationSeconds: 100, probe: {} }));
    const member = service({ authenticate: vi.fn(async () => ({ id: 'user-id', username: 'member', role: 'member' })) });
    const app = await appWith(member, undefined, { playbackSource } as unknown as CatalogService);
    const id = '11111111-1111-4111-8111-111111111111';
    const response = await app.inject({ method: 'GET', url: `/api/v1/catalog/items/${id}/stream?plan=invalid`, headers: { cookie: 'dose_session=token' } });
    expect(response.statusCode).toBe(400); expect(response.json()).toEqual({ error: 'Invalid playback plan' });
    await app.close(); await rm(root, { recursive: true, force: true });
  });

  it('refreshes enrichment for admins and rejects members', async () => {
    const refreshLibrary = vi.fn(async () => ({ libraryId: '11111111-1111-4111-8111-111111111111', refreshed: 3, failed: 0 }));
    const scanner = { start: vi.fn(), latest: vi.fn(), refreshLibrary } as unknown as ScanCoordinator;
    const id = '11111111-1111-4111-8111-111111111111';
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const app = await appWith(admin, scanner);
    const ok = await app.inject({ method: 'POST', url: `/api/v1/libraries/${id}/refresh`, headers: { cookie: 'dose_session=token' } });
    expect(ok.statusCode).toBe(202); expect(ok.json()).toMatchObject({ refreshed: 3, failed: 0 });
    expect(refreshLibrary).toHaveBeenCalledWith(id, false);
    const member = service({ authenticate: vi.fn(async () => ({ id: 'm', username: 'member', role: 'member' })) });
    const memberApp = await appWith(member, scanner);
    expect((await memberApp.inject({ method: 'POST', url: `/api/v1/libraries/${id}/refresh`, headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);
    await app.close(); await memberApp.close();
  });

  it('keeps scan mutation admin-only and catalog authenticated', async () => {
    const scanner = { start: vi.fn(), latest: vi.fn() } as unknown as ScanCoordinator;
    const member = service({ authenticate: vi.fn(async () => ({ id: 'member-id', username: 'member', role: 'member' })) }); const app = await appWith(member, scanner);
    const id = '11111111-1111-4111-8111-111111111111'; expect((await app.inject({ method: 'POST', url: `/api/v1/libraries/${id}/scan`, headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);
    const anonymous = await appWith(service(), scanner, { home: vi.fn() } as unknown as CatalogService); expect((await anonymous.inject({ method: 'GET', url: `/api/v1/catalog/home?libraryId=${id}` })).statusCode).toBe(401);
    await app.close(); await anonymous.close();
  });
});

describe('Plugin administration API', () => {
  const entry = {
    plugin: {
      id: 'trailer-fetcher', metadata: { name: 'Trailer Fetcher', description: 'Fetch trailers', version: '1.0.0' },
      settingsSchema: { parse: () => ({ languages: ['en'], includeClips: false, apiKey: '' }) },
      fields: [
        { kind: 'list', key: 'languages', label: 'Preferred languages' },
        { kind: 'boolean', key: 'includeClips', label: 'Include clips' },
        { kind: 'password', key: 'apiKey', label: 'API key' },
      ],
      actions: [{ id: 'purge', label: 'Purge downloads' }],
      events: { 'media.item.enriched': () => undefined },
      run: () => undefined,
    },
    configuration: { pluginId: 'trailer-fetcher', enabled: true, schedule: null, settings: { languages: ['en'], includeClips: false, apiKey: 'super-secret' }, nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunDurationMs: null, lastRunSummary: null, lastRunError: null, createdAt: new Date(), updatedAt: new Date() },
  };
  function pluginsStub() {
    return {
      list: vi.fn(async () => [entry]), get: vi.fn(async () => entry), configure: vi.fn(async () => entry.configuration),
      run: vi.fn(async () => ({ id: 'r1', status: 'succeeded', durationMs: 5, summary: 'ok' })),
      runAction: vi.fn(async () => ({ id: 'r2', status: 'succeeded', durationMs: 5, summary: 'purged' })),
      history: vi.fn(async () => []),
    } as unknown as PluginService & { run: Mock; runAction: Mock };
  }

  async function appWithPlugins(auth: AuthService, plugins: PluginService) {
    const filesystem: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => true };
    const app = Fastify(); await app.register(cookie);
    await registerApiRoutes(app, auth, false, filesystem, undefined, undefined, undefined, false, plugins);
    return app;
  }

  it('lists plugins with their declared fields and never echoes secrets', async () => {
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const app = await appWithPlugins(admin, pluginsStub());
    const response = await app.inject({ method: 'GET', url: '/api/v1/plugins', headers: { cookie: 'dose_session=token' } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { plugins: Array<{ id: string; enabled: boolean; runnable: boolean; events: string[]; secretsSet: string[]; settings: Record<string, unknown>; fields: Array<{ key: string; kind: string }>; actions: Array<{ id: string }> }> };
    expect(body.plugins[0]).toMatchObject({ id: 'trailer-fetcher', enabled: true, runnable: true, secretsSet: ['apiKey'], events: ['media.item.enriched'] });
    expect(body.plugins[0].fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'languages', kind: 'list' }),
      expect.objectContaining({ key: 'includeClips', kind: 'boolean' }),
    ]));
    expect(body.plugins[0].actions).toEqual([expect.objectContaining({ id: 'purge' })]);
    expect(body.plugins[0].settings.apiKey).toBeNull();
    await app.close();
  });

  it('serves a single plugin and runs a declared action', async () => {
    const plugins = pluginsStub();
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const app = await appWithPlugins(admin, plugins);

    const single = await app.inject({ method: 'GET', url: '/api/v1/plugins/trailer-fetcher', headers: { cookie: 'dose_session=token' } });
    expect(single.statusCode).toBe(200);
    expect(single.json()).toMatchObject({ plugin: { id: 'trailer-fetcher' } });

    const action = await app.inject({ method: 'POST', url: '/api/v1/plugins/trailer-fetcher/actions/purge', headers: { cookie: 'dose_session=token' } });
    expect(action.statusCode).toBe(200);
    expect(plugins.runAction).toHaveBeenCalledWith('trailer-fetcher', 'purge');
    await app.close();
  });

  it('reports invalid settings as a per-field 400', async () => {
    const plugins = pluginsStub();
    plugins.configure = vi.fn(async () => { throw new ZodError([{ code: 'custom', path: ['updateIntervalDays'], message: 'Too large' }]); }) as never;
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const app = await appWithPlugins(admin, plugins);
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/plugins/trailer-fetcher', headers: { cookie: 'dose_session=token' }, payload: { settings: { updateIntervalDays: 400 } } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ errors: { updateIntervalDays: 'Too large' } });
    await app.close();
  });

  it('keeps plugin management admin-only and runs on demand', async () => {
    const plugins = pluginsStub();
    const member = service({ authenticate: vi.fn(async () => ({ id: 'm', username: 'member', role: 'member' })) });
    const memberApp = await appWithPlugins(member, plugins);
    expect((await memberApp.inject({ method: 'GET', url: '/api/v1/plugins', headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);
    expect((await memberApp.inject({ method: 'POST', url: '/api/v1/plugins/trailer-fetcher/run', headers: { cookie: 'dose_session=token' } })).statusCode).toBe(403);

    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const adminApp = await appWithPlugins(admin, plugins);
    const run = await adminApp.inject({ method: 'POST', url: '/api/v1/plugins/trailer-fetcher/run', headers: { cookie: 'dose_session=token' } });
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ run: { status: 'succeeded' } });
    expect(plugins.run).toHaveBeenCalledWith('trailer-fetcher');
    await memberApp.close(); await adminApp.close();
  });
});

describe('Device pairing API', () => {
  function appWithDevices(auth: AuthService, deviceAuth: DeviceAuthService) {
    const app = Fastify();
    const filesystem: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => true };
    return app.register(cookie).then(async () => {
      await registerApiRoutes(app, auth, false, filesystem, undefined, undefined, undefined, false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, deviceAuth);
      return app;
    });
  }

  const anonymous = () => service({ authenticate: vi.fn(async () => null) });
  const signedIn = () => service({ authenticate: vi.fn(async () => ({ id: 'u1', username: 'owner', role: 'member' })) });

  it('starts a pairing request without a session and names the device from its user agent', async () => {
    const deviceAuth = { start: vi.fn(async (deviceName: string) => ({ id: 'r1', userCode: 'K7QP-2M4X', deviceCode: 'secret', expiresAt: new Date('2030-01-01T00:00:00.000Z'), intervalMs: 2000, deviceName })) } as unknown as DeviceAuthService;
    const app = await appWithDevices(anonymous(), deviceAuth);

    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/device/start', payload: {}, headers: { 'user-agent': 'Mozilla/5.0 (SMART-TV; Linux) Chrome/120' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userCode: 'K7QP-2M4X', deviceCode: 'secret', deviceName: 'Chrome on TV', verificationPathComplete: '/link?code=K7QP-2M4X' });
    await app.close();
  });

  it('sets the session cookie when a poll comes back approved', async () => {
    const deviceAuth = { poll: vi.fn(async () => ({ status: 'approved', token: 'session-token', userId: 'u1' })) } as unknown as DeviceAuthService;
    const app = await appWithDevices(signedIn(), deviceAuth);

    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/device/poll', payload: { deviceCode: 'secret-device-code' } });

    expect(response.json()).toMatchObject({ status: 'approved' });
    expect(response.headers['set-cookie']).toEqual(expect.stringContaining('dose_session=session-token'));
    await app.close();
  });

  it('maps pairing failures to their own status codes', async () => {
    const { DeviceAuthError } = await import('./device-auth-service.ts');
    const deviceAuth = {
      poll: vi.fn()
        .mockRejectedValueOnce(new DeviceAuthError('slow_down'))
        .mockRejectedValueOnce(new DeviceAuthError('expired'))
        .mockRejectedValueOnce(new DeviceAuthError('already_used'))
        .mockRejectedValueOnce(new DeviceAuthError('not_found')),
    } as unknown as DeviceAuthService;
    const app = await appWithDevices(anonymous(), deviceAuth);

    const poll = () => app.inject({ method: 'POST', url: '/api/v1/auth/device/poll', payload: { deviceCode: 'secret-device-code' } });
    expect((await poll()).statusCode).toBe(429);
    expect((await poll()).statusCode).toBe(410);
    expect((await poll()).statusCode).toBe(409);
    expect((await poll()).statusCode).toBe(404);
    await app.close();
  });

  it('requires a session to approve a code or list devices', async () => {
    const deviceAuth = { resolve: vi.fn(), listSessions: vi.fn(async () => []) } as unknown as DeviceAuthService;
    const app = await appWithDevices(anonymous(), deviceAuth);

    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/device/K7QP-2M4X/approve' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/sessions' })).statusCode).toBe(401);
    expect(deviceAuth.resolve).not.toHaveBeenCalled();
    await app.close();
  });

  it('approves on behalf of the signed-in user only', async () => {
    const deviceAuth = { resolve: vi.fn(async () => ({ id: 'r1', deviceName: 'TV' })) } as unknown as DeviceAuthService;
    const app = await appWithDevices(signedIn(), deviceAuth);

    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/device/K7QP-2M4X/approve', headers: { cookie: 'dose_session=token' } });

    expect(response.statusCode).toBe(200);
    expect(deviceAuth.resolve).toHaveBeenCalledWith('K7QP-2M4X', 'u1', 'approved');
    await app.close();
  });
});

describe('describeUserAgent', () => {
  it('names common clients and falls back when it cannot tell', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome on Windows');
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604')).toBe('Safari on iOS');
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux) Firefox/121')).toBe('Firefox on Linux');
    expect(describeUserAgent(undefined)).toBe('Unknown device');
  });
});
