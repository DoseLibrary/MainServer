import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from './config.ts';
import type { Database } from './db/client.ts';
import * as schema from './db/schema.ts';
import type { EnrichmentService } from './enrichment.ts';
import { ENRICHMENT_VERSION } from './enrichment.ts';
import { ScanCoordinator } from './scanner.ts';

describe('scan-time enrichment gating', () => {
  let client: PGlite;
  let database: Database;
  let mediaDir: string;
  let configDir: string;
  let libraryId: string;

  /** Records calls and stamps items current, the way a successful pass does. */
  function fakeEnrichment() {
    const enrich = vi.fn(async (_libraryId: string, itemId: string) => {
      await client.query(`update media_items set enrichment_version = $1, enrichment_last_success_at = now(), provider_ids = '{"tmdb":"42"}' where id = $2`, [ENRICHMENT_VERSION, itemId]);
      return true;
    });
    const enrichEpisode = vi.fn(async (_seriesId: string, _seasonId: string, episodeItemId: string) => {
      await client.query(`update media_items set enrichment_version = $1, enrichment_last_success_at = now() where id = $2`, [ENRICHMENT_VERSION, episodeItemId]);
    });
    return { enrich, enrichEpisode } as unknown as EnrichmentService & { enrich: ReturnType<typeof vi.fn>; enrichEpisode: ReturnType<typeof vi.fn> };
  }

  beforeEach(async () => {
    client = new PGlite('memory://');
    database = drizzle(client, { schema }) as unknown as Database;
    await migrate(database as never, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
    mediaDir = await mkdtemp(join(tmpdir(), 'dose-scan-'));
    configDir = await mkdtemp(join(tmpdir(), 'dose-cfg-'));

    await mkdir(join(mediaDir, 'The Wire', 'Season 01'), { recursive: true });
    for (const episode of ['S01E01', 'S01E02', 'S01E03']) {
      await writeFile(join(mediaDir, 'The Wire', 'Season 01', `The Wire ${episode}.mkv`), 'x');
    }

    const [library] = (await client.query<{ id: string }>(
      `insert into libraries (name, kind, root_path) values ('Mixed', 'shows', $1) returning id`, [mediaDir])).rows;
    libraryId = library.id;
  });

  afterEach(async () => {
    await client.close();
    await rm(mediaDir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  });

  const config = () => ({ CONFIG_PATH: configDir, TMDB_API_TOKEN: 'token', SCAN_INGEST_CONCURRENCY: 2, FFPROBE_TIMEOUT_MS: 500 } as unknown as AppConfig);

  it('enriches a series once per scan, not once per episode', async () => {
    const enrichment = fakeEnrichment();
    const scanner = new ScanCoordinator(database, config(), undefined, enrichment);

    await scanner.reconcileLibrary(libraryId);

    const seriesCalls = enrichment.enrich.mock.calls.filter(([, , kind]) => kind === 'series');
    expect(seriesCalls).toHaveLength(1);
    expect(enrichment.enrichEpisode).toHaveBeenCalledTimes(3);
  });

  it('costs zero provider calls to rescan an unchanged library', async () => {
    const enrichment = fakeEnrichment();
    const scanner = new ScanCoordinator(database, config(), undefined, enrichment);
    await scanner.reconcileLibrary(libraryId);
    enrichment.enrich.mockClear();
    enrichment.enrichEpisode.mockClear();

    await scanner.reconcileLibrary(libraryId);

    expect(enrichment.enrich).not.toHaveBeenCalled();
    expect(enrichment.enrichEpisode).not.toHaveBeenCalled();
  });

  it('still enriches a new episode dropped into a current series', async () => {
    const enrichment = fakeEnrichment();
    const scanner = new ScanCoordinator(database, config(), undefined, enrichment);
    await scanner.reconcileLibrary(libraryId);
    enrichment.enrich.mockClear();
    enrichment.enrichEpisode.mockClear();

    await writeFile(join(mediaDir, 'The Wire', 'Season 01', 'The Wire S01E04.mkv'), 'x');
    await scanner.reconcileLibrary(libraryId);

    // The series is already current, so only the new episode costs a call.
    expect(enrichment.enrich).not.toHaveBeenCalled();
    expect(enrichment.enrichEpisode).toHaveBeenCalledTimes(1);
  });

  /** Stamps a provider id per show and a provider title, the way a real pass does. */
  function fakeProviderEnrichment(idByTitle: Record<string, string>) {
    const enrich = vi.fn(async (_libraryId: string, itemId: string, _kind: string, title: string) => {
      const id = idByTitle[title] ?? '1';
      await client.query(
        `update media_items set enrichment_version = $1, enrichment_last_success_at = now(), metadata_source = 'tmdb', provider_ids = $2, title = $3 where id = $4`,
        [ENRICHMENT_VERSION, JSON.stringify({ tmdb: id }), `Provider ${id}`, itemId]);
      return true;
    });
    const enrichEpisode = vi.fn(async (_seriesId: string, seasonItemId: string, episodeItemId: string, season: number, episode: number) => {
      await client.query(`update media_items set enrichment_version = $1, enrichment_last_success_at = now(), metadata_source = 'tmdb', title = $2 where id = $3`, [ENRICHMENT_VERSION, `Season ${season}`, seasonItemId]);
      await client.query(`update media_items set enrichment_version = $1, enrichment_last_success_at = now(), metadata_source = 'tmdb', title = $2 where id = $3`, [ENRICHMENT_VERSION, `Provider episode ${episode}`, episodeItemId]);
    });
    return { enrich, enrichEpisode } as unknown as EnrichmentService & { enrich: ReturnType<typeof vi.fn>; enrichEpisode: ReturnType<typeof vi.fn> };
  }

  it('keeps the provider title when a rescan re-reads the filename', async () => {
    const scanner = new ScanCoordinator(database, config(), undefined, fakeProviderEnrichment({}));
    await scanner.reconcileLibrary(libraryId);
    await scanner.reconcileLibrary(libraryId);

    const titles = (await client.query<{ title: string; kind: string }>(
      `select title, kind from media_items where kind in ('series', 'episode') order by kind, title`)).rows;
    expect(titles.filter((row) => row.kind === 'episode').map((row) => row.title))
      .toEqual(['Provider episode 1', 'Provider episode 2', 'Provider episode 3']);
    expect(titles.filter((row) => row.kind === 'series').map((row) => row.title)).toEqual(['Provider 1']);
  });

  it('collapses two folder spellings of one show into a single series', async () => {
    await mkdir(join(mediaDir, "The Handmaid's Tale", 'Season 01'), { recursive: true });
    await writeFile(join(mediaDir, "The Handmaid's Tale", 'Season 01', "The Handmaid's Tale S01E01.mkv"), 'x');
    await mkdir(join(mediaDir, 'The Handmaids Tale (2017)', 'Season 01'), { recursive: true });
    await writeFile(join(mediaDir, 'The Handmaids Tale (2017)', 'Season 01', 'The Handmaids Tale S01E01.mkv'), 'x');
    await mkdir(join(mediaDir, 'The Handmaids Tale (2017)', 'Season 02'), { recursive: true });
    await writeFile(join(mediaDir, 'The Handmaids Tale (2017)', 'Season 02', 'The Handmaids Tale S02E01.mkv'), 'x');

    const enrichment = fakeProviderEnrichment({ "The Handmaid's Tale": '42', 'The Handmaids Tale': '42', 'The Wire': '7' });
    const scanner = new ScanCoordinator(database, config(), undefined, enrichment);
    await scanner.reconcileLibrary(libraryId);

    const series = (await client.query<{ id: string }>(`select id from media_items where kind = 'series' and provider_ids->>'tmdb' = '42'`)).rows;
    expect(series).toHaveLength(1);
    const seasons = (await client.query<{ id: string; season_number: number }>(
      `select id, season_number from media_items where kind = 'season' and parent_id = $1 order by season_number`, [series[0].id])).rows;
    expect(seasons.map((row) => row.season_number)).toEqual([1, 2]);
    // Both copies of S01E01 play the one episode; S02E01 came along with its season.
    const episodes = (await client.query<{ season_number: number; episode_number: number; files: number }>(
      `select i.season_number, i.episode_number, count(f.id)::int as files from media_items i
         join media_files f on f.media_item_id = i.id
        where i.kind = 'episode' and i.parent_id in (select id from media_items where parent_id = $1)
        group by i.season_number, i.episode_number order by i.season_number`, [series[0].id])).rows;
    expect(episodes).toEqual([{ season_number: 1, episode_number: 1, files: 2 }, { season_number: 2, episode_number: 1, files: 1 }]);
    // The duplicate series row is gone, not merely hidden.
    expect((await client.query(`select id from media_items where kind = 'series'`)).rows).toHaveLength(2);
  });

  it('retries a series whose enrichment never succeeded', async () => {
    const enrichment = fakeEnrichment();
    // The provider fails on the first pass: nothing gets stamped.
    enrichment.enrich.mockImplementationOnce(async () => false);
    const scanner = new ScanCoordinator(database, config(), undefined, enrichment);
    await scanner.reconcileLibrary(libraryId);
    expect(enrichment.enrich).toHaveBeenCalledTimes(1);
    enrichment.enrich.mockClear();

    // Still stale, so the rescan tries again — once, not once per episode.
    await scanner.reconcileLibrary(libraryId);
    expect(enrichment.enrich).toHaveBeenCalledTimes(1);
  });
});
