import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppConfig } from '../config.ts';
import * as schema from './schema.ts';

export type Database = PostgresJsDatabase<typeof schema>;

export function isEmbeddedDatabase(url: string): boolean { return url.startsWith('pglite://'); }
export function pglitePath(url: string): string {
  const path = url.slice('pglite://'.length);
  return !path || path === ':memory:' ? 'memory://' : path;
}

export function createDatabase(config: Pick<AppConfig, 'DATABASE_URL'>) {
  if (isEmbeddedDatabase(config.DATABASE_URL)) {
    const path = pglitePath(config.DATABASE_URL);
    if (path !== 'memory://') mkdirSync(dirname(path), { recursive: true });
    const client = new PGlite(path);
    const database = drizzlePglite(client, { schema }) as unknown as Database;
    return { client, database, health: async () => { await client.query('select 1'); }, close: async () => { await client.close(); }, embedded: true as const };
  }
  const client = postgres(config.DATABASE_URL, { max: 10 });
  const database = drizzlePostgres(client, { schema });
  return { client, database, health: async () => { await client`select 1`; }, close: async () => { await client.end(); }, embedded: false as const };
}
