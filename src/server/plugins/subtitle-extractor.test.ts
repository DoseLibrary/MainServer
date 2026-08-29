import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubtitleExtractorPlugin } from './subtitle-extractor.ts';
import type { Database } from '../db/client.ts';
import type { SubtitleStore, SubtitleTools } from '../subtitles.ts';

const LIB = '10000000-0000-4000-8000-000000000001';
const MOVIE = '20000000-0000-4000-8000-000000000001';
const FILE = '30000000-0000-4000-8000-000000000001';
const idle = new AbortController().signal;

describe('subtitle extractor plugin', () => {
  let client: PGlite;
  let database: Database;
  let extract: ReturnType<typeof vi.fn>;
  let probe: ReturnType<typeof vi.fn>;
  let store: SubtitleStore;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', '/media')`, [LIB]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title) values ($1, $2, 'movie', 'movie:one', 'One', 'one')`, [MOVIE, LIB]);
    await client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at) values ($1, $2, $3, 'One.mkv', 1000, now())`, [FILE, MOVIE, LIB]);

    extract = vi.fn(async () => {});
    probe = vi.fn(async () => ([
      { index: 2, codec: 'subrip', language: 'eng', title: 'English', forced: false },
      { index: 3, codec: 'hdmv_pgs_subtitle', language: 'eng', forced: false },
    ]));
    store = { ensureDir: vi.fn(async () => {}), pathFor: (key: string) => `/subs/${key}`, read: vi.fn() } as unknown as SubtitleStore;
  });

  afterEach(async () => { await client.close(); });

  it('extracts only text subtitle streams and records them', async () => {
    const plugin = createSubtitleExtractorPlugin(database, { probe, extract } as unknown as SubtitleTools, store);
    const result = await plugin.run({ settings: { languages: [], includeForced: true }, signal: idle });

    const absolute = join('/media', 'One.mkv');
    expect(probe).toHaveBeenCalledWith(absolute);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledWith(absolute, 2, `/subs/${FILE}.2.vtt`);
    const { rows } = await client.query<{ language: string; label: string; storage_key: string }>(`select language, label, storage_key from media_subtitles where media_file_id = $1`, [FILE]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ language: 'eng', label: 'English', storage_key: `${FILE}.2.vtt` });
    expect((result as { summary: string }).summary).toContain('extracted 1');
  });

  it('honours the language filter', async () => {
    const plugin = createSubtitleExtractorPlugin(database, { probe, extract } as unknown as SubtitleTools, store);
    await plugin.run({ settings: { languages: ['swe'], includeForced: true }, signal: idle });
    expect(extract).not.toHaveBeenCalled();
    const { rows } = await client.query(`select 1 from media_subtitles where media_file_id = $1`, [FILE]);
    expect(rows).toHaveLength(0);
  });
});
