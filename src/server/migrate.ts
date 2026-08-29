import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { createDatabase } from './db/client.ts';

const config = loadConfig();
const connection = createDatabase(config);

try {
  const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
  if (connection.embedded) await migratePglite(connection.database as never, { migrationsFolder: resolve(moduleDirectory, '../../drizzle') });
  else await migratePostgres(connection.database, { migrationsFolder: resolve(moduleDirectory, '../../drizzle') });
  console.info('Dose database migrations are current.');
} finally {
  await connection.close();
}
