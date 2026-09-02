import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { mediaItems, mediaTrailers } from '../db/schema.ts';
import type { TmdbClient, TmdbVideo } from '../tmdb.ts';
import type { PluginDefinition } from './types.ts';

const storageSubdirectory = z.string().min(1).refine((value) => {
  if (isAbsolute(value)) return false;
  const normalized = value.replace(/\\/g, '/');
  return normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../');
}, 'Storage directory must be a relative subdirectory of managed trailer storage');

export const trailerFetcherSettingsSchema = z.object({
  languages: z.array(z.string().min(2).max(10)).default(['en']), includeClips: z.boolean().default(false),
  qualityCap: z.enum(['720', '1080', '1440', '2160']).default('1080'),
  storageDir: storageSubdirectory.default('trailers'),
  // yt-dlp breaks whenever YouTube shifts; keep the binary fresh on a cadence and
  // recover a failed download by self-updating before giving up.
  autoUpdate: z.boolean().default(true),
  updateIntervalDays: z.coerce.number().int().min(1).max(90).default(7),
  // Large libraries rarely want a trailer per title. 0 means unlimited; above
  // that, newest titles fill the budget and older ones go without.
  storageLimitGb: z.coerce.number().min(0).default(0),
});

export interface TrailerDownloader {
  available(signal: AbortSignal): Promise<boolean>;
  download(key: string, destination: string, qualityCap: string, signal: AbortSignal): Promise<void>;
  /** Self-update the downloader binary (e.g. `yt-dlp -U`). Resolves true when updated. */
  update?(signal: AbortSignal): Promise<boolean>;
}

export function ytDlpDownloader(binary = 'yt-dlp'): TrailerDownloader {
  const execute = (args: string[], signal: AbortSignal) => new Promise<void>((resolveRun, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error('Trailer fetch cancelled'));
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    const abort = () => child.kill('SIGTERM'); signal.addEventListener('abort', abort, { once: true });
    child.once('error', reject); child.once('close', (code) => code === 0 ? resolveRun() : reject(new Error(`${binary} exited with code ${code}`)));
    child.once('close', () => signal.removeEventListener('abort', abort));
  });
  return {
    async available(signal) { try { await execute(['--version'], signal); return true; } catch (error) { if (signal.aborted) throw error; return false; } },
    download: (key, destination, qualityCap, signal) => execute(['--no-playlist', '--no-part', '--restrict-filenames', '-f', `bestvideo[height<=${qualityCap}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${qualityCap}][ext=mp4]`, '--merge-output-format', 'mp4', '-o', destination, `https://www.youtube.com/watch?v=${key}`], signal),
    // `-U` only works for a standalone binary; a pip/package install fails here,
    // which we swallow so update attempts never break a trailer run.
    async update(signal) { try { await execute(['-U'], signal); return true; } catch (error) { if (signal.aborted) throw error; return false; } },
  };
}

