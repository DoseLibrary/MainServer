import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import { DuplicateLibraryError, DuplicateUsernameError, UserInvariantError, UserNotFoundError, type AuthService, type PublicUser } from './auth-service.ts';
import { nodeLibraryFilesystem, resolveLibraryRoot, resolveNativeLibraryRoot, SESSION_COOKIE, SESSION_TTL_MS, type LibraryFilesystem } from './security.ts';
import type { ScanCoordinator } from './scanner.ts';
import type { CatalogService } from './catalog-service.ts';
import { PluginAlreadyRunningError, PluginNotRunnableError, UnknownPluginActionError, type PluginService } from './plugin-service.ts';
import { DeviceAuthError, DEVICE_POLL_INTERVAL_MS, type DeviceAuthService } from './device-auth-service.ts';
import { UnknownSessionError, type PlaybackSessionService } from './playback-session-service.ts';
import { GrantNotReadyError, UnknownGrantError, type DownloadService } from './download-service.ts';
import { DOWNLOAD_PROFILES, estimateTotalBytes, isDownloadProfile } from './download-profiles.ts';
import { LoginThrottle } from './login-throttle.ts';
import type { PluginScheduler } from './plugin-scheduler.ts';
import { UnknownPluginError } from './plugins/registry.ts';
import { ArtworkPathError, type ArtworkService } from './artwork-service.ts';
import type { SubtitleStore } from './subtitles.ts';
import type { PreviewSpriteStore } from './sprites.ts';
import { negotiatePlayback, type PlaybackPlan } from './playback.ts';
import { buildTranscodeArgs, contentTypeFor, decodePlaybackPlan, encodePlaybackPlan, resolveRange, resolveWithin } from './streaming.ts';
import { audioTracksOf } from './playback.ts';
import { SEGMENT_SECONDS, buildSegmentArgs, ladderFor, masterPlaylist, mediaPlaylist, segmentCount, type HlsVariant } from './hls.ts';
import { SegmentCache } from './hls-cache.ts';
import { Semaphore } from './concurrency.ts';
import { applyAlignment, parseSubtitles, serializeVtt } from './subtitle-sync.ts';
import { ImageVariantStore } from './images.ts';
import { MatchItemNotFoundError, MatchUnsupportedKindError, TmdbMatchNotFoundError, type MetadataMatchService } from './metadata-match-service.ts';
import type { LibraryWatcher } from './library-watcher.ts';
import { userSettingsPatch, type UserSettingsService } from './user-settings-service.ts';
import { UserCollectionNotFoundError, userCollectionInput, userCollectionOrder, userCollectionPatch, type UserCollectionsService } from './user-collections-service.ts';
import { queueItemBody, queueOrder, type QueueService } from './queue-service.ts';
import { watchDataDocument, type WatchDataService } from './watch-data-service.ts';
import { HistorySourceError, type HistorySource } from './history-sources/types.ts';
import { plexConfig } from './history-sources/plex.ts';
import { traktConfig } from './history-sources/trakt.ts';
import { tautulliConfig } from './history-sources/tautulli.ts';

const credentials = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(10).max(256) });
const loginCredentials = credentials.extend({ password: z.string().min(1).max(256) });
const libraryInput = z.object({ name: z.string().trim().min(1).max(128), kind: z.enum(['movies', 'shows']), rootPath: z.string().min(1), enabled: z.boolean().optional() });
const libraryKindInput = z.object({ kind: z.enum(['movies', 'shows']) });
const idParams = z.object({ id: z.string().uuid() });
const collectionItemParams = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });
const collectionItemBody = z.object({ mediaItemId: z.string().uuid() });
const queueNextQuery = z.object({ after: z.string().uuid().optional() });
const historySourceParams = z.object({ source: z.enum(['plex', 'trakt', 'tautulli']) });
const historySourceConfig = { plex: plexConfig, trakt: traktConfig, tautulli: tautulliConfig } as const;
export type HistorySources = Partial<Record<'plex' | 'trakt' | 'tautulli', HistorySource<unknown>>>;
const homeQuery = z.object({ libraryId: z.string().uuid().optional() });
const randomQuery = z.object({
  kind: z.enum(['movie', 'series']).optional(),
  genre: z.string().trim().min(1).max(120).optional(),
  yearMin: z.coerce.number().int().min(1888).max(2200).optional(),
  yearMax: z.coerce.number().int().min(1888).max(2200).optional(),
  ratingMin: z.coerce.number().min(0).max(10).optional(),
}).refine((value) => value.yearMin == null || value.yearMax == null || value.yearMin <= value.yearMax, { message: 'yearMin must not exceed yearMax' });
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
  /** Which audio track to play, by position among the file's audio streams. */
  audioTrackIndex: z.number().int().min(0).max(63).optional(),
});
const imageParams = z.object({ name: z.string().regex(/^[A-Za-z0-9._-]+$/).max(255) });
const imageQuery = z.object({
  w: z.coerce.number().int().positive().max(4096).optional(),
  h: z.coerce.number().int().positive().max(4096).optional(),
  fit: z.enum(['cover', 'contain', 'inside']).default('inside'),
  format: z.enum(['jpeg', 'webp', 'avif']).default('webp'),
  quality: z.coerce.number().int().min(30).max(95).default(82),
}).refine((value) => value.w != null || value.h != null, { message: 'A width or height is required' });
const streamQuery = z.object({ plan: z.string().max(4096).optional(), start: z.coerce.number().min(0).max(360_000).optional() });
const hlsQuery = z.object({ plan: z.string().max(4096), q: z.string().regex(/^[a-z0-9]{1,12}$/) });
const hlsSegmentParams = z.object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(100_000) });
const castStreamParams = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const maturityLimit = z.number().int().min(0).max(21).nullable();
const userCreate = credentials.extend({ role: z.enum(['admin', 'member']).default('member'), maxMaturityLevel: maturityLimit.optional() });
const userUpdate = z.object({ role: z.enum(['admin', 'member']).optional(), disabled: z.boolean().optional(), password: z.string().min(10).max(256).optional(), maxMaturityLevel: maturityLimit.optional() }).refine((value) => Object.keys(value).length > 0);
const playbackSessionStart = z.object({ mediaItemId: z.string().uuid(), playMethod: z.enum(['direct', 'remux', 'transcode']).default('direct'), positionSeconds: z.number().min(0).optional(), durationSeconds: z.number().min(0).optional() });
const downloadBody = z.object({ mediaItemId: z.string().uuid(), profile: z.string().refine(isDownloadProfile, 'Unknown profile') });
const downloadEstimateQuery = z.object({ mediaItemId: z.string().uuid(), profile: z.string().refine(isDownloadProfile, 'Unknown profile') });
const historyForgetQuery = z.object({ itemId: z.string().uuid().optional() });
// A viewer nudge for a track automatic timing did not quite land.
const subtitleQuery = z.object({ offsetMs: z.coerce.number().int().min(-600_000).max(600_000).optional() });
const playbackSessionUpdate = z.object({ positionSeconds: z.number().min(0).optional(), paused: z.boolean().optional() });
const deviceStartBody = z.object({ deviceName: z.string().trim().min(1).max(64).optional() });
const devicePollBody = z.object({ deviceCode: z.string().min(10).max(256) });
const deviceCodeParams = z.object({ code: z.string().trim().min(4).max(32) });
const sessionIdParams = z.object({ id: z.string().uuid() });
const pluginIdParams = z.object({ id: z.string().min(1).max(64) });
const pluginActionParams = pluginIdParams.extend({ actionId: z.string().min(1).max(64) });
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

