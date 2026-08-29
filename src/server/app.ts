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

export async function buildApp(config: AppConfig) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });
  const connection = createDatabase(config);
  const { database } = connection;
  const tmdb = new TmdbClient(config.TMDB_API_TOKEN ?? '', config.TMDB_CONCURRENCY, config.TMDB_REQUESTS_PER_SECOND, config.TMDB_TIMEOUT_MS);
  const subtitleStore = new SubtitleStore(join(config.CONFIG_PATH, 'subtitles'));
  const plugins = new PluginService(database, new PluginRegistry()
    .register(createTrailerFetcherPlugin(database, tmdb))
    .register(createSubtitleExtractorPlugin(database, ffmpegSubtitleTools(), subtitleStore)));
  const artwork = new ArtworkService(database, tmdb, new ImageStore(join(config.CONFIG_PATH, 'images')));
  const pluginScheduler = new PluginScheduler(plugins);
  // Plugin bootstrap must never block the server from serving core routes/health.
  try { await plugins.initialize(); await pluginScheduler.start(); }
  catch (error) { app.log.error(error, 'plugin bootstrap failed'); }

  await app.register(fastifyCookie);
  await registerApiRoutes(app, new AuthService(database), config.NODE_ENV === 'production', undefined, new ScanCoordinator(database, config), new CatalogService(database), join(config.CONFIG_PATH, 'images'), config.NODE_ENV === 'development' && isEmbeddedDatabase(config.DATABASE_URL), plugins, pluginScheduler, artwork, subtitleStore);

  app.addHook('onClose', async () => {
    await pluginScheduler.stop();
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