export function createTrailerFetcherPlugin(database: Database, tmdb: TmdbClient, downloader: TrailerDownloader = ytDlpDownloader(), managedStorageRoot = 'trailers'): PluginDefinition<z.infer<typeof trailerFetcherSettingsSchema>> {
  return {
    id: 'trailer-fetcher', metadata: { name: 'Trailer Fetcher', description: 'Refreshes trailers for matched TMDB titles.', version: '1.0.0' },
    settingsSchema: trailerFetcherSettingsSchema,
    fields: [
      { kind: 'list', key: 'languages', label: 'Preferred languages', placeholder: 'en, sv', itemLabel: 'language', group: 'Selection' },
      { kind: 'boolean', key: 'includeClips', label: 'Include clips', description: 'Accept clips and featurettes when no trailer is published.', group: 'Selection' },
      { kind: 'select', key: 'qualityCap', label: 'Maximum quality', options: [
        { value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '1440', label: '1440p' }, { value: '2160', label: '2160p' },
      ], group: 'Selection' },
      { kind: 'path', key: 'storageDir', label: 'Storage subdirectory', description: `Relative folder under managed trailer storage (default root: ${managedStorageRoot})`, required: true, group: 'Storage' },
      { kind: 'number', key: 'storageLimitGb', label: 'Storage limit (GB)', description: 'Most disk space trailers may use; 0 means unlimited. Newest titles are downloaded first and older ones go without once the limit is reached.', min: 0, step: 1, group: 'Storage' },
      { kind: 'boolean', key: 'autoUpdate', label: 'Auto-update yt-dlp', description: 'Self-update yt-dlp on the cadence below and after a failed download.', group: 'Downloader' },
      { kind: 'number', key: 'updateIntervalDays', label: 'Update interval (days)', description: 'How often to refresh yt-dlp before a run (default 7).', min: 1, max: 90, group: 'Downloader' },
    ],
    async run({ settings, signal }) {
      const parsedSettings = trailerFetcherSettingsSchema.parse(settings);
      // "trailers" is retained as the legacy/default value meaning the managed
      // root itself; all other values are safe subdirectories beneath it.
      const storageDir = resolve(managedStorageRoot, parsedSettings.storageDir === 'trailers' ? '.' : parsedSettings.storageDir);
      if (!managedTrailerDirectory(managedStorageRoot, storageDir)) throw new Error('Storage directory escapes managed trailer storage');
      const canDownload = await downloader.available(signal);
      if (canDownload) await mkdir(storageDir, { recursive: true });

      // yt-dlp self-update: throttled to once per updateIntervalDays via a sentinel
      // in the managed root, plus an on-demand refresh after a download fails.
      const updateSentinel = resolve(managedStorageRoot, '.yt-dlp-updated');
      let didUpdate = false;
      const runUpdate = async () => {
        if (didUpdate || !parsedSettings.autoUpdate || !downloader.update) return false;
        try {
          const ok = await downloader.update(signal);
          if (ok) { didUpdate = true; await mkdir(managedStorageRoot, { recursive: true }); await writeFile(updateSentinel, new Date().toISOString()); }
          return ok;
        } catch (error) { if (signal.aborted) throw error; return false; }
      };
      if (canDownload && parsedSettings.autoUpdate && downloader.update && await updateDue(updateSentinel, parsedSettings.updateIntervalDays)) await runUpdate();
      const items = await database.select({ id: mediaItems.id, kind: mediaItems.kind, providerIds: mediaItems.providerIds }).from(mediaItems)
        .where(inArray(mediaItems.kind, ['movie', 'series'])).orderBy(desc(mediaItems.createdAt), desc(mediaItems.id));
      const limitBytes = parsedSettings.storageLimitGb > 0 ? parsedSettings.storageLimitGb * 1024 ** 3 : Infinity;
      let usage = limitBytes === Infinity ? 0 : await managedUsage(database, storageDir);
      let refreshed = 0; let skipped = 0; let trailers = 0; let downloaded = 0; let current = 0; let failed = 0; let capped = 0;
      for (const item of items) {
        if (signal.aborted) throw signal.reason ?? new Error('Trailer fetch cancelled');
        const providerId = Number(item.providerIds.tmdb);
        if (!Number.isInteger(providerId) || providerId < 1) { skipped++; continue; }
        const videos = (await tmdb.getVideos(item.kind as 'movie' | 'series', providerId))
          .filter((video) => useful(video, settings.includeClips));
        const preferred = choosePreferred(videos, settings.languages);
        const [previous] = await database.select().from(mediaTrailers).where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.preferred, true))).limit(1);
        const [existing] = preferred ? await database.select().from(mediaTrailers).where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.providerId, preferred.id))) : [];
        let localPath = existing?.localPath ?? null;
        let downloadedAt = existing?.downloadedAt ?? null;
        if (localPath) { try { await access(localPath); current++; } catch { localPath = null; downloadedAt = null; } }
        const overBudget = !localPath && usage >= limitBytes;
        const status = localPath ? existing?.status ?? 'ready' : canDownload && preferred && !overBudget ? 'pending' : 'metadata';
        await database.transaction(async (tx) => {
          await tx.delete(mediaTrailers).where(eq(mediaTrailers.mediaItemId, item.id));
          if (videos.length) await tx.insert(mediaTrailers).values(videos.map((video) => ({ mediaItemId: item.id, providerId: video.id, site: video.site, key: video.key, name: video.name, type: video.type, official: video.official, language: video.language, country: video.country, publishedAt: video.publishedAt, preferred: video.id === preferred?.id, ...(video.id === preferred?.id ? { localPath, downloadedAt, status } : {}) })));
        });
        if (!preferred) await removeManaged(previous?.localPath, storageDir);
        if (canDownload && preferred && overBudget) capped++;
        else if (canDownload && preferred && !localPath) {
          const providerSuffix = createHash('sha256').update(preferred.id).digest('hex').slice(0, 16);
          const destination = resolve(storageDir, `${item.id}-${providerSuffix}.mp4`);
          const attempt = async () => {
            await downloader.download(preferred.key, destination, settings.qualityCap, signal);
            if (signal.aborted) throw signal.reason ?? new Error('Trailer fetch cancelled');
          };
          let ok = false;
          try { await attempt(); ok = true; }
          catch (error) {
            await rm(destination, { force: true }).catch(() => undefined);
            if (signal.aborted) throw error;
            // Most download failures are a stale yt-dlp; refresh once and retry.
            if (await runUpdate()) {
              try { await attempt(); ok = true; }
              catch (retryError) { await rm(destination, { force: true }).catch(() => undefined); if (signal.aborted) throw retryError; }
            }
          }
          if (ok) {
            await database.update(mediaTrailers).set({ localPath: destination, downloadedAt: new Date(), status: 'ready', updatedAt: new Date() }).where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.providerId, preferred.id)));
            if (previous?.localPath !== destination) await removeManaged(previous?.localPath, storageDir);
            downloaded++; usage += await fileSize(destination);
          } else {
            await database.update(mediaTrailers).set({ status: 'failed', updatedAt: new Date() }).where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.providerId, preferred.id))); failed++;
          }
        }
        refreshed++; trailers += videos.length;
      }
      // A lowered cap leaves more on disk than allowed: drop trailers of the
      // oldest titles until the budget holds again.
      let evicted = 0;
      for (const item of [...items].reverse()) {
        if (usage <= limitBytes) break;
        if (signal.aborted) throw signal.reason ?? new Error('Trailer fetch cancelled');
        const [row] = await database.select({ id: mediaTrailers.id, localPath: mediaTrailers.localPath }).from(mediaTrailers)
          .where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.preferred, true), isNotNull(mediaTrailers.localPath))).limit(1);
        if (!row?.localPath || !managedTrailerDirectory(storageDir, row.localPath)) continue;
        const size = await fileSize(row.localPath);
        await removeManaged(row.localPath, storageDir);
        await database.update(mediaTrailers).set({ localPath: null, downloadedAt: null, status: 'metadata', updatedAt: new Date() }).where(eq(mediaTrailers.id, row.id));
        usage -= size; evicted++;
      }
      const budget = limitBytes === Infinity ? '' : `, capped ${capped}, evicted ${evicted}, using ${gigabytes(usage)} of ${parsedSettings.storageLimitGb} GB`;
      return { summary: `Refreshed ${refreshed} titles, stored ${trailers} trailers, downloaded ${downloaded}, current ${current}, failed ${failed}, skipped ${skipped} without TMDB IDs${budget}${canDownload ? '' : '; yt-dlp unavailable (metadata only)'}` };
    },
  };
}

