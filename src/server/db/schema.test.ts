import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('catalog enrichment migration', () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite('memory://');
    const database = drizzle(client);
    await migrate(database, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  });

  afterEach(async () => {
    await client.close();
  });

  it('migrates a fresh PostgreSQL-compatible database with enrichment columns and tables', async () => {
    const columns = await client.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'media_items'
    `);
    const names = columns.rows.map((row) => row.column_name);

    expect(names).toEqual(expect.arrayContaining([
      'original_title',
      'release_date',
      'tagline',
      'provider_rating',
      'content_rating',
      'enrichment_version',
      'enrichment_last_attempt_at',
      'enrichment_last_success_at',
      'archived_at',
    ]));
    const trailerColumns = await client.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name='media_trailers'`);
    expect(trailerColumns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining(['local_path', 'downloaded_at', 'status']));

    const tables = await client.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      'genres',
      'media_item_genres',
      'people',
      'cast_credits',
      'collections',
      'collection_members',
      'recommendation_edges',
      'media_technical_profiles',
    ]));
  });

  it('can safely re-run the guarded archive migration statements', async () => {
    await client.exec(`alter table media_items add column if not exists archived_at timestamptz`);
    await client.exec(`create index if not exists media_items_archived_at_index on media_items (archived_at)`);
    await client.exec(`alter table media_items add column if not exists archived_at timestamptz`);
    await client.exec(`create index if not exists media_items_archived_at_index on media_items (archived_at)`);
  });

  it('enforces idempotent relationships and cascades enrichment when a library is deleted', async () => {
    const libraryId = '10000000-0000-4000-8000-000000000001';
    const sourceId = '20000000-0000-4000-8000-000000000001';
    const recommendedId = '20000000-0000-4000-8000-000000000002';
    const genreId = '30000000-0000-4000-8000-000000000001';
    const personId = '40000000-0000-4000-8000-000000000001';
    const collectionId = '50000000-0000-4000-8000-000000000001';

    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [libraryId]);
    await client.query(`
      insert into media_items (id, library_id, kind, natural_key, title, sort_title)
      values ($1, $3, 'movie', 'movie:one:2020', 'One', 'One'),
             ($2, $3, 'movie', 'movie:two:2021', 'Two', 'Two')
    `, [sourceId, recommendedId, libraryId]);
    await client.query(`insert into genres (id, library_id, provider_id, name, normalized_name) values ($1, $2, '28', 'Action', 'action')`, [genreId, libraryId]);
    await client.query(`insert into people (id, library_id, provider_id, name) values ($1, $2, '42', 'Actor')`, [personId, libraryId]);
    await client.query(`insert into collections (id, library_id, provider_id, name) values ($1, $2, '7', 'Saga')`, [collectionId, libraryId]);
    await client.query(`insert into media_item_genres (media_item_id, genre_id) values ($1, $2)`, [sourceId, genreId]);
    await client.query(`insert into cast_credits (media_item_id, person_id) values ($1, $2)`, [sourceId, personId]);
    await client.query(`insert into collection_members (collection_id, media_item_id) values ($1, $2)`, [collectionId, sourceId]);
    await client.query(`insert into recommendation_edges (source_media_item_id, recommended_media_item_id) values ($1, $2)`, [sourceId, recommendedId]);

    await expect(client.query(`insert into cast_credits (media_item_id, person_id) values ($1, $2)`, [sourceId, personId])).rejects.toThrow();
    await expect(client.query(`insert into recommendation_edges (source_media_item_id, recommended_media_item_id) values ($1, $2)`, [sourceId, recommendedId])).rejects.toThrow();

    await client.query(`delete from libraries where id = $1`, [libraryId]);

    for (const table of ['genres', 'people', 'collections', 'media_item_genres', 'cast_credits', 'collection_members', 'recommendation_edges']) {
      const result = await client.query<{ count: string }>(`select count(*)::text as count from ${table}`);
      expect(result.rows[0]?.count).toBe('0');
    }
  });
});
