import { sql } from 'drizzle-orm';
import { createDatabase, isEmbeddedDatabase } from './db/client.ts';
import { users } from './db/schema.ts';
import { hashPassword } from './security.ts';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV !== 'development' || !isEmbeddedDatabase(databaseUrl)) throw new Error('Development seeding is only allowed for an embedded development database');
const username = process.env.DOSE_DEV_USERNAME ?? 'admin';
const password = process.env.DOSE_DEV_PASSWORD ?? 'admin';
const connection = createDatabase({ DATABASE_URL: databaseUrl });
try {
  const [row] = await connection.database.select({ count: sql<number>`count(*)::int` }).from(users);
  if (row.count === 0) {
    await connection.database.insert(users).values({ username, passwordHash: await hashPassword(password), role: 'admin' });
    console.info(`Created development administrator '${username}'.`);
  }
} finally { await connection.close(); }