async function fileSize(path: string) { try { return (await stat(path)).size; } catch { return 0; } }
const gigabytes = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);

/** Bytes already held by managed trailer files inside `storageDir`. */
async function managedUsage(database: Database, storageDir: string) {
  const rows = await database.select({ localPath: mediaTrailers.localPath }).from(mediaTrailers).where(isNotNull(mediaTrailers.localPath));
  let total = 0;
  for (const row of rows) if (row.localPath && managedTrailerDirectory(storageDir, row.localPath)) total += await fileSize(row.localPath);
  return total;
}

async function updateDue(sentinelPath: string, intervalDays: number) {
  try { const info = await stat(sentinelPath); return Date.now() - info.mtimeMs >= intervalDays * 86_400_000; }
  catch { return true; } // No sentinel yet — treat as due.
}

function managedTrailerDirectory(root: string, directory: string) {
  const relation = relative(resolve(root), resolve(directory));
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

async function removeManaged(path: string | null | undefined, storageDir: string) {
  if (!path) return;
  const relation = relative(resolve(storageDir), resolve(path));
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) return;
  await rm(resolve(path), { force: true }).catch(() => undefined);
}

function useful(video: TmdbVideo, includeClips: boolean) { return video.site.toLowerCase() === 'youtube' && (video.type.toLowerCase() === 'trailer' || (includeClips && video.type.toLowerCase() === 'clip')); }
export function choosePreferred(videos: TmdbVideo[], languages: string[]) {
  const rank = (video: TmdbVideo) => { const languageIndex = languages.indexOf(video.language ?? ''); return [video.type.toLowerCase() === 'trailer' ? 1 : 0, video.official ? 1 : 0, languageIndex < 0 ? 0 : languages.length - languageIndex, video.publishedAt?.getTime() ?? 0]; };
  return [...videos].sort((a, b) => { const ar = rank(a); const br = rank(b); for (let i = 0; i < ar.length; i++) if (ar[i] !== br[i]) return br[i]! - ar[i]!; return a.id.localeCompare(b.id); })[0];
}
