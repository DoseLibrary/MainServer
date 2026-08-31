import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DuplicateLibraryError, DuplicateUsernameError, UserInvariantError, UserNotFoundError, type AuthService, type PublicUser } from './auth-service.ts';
import { nodeLibraryFilesystem, resolveLibraryRoot, resolveNativeLibraryRoot, SESSION_COOKIE, SESSION_TTL_MS, type LibraryFilesystem } from './security.ts';
import type { ScanCoordinator } from './scanner.ts';
import type { CatalogService } from './catalog-service.ts';
import { PluginAlreadyRunningError, type PluginService } from './plugin-service.ts';
import type { PluginScheduler } from './plugin-scheduler.ts';
import { UnknownPluginError } from './plugins/registry.ts';
import { ArtworkPathError, type ArtworkService } from './artwork-service.ts';
import type { SubtitleStore } from './subtitles.ts';
import type { PreviewSpriteStore } from './sprites.ts';
import { negotiatePlayback } from './playback.ts';
import { buildTranscodeArgs, contentTypeFor, decodePlaybackPlan, encodePlaybackPlan, resolveRange, resolveWithin } from './streaming.ts';
import { ImageVariantStore } from './images.ts';
import { MatchItemNotFoundError, MatchUnsupportedKindError, TmdbMatchNotFoundError, type MetadataMatchService } from './metadata-match-service.ts';
import type { LibraryWatcher } from './library-watcher.ts';

const credentials = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(10).max(256) });
const loginCredentials = credentials.extend({ password: z.string().min(1).max(256) });
const libraryInput = z.object({ name: z.string().trim().min(1).max(128), kind: z.enum(['movies', 'shows']), rootPath: z.string().min(1), enabled: z.boolean().optional() });
const idParams = z.object({ id: z.string().uuid() });
const homeQuery = z.object({ libraryId: z.string().uuid().optional() });
const progressBody = z.object({ positionSeconds: z.number().int().min(0).max(86_400).optional(), watched: z.boolean().optional() }).refine((value) => value.positionSeconds != null || value.watched != null, { message: 'positionSeconds or watched is required' });
const searchQuery = z.object({ libraryId: z.string().uuid().optional(), q: z.string().trim().min(1).max(128) });
const categoryParams = z.object({ key: z.string().trim().min(1).max(120) });
const adminItemsQuery = z.object({
  archived: z.enum(['true', 'false']).optional(),
  sort: z.enum(['title', 'archivedAt']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(128).optional(),
});
const capabilities = z.object({
  containers: z.array(z.string().min(1).max(32)).max(32).default([]),
  videoCodecs: z.array(z.string().min(1).max(32)).max(32).default([]),
  audioCodecs: z.array(z.string().min(1).max(32)).max(32).default([]),
  maxHeight: z.number().int().positive().max(16384).optional(),
  maxBitrate: z.number().int().positive().optional(),
});
const imageParams = z.object({ name: z.string().regex(/^[A-Za-z0-9._-]+$/).max(255) });
const imageQuery = z.object({
  w: z.coerce.number().int().positive().max(4096).optional(),
  h: z.coerce.number().int().positive().max(4096).optional(),
  fit: z.enum(['cover', 'contain', 'inside']).default('inside'),
  format: z.enum(['jpeg', 'webp', 'avif']).default('webp'),
  quality: z.coerce.number().int().min(30).max(95).default(82),
}).refine((value) => value.w != null || value.h != null, { message: 'A width or height is required' });
const streamQuery = z.object({ plan: z.string().max(4096).optional() });
const castStreamParams = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const userCreate = credentials.extend({ role: z.enum(['admin', 'member']).default('member') });
const userUpdate = z.object({ role: z.enum(['admin', 'member']).optional(), disabled: z.boolean().optional(), password: z.string().min(10).max(256).optional() }).refine((value) => Object.keys(value).length > 0);
const pluginIdParams = z.object({ id: z.string().min(1).max(64) });
const pluginConfigBody = z.object({ enabled: z.boolean().optional(), schedule: z.string().trim().max(200).nullable().optional(), settings: z.record(z.string(), z.unknown()).optional() });
const tmdbImagePath = z.string().regex(/^\/[A-Za-z0-9._/-]{1,255}$/);
const artworkBody = z.object({ posterPath: tmdbImagePath.nullable().optional(), backdropPath: tmdbImagePath.nullable().optional() }).refine((value) => value.posterPath !== undefined || value.backdropPath !== undefined, { message: 'posterPath or backdropPath is required' });
const tmdbSearchQuery = z.object({ type: z.enum(['movie', 'series']), q: z.string().trim().max(128).default('') });
const tmdbMatchBody = z.object({ tmdbId: z.number().int().positive() });

function setSession(reply: FastifyReply, token: string, production: boolean) {
  reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: production, maxAge: SESSION_TTL_MS / 1000 });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply, service: AuthService) {
  const user = await service.authenticate(request.cookies[SESSION_COOKIE]);
  if (!user) { await reply.status(401).send({ error: 'Authentication required' }); return null; }
  return user;
}

