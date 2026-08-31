import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreviewSpritePlugin } from './preview-sprites.ts';
import type { Database } from '../db/client.ts';
import type { PreviewSpriteStore, SpriteTools } from '../sprites.ts';

const LIBRARY = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const SHORT = '20000000-0000-4000-8000-000000000002';
const FILE = '30000000-0000-4000-8000-000000000001';
const SHORTFILE = '30000000-0000-4000-8000-000000000002';

describe('preview-sprites plugin', () => {
  let client: PGlite;
  let database: Database;
  let generate: ReturnType<typeof vi.fn>;
  let store: PreviewSpriteStore;
  let plugin: ReturnType<typeof createPreviewSpritePlugin>;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIBRARY]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one', 'One', 'one')`, [MOVIE, LIBRARY]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:short', 'Short', 'short')`, [SHORT, LIBRARY]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'One.mkv', 1000, to_timestamp(1000), 100)`, [FILE, MOVIE, LIBRARY]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, duration_seconds) values ($1, $2, $3, 'Short.mkv', 1000, to_timestamp(1000), 5)`, [SHORTFILE, SHORT, LIBRARY]);

    generate = vi.fn(async () => {});
    store = { ensureDir: vi.fn(async () => {}), pathFor: (key: string) => `/previews/${key}`, read: vi.fn() } as unknown as PreviewSpriteStore;
    plugin = createPreviewSpritePlugin(database, { generate } as unknown as SpriteTools, store);
  });

  afterEach(async () => { await client.close(); });

  const run = (settings: Record<string, unknown>) => plugin.run!({ settings: settings as never, signal: new AbortController().signal });

  it('generates a sprite sheet and persists the descriptor, skipping too-short files', async () => {
    await run({ interval: 10, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 });

    // duration 100 / interval 10 = 10 tiles, 5 columns => 2 rows. The 5s short is skipped.
    expect(generate).toHaveBeenCalledTimes(1);
    const [srcArg, layoutArg, outArg] = generate.mock.calls[0]!;
    expect(layoutArg).toEqual({ interval: 10, columns: 5, rows: 2, tileWidth: 160, tileHeight: 90 });
    expect(outArg).toBe(store.pathFor(`${FILE}.jpg`));
    expect(srcArg).toContain('One.mkv');

    const row = (await client.query<{ columns: number; rows: number; interval: number; tile_width: number; tile_height: number; storage_key: string }>(
      `select columns, rows, interval, tile_width, tile_height, storage_key from media_preview_sprites where media_file_id = $1`, [FILE])).rows[0];
    expect(row).toMatchObject({ columns: 5, rows: 2, interval: 10, tile_width: 160, tile_height: 90, storage_key: `${FILE}.jpg` });
  });

  it('is idempotent: unchanged files are not regenerated', async () => {
    await run({ interval: 10, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 });
    generate.mockClear();
    await run({ interval: 10, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('regenerates when settings change the layout', async () => {
    await run({ interval: 10, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 });
    generate.mockClear();
    await run({ interval: 20, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('counts a failed generation without aborting the run', async () => {
    generate.mockRejectedValueOnce(new Error('ffmpeg missing'));
    const result = await run({ interval: 10, columns: 5, tileWidth: 160, tileHeight: 90, maxTiles: 200 });
    expect(result?.summary).toContain('failed');
    expect((await client.query(`select count(*)::text as c from media_preview_sprites`)).rows[0]).toMatchObject({ c: '0' });
  });
});
