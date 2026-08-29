import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { libraries, mediaFiles, mediaItems, mediaTechnicalProfiles, scanRuns } from './db/schema.ts';
import { deriveTechnicalProfile, type Probe } from './media-profile.ts';
import type { AppConfig } from './config.ts';
import { Semaphore } from './concurrency.ts';
import { parseMediaPath, VIDEO_EXTENSIONS } from './media-parser.ts';
import { TmdbClient } from './tmdb.ts';
import { ImageStore } from './images.ts';
import { EnrichmentService, ENRICHMENT_VERSION } from './enrichment.ts';

const execFileAsync = promisify(execFile);
type Scan = typeof scanRuns.$inferSelect;
export const missingFilePredicate = (libraryId: string, scanId: string) => and(eq(mediaFiles.libraryId, libraryId), or(isNull(mediaFiles.lastSeenScanId), ne(mediaFiles.lastSeenScanId, scanId)));

export class ScanCoordinator {
  private readonly active = new Map<string, Promise<void>>();
  private readonly probeLimit: Semaphore; private readonly tmdb?: TmdbClient; private readonly images: ImageStore; private readonly enrichment?: EnrichmentService;
  constructor(private readonly database: Database, private readonly config: AppConfig) {
    this.probeLimit = new Semaphore(config.FFPROBE_CONCURRENCY ?? 3);
    this.images = new ImageStore(join(config.CONFIG_PATH, 'images'));
    if (config.TMDB_API_TOKEN) { this.tmdb = new TmdbClient(config.TMDB_API_TOKEN, config.TMDB_CONCURRENCY ?? 4, config.TMDB_REQUESTS_PER_SECOND ?? 8, config.TMDB_TIMEOUT_MS ?? 8000); this.enrichment = new EnrichmentService(database, this.tmdb, this.images); }
  }
  async start(libraryId: string): Promise<{ scan: Scan; coalesced: boolean } | null> {
    const library = await this.database.query.libraries.findFirst({ where: eq(libraries.id, libraryId) }); if (!library) return null;
    if (this.active.has(libraryId)) { const latest = await this.latest(libraryId); return latest ? { scan: latest, coalesced: true } : null; }
    const staleBefore = new Date(Date.now() - (this.config.SCAN_STALE_AFTER_MS ?? 1_800_000));
    await this.database.update(scanRuns).set({ status: 'failed', error: 'Scan lease expired after server interruption', finishedAt: new Date() }).where(and(eq(scanRuns.libraryId, libraryId), inArray(scanRuns.status, ['queued', 'running']), lt(scanRuns.heartbeatAt, staleBefore)));
    const persisted = await this.database.query.scanRuns.findFirst({ where: and(eq(scanRuns.libraryId, libraryId), inArray(scanRuns.status, ['queued', 'running'])), orderBy: [desc(scanRuns.createdAt)] });
    if (persisted) return { scan: persisted, coalesced: true };
    const [scan] = await this.database.insert(scanRuns).values({ libraryId, status: 'queued' }).onConflictDoNothing().returning();
    if (!scan) { const active = await this.database.query.scanRuns.findFirst({ where: and(eq(scanRuns.libraryId, libraryId), inArray(scanRuns.status, ['queued', 'running'])), orderBy: [desc(scanRuns.createdAt)] }); return active ? { scan: active, coalesced: true } : null; }
    const task = this.run(scan.id, library).catch(() => undefined).finally(() => this.active.delete(libraryId)); this.active.set(libraryId, task);
    return { scan, coalesced: false };
  }
  latest(libraryId: string) { return this.database.query.scanRuns.findFirst({ where: eq(scanRuns.libraryId, libraryId), orderBy: [desc(scanRuns.createdAt)] }); }
  /** Re-enrich existing titles without touching files. Version-gated unless `force`. */
  async refreshLibrary(libraryId: string, force = false): Promise<{ libraryId: string; refreshed: number; failed: number } | null> {
    const library = await this.database.query.libraries.findFirst({ where: eq(libraries.id, libraryId) });
    if (!library) return null;
    if (!this.enrichment) return { libraryId, refreshed: 0, failed: 0 };
    const staleFilter = force ? undefined : lt(mediaItems.enrichmentVersion, ENRICHMENT_VERSION);
    const items = await this.database.select({ id: mediaItems.id, kind: mediaItems.kind, title: mediaItems.title, year: mediaItems.year, providerIds: mediaItems.providerIds })
      .from(mediaItems).where(and(eq(mediaItems.libraryId, libraryId), eq(mediaItems.available, true), inArray(mediaItems.kind, ['movie', 'series']), ...(staleFilter ? [staleFilter] : [])));
    let refreshed = 0; let failed = 0;
    for (const item of items) {
      // Prefer the stored provider id so a refresh updates the same title rather than re-matching by name.
      const providerId = Number(item.providerIds?.tmdb);
      // One failed lookup never aborts the rest of the backfill.
      try { await this.enrichment.enrich(libraryId, item.id, item.kind === 'series' ? 'series' : 'movie', item.title, item.year ?? undefined, Number.isFinite(providerId) && providerId > 0 ? providerId : undefined); refreshed += 1; }
      catch { failed += 1; }
    }
    return { libraryId, refreshed, failed };
  }
  private async run(scanId: string, library: typeof libraries.$inferSelect) {
    await this.database.update(scanRuns).set({ status: 'running', startedAt: new Date(), heartbeatAt: new Date() }).where(eq(scanRuns.id, scanId));
    try {
      const paths = await this.discover(library.rootPath, scanId);
      await this.database.update(scanRuns).set({ discoveredFiles: paths.length, heartbeatAt: new Date() }).where(eq(scanRuns.id, scanId));
      let processed = 0; let failed = 0;
      let cursor = 0; let sinceFlush = 0;
      const worker = async () => { while (cursor < paths.length) { const absolute = paths[cursor++];
        const relativePath = relative(library.rootPath, absolute).split(sep).join('/'); const parsed = parseMediaPath(relativePath, library.kind);
        if (!parsed) { failed++; sinceFlush++; continue; }
        try { await this.ingest(scanId, library, absolute, relativePath, parsed); processed++; } catch { failed++; }
        sinceFlush++; if (sinceFlush >= 25) { sinceFlush = 0; await this.database.update(scanRuns).set({ processedFiles: processed, failedFiles: failed, heartbeatAt: new Date() }).where(eq(scanRuns.id, scanId)); }
      } };
      await Promise.all(Array.from({ length: Math.min(this.config.SCAN_INGEST_CONCURRENCY ?? 8, paths.length) }, worker));
      await this.cacheLibraryArtwork(library.id);
      await this.database.transaction(async (tx) => {
        await tx.update(mediaFiles).set({ available: false, updatedAt: new Date() }).where(missingFilePredicate(library.id, scanId));
        await tx.update(mediaItems).set({ available: sql`exists (select 1 from ${mediaFiles} f where f.media_item_id = ${mediaItems.id} and f.available = true)`, updatedAt: new Date() }).where(and(eq(mediaItems.libraryId, library.id), inArray(mediaItems.kind, ['movie', 'episode'])));
        await tx.update(mediaItems).set({ available: sql`exists (select 1 from ${mediaItems} child where child.parent_id = ${mediaItems.id} and child.available = true)`, updatedAt: new Date() }).where(and(eq(mediaItems.libraryId, library.id), eq(mediaItems.kind, 'season')));
        await tx.update(mediaItems).set({ available: sql`exists (select 1 from ${mediaItems} child where child.parent_id = ${mediaItems.id} and child.available = true)`, updatedAt: new Date() }).where(and(eq(mediaItems.libraryId, library.id), eq(mediaItems.kind, 'series')));
        await tx.update(libraries).set({ lastScannedAt: new Date(), updatedAt: new Date() }).where(eq(libraries.id, library.id));
        await tx.update(scanRuns).set({ status: 'completed', processedFiles: processed, failedFiles: failed, heartbeatAt: new Date(), finishedAt: new Date() }).where(eq(scanRuns.id, scanId));
      });
    } catch (error) { await this.database.update(scanRuns).set({ status: 'failed', error: error instanceof Error ? error.message.slice(0, 1000) : 'Scan failed', finishedAt: new Date() }).where(eq(scanRuns.id, scanId)); }
  }
  private async cacheLibraryArtwork(libraryId: string) {
    if (!this.tmdb) return;
    const artwork = await this.database.select({ posterPath: mediaItems.posterPath, backdropPath: mediaItems.backdropPath })
      .from(mediaItems).where(eq(mediaItems.libraryId, libraryId));
    let cursor = 0;
    const worker = async () => {
      while (cursor < artwork.length) {
        const item = artwork[cursor++];
        try { await Promise.all([this.images.cache(item.posterPath), this.images.cache(item.backdropPath)]); }
        catch { /* metadata remains useful even when a provider is temporarily unavailable */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.config.TMDB_CONCURRENCY ?? 4, artwork.length) }, worker));
  }
  private async discover(root: string, scanId: string): Promise<string[]> {
    const files: string[] = []; const directories = [root]; const limit = this.config.SCAN_FS_CONCURRENCY ?? 24;
    let batches = 0;
    while (directories.length) {
      const batch = directories.splice(0, limit);
      const results = await Promise.all(batch.map(async (directory) => ({ directory, entries: await readdir(directory, { withFileTypes: true }) })));
      for (const { directory, entries } of results) for (const entry of entries) { const path = join(directory, entry.name); if (entry.isDirectory()) directories.push(path); else if (entry.isFile() && VIDEO_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase())) files.push(path); }
      if (++batches % 20 === 0) await this.database.update(scanRuns).set({ heartbeatAt: new Date(), discoveredFiles: files.length }).where(eq(scanRuns.id, scanId));
    }
    return files;
  }
  private async ingest(scanId: string, library: typeof libraries.$inferSelect, absolute: string, relativePath: string, parsed: NonNullable<ReturnType<typeof parseMediaPath>>) {
    const fileStat = await stat(absolute); let probe: Record<string, unknown> = {}; let durationSeconds: number | undefined;
    const existing = await this.database.query.mediaFiles.findFirst({ where: and(eq(mediaFiles.libraryId, library.id), eq(mediaFiles.relativePath, relativePath)) });
    const unchanged = existing && existing.sizeBytes === fileStat.size && existing.modifiedAt.getTime() === fileStat.mtime.getTime();
    if (existing && unchanged) {
      await this.database.update(mediaFiles).set({ available: true, lastSeenScanId: scanId, updatedAt: new Date() }).where(eq(mediaFiles.id, existing.id));
      await this.database.update(mediaItems).set({ available: true, updatedAt: new Date() }).where(sql`${mediaItems.id} = ${existing.mediaItemId} or ${mediaItems.id} in (select parent_id from ${mediaItems} where id = ${existing.mediaItemId}) or ${mediaItems.id} in (select p.parent_id from ${mediaItems} c join ${mediaItems} p on c.parent_id = p.id where c.id = ${existing.mediaItemId})`);
      if (!this.tmdb) return;
      probe = existing.probe as Record<string, unknown>; durationSeconds = existing.durationSeconds ?? undefined;
    }
    if (!unchanged) try { const result = await this.probeLimit.run(() => execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name,bit_rate:stream=codec_type,codec_name,width,height,channels,bit_rate,color_transfer,color_primaries,color_space', '-of', 'json', absolute], { timeout: this.config.FFPROBE_TIMEOUT_MS ?? 20_000, maxBuffer: 1024 * 1024 })); probe = JSON.parse(result.stdout); const duration = Number((probe.format as { duration?: string } | undefined)?.duration); if (Number.isFinite(duration)) durationSeconds = Math.round(duration); } catch { /* a missing/broken ffprobe never aborts discovery */ }
    let parentId: string | null = null; let metadataItemId: string | null = null; const itemKey = parsed.key;
    if (parsed.type === 'episode') {
      const seriesKey = `series:${parsed.series.toLowerCase()}`; const series = await this.upsertItem(library.id, seriesKey, { kind: 'series', title: parsed.series, sortTitle: parsed.series.toLowerCase() });
      metadataItemId = series.id;
      parentId = (await this.upsertItem(library.id, `${seriesKey}:season:${parsed.season}`, { kind: 'season', title: `Season ${parsed.season}`, sortTitle: String(parsed.season).padStart(3, '0'), seasonNumber: parsed.season, parentId: series.id })).id;
    }
    const item = await this.upsertItem(library.id, itemKey, { kind: parsed.type === 'movie' ? 'movie' : 'episode', title: parsed.title, sortTitle: parsed.title.toLowerCase(), year: parsed.type === 'movie' ? parsed.year : undefined, seasonNumber: parsed.type === 'episode' ? parsed.season : undefined, episodeNumber: parsed.type === 'episode' ? parsed.episode : undefined, parentId });
    const [mediaFile] = await this.database.insert(mediaFiles).values({ mediaItemId: item.id, libraryId: library.id, relativePath, sizeBytes: fileStat.size, modifiedAt: fileStat.mtime, durationSeconds, probe, available: true, lastSeenScanId: scanId }).onConflictDoUpdate({ target: [mediaFiles.libraryId, mediaFiles.relativePath], set: { mediaItemId: item.id, sizeBytes: fileStat.size, modifiedAt: fileStat.mtime, durationSeconds, probe, available: true, lastSeenScanId: scanId, updatedAt: new Date() } }).returning({ id: mediaFiles.id });
    if (mediaFile) { const profile = deriveTechnicalProfile(probe as Probe); await this.database.insert(mediaTechnicalProfiles).values({ mediaFileId: mediaFile.id, ...profile }).onConflictDoUpdate({ target: [mediaTechnicalProfiles.mediaFileId], set: { ...profile, updatedAt: new Date() } }); }
    if (this.enrichment) {
      const enrichTitle = parsed.type === 'movie' ? parsed.title : parsed.series;
      const enrichId = parsed.type === 'movie' ? item.id : metadataItemId!;
      // Enrichment failures are isolated per item and never abort unrelated files.
      try { await this.enrichment.enrich(library.id, enrichId, parsed.type === 'movie' ? 'movie' : 'series', enrichTitle, parsed.type === 'movie' ? parsed.year : undefined); } catch { /* isolated per item */ }
    }
  }
  private async upsertItem(libraryId: string, naturalKey: string, values: Omit<typeof mediaItems.$inferInsert, 'libraryId' | 'naturalKey'>) {
    const [item] = await this.database.insert(mediaItems).values({ libraryId, naturalKey, ...values, available: true }).onConflictDoUpdate({ target: [mediaItems.libraryId, mediaItems.naturalKey], set: { ...values, available: true, updatedAt: new Date() } }).returning(); return item;
  }
}
