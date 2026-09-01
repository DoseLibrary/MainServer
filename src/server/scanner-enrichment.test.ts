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
