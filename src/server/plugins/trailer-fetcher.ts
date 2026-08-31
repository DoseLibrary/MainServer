import { and, asc, eq, inArray } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, rm } from 'node:fs/promises';
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
});

export interface TrailerDownloader {
  available(signal: AbortSignal): Promise<boolean>;
  download(key: string, destination: string, qualityCap: string, signal: AbortSignal): Promise<void>;
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
  };
}

export function createTrailerFetcherPlugin(database: Database, tmdb: TmdbClient, downloader: TrailerDownloader = ytDlpDownloader(), managedStorageRoot = 'trailers'): PluginDefinition<z.infer<typeof trailerFetcherSettingsSchema>> {
  return {
    id: 'trailer-fetcher', metadata: { name: 'Trailer Fetcher', description: 'Refreshes trailers for matched TMDB titles.', version: '1.0.0' },
    settingsSchema: trailerFetcherSettingsSchema, settings: { languages: { label: 'Preferred languages' }, includeClips: { label: 'Include clips' }, qualityCap: { label: 'Maximum quality' }, storageDir: { label: 'Storage subdirectory', description: `Relative folder under managed trailer storage (default root: ${managedStorageRoot})` } },
    async run({ settings, signal }) {
      const parsedSettings = trailerFetcherSettingsSchema.parse(settings);
      // "trailers" is retained as the legacy/default value meaning the managed
      // root itself; all other values are safe subdirectories beneath it.
      const storageDir = resolve(managedStorageRoot, parsedSettings.storageDir === 'trailers' ? '.' : parsedSettings.storageDir);
      if (!managedTrailerDirectory(managedStorageRoot, storageDir)) throw new Error('Storage directory escapes managed trailer storage');
      const canDownload = await downloader.available(signal);
      if (canDownload) await mkdir(storageDir, { recursive: true });
      const items = await database.select({ id: mediaItems.id, kind: mediaItems.kind, providerIds: mediaItems.providerIds }).from(mediaItems)
        .where(inArray(mediaItems.kind, ['movie', 'series'])).orderBy(asc(mediaItems.id));
      let refreshed = 0; let skipped = 0; let trailers = 0; let downloaded = 0; let current = 0; let failed = 0;
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
        let status = localPath ? existing?.status ?? 'ready' : canDownload && preferred ? 'pending' : 'metadata';
        if (localPath) { try { await access(localPath); current++; } catch { localPath = null; downloadedAt = null; status = canDownload ? 'pending' : 'metadata'; } }
        await database.transaction(async (tx) => {
          await tx.delete(mediaTrailers).where(eq(mediaTrailers.mediaItemId, item.id));
          if (videos.length) await tx.insert(mediaTrailers).values(videos.map((video) => ({ mediaItemId: item.id, providerId: video.id, site: video.site, key: video.key, name: video.name, type: video.type, official: video.official, language: video.language, country: video.country, publishedAt: video.publishedAt, preferred: video.id === preferred?.id, ...(video.id === preferred?.id ? { localPath, downloadedAt, status } : {}) })));
        });
        if (!preferred) await removeManaged(previous?.localPath, storageDir);
        if (canDownload && preferred && !localPath) {
          const providerSuffix = createHash('sha256').update(preferred.id).digest('hex').slice(0, 16);
          const destination = resolve(storageDir, `${item.id}-${providerSuffix}.mp4`);
          try {
            await downloader.download(preferred.key, destination, settings.qualityCap, signal);
            if (signal.aborted) throw signal.reason ?? new Error('Trailer fetch cancelled');
            await database.update(mediaTrailers).set({ localPath: destination, downloadedAt: new Date(), status: 'ready', updatedAt: new Date() }).where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.providerId, preferred.id)));
            if (previous?.localPath !== destination) await removeManaged(previous?.localPath, storageDir);
            downloaded++;
          } catch (error) {
            await rm(destination, { force: true }).catch(() => undefined);
            if (signal.aborted) throw error;
            await database.update(mediaTrailers).set({ status: 'failed', updatedAt: new Date() }).where(and(eq(mediaTrailers.mediaItemId, item.id), eq(mediaTrailers.providerId, preferred.id))); failed++;
          }
        }
        refreshed++; trailers += videos.length;
      }
      return { summary: `Refreshed ${refreshed} titles, stored ${trailers} trailers, downloaded ${downloaded}, current ${current}, failed ${failed}, skipped ${skipped} without TMDB IDs${canDownload ? '' : '; yt-dlp unavailable (metadata only)'}` };
    },
  };
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
