import { eq } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { mediaItems } from './db/schema.ts';
import type { TmdbClient } from './tmdb.ts';
import { imageLocalUrl, type ImageStore } from './images.ts';

const POSTER_PREVIEW = 'https://image.tmdb.org/t/p/w342';
const BACKDROP_PREVIEW = 'https://image.tmdb.org/t/p/w780';
const LOGO_PREVIEW = 'https://image.tmdb.org/t/p/w500';
const TMDB_PATH = /^\/[A-Za-z0-9._/-]{1,255}$/;

export interface ArtworkChange { posterPath?: string | null; backdropPath?: string | null; logoPath?: string | null }

const ROLE_OF = { posterPath: 'poster', backdropPath: 'backdrop', logoPath: 'logo' } as const;

/** Lists TMDB artwork candidates for a title and applies an admin's choice, caching it locally. */
export class ArtworkService {
  constructor(private readonly database: Database, private readonly tmdb: TmdbClient, private readonly images: ImageStore) {}

  async options(itemId: string) {
    const [item] = await this.database.select({ kind: mediaItems.kind, providerIds: mediaItems.providerIds }).from(mediaItems).where(eq(mediaItems.id, itemId)).limit(1);
    if (!item) return null;
    const providerId = Number(item.providerIds?.tmdb);
    if (!Number.isInteger(providerId) || providerId < 1 || (item.kind !== 'movie' && item.kind !== 'series')) return { posters: [], backdrops: [], logos: [] };
    const images = await this.tmdb.getImages(item.kind, providerId);
    return {
      posters: images.posters.map((path) => ({ path, previewUrl: `${POSTER_PREVIEW}${path}` })),
      backdrops: images.backdrops.map((path) => ({ path, previewUrl: `${BACKDROP_PREVIEW}${path}` })),
      logos: images.logos.map((path) => ({ path, previewUrl: `${LOGO_PREVIEW}${path}` })),
    };
  }

  async apply(itemId: string, change: ArtworkChange) {
    const set: Partial<{ posterPath: string | null; backdropPath: string | null; logoPath: string | null; updatedAt: Date }> = {};
    for (const field of ['posterPath', 'backdropPath', 'logoPath'] as const) {
      const path = change[field];
      if (path === undefined) continue;
      if (path !== null && !TMDB_PATH.test(path)) throw new ArtworkPathError('Invalid image path');
      // Cache the chosen artwork so read paths stay offline; a download hiccup never blocks the choice.
      if (path) await this.images.cache(path, ROLE_OF[field]).catch(() => {});
      set[field] = path;
    }
    if (Object.keys(set).length === 0) return null;
    set.updatedAt = new Date();
    const [updated] = await this.database.update(mediaItems).set(set).where(eq(mediaItems.id, itemId)).returning({ id: mediaItems.id, posterPath: mediaItems.posterPath, backdropPath: mediaItems.backdropPath, logoPath: mediaItems.logoPath });
    if (!updated) return null;
    return { id: updated.id, posterUrl: imageLocalUrl(updated.posterPath), backdropUrl: imageLocalUrl(updated.backdropPath), logoUrl: imageLocalUrl(updated.logoPath) };
  }
}

export class ArtworkPathError extends Error {}