function requireAdmin(user: PublicUser, reply: FastifyReply) {
  if (user.role !== 'admin') { void reply.status(403).send({ error: 'Administrator access required' }); return false; }
  return true;
}

export async function registerApiRoutes(app: FastifyInstance, service: AuthService, production: boolean, filesystem: LibraryFilesystem = nodeLibraryFilesystem, scanner?: ScanCoordinator, catalog?: CatalogService, imagesDir = '/config/images', nativeLibraryPaths = false, plugins?: PluginService, pluginScheduler?: PluginScheduler, artwork?: ArtworkService, subtitleStore?: SubtitleStore, metadataMatch?: MetadataMatchService, libraryWatcher?: Pick<LibraryWatcher, 'synchronize'>, spriteStore?: PreviewSpriteStore) {
  const imageVariants = new ImageVariantStore(imagesDir);
  const synchronizeWatchers = async () => {
    try { await libraryWatcher?.synchronize(); }
    catch (error) { app.log.error(error, 'library watcher synchronization failed'); }
  };
  const castStreams = new Map<string, { itemId: string; plan?: string; expiresAt: number }>();
  app.get('/api/v1/setup/status', async () => ({ setupRequired: await service.setupRequired() }));
  app.post('/api/v1/setup', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Username is required and password must be at least 10 characters' });
    try { const result = await service.setup(parsed.data.username, parsed.data.password); setSession(reply, result.token, production); return reply.status(201).send({ user: result.user }); }
    catch (error) { if (error instanceof Error && error.message === 'SETUP_COMPLETE') return reply.status(409).send({ error: 'Setup already completed' }); throw error; }
  });
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginCredentials.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid credentials' });
    const result = await service.login(parsed.data.username, parsed.data.password);
    if (!result) return reply.status(401).send({ error: 'Invalid credentials' });
    setSession(reply, result.token, production); return { user: result.user };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => { await service.logout(request.cookies[SESSION_COOKIE]); reply.clearCookie(SESSION_COOKIE, { path: '/' }); return reply.status(204).send(); });
  app.get('/api/v1/auth/me', async (request, reply) => { const user = await requireUser(request, reply, service); if (user) return { user }; });
  app.get('/api/v1/admin/tmdb/search', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const parsed = tmdbSearchQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid TMDB search' });
    if (!metadataMatch) return reply.status(503).send({ error: 'Metadata matching unavailable' });
    if (!parsed.data.q) return { results: [] };
    return { results: await metadataMatch.search(parsed.data.type, parsed.data.q) };
  });
  app.post('/api/v1/admin/items/:id/match', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const params = idParams.safeParse(request.params); const body = tmdbMatchBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid item or TMDB id' });
    if (!metadataMatch) return reply.status(503).send({ error: 'Metadata matching unavailable' });
    try { return { item: await metadataMatch.match(params.data.id, body.data.tmdbId) }; }
    catch (error) {
      if (error instanceof MatchItemNotFoundError) return reply.status(404).send({ error: 'Item not found' });
      if (error instanceof MatchUnsupportedKindError) return reply.status(400).send({ error: 'Only movies and series can be matched' });
      if (error instanceof TmdbMatchNotFoundError) return reply.status(404).send({ error: 'TMDB title not found' });
      throw error;
    }
  });
  app.get('/api/v1/admin/items', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const parsed = adminItemsQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid item filter' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return catalog.adminMediaList({
      archived: parsed.data.archived === undefined ? undefined : parsed.data.archived === 'true',
      sort: parsed.data.sort, direction: parsed.data.direction, limit: parsed.data.limit, offset: parsed.data.offset, query: parsed.data.q,
    });
  });
  app.delete('/api/v1/admin/items/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const removed = await catalog.removeItem(params.data.id); if (!removed) return reply.status(404).send({ error: 'Item not found' });
    return reply.status(204).send();
  });
  app.get('/api/v1/libraries', async (request, reply) => { const user = await requireUser(request, reply, service); if (user) return { libraries: await service.listLibraries() }; });
  app.post('/api/v1/libraries', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const parsed = libraryInput.safeParse(request.body); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library' });
    try { const rootPath = nativeLibraryPaths ? await resolveNativeLibraryRoot(parsed.data.rootPath, filesystem) : await resolveLibraryRoot(parsed.data.rootPath, filesystem); const library = await service.createLibrary({ ...parsed.data, rootPath }); await synchronizeWatchers(); return reply.status(201).send({ library }); }
    catch (error) {
      if (error instanceof DuplicateLibraryError) return reply.status(409).send({ error: 'A library with that name or root already exists' });
      if (error instanceof Error && (error.message.startsWith('Library root') || error.message.includes('ENOENT') || error.message.includes('EACCES'))) return reply.status(400).send({ error: error.message.startsWith('Library root') ? error.message : 'Library root must be an accessible directory' });
      throw error;
    }
  });
  app.delete('/api/v1/libraries/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library id' });
    if (!await service.deleteLibrary(parsed.data.id)) return reply.status(404).send({ error: 'Library not found' });
    await synchronizeWatchers();
    return reply.status(204).send();
  });
  app.post('/api/v1/libraries/:id/scan', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library id' });
    if (!scanner) return reply.status(503).send({ error: 'Scanner unavailable' });
    const result = await scanner.start(parsed.data.id); if (!result) return reply.status(404).send({ error: 'Library not found' });
    return reply.status(202).send(result);
  });
  app.post('/api/v1/libraries/:id/refresh', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library id' });
    const force = z.object({ force: z.coerce.boolean().optional().default(false) }).safeParse(request.query);
    if (!scanner) return reply.status(503).send({ error: 'Scanner unavailable' });
    const result = await scanner.refreshLibrary(parsed.data.id, force.success ? force.data.force : false);
    if (!result) return reply.status(404).send({ error: 'Library not found' });
    return reply.status(202).send(result);
  });
  app.get('/api/v1/libraries/:id/scans/latest', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library id' });
    if (!scanner) return reply.status(503).send({ error: 'Scanner unavailable' });
    const scan = await scanner.latest(parsed.data.id); if (!scan) return reply.status(404).send({ error: 'No scans found' }); return { scan };
  });
  app.get('/api/v1/catalog/home', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = homeQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' }); return catalog.home(parsed.data.libraryId, user.id);
  });
  app.get('/api/v1/catalog/items/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' }); const item = await catalog.item(parsed.data.id, user.id); if (!item) return reply.status(404).send({ error: 'Item not found' }); return { item };
  });
  app.post('/api/v1/catalog/items/:id/progress', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    const body = progressBody.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid progress' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    await catalog.saveProgress(user.id, params.data.id, body.data.positionSeconds, body.data.watched);
    return reply.status(204).send();
  });
  app.post('/api/v1/catalog/items/:id/watchlist', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return catalog.setWatchlist(user.id, params.data.id, true);
  });
  app.delete('/api/v1/catalog/items/:id/watchlist', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return catalog.setWatchlist(user.id, params.data.id, false);
  });
  app.get('/api/v1/catalog/items/:id/artwork', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!artwork) return reply.status(503).send({ error: 'Artwork unavailable' });
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid item id' });
    const options = await artwork.options(parsed.data.id); if (!options) return reply.status(404).send({ error: 'Item not found' });
    return options;
  });
  app.patch('/api/v1/catalog/items/:id/artwork', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!artwork) return reply.status(503).send({ error: 'Artwork unavailable' });
    const parsed = idParams.safeParse(request.params); const body = artworkBody.safeParse(request.body);
    if (!parsed.success || !body.success) return reply.status(400).send({ error: 'Invalid artwork selection' });
    try {
      const updated = await artwork.apply(parsed.data.id, body.data);
      if (!updated) return reply.status(404).send({ error: 'Item not found' });
      return { item: updated };
    } catch (error) {
      if (error instanceof ArtworkPathError) return reply.status(400).send({ error: 'Invalid image path' });
      throw error;
    }
  });
  app.get('/api/v1/subtitles/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!catalog || !subtitleStore) return reply.status(503).send({ error: 'Subtitles unavailable' });
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid subtitle id' });
    const row = await catalog.subtitle(parsed.data.id); if (!row) return reply.status(404).send({ error: 'Subtitle not found' });
    try {
      const body = await subtitleStore.read(row.storageKey);
      reply.header('Content-Type', 'text/vtt; charset=utf-8');
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(body);
    } catch { return reply.status(404).send({ error: 'Subtitle not found' }); }
  });
  app.get('/api/v1/catalog/collections/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid collection id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const collection = await catalog.collection(parsed.data.id); if (!collection) return reply.status(404).send({ error: 'Collection not found' });
    return { collection };
  });
  app.get('/api/v1/catalog/genres/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid genre id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const genre = await catalog.genre(parsed.data.id); if (!genre) return reply.status(404).send({ error: 'Genre not found' });
    return { genre };
  });
  app.get('/api/v1/catalog/categories', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = homeQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library filter' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return { categories: await catalog.categories(parsed.data.libraryId) };
  });
  app.get('/api/v1/catalog/categories/:key', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = categoryParams.safeParse(request.params); const query = homeQuery.safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'Invalid category' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const category = await catalog.category(params.data.key, query.data.libraryId); if (!category) return reply.status(404).send({ error: 'Category not found' });
    return { category };
  });
  app.get('/api/v1/catalog/people/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid person id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const person = await catalog.person(parsed.data.id); if (!person) return reply.status(404).send({ error: 'Person not found' });
    return { person };
  });
  app.get('/api/v1/catalog/search', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = searchQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid search query' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return catalog.search(parsed.data.libraryId, parsed.data.q);
  });
  app.post('/api/v1/catalog/items/:id/playback', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    const body = capabilities.safeParse(request.body ?? {}); if (!body.success) return reply.status(400).send({ error: 'Invalid client capabilities' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.playbackSource(params.data.id); if (!source) return reply.status(404).send({ error: 'No playable file for this item' });
    const plan = negotiatePlayback(source.probe, body.data);
    if (plan.mode === 'transcode' && plan.container !== 'mp4') return reply.status(406).send({ error: 'No supported transcode container; client must support mp4' });
    const baseUrl = `/api/v1/catalog/items/${params.data.id}/stream`;
    const url = plan.mode === 'direct' ? baseUrl : `${baseUrl}?plan=${encodeURIComponent(encodePlaybackPlan(plan))}`;
    const castToken = randomBytes(32).toString('hex');
    castStreams.set(castToken, { itemId: params.data.id, plan: plan.mode === 'direct' ? undefined : encodePlaybackPlan(plan), expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return { plan, durationSeconds: source.durationSeconds, stream: { url, castUrl: `/api/v1/cast/${castToken}/stream`, direct: plan.mode === 'direct' } };
  });
  app.get('/api/v1/images/:name', async (request, reply) => {
    const parsed = imageParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid image name' });
    const file = join(imagesDir, parsed.data.name);
    try { const info = await stat(file); if (!info.isFile()) return reply.status(404).send({ error: 'Image not found' }); }
    catch { return reply.status(404).send({ error: 'Image not found' }); }
    const hasTransform = Object.keys(request.query as Record<string, unknown>).length > 0;
    if (hasTransform) {
      const query = imageQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid image options' });
      try {
        const variant = await imageVariants.get(parsed.data.name, { width: query.data.w, height: query.data.h, fit: query.data.fit, format: query.data.format, quality: query.data.quality });
        reply.header('Cache-Control', 'public, max-age=31536000, immutable'); reply.type(variant.contentType);
        return reply.send(createReadStream(variant.path));
      } catch { return reply.status(422).send({ error: 'Image could not be resized' }); }
    }
    const ext = parsed.data.name.slice(parsed.data.name.lastIndexOf('.') + 1).toLowerCase();
    reply.header('Cache-Control', 'public, max-age=604800, immutable'); reply.type(IMAGE_TYPES[ext] ?? 'application/octet-stream');
    return reply.send(createReadStream(file));
  });
  app.get('/api/v1/catalog/items/:id/stream', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    const query = streamQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid stream options' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.playbackSource(params.data.id); if (!source) return reply.status(404).send({ error: 'No playable file for this item' });
    const absolute = resolveWithin(source.rootPath, source.relativePath); if (!absolute) return reply.status(404).send({ error: 'File not found' });
    let info; try { info = await stat(absolute); } catch { return reply.status(404).send({ error: 'File not found' }); }
    if (!info.isFile()) return reply.status(404).send({ error: 'File not found' });

    if (query.data.plan) {
      const plan = decodePlaybackPlan(query.data.plan);
      if (!plan) return reply.status(400).send({ error: 'Invalid playback plan' });
      const child = spawn('ffmpeg', buildTranscodeArgs(plan, absolute), { stdio: ['ignore', 'pipe', 'ignore'] });
      child.on('error', () => { request.raw.destroy(); });
      request.raw.on('close', () => child.kill('SIGKILL'));
      reply.header('Content-Type', 'video/mp4'); reply.header('Cache-Control', 'no-store');
      return reply.send(child.stdout);
    }

    const range = resolveRange(request.headers.range, info.size);
    if (range.status === 416) { reply.header('Content-Range', `bytes */${info.size}`); return reply.status(416).send(); }
    reply.header('Accept-Ranges', 'bytes'); reply.header('Content-Type', contentTypeFor(absolute)); reply.header('Content-Length', String(range.length));
    if (range.status === 206) { reply.header('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`); reply.status(206); }
    return reply.send(createReadStream(absolute, { start: range.start, end: range.end }));
  });
  app.get('/api/v1/media/:id/trailer', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.localTrailerSource(params.data.id); if (!source) return reply.status(404).send({ error: 'Trailer not found' });
    let info; try { info = await stat(source.localPath); } catch { return reply.status(404).send({ error: 'Trailer not found' }); }
    if (!info.isFile()) return reply.status(404).send({ error: 'Trailer not found' });
    const range = resolveRange(request.headers.range, info.size);
    if (range.status === 416) { reply.header('Content-Range', `bytes */${info.size}`); return reply.status(416).send(); }
    reply.header('Accept-Ranges', 'bytes'); reply.header('Content-Type', contentTypeFor(source.localPath)); reply.header('Content-Length', String(range.length)); reply.header('Cache-Control', 'private, max-age=3600');
    if (range.status === 206) { reply.header('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`); reply.status(206); }
    return reply.send(createReadStream(source.localPath, { start: range.start, end: range.end }));
  });
  app.get('/api/v1/media/:id/sprites', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const sprite = await catalog.previewSprite(params.data.id); if (!sprite) return reply.status(404).send({ error: 'Preview sprite not found' });
    return { sprite: { src: `/api/v1/media/${encodeURIComponent(params.data.id)}/sprites/sheet`, columns: sprite.columns, rows: sprite.rows, interval: sprite.interval, tileWidth: sprite.tileWidth, tileHeight: sprite.tileHeight } };
  });
  app.get('/api/v1/media/:id/sprites/sheet', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog || !spriteStore) return reply.status(503).send({ error: 'Previews unavailable' });
    const sprite = await catalog.previewSprite(params.data.id); if (!sprite) return reply.status(404).send({ error: 'Preview sprite not found' });
    let body; try { body = await spriteStore.read(sprite.storageKey); } catch { return reply.status(404).send({ error: 'Preview sprite not found' }); }
    reply.header('Content-Type', 'image/jpeg'); reply.header('Cache-Control', 'private, max-age=86400'); return reply.send(body);
  });
  app.get('/api/v1/cast/:token/stream', async (request, reply) => {
    const params = castStreamParams.safeParse(request.params); if (!params.success) return reply.status(404).send({ error: 'Stream not found' });
    const grant = castStreams.get(params.data.token);
    if (!grant || grant.expiresAt <= Date.now()) { castStreams.delete(params.data.token); return reply.status(404).send({ error: 'Stream not found' }); }
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.playbackSource(grant.itemId); if (!source) return reply.status(404).send({ error: 'Stream not found' });
    const absolute = resolveWithin(source.rootPath, source.relativePath); if (!absolute) return reply.status(404).send({ error: 'Stream not found' });
    let info; try { info = await stat(absolute); } catch { return reply.status(404).send({ error: 'Stream not found' }); }
    if (!info.isFile()) return reply.status(404).send({ error: 'Stream not found' });
    if (grant.plan) {
      const plan = decodePlaybackPlan(grant.plan); if (!plan) return reply.status(404).send({ error: 'Stream not found' });
      const child = spawn('ffmpeg', buildTranscodeArgs(plan, absolute), { stdio: ['ignore', 'pipe', 'ignore'] });
      child.on('error', () => { request.raw.destroy(); }); request.raw.on('close', () => child.kill('SIGKILL'));
      reply.header('Content-Type', 'video/mp4'); reply.header('Cache-Control', 'private, no-store'); return reply.send(child.stdout);
    }
    const range = resolveRange(request.headers.range, info.size);
    if (range.status === 416) { reply.header('Content-Range', `bytes */${info.size}`); return reply.status(416).send(); }
    reply.header('Accept-Ranges', 'bytes'); reply.header('Content-Type', contentTypeFor(absolute)); reply.header('Content-Length', String(range.length)); reply.header('Cache-Control', 'private, no-store');
    if (range.status === 206) { reply.header('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`); reply.status(206); }
    return reply.send(createReadStream(absolute, { start: range.start, end: range.end }));
  });
  app.get('/api/v1/users', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    return { users: await service.listUsers() };
  });
  app.post('/api/v1/users', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    const parsed = userCreate.safeParse(request.body); if (!parsed.success) return reply.status(400).send({ error: 'Invalid user' });
    try { return reply.status(201).send({ user: await service.createUser(parsed.data) }); }
    catch (error) { return userError(error, reply); }
  });
  app.patch('/api/v1/users/:id', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    const params = idParams.safeParse(request.params); const body = userUpdate.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid user update' });
    try { return { user: await service.updateUser(actor.id, params.data.id, body.data) }; }
    catch (error) { return userError(error, reply); }
  });
  app.delete('/api/v1/users/:id', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid user id' });
    try { await service.deleteUser(actor.id, params.data.id); return reply.status(204).send(); }
    catch (error) { return userError(error, reply); }
  });

  app.get('/api/v1/plugins', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!plugins) return reply.status(503).send({ error: 'Plugins unavailable' });
    return { plugins: (await plugins.list()).map(describePlugin) };
  });
  app.get('/api/v1/plugins/:id/runs', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!plugins) return reply.status(503).send({ error: 'Plugins unavailable' });
    const params = pluginIdParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid plugin id' });
    try { return { runs: await plugins.history(params.data.id) }; }
    catch (error) { return pluginError(error, reply); }
  });
  app.patch('/api/v1/plugins/:id', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!plugins) return reply.status(503).send({ error: 'Plugins unavailable' });
    const params = pluginIdParams.safeParse(request.params); const body = pluginConfigBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid plugin configuration' });
    try {
      await plugins.configure(params.data.id, body.data);
      await pluginScheduler?.reload();
      const { plugin, configuration } = await plugins.get(params.data.id);
      return { plugin: describePlugin({ plugin, configuration }) };
    } catch (error) { return pluginError(error, reply); }
  });
  app.post('/api/v1/plugins/:id/run', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!plugins) return reply.status(503).send({ error: 'Plugins unavailable' });
    const params = pluginIdParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid plugin id' });
    try { return { run: await plugins.run(params.data.id) }; }
    catch (error) { return pluginError(error, reply); }
  });
}

