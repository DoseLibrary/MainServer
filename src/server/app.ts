import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import type { AppConfig } from './config.ts';
import { createDatabase, isEmbeddedDatabase } from './db/client.ts';
import { AuthService } from './auth-service.ts';
import { registerApiRoutes } from './routes.ts';
import { ScanCoordinator } from './scanner.ts';
import { CatalogService } from './catalog-service.ts';
import { PluginRegistry } from './plugins/registry.ts';
import { createTrailerFetcherPlugin } from './plugins/trailer-fetcher.ts';
import { PluginService } from './plugin-service.ts';
import { PluginScheduler } from './plugin-scheduler.ts';
import { TmdbClient } from './tmdb.ts';
import { ArtworkService } from './artwork-service.ts';
import { ImageStore } from './images.ts';
import { createSubtitleExtractorPlugin } from './plugins/subtitle-extractor.ts';
import { SubtitleStore, ffmpegSubtitleTools } from './subtitles.ts';
import { createPreviewSpritePlugin } from './plugins/preview-sprites.ts';
import { PreviewSpriteStore, ffmpegSpriteTools } from './sprites.ts';
import { EnrichmentService } from './enrichment.ts';
import { MetadataMatchService } from './metadata-match-service.ts';
import { LibraryWatcher } from './library-watcher.ts';

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });
  const connection = createDatabase(config);
  const { database } = connection;
  const tmdb = new TmdbClient(config.TMDB_API_TOKEN ?? '', config.TMDB_CONCURRENCY, config.TMDB_REQUESTS_PER_SECOND, config.TMDB_TIMEOUT_MS);
  const subtitleStore = new SubtitleStore(join(config.CONFIG_PATH, 'subtitles'));
  const spriteStore = new PreviewSpriteStore(join(config.CONFIG_PATH, 'previews'));
  const plugins = new PluginService(database, new PluginRegistry()
    .register(createTrailerFetcherPlugin(database, tmdb, undefined, join(config.CONFIG_PATH, 'trailers')))
    .register(createSubtitleExtractorPlugin(database, ffmpegSubtitleTools(), subtitleStore))
    .register(createPreviewSpritePlugin(database, ffmpegSpriteTools(), spriteStore)));
  const imageStore = new ImageStore(join(config.CONFIG_PATH, 'images'));
  const artwork = new ArtworkService(database, tmdb, imageStore);
  const metadataMatch = new MetadataMatchService(database, tmdb, new EnrichmentService(database, tmdb, imageStore));
  const pluginScheduler = new PluginScheduler(plugins);
  // Plugin bootstrap must never block the server from serving core routes/health.
  try { await plugins.initialize(); await pluginScheduler.start(); }
  catch (error) { app.log.error(error, 'plugin bootstrap failed'); }

  const scanner = new ScanCoordinator(database, config);
  const libraryWatcher = new LibraryWatcher(database, scanner, app.log, config.LIBRARY_WATCH_DEBOUNCE_MS ?? 1_000);
  if (config.LIBRARY_WATCH_ENABLED === true) {
    try { await libraryWatcher.start(); }
    catch (error) { app.log.error(error, 'library watcher bootstrap failed'); }
  }

  await app.register(fastifyCookie);
  await registerApiRoutes(app, new AuthService(database), config.NODE_ENV === 'production', undefined, scanner, new CatalogService(database, join(config.CONFIG_PATH, 'trailers')), join(config.CONFIG_PATH, 'images'), config.NODE_ENV === 'development' && isEmbeddedDatabase(config.DATABASE_URL), plugins, pluginScheduler, artwork, subtitleStore, metadataMatch, libraryWatcher, spriteStore);

  app.addHook('onClose', async () => {
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
