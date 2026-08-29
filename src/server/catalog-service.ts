import { and, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { castCredits, collectionMembers, collections, genres, libraries, mediaFiles, mediaItemGenres, mediaItems, mediaTechnicalProfiles, mediaTrailers, people, playbackProgress, recommendationEdges, watchlistEntries } from './db/schema.ts';
import type { Probe } from './playback.ts';
import { imageLocalUrl } from './images.ts';

const SEARCH_LIMIT = 20;
const CAST_LIMIT = 20;
/** Max items per home carousel. */
const HOME_ROW_LIMIT = 20;

interface QualityProfile { resolutionLabel: string | null; dynamicRange: string | null; videoCodec: string | null; audioCodec: string | null; audioChannels: string | null; }

/** Compact badge such as `4K HDR` or `1080p` from a technical profile. */
export function qualityBadge(profile?: QualityProfile | null): string | undefined {
  if (!profile?.resolutionLabel) return undefined;
  const hdr = profile.dynamicRange && profile.dynamicRange !== 'SDR' ? ' HDR' : '';
  return `${profile.resolutionLabel}${hdr}`;
}

export function formatRuntime(seconds?: number | null): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export interface SearchResult {
  id: string;
  title: string;
  year: number | null;
  posterUrl?: string;
  kind: string;
  /** Runtime for movies, season count for series. */
  meta?: string;
  /** Quality badge such as `4K HDR`. */
  badge?: string;
  genres?: string[];
}

export class CatalogService {
  constructor(private readonly database: Database) {}

  /** One query: quality profile per media item id (via its available file). */
  private async qualityByItem(itemIds: string[]): Promise<Map<string, QualityProfile>> {
    const map = new Map<string, QualityProfile>();
    if (itemIds.length === 0) return map;
    const rows = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, resolutionLabel: mediaTechnicalProfiles.resolutionLabel, dynamicRange: mediaTechnicalProfiles.dynamicRange, videoCodec: mediaTechnicalProfiles.videoCodec, audioCodec: mediaTechnicalProfiles.audioCodec, audioChannels: mediaTechnicalProfiles.audioChannels })
      .from(mediaTechnicalProfiles).innerJoin(mediaFiles, eq(mediaFiles.id, mediaTechnicalProfiles.mediaFileId))
      .where(and(inArray(mediaFiles.mediaItemId, itemIds), eq(mediaFiles.available, true)));
    for (const row of rows) if (!map.has(row.mediaItemId)) map.set(row.mediaItemId, row);
    return map;
  }

  /** One query: ordered genre names per media item id. */
  private async genresByItem(itemIds: string[]): Promise<Map<string, Array<{ id: string; name: string }>>> {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    if (itemIds.length === 0) return map;
    const rows = await this.database.select({ mediaItemId: mediaItemGenres.mediaItemId, id: genres.id, name: genres.name })
      .from(mediaItemGenres).innerJoin(genres, eq(genres.id, mediaItemGenres.genreId))
      .where(inArray(mediaItemGenres.mediaItemId, itemIds)).orderBy(mediaItemGenres.position);
    for (const row of rows) { const list = map.get(row.mediaItemId) ?? []; list.push({ id: row.id, name: row.name }); map.set(row.mediaItemId, list); }
    return map;
  }

  /** One query: collection label + local poster per media item id. */
  private async collectionByItem(itemIds: string[]): Promise<Map<string, { id: string; name: string; posterUrl?: string }>> {
    const map = new Map<string, { id: string; name: string; posterUrl?: string }>();
    if (itemIds.length === 0) return map;
    const rows = await this.database.select({ mediaItemId: collectionMembers.mediaItemId, id: collections.id, name: collections.name, posterPath: collections.posterPath })
      .from(collectionMembers).innerJoin(collections, eq(collections.id, collectionMembers.collectionId))
      .where(inArray(collectionMembers.mediaItemId, itemIds));
    for (const row of rows) map.set(row.mediaItemId, { id: row.id, name: row.name, posterUrl: imageLocalUrl(row.posterPath) });
    return map;
  }

  private async castForItem(itemId: string) {
    const rows = await this.database.select({ id: people.id, name: people.name, profilePath: people.profilePath, character: castCredits.character, order: castCredits.billingOrder })
      .from(castCredits).innerJoin(people, eq(people.id, castCredits.personId))
      .where(eq(castCredits.mediaItemId, itemId)).orderBy(castCredits.billingOrder).limit(CAST_LIMIT);
    return rows.map((row) => ({ id: row.id, name: row.name, character: row.character ?? undefined, profileUrl: imageLocalUrl(row.profilePath), order: row.order }));
  }

  /** A person and every local title they are credited in, for actor pages. */
  async person(personId: string) {
    const [person] = await this.database.select({ id: people.id, name: people.name, profilePath: people.profilePath }).from(people).where(eq(people.id, personId)).limit(1);
    if (!person) return null;
    const rows = await this.database.select({ item: mediaItems, character: castCredits.character })
      .from(castCredits).innerJoin(mediaItems, eq(mediaItems.id, castCredits.mediaItemId))
      .where(and(eq(castCredits.personId, personId), eq(mediaItems.available, true), inArray(mediaItems.kind, ['movie', 'series'])))
      .orderBy(castCredits.billingOrder, mediaItems.sortTitle);
    const titles = rows.map((row) => ({ ...toCatalogItem(row.item, null), character: row.character ?? undefined }));
    return { id: person.id, name: person.name, profileUrl: imageLocalUrl(person.profilePath), titles };
  }

  private async recommendationsForItem(itemId: string) {
    const rows = await this.database.select({ item: mediaItems })
      .from(recommendationEdges).innerJoin(mediaItems, eq(mediaItems.id, recommendationEdges.recommendedMediaItemId))
      .where(and(eq(recommendationEdges.sourceMediaItemId, itemId), eq(mediaItems.available, true))).orderBy(recommendationEdges.position);
    return rows.map((row) => toCatalogItem(row.item, null));
  }

  async search(libraryId: string, query: string) {
    const term = query.trim();
    if (term.length === 0) return { query: term, groups: [] as Array<{ id: string; label: string; items: SearchResult[] }> };
    const rows = await this.database.select().from(mediaItems)
      .where(and(eq(mediaItems.libraryId, libraryId), eq(mediaItems.available, true), isNull(mediaItems.parentId), ilike(mediaItems.title, `%${term}%`)))
      .orderBy(mediaItems.sortTitle).limit(SEARCH_LIMIT);

    const movieIds = rows.filter((item) => item.kind === 'movie').map((item) => item.id);
    const seriesIds = rows.filter((item) => item.kind === 'series').map((item) => item.id);

    const durations = new Map<string, number | null>();
    if (movieIds.length > 0) {
      const files = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, durationSeconds: mediaFiles.durationSeconds })
        .from(mediaFiles).where(and(inArray(mediaFiles.mediaItemId, movieIds), eq(mediaFiles.available, true)));
      for (const file of files) if (!durations.has(file.mediaItemId)) durations.set(file.mediaItemId, file.durationSeconds);
    }

    const seasonCounts = new Map<string, number>();
    if (seriesIds.length > 0) {
      const seasons = await this.database.select({ parentId: mediaItems.parentId, total: count() })
        .from(mediaItems).where(and(inArray(mediaItems.parentId, seriesIds), eq(mediaItems.kind, 'season'), eq(mediaItems.available, true)))
        .groupBy(mediaItems.parentId);
      for (const season of seasons) if (season.parentId) seasonCounts.set(season.parentId, season.total);
    }

    const allIds = rows.map((item) => item.id);
    const quality = await this.qualityByItem(allIds);
    const genreMap = await this.genresByItem(allIds);

    const toResult = (item: typeof mediaItems.$inferSelect): SearchResult => {
      const base = toCatalogItem(item, null);
      const meta = item.kind === 'series'
        ? seasonLabel(seasonCounts.get(item.id) ?? 0)
        : formatRuntime(durations.get(item.id));
      return { id: base.id, title: base.title, year: base.year, posterUrl: base.posterUrl, kind: item.kind, meta, badge: qualityBadge(quality.get(item.id)), genres: (genreMap.get(item.id) ?? []).map((genre) => genre.name) };
    };

    const groups = [
      { id: 'movies', label: 'Movies', items: rows.filter((item) => item.kind === 'movie').map(toResult) },
      { id: 'shows', label: 'Shows', items: rows.filter((item) => item.kind === 'series').map(toResult) },
    ].filter((group) => group.items.length > 0);
    return { query: term, groups };
  }
  async saveProgress(userId: string, mediaItemId: string, positionSeconds?: number, watched?: boolean) {
    const now = new Date();
    // Position is optional so "mark watched" can flip the flag without clobbering resume.
    await this.database.insert(playbackProgress)
      .values({ userId, mediaItemId, positionSeconds: positionSeconds ?? 0, watched: watched ?? false, lastWatchedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [playbackProgress.userId, playbackProgress.mediaItemId], set: { ...(positionSeconds != null ? { positionSeconds } : {}), ...(watched != null ? { watched } : {}), lastWatchedAt: now, updatedAt: now } });
    return { mediaItemId, positionSeconds: positionSeconds ?? 0, watched: watched ?? false };
  }
  async setWatchlist(userId: string, mediaItemId: string, saved: boolean) {
    if (saved) await this.database.insert(watchlistEntries).values({ userId, mediaItemId }).onConflictDoNothing();
    else await this.database.delete(watchlistEntries).where(and(eq(watchlistEntries.userId, userId), eq(watchlistEntries.mediaItemId, mediaItemId)));
    return { mediaItemId, inWatchlist: saved };
  }
  private async isWatchlisted(userId: string, mediaItemId: string) {
    const [row] = await this.database.select({ mediaItemId: watchlistEntries.mediaItemId }).from(watchlistEntries).where(and(eq(watchlistEntries.userId, userId), eq(watchlistEntries.mediaItemId, mediaItemId))).limit(1);
    return Boolean(row);
  }
  async playbackSource(mediaItemId: string) {
    const [file] = await this.database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, durationSeconds: mediaFiles.durationSeconds, probe: mediaFiles.probe, rootPath: libraries.rootPath })
      .from(mediaFiles).innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
      .where(and(eq(mediaFiles.mediaItemId, mediaItemId), eq(mediaFiles.available, true))).limit(1);
    if (!file) return null;
    return { fileId: file.id, relativePath: file.relativePath, rootPath: file.rootPath, durationSeconds: file.durationSeconds, probe: file.probe as Probe };
  }
  async home(libraryId: string | undefined, userId: string) {
    // A missing libraryId aggregates every library so movies and shows share one home.
    const scope = libraryId ? eq(mediaItems.libraryId, libraryId) : undefined;
    const items = await this.database.select({ item: mediaItems, progress: playbackProgress }).from(mediaItems).leftJoin(playbackProgress, and(eq(playbackProgress.mediaItemId, mediaItems.id), eq(playbackProgress.userId, userId))).where(and(eq(mediaItems.available, true), isNull(mediaItems.parentId), ...(scope ? [scope] : []))).orderBy(mediaItems.sortTitle);
    const fileScope = libraryId ? eq(mediaFiles.libraryId, libraryId) : undefined;
    const files = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, durationSeconds: mediaFiles.durationSeconds }).from(mediaFiles).where(and(eq(mediaFiles.available, true), ...(fileScope ? [fileScope] : [])));
    const durations = new Map(files.map((file) => [file.mediaItemId, file.durationSeconds]));
    const ids = items.map(({ item }) => item.id);
    const [quality, genreMap, collectionMap] = await Promise.all([this.qualityByItem(ids), this.genresByItem(ids), this.collectionByItem(ids)]);
    const shape = items.map(({ item, progress }) => ({
      ...toCatalogItem(item, progress, durations.get(item.id)),
      badge: qualityBadge(quality.get(item.id)),
      genres: (genreMap.get(item.id) ?? []).map((genre) => genre.name),
      collection: collectionMap.get(item.id)?.name,
    }));
    const movies = shape.filter((item) => item.kind === 'movie');
    const series = shape.filter((item) => item.kind === 'series');

    // Newest episodes across every series, shown as posters (never mixed with movies).
    const episodeRows = await this.database.select({ item: mediaItems }).from(mediaItems)
      .where(and(eq(mediaItems.available, true), eq(mediaItems.kind, 'episode'), ...(scope ? [scope] : [])))
      .orderBy(desc(mediaItems.createdAt)).limit(HOME_ROW_LIMIT);
    const episodes = episodeRows.map(({ item }) => ({ ...toCatalogItem(item, null), badge: undefined as string | undefined, genres: [] as string[], collection: undefined as string | undefined }));

    // Watch list: movies the user saved, most recently added first.
    const watchOrder = await this.database.select({ mediaItemId: watchlistEntries.mediaItemId }).from(watchlistEntries)
      .where(eq(watchlistEntries.userId, userId)).orderBy(desc(watchlistEntries.createdAt));
    const movieById = new Map(movies.map((movie) => [movie.id, movie]));
    const watchlist = watchOrder.map((row) => movieById.get(row.mediaItemId)).filter((movie): movie is typeof movies[number] => Boolean(movie)).slice(0, HOME_ROW_LIMIT);

    // Newly added movies, newest first by ingest time.
    const createdAtById = new Map(items.map(({ item }) => [item.id, item.createdAt]));
    const newlyAdded = [...movies].sort((a, b) => (createdAtById.get(b.id)?.getTime() ?? 0) - (createdAtById.get(a.id)?.getTime() ?? 0)).slice(0, HOME_ROW_LIMIT);

    const sections: Array<{ id: string; title: string; layout: 'poster' | 'card'; items: typeof shape }> = [];

    // Movie rows mirror the classic home: resume, saved, then freshest. All movies-only (never mixed).
    const resume = movies.filter((item) => item.progress != null && item.progress > 0 && item.progress < 1).slice(0, HOME_ROW_LIMIT);
    if (resume.length > 0) sections.push({ id: 'continue-watching', title: 'Continue Watching', layout: 'card', items: resume });
    if (watchlist.length > 0) sections.push({ id: 'watchlist', title: 'Watch List', layout: 'card', items: watchlist });
    if (newlyAdded.length > 0) sections.push({ id: 'newly-added', title: 'Newly Added', layout: 'card', items: newlyAdded });

    // Shows get their own rows: newest episodes as posters, newest series as backdrops.
    if (episodes.length > 0) sections.push({ id: 'new-episodes', title: 'Newly Added Episodes', layout: 'poster', items: episodes });
    const newlyAddedShows = [...series].sort((a, b) => (createdAtById.get(b.id)?.getTime() ?? 0) - (createdAtById.get(a.id)?.getTime() ?? 0)).slice(0, HOME_ROW_LIMIT);
    if (newlyAddedShows.length > 0) sections.push({ id: 'newly-added-shows', title: 'Newly Added Shows', layout: 'card', items: newlyAddedShows });

    // Hero spotlights a random movie (backdrop preferred) so the home varies between visits.
    const heroPool = movies.filter((movie) => movie.backdropUrl);
    const pool = heroPool.length > 0 ? heroPool : movies;
    const featured = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : series[0] ?? shape[0] ?? null;
    return { libraryId: libraryId ?? null, featured, sections };
  }
  async item(id: string, userId: string) {
    const [row] = await this.database.select({ item: mediaItems, progress: playbackProgress }).from(mediaItems).leftJoin(playbackProgress, and(eq(playbackProgress.mediaItemId, mediaItems.id), eq(playbackProgress.userId, userId))).where(and(eq(mediaItems.id, id), eq(mediaItems.available, true))).limit(1); if (!row) return null;
    const childRows = await this.database.select({ item: mediaItems, progress: playbackProgress }).from(mediaItems).leftJoin(playbackProgress, and(eq(playbackProgress.mediaItemId, mediaItems.id), eq(playbackProgress.userId, userId))).where(and(eq(mediaItems.parentId, id), eq(mediaItems.available, true))).orderBy(mediaItems.seasonNumber, mediaItems.episodeNumber, mediaItems.sortTitle);
    const childFiles = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, durationSeconds: mediaFiles.durationSeconds }).from(mediaFiles).innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId)).where(and(eq(mediaItems.parentId, id), eq(mediaFiles.available, true)));
    const children = serializeCatalogChildren(childRows, new Map(childFiles.map((file) => [file.mediaItemId, file.durationSeconds])));
    const files = await this.database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, durationSeconds: mediaFiles.durationSeconds }).from(mediaFiles).where(and(eq(mediaFiles.mediaItemId, id), eq(mediaFiles.available, true)));
    const [quality, genreMap, collectionMap, cast, recommendations, inWatchlist, trailers] = await Promise.all([
      this.qualityByItem([id]), this.genresByItem([id]), this.collectionByItem([id]), this.castForItem(id), this.recommendationsForItem(id), this.isWatchlisted(userId, id),
      this.database.select({ site: mediaTrailers.site, key: mediaTrailers.key, name: mediaTrailers.name, type: mediaTrailers.type, official: mediaTrailers.official, preferred: mediaTrailers.preferred }).from(mediaTrailers).where(eq(mediaTrailers.mediaItemId, id)).orderBy(desc(mediaTrailers.preferred), desc(mediaTrailers.publishedAt)),
    ]);
    const profile = quality.get(id) ?? null;
    return {
      ...toCatalogItem(row.item, row.progress, files[0]?.durationSeconds),
      inWatchlist,
      watched: row.progress?.watched ?? false,
      originalTitle: row.item.originalTitle ?? undefined,
      releaseDate: row.item.releaseDate ?? undefined,
      tagline: row.item.tagline ?? undefined,
      contentRating: row.item.contentRating ?? undefined,
      providerRating: row.item.providerRating ?? undefined,
      runtime: formatRuntime(files[0]?.durationSeconds),
      quality: profile ? { badge: qualityBadge(profile), resolutionLabel: profile.resolutionLabel, dynamicRange: profile.dynamicRange, videoCodec: profile.videoCodec, audioCodec: profile.audioCodec, audioChannels: profile.audioChannels } : undefined,
      genres: genreMap.get(id) ?? [],
      collection: collectionMap.get(id),
      cast,
      recommendations,
      trailers,
      children,
      files,
    };
  }
}

function seasonLabel(total: number): string | undefined {
  if (total <= 0) return 'Series';
  return `${total} season${total === 1 ? '' : 's'}`;
}

export function toCatalogItem(item: typeof mediaItems.$inferSelect, progress: typeof playbackProgress.$inferSelect | null, duration?: number | null) { return { id: item.id, libraryId: item.libraryId, kind: item.kind, title: item.title, year: item.year, overview: item.overview, posterUrl: imageLocalUrl(item.posterPath), backdropUrl: imageLocalUrl(item.backdropPath), logoUrl: imageLocalUrl(item.logoPath), seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, progress: progress?.watched ? 1 : progress && duration && duration > 0 ? Math.min(1, Math.max(0, progress.positionSeconds / duration)) : undefined }; }

export function serializeCatalogChildren(rows: Array<{ item: typeof mediaItems.$inferSelect; progress: typeof playbackProgress.$inferSelect | null }>, durations: Map<string, number | null>) { return rows.map(({ item, progress }) => toCatalogItem(item, progress, durations.get(item.id))); }