/** Turns an ownership miss into a 404 so one user never learns another's collection exists. */
async function withUserCollection<T>(reply: FastifyReply, run: () => Promise<T>) {
  try { return await run(); }
  catch (error) {
    if (error instanceof UserCollectionNotFoundError) return reply.status(404).send({ error: 'Collection not found' });
    throw error;
  }
}

function requireAdmin(user: PublicUser, reply: FastifyReply) {
  if (user.role !== 'admin') { void reply.status(403).send({ error: 'Administrator access required' }); return false; }
  return true;
}

export async function registerApiRoutes(app: FastifyInstance, service: AuthService, production: boolean, filesystem: LibraryFilesystem = nodeLibraryFilesystem, scanner?: ScanCoordinator, catalog?: CatalogService, imagesDir = '/config/images', nativeLibraryPaths = false, plugins?: PluginService, pluginScheduler?: PluginScheduler, artwork?: ArtworkService, subtitleStore?: SubtitleStore, metadataMatch?: MetadataMatchService, libraryWatcher?: Pick<LibraryWatcher, 'synchronize'>, spriteStore?: PreviewSpriteStore, settings?: UserSettingsService, userCollections?: UserCollectionsService, queue?: QueueService, watchData?: WatchDataService, historySources?: HistorySources, deviceAuth?: DeviceAuthService, playbackSessions?: PlaybackSessionService, downloads?: DownloadService) {
  const imageVariants = new ImageVariantStore(imagesDir);
  const synchronizeWatchers = async () => {
    try { await libraryWatcher?.synchronize(); }
    catch (error) { app.log.error(error, 'library watcher synchronization failed'); }
  };
  const castStreams = new Map<string, { itemId: string; plan?: string; expiresAt: number; maturityLimit: number | null }>();
  app.get('/api/v1/setup/status', async () => ({ setupRequired: await service.setupRequired() }));
  app.post('/api/v1/setup', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Username is required and password must be at least 10 characters' });
    try { const result = await service.setup(parsed.data.username, parsed.data.password); setSession(reply, result.token, production); return reply.status(201).send({ user: result.user }); }
    catch (error) { if (error instanceof Error && error.message === 'SETUP_COMPLETE') return reply.status(409).send({ error: 'Setup already completed' }); throw error; }
  });
  const loginThrottle = new LoginThrottle();
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginCredentials.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid credentials' });
    // Volume is the only thing a password guesser has; take it away.
    const waitMs = loginThrottle.retryAfterMs(request.ip, parsed.data.username);
    if (waitMs > 0) {
      reply.header('Retry-After', String(Math.ceil(waitMs / 1000)));
      return reply.status(429).send({ error: 'Too many attempts. Try again later.' });
    }
    const result = await service.login(parsed.data.username, parsed.data.password, describeUserAgent(request.headers['user-agent']));
    if (!result) {
      loginThrottle.recordFailure(request.ip, parsed.data.username);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    loginThrottle.recordSuccess(parsed.data.username);
    setSession(reply, result.token, production); return { user: result.user };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => { await service.logout(request.cookies[SESSION_COOKIE]); reply.clearCookie(SESSION_COOKIE, { path: '/' }); return reply.status(204).send(); });
  app.get('/api/v1/auth/me', async (request, reply) => { const user = await requireUser(request, reply, service); if (user) return { user }; });
  // Device pairing (QR flow): a device starts a request and shows its user code,
  // the owner approves it from a signed-in phone, the device polls for a session.
  app.post('/api/v1/auth/device/start', async (request, reply) => {
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    const body = deviceStartBody.safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ error: 'Invalid device name' });
    const deviceName = body.data.deviceName ?? describeUserAgent(request.headers['user-agent']);
    const started = await deviceAuth.start(deviceName);
    return {
      userCode: started.userCode, deviceCode: started.deviceCode, deviceName,
      expiresAt: started.expiresAt.toISOString(), intervalMs: started.intervalMs,
      verificationPath: '/link', verificationPathComplete: `/link?code=${encodeURIComponent(started.userCode)}`,
    };
  });
  app.post('/api/v1/auth/device/poll', async (request, reply) => {
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    const body = devicePollBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid device code' });
    try {
      const result = await deviceAuth.poll(body.data.deviceCode);
      if (result.status !== 'approved') return { status: result.status };
      setSession(reply, result.token, production);
      const user = await service.authenticate(result.token);
      return { status: 'approved', user };
    } catch (error) { return deviceAuthError(error, reply); }
  });
  app.get('/api/v1/auth/device/:code', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    const params = deviceCodeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    try { return { request: await deviceAuth.describe(params.data.code) }; }
    catch (error) { return deviceAuthError(error, reply); }
  });
  app.post('/api/v1/auth/device/:code/approve', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    const params = deviceCodeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    try { return { approved: await deviceAuth.resolve(params.data.code, user.id, 'approved') }; }
    catch (error) { return deviceAuthError(error, reply); }
  });
  app.post('/api/v1/auth/device/:code/deny', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    const params = deviceCodeParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid code' });
    try { await deviceAuth.resolve(params.data.code, user.id, 'denied'); return reply.status(204).send(); }
    catch (error) { return deviceAuthError(error, reply); }
  });
  // Live playback reporting: the player opens a session, heartbeats while it
  // plays, and closes it on exit so administrators can see current activity.
  app.post('/api/v1/playback/sessions', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!playbackSessions) return reply.status(503).send({ error: 'Playback reporting unavailable' });
    const body = playbackSessionStart.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid playback session' });
    const session = await playbackSessions.start({ ...body.data, userId: user.id, deviceName: describeUserAgent(request.headers['user-agent']) });
    return reply.status(201).send({ session });
  });
  app.post('/api/v1/playback/sessions/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!playbackSessions) return reply.status(503).send({ error: 'Playback reporting unavailable' });
    const params = sessionIdParams.safeParse(request.params); const body = playbackSessionUpdate.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid playback report' });
    try { return { session: await playbackSessions.heartbeat(params.data.id, user.id, body.data) }; }
    catch (error) {
      if (error instanceof UnknownSessionError) return reply.status(404).send({ error: 'Unknown playback session' });
      throw error;
    }
  });
  app.delete('/api/v1/playback/sessions/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!playbackSessions) return reply.status(503).send({ error: 'Playback reporting unavailable' });
    const params = sessionIdParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid session id' });
    await playbackSessions.stop(params.data.id, user.id);
    return reply.status(204).send();
  });
  app.get('/api/v1/me/history', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!playbackSessions) return reply.status(503).send({ error: 'Playback reporting unavailable' });
    return { history: await playbackSessions.history(user.id) };
  });
  app.delete('/api/v1/me/history', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!playbackSessions) return reply.status(503).send({ error: 'Playback reporting unavailable' });
    const query = historyForgetQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid item id' });
    await playbackSessions.forget(user.id, query.data.itemId);
    return reply.status(204).send();
  });
  // Offline downloads: a grant is requested, encoded in the background, fetched
  // with ranges so an interrupted transfer resumes, then claimed so the server
  // can drop its copy.
  app.get('/api/v1/downloads', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads) return reply.status(503).send({ error: 'Downloads unavailable' });
    return { downloads: await downloads.list(user.id) };
  });

  /** What a title, or a whole season, would cost on the device. */
  app.get('/api/v1/downloads/estimate', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads || !catalog) return reply.status(503).send({ error: 'Downloads unavailable' });
    const query = downloadEstimateQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid estimate request' });
    const viewer = catalog.forViewer(user.maxMaturityLevel);
    const item = await viewer.item(query.data.mediaItemId, user.id);
    if (!item) return reply.status(404).send({ error: 'Item not found' });
    const profile = DOWNLOAD_PROFILES[query.data.profile as 'sd' | 'hd'];

    // A season is downloaded as its episodes, so the figure shown is their total.
    const episodes = (item.children ?? []).filter((child) => child.kind === 'episode');
    const targets = episodes.length > 0 ? episodes : [item];
    const durations = await Promise.all(targets.map(async (target) => {
      const source = await viewer.playbackSource(target.id);
      return source?.durationSeconds ?? 0;
    }));
    return {
      items: targets.map((target, index) => ({ id: target.id, title: target.title, estimatedBytes: estimateTotalBytes([durations[index]], profile) })),
      totalBytes: estimateTotalBytes(durations, profile),
      profile: profile.id,
    };
  });

  app.post('/api/v1/downloads', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads || !catalog) return reply.status(503).send({ error: 'Downloads unavailable' });
    const body = downloadBody.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid download request' });
    // The same viewer gate as streaming: a restricted account cannot take home
    // what it is not allowed to watch.
    const viewer = catalog.forViewer(user.maxMaturityLevel);
    const item = await viewer.item(body.data.mediaItemId, user.id);
    const source = await viewer.playbackSource(body.data.mediaItemId);
    if (!item || !source) return reply.status(404).send({ error: 'No playable file for this item' });
    const absolute = resolveWithin(source.rootPath, source.relativePath);
    if (!absolute) return reply.status(404).send({ error: 'File not found' });

    const grant = await downloads.request({
      userId: user.id, mediaItemId: body.data.mediaItemId, profile: body.data.profile as 'sd' | 'hd',
      sourcePath: absolute, durationSeconds: source.durationSeconds, title: item.title,
    });
    return reply.status(201).send({ download: grant });
  });

  app.get('/api/v1/downloads/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads) return reply.status(503).send({ error: 'Downloads unavailable' });
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid download id' });
    try { return { download: await downloads.get(user.id, params.data.id) }; }
    catch (error) { return downloadError(error, reply); }
  });

  app.get('/api/v1/downloads/:id/file', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads) return reply.status(503).send({ error: 'Downloads unavailable' });
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid download id' });
    let file; try { file = await downloads.fileFor(user.id, params.data.id); }
    catch (error) { return downloadError(error, reply); }

    const range = resolveRange(request.headers.range, file.size);
    if (range.status === 416) { reply.header('Content-Range', `bytes */${file.size}`); return reply.status(416).send(); }
    reply.header('Accept-Ranges', 'bytes'); reply.header('Content-Type', 'video/mp4');
    reply.header('Content-Length', String(range.length)); reply.header('Cache-Control', 'no-store');
    if (range.status === 206) { reply.header('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`); reply.status(206); }
    return reply.send(createReadStream(file.path, { start: range.start, end: range.end }));
  });

  app.post('/api/v1/downloads/:id/complete', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads) return reply.status(503).send({ error: 'Downloads unavailable' });
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid download id' });
    try { await downloads.claim(user.id, params.data.id); return reply.status(204).send(); }
    catch (error) { return downloadError(error, reply); }
  });

  app.delete('/api/v1/downloads/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!downloads) return reply.status(503).send({ error: 'Downloads unavailable' });
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid download id' });
    try { await downloads.cancel(user.id, params.data.id); return reply.status(204).send(); }
    catch (error) { return downloadError(error, reply); }
  });

  app.get('/api/v1/admin/activity', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!playbackSessions) return reply.status(503).send({ error: 'Playback reporting unavailable' });
    await playbackSessions.closeStale();
    return { sessions: await playbackSessions.listActive() };
  });
  app.get('/api/v1/me/sessions', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    return { sessions: await deviceAuth.listSessions(user.id, request.cookies[SESSION_COOKIE]) };
  });
  app.delete('/api/v1/me/sessions/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!deviceAuth) return reply.status(503).send({ error: 'Device pairing unavailable' });
    const params = sessionIdParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid session id' });
    try { await deviceAuth.revokeSession(user.id, params.data.id); return reply.status(204).send(); }
    catch (error) { return deviceAuthError(error, reply); }
  });
  app.get('/api/v1/me/settings', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!settings) return reply.status(503).send({ error: 'User settings unavailable' });
    return { settings: await settings.get(user.id) };
  });
  app.put('/api/v1/me/settings', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = userSettingsPatch.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid settings' });
    if (!settings) return reply.status(503).send({ error: 'User settings unavailable' });
    return { settings: await settings.update(user.id, parsed.data) };
  });
  app.get('/api/v1/me/collections', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return { collections: await userCollections.list(user.id) };
  });
  app.post('/api/v1/me/collections', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = userCollectionInput.safeParse(request.body); if (!parsed.success) return reply.status(400).send({ error: 'Invalid collection' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return reply.status(201).send({ collection: await userCollections.create(user.id, parsed.data) });
  });
  app.get('/api/v1/me/collections/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid collection id' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return withUserCollection(reply, async () => ({ collection: await userCollections.get(user.id, params.data.id) }));
  });
  app.patch('/api/v1/me/collections/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid collection id' });
    const parsed = userCollectionPatch.safeParse(request.body); if (!parsed.success) return reply.status(400).send({ error: 'Invalid collection' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return withUserCollection(reply, async () => ({ collection: await userCollections.update(user.id, params.data.id, parsed.data) }));
  });
  app.delete('/api/v1/me/collections/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid collection id' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return withUserCollection(reply, async () => { await userCollections.remove(user.id, params.data.id); return reply.status(204).send(); });
  });
  app.post('/api/v1/me/collections/:id/items', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid collection id' });
    const body = collectionItemBody.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return withUserCollection(reply, async () => ({ collection: await userCollections.addItem(user.id, params.data.id, body.data.mediaItemId) }));
  });
  app.delete('/api/v1/me/collections/:id/items/:itemId', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = collectionItemParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return withUserCollection(reply, async () => ({ collection: await userCollections.removeItem(user.id, params.data.id, params.data.itemId) }));
  });
  app.put('/api/v1/me/collections/:id/items', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid collection id' });
    const body = userCollectionOrder.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid order' });
    if (!userCollections) return reply.status(503).send({ error: 'User collections unavailable' });
    return withUserCollection(reply, async () => ({ collection: await userCollections.reorder(user.id, params.data.id, body.data.mediaItemIds) }));
  });
  app.get('/api/v1/me/queue', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!queue) return reply.status(503).send({ error: 'Queue unavailable' });
    return { items: await queue.list(user.id) };
  });
  app.post('/api/v1/me/queue', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const body = queueItemBody.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!queue) return reply.status(503).send({ error: 'Queue unavailable' });
    return { items: await queue.add(user.id, body.data.mediaItemId) };
  });
  app.delete('/api/v1/me/queue/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!queue) return reply.status(503).send({ error: 'Queue unavailable' });
    return { items: await queue.remove(user.id, params.data.id) };
  });
  app.delete('/api/v1/me/queue', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!queue) return reply.status(503).send({ error: 'Queue unavailable' });
    return { items: await queue.clear(user.id) };
  });
  app.put('/api/v1/me/queue', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const body = queueOrder.safeParse(request.body); if (!body.success) return reply.status(400).send({ error: 'Invalid order' });
    if (!queue) return reply.status(503).send({ error: 'Queue unavailable' });
    return { items: await queue.reorder(user.id, body.data.mediaItemIds) };
  });
  app.get('/api/v1/me/queue/next', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = queueNextQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!queue) return reply.status(503).send({ error: 'Queue unavailable' });
    return { item: await queue.next(user.id, parsed.data.after) };
  });
  app.get('/api/v1/me/watch-data/export', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!watchData) return reply.status(503).send({ error: 'Watch data unavailable' });
    reply.header('Content-Disposition', 'attachment; filename="dose-watch-data.json"');
    return watchData.exportFor(user.id);
  });
  app.post('/api/v1/me/watch-data/import', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = watchDataDocument.safeParse(request.body); if (!parsed.success) return reply.status(400).send({ error: 'Invalid watch data document' });
    if (!watchData) return reply.status(503).send({ error: 'Watch data unavailable' });
    return { summary: await watchData.importDocument(user.id, parsed.data) };
  });
  app.post('/api/v1/me/watch-data/import/:source', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = historySourceParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Unknown history source' });
    const config = historySourceConfig[params.data.source].safeParse(request.body);
    if (!config.success) return reply.status(400).send({ error: 'Invalid source configuration' });
    const historySource = historySources?.[params.data.source];
    if (!watchData || !historySource) return reply.status(503).send({ error: 'History import unavailable' });
    try {
      // The source is read in full before anything is written, so a mid-read failure
      // leaves the caller's watch data untouched.
      const { entries, errors } = await historySource.read(config.data as never);
      const summary = await watchData.importProgress(user.id, entries);
      return { summary: { matched: summary.matched, written: summary.written, skipped: summary.unmatched.length, unmatched: summary.unmatched, errors } };
    } catch (error) {
      if (error instanceof HistorySourceError) return reply.status(error.status).send({ error: error.message });
      throw error;
    }
  });
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
  app.patch('/api/v1/libraries/:id/kind', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user || !requireAdmin(user, reply)) return;
    const params = idParams.safeParse(request.params); const body = libraryKindInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid library type' });
    const library = await service.updateLibraryKind(params.data.id, body.data.kind);
    if (!library) return reply.status(404).send({ error: 'Library not found' });
    await synchronizeWatchers();
    return { library };
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
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' }); return catalog.forViewer(user.maxMaturityLevel).home(parsed.data.libraryId, user.id);
  });
  app.get('/api/v1/catalog/random', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = randomQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid random picker filters' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const item = await catalog.forViewer(user.maxMaturityLevel).randomItem(parsed.data); if (!item) return reply.status(404).send({ error: 'No titles match these filters' });
    return { item };
  });
  app.get('/api/v1/catalog/items/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' }); const item = await catalog.forViewer(user.maxMaturityLevel).item(parsed.data.id, user.id); if (!item) return reply.status(404).send({ error: 'Item not found' }); return { item };
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
    const query = subtitleQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid subtitle offset' });
    try {
      const body = await subtitleStore.read(row.storageKey);
      reply.header('Content-Type', 'text/vtt; charset=utf-8');
      reply.header('Cache-Control', 'private, max-age=3600');
      if (!query.data.offsetMs) return reply.send(body);
      const shifted = applyAlignment(parseSubtitles(body.toString('utf8')), { offsetMs: query.data.offsetMs, scale: 1 });
      return reply.send(serializeVtt(shifted));
    } catch { return reply.status(404).send({ error: 'Subtitle not found' }); }
  });
  app.get('/api/v1/catalog/collections', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return { collections: await catalog.forViewer(user.maxMaturityLevel).collectionsOverview() };
  });
  app.get('/api/v1/catalog/collections/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid collection id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const showGaps = settings ? (await settings.get(user.id)).showCollectionGaps : false;
    const collection = await catalog.forViewer(user.maxMaturityLevel).collection(parsed.data.id, showGaps); if (!collection) return reply.status(404).send({ error: 'Collection not found' });
    return { collection };
  });
  app.get('/api/v1/catalog/genres/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid genre id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const genre = await catalog.forViewer(user.maxMaturityLevel).genre(parsed.data.id); if (!genre) return reply.status(404).send({ error: 'Genre not found' });
    return { genre };
  });
  app.get('/api/v1/catalog/categories', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = homeQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid library filter' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return { categories: await catalog.forViewer(user.maxMaturityLevel).categories(parsed.data.libraryId) };
  });
  app.get('/api/v1/catalog/categories/:key', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = categoryParams.safeParse(request.params); const query = homeQuery.safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: 'Invalid category' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const category = await catalog.forViewer(user.maxMaturityLevel).category(params.data.key, query.data.libraryId); if (!category) return reply.status(404).send({ error: 'Category not found' });
    return { category };
  });
  app.get('/api/v1/catalog/people/:id', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = idParams.safeParse(request.params); if (!parsed.success) return reply.status(400).send({ error: 'Invalid person id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const person = await catalog.forViewer(user.maxMaturityLevel).person(parsed.data.id); if (!person) return reply.status(404).send({ error: 'Person not found' });
    return { person };
  });
  app.get('/api/v1/catalog/search', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const parsed = searchQuery.safeParse(request.query); if (!parsed.success) return reply.status(400).send({ error: 'Invalid search query' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    return catalog.forViewer(user.maxMaturityLevel).search(parsed.data.libraryId, parsed.data.q);
  });
  app.post('/api/v1/catalog/items/:id/playback', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    const body = capabilities.safeParse(request.body ?? {}); if (!body.success) return reply.status(400).send({ error: 'Invalid client capabilities' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.forViewer(user.maxMaturityLevel).playbackSource(params.data.id); if (!source) return reply.status(404).send({ error: 'No playable file for this item' });
    const plan = negotiatePlayback(source.probe, body.data, body.data.audioTrackIndex);
    if (plan.mode === 'transcode' && plan.container !== 'mp4') return reply.status(406).send({ error: 'No supported transcode container; client must support mp4' });
    const baseUrl = `/api/v1/catalog/items/${params.data.id}/stream`;
    const url = plan.mode === 'direct' ? baseUrl : `${baseUrl}?plan=${encodeURIComponent(encodePlaybackPlan(plan))}`;
    const castToken = randomBytes(32).toString('hex');
    castStreams.set(castToken, { itemId: params.data.id, plan: plan.mode === 'direct' ? undefined : encodePlaybackPlan(plan), expiresAt: Date.now() + 6 * 60 * 60 * 1000, maturityLimit: user.maxMaturityLevel });
    // Full transcodes stream over HLS (seek + quality ladder); remuxes stay on
    // the progressive pipe with seek-restart, since their video is not re-encoded.
    const canHls = plan.mode === 'transcode' && !plan.remux && plan.video != null && source.durationSeconds != null;
    const hlsUrl = canHls ? `/api/v1/catalog/items/${params.data.id}/hls/master.m3u8?plan=${encodeURIComponent(encodePlaybackPlan(plan))}` : undefined;
    if (canHls) {
      // Warm the opening segment while the client is still parsing playlists,
      // so a transcode's first frame comes out of the cache, not an encoder.
      const absolute = source.rootPath ? resolveWithin(source.rootPath, source.relativePath) : null;
      const variant = ladderFor(plan.video?.height)[0];
      if (absolute && variant) {
        const key = `${absolute}|${encodePlaybackPlan(plan)}|${variant.id}|0`;
        if (!segmentCache.knows(key)) void readaheadEncodes.run(() => segmentCache.fill(key, () => encodeSegment(absolute, plan, variant, 0, source.durationSeconds!))).catch(() => undefined);
      }
    }
    return { plan, durationSeconds: source.durationSeconds, audioTracks: audioTracksOf(source.probe), stream: { url, hlsUrl, castUrl: `/api/v1/cast/${castToken}/stream`, direct: plan.mode === 'direct' } };
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
    const source = await catalog.forViewer(user.maxMaturityLevel).playbackSource(params.data.id); if (!source) return reply.status(404).send({ error: 'No playable file for this item' });
    const absolute = resolveWithin(source.rootPath, source.relativePath); if (!absolute) return reply.status(404).send({ error: 'File not found' });
    let info; try { info = await stat(absolute); } catch { return reply.status(404).send({ error: 'File not found' }); }
    if (!info.isFile()) return reply.status(404).send({ error: 'File not found' });

    if (query.data.plan) {
      const plan = decodePlaybackPlan(query.data.plan);
      if (!plan) return reply.status(400).send({ error: 'Invalid playback plan' });
      // A seek outside the buffer restarts the stream here rather than replaying
      // everything from zero; the player offsets its timeline by the same amount.
      const child = spawn('ffmpeg', buildTranscodeArgs(plan, absolute, query.data.start), { stdio: ['ignore', 'pipe', 'ignore'] });
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
  // HLS delivery for transcodes: a VOD playlist over deterministic segments.
  // Seeking is the client fetching a different index; quality switching is the
  // client moving between rungs. No server-side session exists to clean up.
  const segmentEncodes = new Semaphore(3);
  // Readahead runs beside on-demand encodes, never ahead of them in the queue.
  const readaheadEncodes = new Semaphore(1);
  const segmentCache = new SegmentCache();
  const READAHEAD_SEGMENTS = 2;
  const encodeSegment = (absolute: string, plan: PlaybackPlan, variant: HlsVariant, index: number, duration: number) =>
    new Promise<Buffer>((resolveSegment, rejectSegment) => {
      const child = spawn('ffmpeg', buildSegmentArgs(absolute, plan, variant, index, duration), { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      const stderr: Buffer[] = [];
      const timer = setTimeout(() => child.kill('SIGKILL'), SEGMENT_SECONDS * 10_000);
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.once('error', (cause) => { clearTimeout(timer); rejectSegment(cause); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && chunks.length > 0) resolveSegment(Buffer.concat(chunks));
        else rejectSegment(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString().slice(0, 200)}`));
      });
    });
  const hlsSource = async (reply: FastifyReply, user: PublicUser, itemId: string) => {
    if (!catalog) { await reply.status(503).send({ error: 'Catalog unavailable' }); return null; }
    const source = await catalog.forViewer(user.maxMaturityLevel).playbackSource(itemId);
    if (!source) { await reply.status(404).send({ error: 'No playable file for this item' }); return null; }
    const absolute = resolveWithin(source.rootPath, source.relativePath);
    if (!absolute || !source.durationSeconds) { await reply.status(404).send({ error: 'File not found' }); return null; }
    return { source, absolute };
  };

  app.get('/api/v1/catalog/items/:id/hls/master.m3u8', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    const query = streamQuery.safeParse(request.query); if (!query.success || !query.data.plan) return reply.status(400).send({ error: 'Invalid stream options' });
    const plan = decodePlaybackPlan(query.data.plan); if (!plan) return reply.status(400).send({ error: 'Invalid playback plan' });
    const resolved = await hlsSource(reply, user, params.data.id); if (!resolved) return;
    const variants = ladderFor(plan.video?.height);
    reply.header('Content-Type', 'application/vnd.apple.mpegurl'); reply.header('Cache-Control', 'no-store');
    return masterPlaylist(variants, (variant) => `media.m3u8?plan=${encodeURIComponent(query.data.plan!)}&q=${variant.id}`);
  });

  app.get('/api/v1/catalog/items/:id/hls/media.m3u8', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    const query = hlsQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid stream options' });
    if (!decodePlaybackPlan(query.data.plan)) return reply.status(400).send({ error: 'Invalid playback plan' });
    const resolved = await hlsSource(reply, user, params.data.id); if (!resolved) return;
    reply.header('Content-Type', 'application/vnd.apple.mpegurl'); reply.header('Cache-Control', 'no-store');
    return mediaPlaylist(resolved.source.durationSeconds!, (index) => `${index}.ts?plan=${encodeURIComponent(query.data.plan)}&q=${query.data.q}`);
  });

  app.get('/api/v1/catalog/items/:id/hls/:index.ts', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = hlsSegmentParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid segment' });
    const query = hlsQuery.safeParse(request.query); if (!query.success) return reply.status(400).send({ error: 'Invalid stream options' });
    const plan = decodePlaybackPlan(query.data.plan); if (!plan) return reply.status(400).send({ error: 'Invalid playback plan' });
    const resolved = await hlsSource(reply, user, params.data.id); if (!resolved) return;
    const duration = resolved.source.durationSeconds!;
    if (params.data.index >= segmentCount(duration)) return reply.status(404).send({ error: 'Segment out of range' });
    const variant = ladderFor(plan.video?.height).find((entry) => entry.id === query.data.q);
    if (!variant) return reply.status(400).send({ error: 'Unknown quality' });

    // Cache first; a miss encodes under the semaphore so a prefetching client
    // cannot stampede the encoder. An encode outlives its request on purpose:
    // the finished segment serves the retry, the next viewer, or a resume.
    const keyOf = (index: number) => `${resolved.absolute}|${query.data.plan}|${query.data.q}|${index}`;
    const body = segmentCache.get(keyOf(params.data.index))
      ?? await segmentEncodes.run(() => segmentCache.fill(keyOf(params.data.index), () => encodeSegment(resolved.absolute, plan, variant, params.data.index, duration))).catch(() => null);
    if (!body) return reply.status(502).send({ error: 'Segment could not be encoded' });
    // Warm the segments after this one while it plays, so sequential playback
    // never waits at a boundary — the readahead lane leaves on-demand slots free.
    for (let ahead = params.data.index + 1; ahead <= params.data.index + READAHEAD_SEGMENTS; ahead++) {
      if (ahead >= segmentCount(duration)) break;
      const key = keyOf(ahead);
      if (segmentCache.knows(key)) continue;
      void readaheadEncodes.run(() => segmentCache.fill(key, () => encodeSegment(resolved.absolute, plan, variant, ahead, duration))).catch(() => undefined);
    }
    reply.header('Content-Type', 'video/mp2t');
    // Deterministic output: the same segment at the same quality is cacheable.
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(body);
  });

  app.get('/api/v1/media/:id/trailer', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.forViewer(user.maxMaturityLevel).localTrailerSource(params.data.id); if (!source) return reply.status(404).send({ error: 'Trailer not found' });
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
    const sprite = await catalog.forViewer(user.maxMaturityLevel).previewSprite(params.data.id); if (!sprite) return reply.status(404).send({ error: 'Preview sprite not found' });
    return { sprite: { src: `/api/v1/media/${encodeURIComponent(params.data.id)}/sprites/sheet`, columns: sprite.columns, rows: sprite.rows, interval: sprite.interval, tileWidth: sprite.tileWidth, tileHeight: sprite.tileHeight } };
  });
  app.get('/api/v1/media/:id/chapters', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid media id' });
    return { chapters: await catalog.forViewer(user.maxMaturityLevel).chapters(params.data.id) };
  });
  app.get('/api/v1/media/:id/intro', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid media id' });
    return { intro: await catalog.forViewer(user.maxMaturityLevel).introMarker(params.data.id) };
  });
  app.get('/api/v1/media/:id/sprites/sheet', async (request, reply) => {
    const user = await requireUser(request, reply, service); if (!user) return;
    const params = idParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid item id' });
    if (!catalog || !spriteStore) return reply.status(503).send({ error: 'Previews unavailable' });
    const sprite = await catalog.forViewer(user.maxMaturityLevel).previewSprite(params.data.id); if (!sprite) return reply.status(404).send({ error: 'Preview sprite not found' });
    let body; try { body = await spriteStore.read(sprite.storageKey); } catch { return reply.status(404).send({ error: 'Preview sprite not found' }); }
    reply.header('Content-Type', 'image/jpeg'); reply.header('Cache-Control', 'private, max-age=86400'); return reply.send(body);
  });
  app.get('/api/v1/cast/:token/stream', async (request, reply) => {
    const params = castStreamParams.safeParse(request.params); if (!params.success) return reply.status(404).send({ error: 'Stream not found' });
    const grant = castStreams.get(params.data.token);
    if (!grant || grant.expiresAt <= Date.now()) { castStreams.delete(params.data.token); return reply.status(404).send({ error: 'Stream not found' }); }
    if (!catalog) return reply.status(503).send({ error: 'Catalog unavailable' });
    const source = await catalog.forViewer(grant.maturityLimit).playbackSource(grant.itemId); if (!source) return reply.status(404).send({ error: 'Stream not found' });
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
  app.get('/api/v1/plugins/:id', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!plugins) return reply.status(503).send({ error: 'Plugins unavailable' });
    const params = pluginIdParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid plugin id' });
    try { return { plugin: describePlugin(await plugins.get(params.data.id)) }; }
    catch (error) { return pluginError(error, reply); }
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
  app.post('/api/v1/plugins/:id/actions/:actionId', async (request, reply) => {
    const actor = await requireUser(request, reply, service); if (!actor || !requireAdmin(actor, reply)) return;
    if (!plugins) return reply.status(503).send({ error: 'Plugins unavailable' });
    const params = pluginActionParams.safeParse(request.params); if (!params.success) return reply.status(400).send({ error: 'Invalid plugin action' });
    try { return { run: await plugins.runAction(params.data.id, params.data.actionId) }; }
    catch (error) { return pluginError(error, reply); }
  });
}

/** Shape a plugin definition + its stored configuration for the admin UI. Field
 * descriptors are declared by the plugin; secrets are reported as set, never echoed. */
function describePlugin(entry: { plugin: import('./plugins/types.ts').RegisteredPlugin; configuration: typeof import('./db/schema.ts').pluginConfigurations.$inferSelect }) {
  const defaults = entry.plugin.settingsSchema.parse({}) as Record<string, unknown>;
  const fields = entry.plugin.fields ?? [];
  const cfg = entry.configuration;
  const secretKeys = fields.filter((field) => field.kind === 'password').map((field) => field.key);
  const settings = { ...cfg.settings };
  const secretsSet: string[] = [];
  for (const key of secretKeys) {
    const value = settings[key];
    if (typeof value === 'string' && value.length > 0) secretsSet.push(key);
    settings[key] = null;
  }
  return {
    id: entry.plugin.id, name: entry.plugin.metadata.name, description: entry.plugin.metadata.description, version: entry.plugin.metadata.version,
    fields, defaults, secretsSet,
    actions: (entry.plugin.actions ?? []).map(({ id, label, description, confirm }) => ({ id, label, description, confirm })),
    events: Object.keys(entry.plugin.events ?? {}),
    runnable: Boolean(entry.plugin.run),
    enabled: cfg.enabled, schedule: cfg.schedule, settings,
    nextRunAt: cfg.nextRunAt, lastRunAt: cfg.lastRunAt, lastRunStatus: cfg.lastRunStatus,
    lastRunDurationMs: cfg.lastRunDurationMs, lastRunSummary: cfg.lastRunSummary, lastRunError: cfg.lastRunError,
  };
}

/** A short, human-readable device label derived from the browser's user agent. */
export function describeUserAgent(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /OPR\//.test(userAgent) ? 'Opera' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : undefined;
  const platform = /TV|Tizen|Web0S|SmartTV|AFT/i.test(userAgent) ? 'TV'
    : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad|iPod/.test(userAgent) ? 'iOS'
    : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
    : /CrOS/.test(userAgent) ? 'ChromeOS' : /Linux/.test(userAgent) ? 'Linux' : undefined;
  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? 'Unknown device';
}

function downloadError(error: unknown, reply: FastifyReply) {
  if (error instanceof UnknownGrantError) return reply.status(404).send({ error: error.message });
  // Still encoding: the client polls rather than treating this as a failure.
  if (error instanceof GrantNotReadyError) return reply.status(409).send({ error: 'Download is not ready yet', status: error.message });
  throw error;
}

function deviceAuthError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof DeviceAuthError)) throw error;
  if (error.reason === 'slow_down') return reply.status(429).send({ error: 'Polling too quickly', intervalMs: DEVICE_POLL_INTERVAL_MS });
  if (error.reason === 'expired') return reply.status(410).send({ error: 'This code has expired' });
  if (error.reason === 'already_used') return reply.status(409).send({ error: 'This code was already used' });
  return reply.status(404).send({ error: 'Unknown code' });
}

function pluginError(error: unknown, reply: FastifyReply) {
  if (error instanceof UnknownPluginError) return reply.status(404).send({ error: 'Unknown plugin' });
  if (error instanceof UnknownPluginActionError) return reply.status(404).send({ error: 'Unknown plugin action' });
  if (error instanceof PluginNotRunnableError) return reply.status(400).send({ error: 'Plugin has no scheduled run' });
  if (error instanceof PluginAlreadyRunningError) return reply.status(409).send({ error: 'Plugin is already running' });
  // Settings that fail the plugin schema are an operator mistake, not a server fault.
  if (error instanceof ZodError) {
    const errors: Record<string, string> = {};
    for (const issue of error.issues) errors[issue.path.join('.') || '_'] = issue.message;
    return reply.status(400).send({ error: 'Invalid plugin settings', errors });
  }
  throw error;
}

function userError(error: unknown, reply: FastifyReply) {
  if (error instanceof DuplicateUsernameError) return reply.status(409).send({ error: 'That username is already in use' });
  if (error instanceof UserInvariantError) return reply.status(409).send({ error: error.message });
  if (error instanceof UserNotFoundError) return reply.status(404).send({ error: 'User not found' });
  throw error;
}
