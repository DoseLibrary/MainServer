import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import type { AppConfig } from './config.ts';
import { createDatabase, isEmbeddedDatabase } from './db/client.ts';
import { AuthService } from './auth-service.ts';
import { DeviceAuthService } from './device-auth-service.ts';
import { PlaybackSessionService } from './playback-session-service.ts';
import { DownloadService } from './download-service.ts';
import { REALTIME_SUBSCRIBER, RealtimeService, registerRealtimeRoute } from './realtime.ts';
import { registerApiRoutes } from './routes.ts';
import { ScanCoordinator } from './scanner.ts';
import { CatalogService } from './catalog-service.ts';
import { PluginRegistry } from './plugins/registry.ts';
import { PluginEventBus } from './plugins/events.ts';
import { createTrailerFetcherPlugin, ytDlpDownloader } from './plugins/trailer-fetcher.ts';
import { PluginService } from './plugin-service.ts';
import { PluginScheduler } from './plugin-scheduler.ts';
import { TmdbClient } from './tmdb.ts';
import { ArtworkService } from './artwork-service.ts';
import { ImageStore } from './images.ts';
import { createSubtitleExtractorPlugin } from './plugins/subtitle-extractor.ts';
import { SubtitleStore, ffmpegSubtitleTools } from './subtitles.ts';
import { createPreviewSpritePlugin } from './plugins/preview-sprites.ts';
import { PreviewSpriteStore, ffmpegSpriteTools } from './sprites.ts';
import { createIntroDetectorPlugin } from './plugins/intro-detector.ts';
import { createSubtitleSyncPlugin } from './plugins/subtitle-sync.ts';
import { EnrichmentService } from './enrichment.ts';
import { MetadataMatchService } from './metadata-match-service.ts';
import { LibraryWatcher } from './library-watcher.ts';
import { UserSettingsService } from './user-settings-service.ts';
import { UserCollectionsService } from './user-collections-service.ts';
import { QueueService } from './queue-service.ts';
import { WatchDataService } from './watch-data-service.ts';
import { PlexHistorySource } from './history-sources/plex.ts';
import { TraktHistorySource } from './history-sources/trakt.ts';
import { TautulliHistorySource } from './history-sources/tautulli.ts';
import { HardwareAccelerator } from './hwaccel.ts';
import { createSeerrPlugin } from './plugins/seerr.ts';

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test', trustProxy: config.TRUST_PROXY === true });
  const connection = createDatabase(config);
  const { database } = connection;
  const tmdb = new TmdbClient(config.TMDB_API_TOKEN ?? '', config.TMDB_CONCURRENCY, config.TMDB_REQUESTS_PER_SECOND, config.TMDB_TIMEOUT_MS);
  const subtitleStore = new SubtitleStore(join(config.CONFIG_PATH, 'subtitles'));
  const spriteStore = new PreviewSpriteStore(join(config.CONFIG_PATH, 'previews'));
  // The bus is built first so every core service can emit; it resolves "enabled"
  // through the plugin service, which is constructed immediately below.
  const pluginEvents = new PluginEventBus({
    isEnabled: (pluginId) => pluginId === REALTIME_SUBSCRIBER || plugins.isEnabled(pluginId),
    log: { error: (details, message) => app.log.error(details, message), warn: (details, message) => app.log.warn(details, message) },
  });
  const plugins: PluginService = new PluginService(database, new PluginRegistry()
    .register(createTrailerFetcherPlugin(database, tmdb, ytDlpDownloader(config.YT_DLP_PATH), join(config.CONFIG_PATH, 'trailers')))
    .register(createSubtitleExtractorPlugin(database, ffmpegSubtitleTools(), subtitleStore))
    .register(createPreviewSpritePlugin(database, ffmpegSpriteTools(), spriteStore))
    .register(createIntroDetectorPlugin(database))
    .register(createSubtitleSyncPlugin(database, subtitleStore))
    .register(createSeerrPlugin()), undefined, pluginEvents);
  const imageStore = new ImageStore(join(config.CONFIG_PATH, 'images'));
  const artwork = new ArtworkService(database, tmdb, imageStore);
  const metadataMatch = new MetadataMatchService(database, tmdb, new EnrichmentService(database, tmdb, imageStore, pluginEvents));
  const pluginScheduler = new PluginScheduler(plugins);
  // Plugin bootstrap must never block the server from serving core routes/health.
  try { await plugins.initialize(); await pluginScheduler.start(); }
  catch (error) { app.log.error(error, 'plugin bootstrap failed'); }

  const scanner = new ScanCoordinator(database, config, pluginEvents);
  const libraryWatcher = new LibraryWatcher(database, scanner, app.log, config.LIBRARY_WATCH_DEBOUNCE_MS ?? 1_000);
  if (config.LIBRARY_WATCH_ENABLED === true) {
    try { await libraryWatcher.start(); }
    catch (error) { app.log.error(error, 'library watcher bootstrap failed'); }
  }

  const downloads = new DownloadService(database, join(config.CONFIG_PATH, 'downloads'));
  // Clear out files the devices never came back for, on boot and hourly.
  const downloadSweep = setInterval(() => { void downloads.sweep().catch(() => undefined); }, 60 * 60 * 1000);
  void downloads.sweep().catch(() => undefined);

  // Detection spawns ffmpeg several times, so it runs once in the background:
  // streams that start before it lands use software and pick up the GPU after.
  const hardware = new HardwareAccelerator({ mode: config.HWACCEL, device: config.HWACCEL_DEVICE, offloadDecode: config.HWACCEL_DECODE });
  void hardware.ready()
    .then((report) => {
      if (report.warning) app.log.warn(report.warning);
      app.log.info({ selected: report.selected, available: report.available, adapters: report.adapters }, report.selected ? 'hardware transcoding enabled' : 'hardware transcoding unavailable; using software');
    })
    .catch((error: unknown) => app.log.warn(error, 'hardware transcoding detection failed'));
  const realtime = new RealtimeService();
  // Without a TMDB token nothing ever enriches, so ingest is the only signal.
  realtime.attach(pluginEvents, { announceOnIngest: !config.TMDB_API_TOKEN });

  // Baseline browser protections on every response. The CSP allows exactly the
  // one external script the app uses (the Google Cast sender) and nothing else;
  // media/blob sources cover the player and the offline service worker.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '));
    return payload;
  });

  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket);
  const auth = new AuthService(database);
  registerRealtimeRoute(app, auth, realtime);
  await registerApiRoutes(app, auth, config.NODE_ENV === 'production', undefined, scanner, new CatalogService(database, join(config.CONFIG_PATH, 'trailers'), pluginEvents), join(config.CONFIG_PATH, 'images'), config.NODE_ENV === 'development' && isEmbeddedDatabase(config.DATABASE_URL), plugins, pluginScheduler, artwork, subtitleStore, metadataMatch, libraryWatcher, spriteStore, new UserSettingsService(database), new UserCollectionsService(database), new QueueService(database), new WatchDataService(database), { plex: new PlexHistorySource(), trakt: new TraktHistorySource(), tautulli: new TautulliHistorySource() }, new DeviceAuthService(database), new PlaybackSessionService(database), downloads, hardware);

  app.addHook('onClose', async () => {
    clearInterval(downloadSweep);
    downloads.abortAll();
    realtime.closeAll();
    plugins.abortAll();
    await pluginScheduler.stop();
    await libraryWatcher.stop();
    await connection.close();
  });

  app.get('/api/v1/health', async (_request, reply) => {
    try {
      await connection.health();
      return { status: 'ok', database: 'ok', metadata: { tmdb: config.TMDB_API_TOKEN ? 'configured' : 'not_configured' } };
    } catch (error) {
      app.log.error(error, 'database health check failed');
      return reply.status(503).send({ status: 'degraded', database: 'unavailable', metadata: { tmdb: config.TMDB_API_TOKEN ? 'configured' : 'not_configured' } });
    }
  });

  if (config.NODE_ENV === 'production') {
    await app.register(fastifyStatic, {
      root: resolve(fileURLToPath(new URL('.', import.meta.url)), '../../dist'),
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
