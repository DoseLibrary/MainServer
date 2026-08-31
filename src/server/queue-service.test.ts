import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueueService } from './queue-service.ts';
import type { Database } from './db/client.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const ONE = '20000000-0000-4000-8000-000000000001';
const TWO = '20000000-0000-4000-8000-000000000002';
const GONE = '20000000-0000-4000-8000-000000000003';
const USER = '70000000-0000-4000-8000-000000000001';
const OTHER = '70000000-0000-4000-8000-000000000002';

describe('QueueService', () => {
  let client: PGlite;
  let service: QueueService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new QueueService(database);

    await client.query(`insert into users (id, username, password_hash) values ($1, 'owner', 'x'), ($2, 'other', 'x')`, [USER, OTHER]);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year) values
      ($1, $4, 'movie', 'movie:one', 'One', 'one', 2020),
      ($2, $4, 'movie', 'movie:two', 'Two', 'two', 2021),
      ($3, $4, 'movie', 'movie:gone', 'Gone', 'gone', 2019)`, [ONE, TWO, GONE, LIB]);
  });

  afterEach(async () => { await client.close(); });

  it('appends idempotently, reorders, removes, and clears', async () => {
    await service.add(USER, ONE);
    await service.add(USER, TWO);
    expect((await service.add(USER, ONE)).map((item) => item.id)).toEqual([ONE, TWO]);

    expect((await service.reorder(USER, [TWO, ONE])).map((item) => item.id)).toEqual([TWO, ONE]);
    expect((await service.remove(USER, TWO)).map((item) => item.id)).toEqual([ONE]);
    expect(await service.clear(USER)).toEqual([]);
    expect(await service.list(USER)).toEqual([]);
  });

  it('flags unavailable entries, skips them when advancing, and ends at the tail', async () => {
    await service.add(USER, ONE);
    await service.add(USER, GONE);
    await service.add(USER, TWO);
    await client.query(`update media_items set archived_at = now(), available = false where id = $1`, [GONE]);

    const listed = await service.list(USER);
    expect(listed.map((item) => item.id)).toEqual([ONE, GONE, TWO]);
    expect(listed[1]).toMatchObject({ unavailable: true });
    expect(listed[0]).toMatchObject({ unavailable: false });

    expect((await service.next(USER))?.id).toBe(ONE);
    // The archived middle entry is skipped, not removed.
    expect((await service.next(USER, ONE))?.id).toBe(TWO);
    expect(await service.next(USER, TWO)).toBeNull();
    expect((await service.list(USER)).map((item) => item.id)).toEqual([ONE, GONE, TWO]);
  });

  it('keeps queues per user and cascades on user delete', async () => {
    await service.add(USER, ONE);
    expect(await service.list(OTHER)).toEqual([]);
    expect(await service.next(OTHER)).toBeNull();
    expect(await service.contains(USER, ONE)).toBe(true);
    expect(await service.contains(OTHER, ONE)).toBe(false);
    expect(await service.playableIds(USER)).toEqual([ONE]);

    await client.query(`delete from users where id = $1`, [USER]);
    const rows = await client.query<{ c: string }>(`select count(*)::text as c from playback_queue`);
    expect(rows.rows[0]?.c).toBe('0');
  });

  it('falls back to the head when the played title is not queued', async () => {
    await service.add(USER, ONE);
    await service.add(USER, TWO);
    expect((await service.next(USER, GONE))?.id).toBe(ONE);
  });
});
