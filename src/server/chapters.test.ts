import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog-service.ts';
import { chaptersOf, ffprobeChapters, probeKnowsChapters } from './chapters.ts';
import type { Database } from './db/client.ts';

const execFileAsync = promisify(execFile);

describe('reading chapters out of a probe', () => {
  it('keeps titles, orders by start, and names the untitled', () => {
    const probe = {
      chapters: [
        { start_time: '600.000000', end_time: '1200.0', tags: { title: 'The Heist' } },
        { start_time: '0.000000', end_time: '600.0', tags: {} },
      ],
    };

    expect(chaptersOf(probe)).toEqual([
      { title: 'Chapter 1', startSeconds: 0, endSeconds: 600 },
      { title: 'The Heist', startSeconds: 600, endSeconds: 1200 },
    ]);
  });

  it('drops what it cannot trust instead of failing the list', () => {
    const probe = {
      chapters: [
        { start_time: 'abc', end_time: '10' },
        { start_time: '20', end_time: '10' },
        { start_time: '-5', end_time: '10' },
        { start_time: '0', end_time: '5', tags: { title: '  ' } },
      ],
    };

    expect(chaptersOf(probe)).toEqual([{ title: 'Chapter 1', startSeconds: 0, endSeconds: 5 }]);
    expect(chaptersOf(null)).toEqual([]);
    expect(chaptersOf({})).toEqual([]);
  });

  it('tells a probe that was never asked apart from a file with none', () => {
    expect(probeKnowsChapters({ chapters: [] })).toBe(true);
    expect(probeKnowsChapters({ format: {} })).toBe(false);
    expect(probeKnowsChapters(null)).toBe(false);
  });
});

describe('chapters through the catalog', () => {
  const LIB = '10000000-0000-4000-8000-000000000001';
  const MOVIE = '20000000-0000-4000-8000-000000000001';
  const FILE = '30000000-0000-4000-8000-000000000001';

  let client: PGlite;
  let database: Database;
  let mediaDir: string;

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    mediaDir = await mkdtemp(join(tmpdir(), 'dose-ch-'));
    await client.query(`insert into libraries (id, name, kind, root_path) values ($1, 'Movies', 'movies', $2)`, [LIB, mediaDir]);
    await client.query(`insert into media_items (id, library_id, kind, natural_key, title, sort_title, maturity_level) values ($1, $2, 'movie', 'movie:one', 'Arrival', 'arrival', 13)`, [MOVIE, LIB]);
  });

  afterEach(async () => {
    await client.close();
    await rm(mediaDir, { recursive: true, force: true });
  });

  const insertFile = (probe: unknown) =>
    client.query(`insert into media_files (id, media_item_id, library_id, relative_path, size_bytes, modified_at, probe) values ($1, $2, $3, 'Arrival.mkv', 1, now(), $4)`,
      [FILE, MOVIE, LIB, JSON.stringify(probe)]);

  it('serves chapters straight from a probe that has them', async () => {
    await insertFile({ chapters: [{ start_time: '0', end_time: '300', tags: { title: 'Opening' } }] });
    const probeFile = vi.fn();

    const chapters = await new CatalogService(database).chapters(MOVIE, probeFile as never);

    expect(chapters).toEqual([{ title: 'Opening', startSeconds: 0, endSeconds: 300 }]);
    expect(probeFile).not.toHaveBeenCalled();
  });

  it('looks once at a file scanned before chapters were probed, then remembers', async () => {
    await insertFile({ format: { duration: '100' } });
    const probeFile = vi.fn(async () => [{ start_time: '0', end_time: '50', tags: { title: 'Part One' } }]);
    const catalog = new CatalogService(database);

    expect(await catalog.chapters(MOVIE, probeFile as never)).toEqual([{ title: 'Part One', startSeconds: 0, endSeconds: 50 }]);
    expect(await catalog.chapters(MOVIE, probeFile as never)).toHaveLength(1);

    // The live look happened exactly once; the answer now lives in the probe.
    expect(probeFile).toHaveBeenCalledTimes(1);
  });

  it('remembers a chapterless file the same way, without re-probing', async () => {
    await insertFile({ format: {} });
    const probeFile = vi.fn(async () => []);
    const catalog = new CatalogService(database);

    expect(await catalog.chapters(MOVIE, probeFile as never)).toEqual([]);
    expect(await catalog.chapters(MOVIE, probeFile as never)).toEqual([]);

    expect(probeFile).toHaveBeenCalledTimes(1);
  });

  it('hides chapters of a title the viewer is not allowed to see', async () => {
    await insertFile({ chapters: [{ start_time: '0', end_time: '300' }] });
    await client.query(`update media_items set maturity_level = 17 where id = $1`, [MOVIE]);

    expect(await new CatalogService(database).forViewer(13).chapters(MOVIE)).toEqual([]);
  });
});

describe('against a real chaptered file', () => {
  it('reads back the chapters ffmpeg wrote', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dose-chreal-'));
    try {
      const meta = join(dir, 'chapters.txt');
      await writeFile(meta, [
        ';FFMETADATA1', '',
        '[CHAPTER]', 'TIMEBASE=1/1000', 'START=0', 'END=2000', 'title=Cold Open', '',
        '[CHAPTER]', 'TIMEBASE=1/1000', 'START=2000', 'END=4000', 'title=The Reveal',
      ].join('\n'));
      const file = join(dir, 'sample.mkv');
      await execFileAsync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=4',
        '-i', meta, '-map_metadata', '1', '-c:v', 'libx264', '-preset', 'veryfast', '-y', file], { timeout: 60_000 });

      const chapters = chaptersOf({ chapters: await ffprobeChapters(file) });

      expect(chapters).toEqual([
        { title: 'Cold Open', startSeconds: 0, endSeconds: 2 },
        { title: 'The Reveal', startSeconds: 2, endSeconds: 4 },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
