import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { startMdnsAdvertiser, type MdnsAdvertiser } from './mdns.ts';

const config = loadConfig();
const app = await buildApp(config);

let mdns: MdnsAdvertiser | null = null;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await mdns?.stop();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
mdns = startMdnsAdvertiser(config, app.log);