/** Shape a plugin definition + its stored configuration for the admin UI, deriving a
 * simple field descriptor list from the settings metadata and parsed defaults. */
function describePlugin(entry: { plugin: import('./plugins/types.ts').RegisteredPlugin; configuration: typeof import('./db/schema.ts').pluginConfigurations.$inferSelect }) {
  const defaults = entry.plugin.settingsSchema.parse({}) as Record<string, unknown>;
  const fields = Object.entries(entry.plugin.settings ?? {}).map(([key, meta]) => {
    const value = defaults[key];
    const type = typeof value === 'boolean' ? 'boolean' : Array.isArray(value) ? 'list' : typeof value === 'number' ? 'number' : 'text';
    return { key, label: meta.label, description: meta.description, secret: meta.secret ?? false, type, default: value };
  });
  const cfg = entry.configuration;
  return {
    id: entry.plugin.id, name: entry.plugin.metadata.name, description: entry.plugin.metadata.description, version: entry.plugin.metadata.version,
    fields, enabled: cfg.enabled, schedule: cfg.schedule, settings: cfg.settings,
    nextRunAt: cfg.nextRunAt, lastRunAt: cfg.lastRunAt, lastRunStatus: cfg.lastRunStatus,
    lastRunDurationMs: cfg.lastRunDurationMs, lastRunSummary: cfg.lastRunSummary, lastRunError: cfg.lastRunError,
  };
}

function pluginError(error: unknown, reply: FastifyReply) {
  if (error instanceof UnknownPluginError) return reply.status(404).send({ error: 'Unknown plugin' });
  if (error instanceof PluginAlreadyRunningError) return reply.status(409).send({ error: 'Plugin is already running' });
  throw error;
}

function userError(error: unknown, reply: FastifyReply) {
  if (error instanceof DuplicateUsernameError) return reply.status(409).send({ error: 'That username is already in use' });
  if (error instanceof UserInvariantError) return reply.status(409).send({ error: error.message });
  if (error instanceof UserNotFoundError) return reply.status(404).send({ error: 'User not found' });
  throw error;
}
