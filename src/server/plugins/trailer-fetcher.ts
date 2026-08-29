import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { mediaItems, mediaTrailers } from '../db/schema.ts';
import type { TmdbClient, TmdbVideo } from '../tmdb.ts';
import type { PluginDefinition } from './types.ts';

const settingsSchema = z.object({ languages: z.array(z.string().min(2).max(10)).default(['en']), includeClips: z.boolean().default(false) });

export function createTrailerFetcherPlugin(database: Database, tmdb: TmdbClient): PluginDefinition<z.infer<typeof settingsSchema>> {
  return {
    id: 'trailer-fetcher', metadata: { name: 'Trailer Fetcher', description: 'Refreshes trailers for matched TMDB titles.', version: '1.0.0' },
    settingsSchema, settings: { languages: { label: 'Preferred languages' }, includeClips: { label: 'Include clips' } },
    async run({ settings, signal }) {
      const items = await database.select({ id: mediaItems.id, kind: mediaItems.kind, providerIds: mediaItems.providerIds }).from(mediaItems)
        .where(inArray(mediaItems.kind, ['movie', 'series'])).orderBy(asc(mediaItems.id));
      let refreshed = 0; let skipped = 0; let trailers = 0;
      for (const item of items) {
        if (signal.aborted) throw signal.reason ?? new Error('Trailer fetch cancelled');
        const providerId = Number(item.providerIds.tmdb);
        if (!Number.isInteger(providerId) || providerId < 1) { skipped++; continue; }
        const videos = (await tmdb.getVideos(item.kind as 'movie' | 'series', providerId))
          .filter((video) => useful(video, settings.includeClips));
        const preferred = choosePreferred(videos, settings.languages);
        await database.transaction(async (tx) => {
          await tx.delete(mediaTrailers).where(eq(mediaTrailers.mediaItemId, item.id));
          if (videos.length) await tx.insert(mediaTrailers).values(videos.map((video) => ({ mediaItemId: item.id, providerId: video.id, site: video.site, key: video.key, name: video.name, type: video.type, official: video.official, language: video.language, country: video.country, publishedAt: video.publishedAt, preferred: video.id === preferred?.id })));
        });
        refreshed++; trailers += videos.length;
      }
      return { summary: `Refreshed ${refreshed} titles, stored ${trailers} trailers, skipped ${skipped} without TMDB IDs` };
    },
  };
}

function useful(video: TmdbVideo, includeClips: boolean) { return video.site.toLowerCase() === 'youtube' && (video.type.toLowerCase() === 'trailer' || (includeClips && video.type.toLowerCase() === 'clip')); }
export function choosePreferred(videos: TmdbVideo[], languages: string[]) {
  const rank = (video: TmdbVideo) => { const languageIndex = languages.indexOf(video.language ?? ''); return [video.type.toLowerCase() === 'trailer' ? 1 : 0, video.official ? 1 : 0, languageIndex < 0 ? 0 : languages.length - languageIndex, video.publishedAt?.getTime() ?? 0]; };
  return [...videos].sort((a, b) => { const ar = rank(a); const br = rank(b); for (let i = 0; i < ar.length; i++) if (ar[i] !== br[i]) return br[i]! - ar[i]!; return a.id.localeCompare(b.id); })[0];
}
