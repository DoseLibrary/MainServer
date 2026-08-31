import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choosePreferred, createTrailerFetcherPlugin, trailerFetcherSettingsSchema, type TrailerDownloader } from './trailer-fetcher.ts';
import type { TmdbVideo } from '../tmdb.ts';
import type { TmdbClient } from '../tmdb.ts';
import * as schema from '../db/schema.ts';
import type { Database } from '../db/client.ts';

const cleanup: string[] = [];
async function fixture() {
  const client = new PGlite('memory://'); const database = drizzle(client, { schema }); await migrate(database, { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  const library = '10000000-0000-4000-8000-000000000001'; const item = '20000000-0000-4000-8000-000000000001';
  await client.query(`insert into libraries (id,name,kind,root_path) values ($1,'Movies','movies','/media')`, [library]);
  await client.query(`insert into media_items (id,library_id,kind,natural_key,title,sort_title,provider_ids) values ($1,$2,'movie','movie:test','Test','Test','{"tmdb":"42"}')`, [item, library]);
  const dir = await mkdtemp(join(tmpdir(), 'dose-trailer-')); cleanup.push(dir);
  return { client, database: database as unknown as Database, item, dir };
}
afterEach(async () => { await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const video: TmdbVideo = { id: 'tmdb-video', key: 'youtube-key', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: true, language: 'en' };
const tmdbWith = (getVideos: ReturnType<typeof vi.fn>) => ({ getVideos } as unknown as TmdbClient);
const settings = (storageDir = 'trailers') => ({ languages: ['en'], includeClips: false, qualityCap: '1080' as const, storageDir });

describe('trailer fetcher', () => {
  it('deterministically prefers official YouTube trailers in preferred language', () => {
    const videos: TmdbVideo[] = [
      { id: 'b', key: 'b', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: true, language: 'sv' },
      { id: 'a', key: 'a', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: true, language: 'en' },
      { id: 'c', key: 'c', site: 'YouTube', name: 'Trailer', type: 'Trailer', official: false, language: 'en' },
    ];
    expect(choosePreferred(videos, ['en', 'sv'])?.id).toBe('a');
  });

  it('downloads the preferred trailer, records it, and skips a current file on rerun', async () => {
    const { client, database, item, dir } = await fixture();
    const downloader: TrailerDownloader = { available: vi.fn(async () => true), download: vi.fn(async (_key, path) => { await writeFile(path, 'trailer'); }) };
    const plugin = createTrailerFetcherPlugin(database, tmdbWith(vi.fn(async () => [video])), downloader, dir); const signal = new AbortController().signal;
    await plugin.run({ settings: settings(), signal }); await plugin.run({ settings: settings(), signal });
    expect(downloader.download).toHaveBeenCalledTimes(1);
    const result = await client.query<{ local_path: string; status: string; downloaded_at: Date }>(`select local_path,status,downloaded_at from media_trailers where media_item_id=$1 and preferred=true`, [item]);
    expect(result.rows[0]).toMatchObject({ status: 'ready' }); expect(result.rows[0]?.local_path).toMatch(new RegExp(`${item}-[a-f0-9]{16}\\.mp4$`)); expect(result.rows[0]?.downloaded_at).toBeTruthy();
    await client.close();
  }, 15_000);

  it('stores metadata and reports graceful degradation when yt-dlp is unavailable', async () => {
    const { client, database, dir } = await fixture();
    const downloader: TrailerDownloader = { available: vi.fn(async () => false), download: vi.fn() };
    const result = await createTrailerFetcherPlugin(database, tmdbWith(vi.fn(async () => [video])), downloader, dir).run({ settings: settings(), signal: new AbortController().signal });
    expect(result?.summary).toContain('yt-dlp unavailable'); expect(downloader.download).not.toHaveBeenCalled();
    expect((await client.query<{ status: string }>(`select status from media_trailers`)).rows[0]?.status).toBe('metadata'); await client.close();
  });

  it('honors an already-aborted run signal', async () => {
    const { client, database, dir } = await fixture(); const controller = new AbortController(); controller.abort(new Error('cancelled'));
    const downloader: TrailerDownloader = { available: vi.fn(async (signal) => { if (signal.aborted) throw signal.reason; return true; }), download: vi.fn() };
    await expect(createTrailerFetcherPlugin(database, tmdbWith(vi.fn(async () => [video])), downloader, dir).run({ settings: settings(), signal: controller.signal })).rejects.toThrow('cancelled');
    expect(downloader.download).not.toHaveBeenCalled(); await client.close();
  });

  it('downloads a changed preferred trailer before removing the previous managed file', async () => {
    const { client, database, dir } = await fixture();
    const next = { ...video, id: 'tmdb-video-b', key: 'youtube-key-b' }; const getVideos = vi.fn().mockResolvedValueOnce([video]).mockResolvedValueOnce([next]);
    const downloader: TrailerDownloader = { available: vi.fn(async () => true), download: vi.fn(async (_key, path) => { await writeFile(path, 'trailer'); }) };
    const plugin = createTrailerFetcherPlugin(database, tmdbWith(getVideos), downloader, dir); const context = { settings: settings(), signal: new AbortController().signal };
    await plugin.run(context); const first = (await client.query<{ local_path: string }>(`select local_path from media_trailers where preferred=true`)).rows[0]!.local_path;
    await plugin.run(context); const second = (await client.query<{ provider_id: string; local_path: string }>(`select provider_id,local_path from media_trailers where preferred=true`)).rows[0]!;
    expect(second.provider_id).toBe(next.id); expect(second.local_path).not.toBe(first); await expect(access(second.local_path)).resolves.toBeUndefined(); await expect(access(first)).rejects.toThrow(); await client.close();
  }, 15_000);

  it('removes a stale managed trailer when TMDB returns no usable videos', async () => {
    const { client, database, dir } = await fixture(); const getVideos = vi.fn().mockResolvedValueOnce([video]).mockResolvedValueOnce([]);
    const downloader: TrailerDownloader = { available: vi.fn(async () => true), download: vi.fn(async (_key, path) => { await writeFile(path, 'trailer'); }) };
    const plugin = createTrailerFetcherPlugin(database, tmdbWith(getVideos), downloader, dir); const context = { settings: settings(), signal: new AbortController().signal };
    await plugin.run(context); const oldPath = (await client.query<{ local_path: string }>(`select local_path from media_trailers where preferred=true`)).rows[0]!.local_path;
    await plugin.run(context); expect((await client.query(`select * from media_trailers`)).rows).toHaveLength(0); await expect(access(oldPath)).rejects.toThrow(); await client.close();
  }, 15_000);

  it('accepts safe managed subdirectories and rejects absolute or escaping settings', async () => {
    expect(trailerFetcherSettingsSchema.parse({ storageDir: 'language/en' }).storageDir).toBe('language/en');
    expect(() => trailerFetcherSettingsSchema.parse({ storageDir: '../outside' })).toThrow();
    expect(() => trailerFetcherSettingsSchema.parse({ storageDir: resolve(tmpdir(), 'outside') })).toThrow();
    const { client, database, item, dir } = await fixture();
    const downloader: TrailerDownloader = { available: vi.fn(async () => true), download: vi.fn(async (_key, path) => { await writeFile(path, 'trailer'); }) };
    await createTrailerFetcherPlugin(database, tmdbWith(vi.fn(async () => [video])), downloader, dir).run({ settings: settings('language/en'), signal: new AbortController().signal });
    const { CatalogService } = await import('../catalog-service.ts');
    const source = await new CatalogService(database, dir).localTrailerSource(item);
    expect(source?.localPath).toContain(join('language', 'en')); await expect(access(source!.localPath)).resolves.toBeUndefined(); await client.close();
  }, 15_000);
});
