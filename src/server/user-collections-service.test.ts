import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserCollectionNotFoundError, UserCollectionsService } from './user-collections-service.ts';
import type { Database } from './db/client.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const ONE = '20000000-0000-4000-8000-000000000001';
const TWO = '20000000-0000-4000-8000-000000000002';
const ARCHIVED = '20000000-0000-4000-8000-000000000003';
const OWNER = '70000000-0000-4000-8000-000000000001';
const OTHER = '70000000-0000-4000-8000-000000000002';

describe('UserCollectionsService', () => {
  let client: PGlite;
  let service: UserCollectionsService;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    service = new UserCollectionsService(database);

    await client.query(`insert into users (id, username, password_hash) values ($1, 'owner', 'x'), ($2, 'other', 'x')`, [OWNER, OTHER]);
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, year) values
      ($1, $4, 'movie', 'movie:one', 'One', 'one', 2020),
      ($2, $4, 'movie', 'movie:two', 'Two', 'two', 2021),
      ($3, $4, 'movie', 'movie:gone', 'Gone', 'gone', 2019)`, [ONE, TWO, ARCHIVED, LIB]);
    await client.query(`update media_items set archived_at = now(), available = false where id = $1`, [ARCHIVED]);
  });

  afterEach(async () => { await client.close(); });

  it('creates, renames, and deletes a collection with its membership count', async () => {
    const created = await service.create(OWNER, { name: 'Marathon' });
    expect(created).toMatchObject({ name: 'Marathon', itemCount: 0 });

    await service.addItem(OWNER, created.id, ONE);
    expect(await service.list(OWNER)).toEqual([expect.objectContaining({ id: created.id, name: 'Marathon', itemCount: 1 })]);

    await service.update(OWNER, created.id, { name: 'Movie night' });
    expect((await service.list(OWNER))[0]).toMatchObject({ name: 'Movie night' });

    await service.remove(OWNER, created.id);
    expect(await service.list(OWNER)).toEqual([]);
  });

  it('adds idempotently, hides archived members, and reorders positions', async () => {
    const collection = await service.create(OWNER, { name: 'Saga' });
    await service.addItem(OWNER, collection.id, ONE);
    await service.addItem(OWNER, collection.id, TWO);
    await service.addItem(OWNER, collection.id, ONE);
    await service.addItem(OWNER, collection.id, ARCHIVED);

    const view = await service.get(OWNER, collection.id);
    expect(view.items.map((item) => item.id)).toEqual([ONE, TWO]);
    // Membership keeps the archived title even though the view hides it.
    expect((await service.list(OWNER))[0]?.itemCount).toBe(3);

    const reordered = await service.reorder(OWNER, collection.id, [TWO, ONE]);
    expect(reordered.items.map((item) => item.id)).toEqual([TWO, ONE]);

    const afterRemoval = await service.removeItem(OWNER, collection.id, TWO);
    expect(afterRemoval.items.map((item) => item.id)).toEqual([ONE]);
  });

  it('refuses to read or mutate another user collection', async () => {
    const collection = await service.create(OWNER, { name: 'Private' });
    await expect(service.get(OTHER, collection.id)).rejects.toBeInstanceOf(UserCollectionNotFoundError);
    await expect(service.update(OTHER, collection.id, { name: 'Hijacked' })).rejects.toBeInstanceOf(UserCollectionNotFoundError);
    await expect(service.addItem(OTHER, collection.id, ONE)).rejects.toBeInstanceOf(UserCollectionNotFoundError);
    await expect(service.remove(OTHER, collection.id)).rejects.toBeInstanceOf(UserCollectionNotFoundError);
    expect(await service.list(OTHER)).toEqual([]);
  });

  it('lets a title belong to several collections and cascades on user delete', async () => {
    const first = await service.create(OWNER, { name: 'A' });
    const second = await service.create(OWNER, { name: 'B' });
    await service.addItem(OWNER, first.id, ONE);
    await service.addItem(OWNER, second.id, ONE);
    expect((await service.get(OWNER, second.id)).items.map((item) => item.id)).toEqual([ONE]);

    await client.query(`delete from users where id = $1`, [OWNER]);
    const remaining = await client.query<{ c: string }>(`select count(*)::text as c from user_collections`);
    expect(remaining.rows[0]?.c).toBe('0');
    const items = await client.query<{ c: string }>(`select count(*)::text as c from user_collection_items`);
    expect(items.rows[0]?.c).toBe('0');
  });
});
