import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth-service.ts';
import { DuplicateLibraryError } from './auth-service.ts';
import { registerApiRoutes } from './routes.ts';
import type { LibraryFilesystem } from './security.ts';
import type { ScanCoordinator } from './scanner.ts';
import type { CatalogService } from './catalog-service.ts';
import type { PluginService } from './plugin-service.ts';
import sharp from 'sharp';
import type { MetadataMatchService } from './metadata-match-service.ts';

function service(overrides: Partial<Record<keyof AuthService, unknown>> = {}) {
  return {
    setupRequired: vi.fn(async () => true), setup: vi.fn(), login: vi.fn(), logout: vi.fn(),
    authenticate: vi.fn(async () => null), listLibraries: vi.fn(async () => []),
    createLibrary: vi.fn(), deleteLibrary: vi.fn(),
    listUsers: vi.fn(async () => []), createUser: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

async function appWith(auth: AuthService, scanner?: ScanCoordinator, catalog?: CatalogService, imagesDir?: string, nativeLibraryPaths = false, metadataMatch?: MetadataMatchService) {
  const filesystem: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => true };
  const app = Fastify(); await app.register(cookie); await registerApiRoutes(app, auth, false, filesystem, scanner, catalog, imagesDir, nativeLibraryPaths, undefined, undefined, undefined, undefined, metadataMatch); return app;
}

describe('API authorization', () => {
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
    plugin: { id: 'trailer-fetcher', metadata: { name: 'Trailer Fetcher', description: 'Fetch trailers', version: '1.0.0' }, settingsSchema: { parse: () => ({ languages: ['en'], includeClips: false }) }, settings: { languages: { label: 'Preferred languages' }, includeClips: { label: 'Include clips' } } },
    configuration: { pluginId: 'trailer-fetcher', enabled: true, schedule: null, settings: { languages: ['en'], includeClips: false }, nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunDurationMs: null, lastRunSummary: null, lastRunError: null, createdAt: new Date(), updatedAt: new Date() },
  };
  function pluginsStub() {
    return { list: vi.fn(async () => [entry]), get: vi.fn(async () => entry), configure: vi.fn(async () => entry.configuration), run: vi.fn(async () => ({ id: 'r1', status: 'succeeded', durationMs: 5, summary: 'ok' })), history: vi.fn(async () => []) } as unknown as PluginService;
  }
  async function appWithPlugins(auth: AuthService, plugins: PluginService) {
    const filesystem: LibraryFilesystem = { realpath: async (path) => path, isDirectory: async () => true };
    const app = Fastify(); await app.register(cookie);
    await registerApiRoutes(app, auth, false, filesystem, undefined, undefined, undefined, false, plugins);
    return app;
  }

  it('lists plugins with derived setting fields for admins', async () => {
    const admin = service({ authenticate: vi.fn(async () => ({ id: 'a', username: 'admin', role: 'admin' })) });
    const app = await appWithPlugins(admin, pluginsStub());
    const response = await app.inject({ method: 'GET', url: '/api/v1/plugins', headers: { cookie: 'dose_session=token' } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { plugins: Array<{ id: string; enabled: boolean; fields: Array<{ key: string; type: string }> }> };
    expect(body.plugins[0]).toMatchObject({ id: 'trailer-fetcher', enabled: true });
    expect(body.plugins[0].fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'languages', type: 'list' }),
      expect.objectContaining({ key: 'includeClips', type: 'boolean' }),
    ]));
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
