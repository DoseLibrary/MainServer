import { and, asc, count, desc, eq, getTableName, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from './db/client.ts';
import { castCredits, collectionExpectedMembers, collectionMembers, collections, genres, libraries, mediaFiles, mediaItemGenres, mediaItems, mediaIntroMarkers, mediaPreviewSprites, mediaSubtitles, mediaTechnicalProfiles, mediaTrailers, people, playbackProgress, recommendationEdges, watchlistEntries } from './db/schema.ts';
import type { Probe } from './playback.ts';
import { imageLocalUrl } from './images.ts';
import type { PluginEventBus } from './plugins/events.ts';
import { UNRATED_LEVEL } from './maturity.ts';
import { chaptersOf, ffprobeChapters, probeKnowsChapters, type Chapter } from './chapters.ts';
import { isAbsolute, relative, resolve } from 'node:path';
import { stat } from 'node:fs/promises';

const SEARCH_LIMIT = 20;
const CAST_LIMIT = 20;
/** Max items per home carousel. */
const HOME_ROW_LIMIT = 25;

/** A title's place in its show, with the artwork that stands in for its own. */
interface ShowAncestry {
  parent?: { id: string; title: string; kind: string; seasonNumber?: number };
  series?: { id: string; title: string; kind: string; seasonNumber?: number };
  showArtwork?: { posterUrl?: string; backdropUrl?: string };
}

interface QualityProfile { resolutionLabel: string | null; dynamicRange: string | null; videoCodec: string | null; audioCodec: string | null; audioChannels: string | null; }

/** Compact badge such as `4K HDR` or `1080p` from a technical profile. */
export function qualityBadge(profile?: QualityProfile | null): string | undefined {
  if (!profile?.resolutionLabel) return undefined;
  const hdr = profile.dynamicRange && profile.dynamicRange !== 'SDR' ? ' HDR' : '';
  return `${profile.resolutionLabel}${hdr}`;
}

/**
 * Sibling files of one item (an `.mkv` beside its `.mp4` conversion) in the
 * order they should be preferred. The longest comes first, since a truncated
 * conversion is shorter than its source; the path breaks ties so the choice
 * is stable across scans, which rewrite the rows and shuffle their heap order.
 */
const PREFERRED_FILE_ORDER = [sql`${mediaFiles.durationSeconds} desc nulls last`, asc(mediaFiles.relativePath)];

/** One duration per item, from files already in preferred order. */
function preferredDurations(files: Array<{ mediaItemId: string; durationSeconds: number | null }>): Map<string, number | null> {
  const durations = new Map<string, number | null>();
  for (const file of files) if (!durations.has(file.mediaItemId)) durations.set(file.mediaItemId, file.durationSeconds);
  return durations;
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

export interface RandomItemFilters {
  kind?: 'movie' | 'series';
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
}

export interface MovieDeckFilters {
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  /** Drop titles the viewer has already marked watched. */
  unwatchedOnly?: boolean;
}

/** One card in a movie-night deck: everything a phone shows without another request. */
export interface MovieCard {
  id: string;
  title: string;
  year?: number;
  posterUrl?: string;
  rating?: number;
  overview?: string;
  runtimeMinutes?: number;
}

export const MOVIE_DECK_LIMIT = 500;

export class CatalogService {
  constructor(
    private readonly database: Database,
    private readonly trailerStorageRoot?: string,
    private readonly events?: PluginEventBus,
    /** Highest maturity level this view may return; null means unrestricted. */
    private readonly maturityLimit: number | null = null,
  ) {}

  /**
   * A view of the catalog restricted to what one member may watch. Every
   * member-facing read goes through the returned instance, so a parental limit
   * cannot be sidestepped by hitting search, a collection, or the stream URL.
   */
  forViewer(limit: number | null | undefined): CatalogService {
    if (limit == null) return this;
    return new CatalogService(this.database, this.trailerStorageRoot, this.events, limit);
  }

  /** SQL guard for the item table, or undefined when the viewer is unrestricted. */
  private get withinMaturity() {
    if (this.maturityLimit == null) return undefined;
    // An unrated title is hidden from a restricted member rather than assumed safe.
    return sql`coalesce(${mediaItems.maturityLevel}, ${UNRATED_LEVEL}) <= ${this.maturityLimit}`;
  }


  /** EXISTS clause matching a top-level item tagged with the given genre (by name or normalized name). */
  private genreClause(genre: string) {
    const normalized = genre.trim().toLowerCase();
    return sql`exists (
      select 1 from ${mediaItemGenres}
      inner join ${genres} on ${genres.id} = ${mediaItemGenres.genreId}
      where ${mediaItemGenres.mediaItemId} = ${mediaItems.id}
        and (lower(${genres.name}) = ${normalized} or ${genres.normalizedName} = ${normalized})
    )`;
  }

  /** Pick one uniformly random member-visible top-level title matching every filter. */
  async randomItem(filters: RandomItemFilters = {}) {
    const clauses = [
      eq(mediaItems.available, true), this.withinMaturity,
      isNull(mediaItems.archivedAt),
      isNull(mediaItems.parentId),
      inArray(mediaItems.kind, ['movie', 'series'] as const),
    ];
    if (filters.kind) clauses.push(eq(mediaItems.kind, filters.kind));
    if (filters.yearMin != null) clauses.push(sql`${mediaItems.year} >= ${filters.yearMin}`);
    if (filters.yearMax != null) clauses.push(sql`${mediaItems.year} <= ${filters.yearMax}`);
    if (filters.ratingMin != null) clauses.push(sql`${mediaItems.providerRating} >= ${filters.ratingMin}`);
    if (filters.genre) clauses.push(this.genreClause(filters.genre));
    const [item] = await this.database.select({
      id: mediaItems.id, title: mediaItems.title, userTitle: mediaItems.userTitle,
      year: mediaItems.year, userYear: mediaItems.userYear, kind: mediaItems.kind,
      posterPath: mediaItems.posterPath, overview: mediaItems.overview, userOverview: mediaItems.userOverview,
      providerRating: mediaItems.providerRating,
    }).from(mediaItems).where(and(...clauses)).orderBy(sql`random()`).limit(1);
    if (!item) return null;
    return {
      id: item.id,
      title: item.userTitle ?? item.title,
      year: item.userYear ?? item.year ?? undefined,
      kind: item.kind,
      posterUrl: item.posterPath ? imageLocalUrl(item.posterPath) : undefined,
      overview: item.userOverview ?? item.overview ?? undefined,
      providerRating: item.providerRating ?? undefined,
    };
  }

  private movieDeckClauses(filters: MovieDeckFilters, viewerId?: string) {
    const clauses = [
      eq(mediaItems.available, true), this.withinMaturity,
      isNull(mediaItems.archivedAt), isNull(mediaItems.parentId),
      eq(mediaItems.kind, 'movie'),
    ];
    if (filters.yearMin != null) clauses.push(sql`${mediaItems.year} >= ${filters.yearMin}`);
    if (filters.yearMax != null) clauses.push(sql`${mediaItems.year} <= ${filters.yearMax}`);
    if (filters.ratingMin != null) clauses.push(sql`${mediaItems.providerRating} >= ${filters.ratingMin}`);
    if (filters.genre) clauses.push(this.genreClause(filters.genre));
    if (filters.unwatchedOnly && viewerId) {
      clauses.push(sql`not exists (
        select 1 from ${playbackProgress}
        where ${playbackProgress.mediaItemId} = ${mediaItems.id}
          and ${playbackProgress.userId} = ${viewerId}
          and ${playbackProgress.watched} = true
      )`);
    }
    return and(...clauses);
  }

  /**
   * Every movie the viewer may see that matches the filters, as deck cards.
   * Unshuffled, and capped at `limit` — the cap is a *random* sample, so a
   * library larger than the cap does not deal the same subset every night.
   */
  async listMovieCards(filters: MovieDeckFilters, viewerId?: string, limit = MOVIE_DECK_LIMIT): Promise<MovieCard[]> {
    // Both columns inside the subquery are qualified via sql.identifier rather than
    // interpolated directly: drizzle renders a single-table query's own columns
    // unqualified, which would otherwise collide with media_files' own columns
    // inside this subquery. Deriving the identifiers from the schema (table name +
    // column name) keeps this correct if either table is ever renamed.
    const qualify = (table: typeof mediaItems | typeof mediaFiles, column: { name: string }) =>
      sql`${sql.identifier(getTableName(table))}.${sql.identifier(column.name)}`;
    const mediaItemsId = qualify(mediaItems, mediaItems.id);
    const duration = qualify(mediaFiles, mediaFiles.durationSeconds);
    const runtime = sql<number | null>`(select max(${duration}) from ${mediaFiles} where ${mediaFiles.mediaItemId} = ${mediaItemsId})`;
    const rows = await this.database.select({
      id: mediaItems.id, title: mediaItems.title, userTitle: mediaItems.userTitle,
      year: mediaItems.year, userYear: mediaItems.userYear,
      posterPath: mediaItems.posterPath, overview: mediaItems.overview, userOverview: mediaItems.userOverview,
      providerRating: mediaItems.providerRating, durationSeconds: runtime,
    }).from(mediaItems).where(this.movieDeckClauses(filters, viewerId)).orderBy(sql`random()`).limit(limit);
    return rows.map((row) => ({
      id: row.id,
      title: row.userTitle ?? row.title,
      year: row.userYear ?? row.year ?? undefined,
      posterUrl: row.posterPath ? imageLocalUrl(row.posterPath) : undefined,
      rating: row.providerRating ?? undefined,
      overview: row.userOverview ?? row.overview ?? undefined,
      runtimeMinutes: row.durationSeconds ? Math.round(row.durationSeconds / 60) : undefined,
    }));
  }

  async countMovieCards(filters: MovieDeckFilters, viewerId?: string): Promise<number> {
    const [row] = await this.database.select({ count: sql<number>`count(*)::int` }).from(mediaItems).where(this.movieDeckClauses(filters, viewerId));
    return row?.count ?? 0;
  }

  /** Soft-archive an item and roll availability up through its parent hierarchy. */
  async archiveItem(itemId: string, archivedAt = new Date()): Promise<void> {
    const [item] = await this.database.select({ id: mediaItems.id, parentId: mediaItems.parentId, archivedAt: mediaItems.archivedAt })
      .from(mediaItems).where(eq(mediaItems.id, itemId)).limit(1);
    if (!item) return;
    await this.database.update(mediaItems).set({ available: false, archivedAt, updatedAt: archivedAt }).where(eq(mediaItems.id, item.id));
    // Only a real state change is an event; scans re-archive already archived leaves.
    if (item.archivedAt == null) this.events?.emit('media.item.archived', { mediaItemId: item.id });
    let parentId = item.parentId;
    while (parentId) {
      const [parent] = await this.database.select({ id: mediaItems.id, parentId: mediaItems.parentId }).from(mediaItems).where(eq(mediaItems.id, parentId)).limit(1);
      if (!parent) break;
      const [availableChild] = await this.database.select({ id: mediaItems.id }).from(mediaItems)
        .where(and(eq(mediaItems.parentId, parent.id), eq(mediaItems.available, true), isNull(mediaItems.archivedAt))).limit(1);
      if (availableChild) break;
      await this.database.update(mediaItems).set({ available: false, archivedAt, updatedAt: archivedAt }).where(eq(mediaItems.id, parent.id));
      parentId = parent.parentId;
    }
  }

  /** Restore an item and every ancestor needed to make it member-visible again. */
  async unarchiveItem(itemId: string, restoredAt = new Date()): Promise<void> {
    let currentId: string | null = itemId;
    let restored = false;
    while (currentId) {
      const [item] = await this.database.select({ id: mediaItems.id, parentId: mediaItems.parentId, archivedAt: mediaItems.archivedAt, available: mediaItems.available }).from(mediaItems).where(eq(mediaItems.id, currentId)).limit(1);
      if (!item) break;
      if (currentId === itemId) restored = item.archivedAt != null || !item.available;
      await this.database.update(mediaItems).set({ available: true, archivedAt: null, updatedAt: restoredAt }).where(eq(mediaItems.id, item.id));
      currentId = item.parentId;
    }
    if (restored) this.events?.emit('media.item.unarchived', { mediaItemId: itemId });
  }

  /** Admin inventory, optionally restricted to archived/active rows and sortable by archive time. */
  async adminItems(options: { archived?: boolean; sort?: 'archivedAt' | 'title'; direction?: 'asc' | 'desc' } = {}) {
    const filter = options.archived === true ? isNotNull(mediaItems.archivedAt)
      : options.archived === false ? and(eq(mediaItems.available, true), isNull(mediaItems.archivedAt)) : undefined;
    const sortColumn = options.sort === 'title' ? mediaItems.sortTitle : mediaItems.archivedAt;
    return this.database.select().from(mediaItems).where(filter)
      .orderBy(options.direction === 'asc' ? asc(sortColumn) : desc(sortColumn), mediaItems.sortTitle);
  }

  /** Paged, sortable admin listing of top-level titles for the media management table. */
  async adminMediaList(options: { archived?: boolean; sort?: 'archivedAt' | 'title'; direction?: 'asc' | 'desc'; limit?: number; offset?: number; query?: string } = {}) {
    const clauses = [inArray(mediaItems.kind, ['movie', 'series'] as const)];
    if (options.archived === true) clauses.push(isNotNull(mediaItems.archivedAt));
    else if (options.archived === false) clauses.push(and(eq(mediaItems.available, true), isNull(mediaItems.archivedAt))!);
    const term = options.query?.trim();
    if (term) clauses.push(ilike(mediaItems.title, `%${term}%`));
    const where = and(...clauses);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const sortColumn = options.sort === 'archivedAt' ? mediaItems.archivedAt : mediaItems.sortTitle;
    const order = options.direction === 'desc' ? desc(sortColumn) : asc(sortColumn);
    const rows = await this.database.select({ item: mediaItems, libraryName: libraries.name })
      .from(mediaItems).innerJoin(libraries, eq(libraries.id, mediaItems.libraryId))
      .where(where).orderBy(order, asc(mediaItems.sortTitle)).limit(limit).offset(offset);
    const [{ value: total } = { value: 0 }] = await this.database.select({ value: count() }).from(mediaItems).where(where);
    return {
      total: Number(total),
      items: rows.map(({ item, libraryName }) => ({
        id: item.id,
        title: item.userTitle ?? item.title,
        year: item.userYear ?? item.year ?? undefined,
        kind: item.kind,
        library: libraryName,
        archived: item.archivedAt != null,
        archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
        posterUrl: item.posterPath ? imageLocalUrl(item.posterPath) : undefined,
        tmdbId: item.providerIds.tmdb,
      })),
    };
  }

  /** Permanently remove a top-level title; files, progress, and relationships cascade. */
  async removeItem(id: string) {
    const rows = await this.database.delete(mediaItems)
      .where(and(eq(mediaItems.id, id), inArray(mediaItems.kind, ['movie', 'series'] as const)))
      .returning({ id: mediaItems.id });
    if (rows.length > 0) this.events?.emit('media.item.removed', { mediaItemId: id });
    return rows.length > 0;
  }

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

  /** The next episode to play after this one, in season/episode order across the series. */
  /** The episode that follows this one within its series, in broadcast order. */
  private async nextEpisode(episode: typeof mediaItems.$inferSelect) {
    if (episode.kind !== 'episode' || !episode.parentId) return undefined;
    const [season] = await this.database.select({ seriesId: mediaItems.parentId }).from(mediaItems).where(eq(mediaItems.id, episode.parentId)).limit(1);
    if (!season?.seriesId) return undefined;
    const seasons = alias(mediaItems, 'season_scope');
    const rows = await this.database.select({ id: mediaItems.id, title: mediaItems.title, userTitle: mediaItems.userTitle, backdropPath: mediaItems.backdropPath, posterPath: mediaItems.posterPath, seasonNumber: mediaItems.seasonNumber, episodeNumber: mediaItems.episodeNumber })
      .from(mediaItems).innerJoin(seasons, eq(seasons.id, mediaItems.parentId))
      .where(and(eq(seasons.parentId, season.seriesId), eq(mediaItems.kind, 'episode'), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt)))
      .orderBy(mediaItems.seasonNumber, mediaItems.episodeNumber);
    const index = rows.findIndex((row) => row.id === episode.id);
    const next = index >= 0 ? rows[index + 1] : undefined;
    if (!next) return undefined;
    return {
      id: next.id,
      title: next.userTitle ?? next.title,
      seasonNumber: next.seasonNumber ?? undefined,
      episodeNumber: next.episodeNumber ?? undefined,
      // Episode stills live on the backdrop; the season poster is the fallback.
      posterUrl: imageLocalUrl(next.backdropPath) ?? imageLocalUrl(next.posterPath),
    };
  }

  /**
   * Where an episode sits in its show, plus the artwork that stands in for the
   * portrait poster episodes almost never carry: the season's poster, then the
   * series', so a row of episode tiles is never a row of empty frames.
   */
  private async episodeContext(episodes: Array<typeof mediaItems.$inferSelect>) {
    type Context = { seriesId?: string; seriesTitle?: string; seasonId?: string; posterUrl?: string; backdropUrl?: string };
    const context = new Map<string, Context>();
    const seasonIds = [...new Set(episodes.map((episode) => episode.parentId).filter((id): id is string => Boolean(id)))];
    if (seasonIds.length === 0) return context;
    const seasonRows = await this.database.select({ id: mediaItems.id, parentId: mediaItems.parentId, title: mediaItems.title, posterPath: mediaItems.posterPath, backdropPath: mediaItems.backdropPath })
      .from(mediaItems).where(inArray(mediaItems.id, seasonIds));
    const seasonById = new Map(seasonRows.map((row) => [row.id, row]));
    const seriesIds = [...new Set(seasonRows.map((row) => row.parentId).filter((id): id is string => Boolean(id)))];
    const seriesRows = seriesIds.length > 0
      ? await this.database.select({ id: mediaItems.id, title: mediaItems.title, posterPath: mediaItems.posterPath, backdropPath: mediaItems.backdropPath })
        .from(mediaItems).where(inArray(mediaItems.id, seriesIds))
      : [];
    const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
    for (const episode of episodes) {
      // Scanners hang episodes off a season, but a flat show puts them straight
      // under the series; both shapes have to resolve to the same show.
      const parent = episode.parentId ? seasonById.get(episode.parentId) : undefined;
      const season = parent?.parentId ? parent : undefined;
      const series = parent?.parentId ? seriesById.get(parent.parentId) : parent;
      context.set(episode.id, {
        seriesId: series?.id,
        seriesTitle: series?.title,
        seasonId: season?.id,
        posterUrl: imageLocalUrl(season?.posterPath) ?? imageLocalUrl(series?.posterPath),
        backdropUrl: imageLocalUrl(season?.backdropPath) ?? imageLocalUrl(series?.backdropPath),
      });
    }
    return context;
  }

  /**
   * Home tiles are portrait, so the season poster leads and the episode's own
   * still is the last resort rather than the first choice.
   */
  private withShowArtwork<T extends { id: string; posterUrl?: string; backdropUrl?: string }>(items: T[], context: Map<string, { seriesId?: string; seriesTitle?: string; posterUrl?: string; backdropUrl?: string }>) {
    return items.map((item) => {
      const show = context.get(item.id);
      return {
        ...item,
        posterUrl: item.posterUrl ?? show?.posterUrl ?? item.backdropUrl,
        backdropUrl: item.backdropUrl ?? show?.backdropUrl,
        seriesId: show?.seriesId,
        seriesTitle: show?.seriesTitle,
      };
    });
  }

  /**
   * The season and series a title hangs under. A season or episode page opened
   * straight from a home row would otherwise have no route into its show.
   */
  private async showAncestry(item: typeof mediaItems.$inferSelect): Promise<ShowAncestry> {
    const empty: ShowAncestry = {};
    if (!item.parentId || (item.kind !== 'episode' && item.kind !== 'season')) return empty;
    const columns = { id: mediaItems.id, title: mediaItems.title, kind: mediaItems.kind, parentId: mediaItems.parentId, seasonNumber: mediaItems.seasonNumber, posterPath: mediaItems.posterPath, backdropPath: mediaItems.backdropPath };
    type Row = Pick<typeof mediaItems.$inferSelect, keyof typeof columns>;
    const ref = (row: Row) => ({ id: row.id, title: row.title, kind: row.kind, seasonNumber: row.seasonNumber ?? undefined });
    // The nearer relative wins: a season's own art describes the episode better
    // than the series poster does.
    const artwork = (...rows: Array<Row | undefined>) => ({
      posterUrl: rows.map((row) => imageLocalUrl(row?.posterPath)).find(Boolean),
      backdropUrl: rows.map((row) => imageLocalUrl(row?.backdropPath)).find(Boolean),
    });
    const [parent] = await this.database.select(columns).from(mediaItems)
      .where(and(eq(mediaItems.id, item.parentId), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).limit(1);
    if (!parent) return empty;
    if (parent.kind !== 'season' || !parent.parentId) return { parent: ref(parent), series: parent.kind === 'series' ? ref(parent) : undefined, showArtwork: artwork(parent) };
    const [series] = await this.database.select(columns).from(mediaItems)
      .where(and(eq(mediaItems.id, parent.parentId), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).limit(1);
    return { parent: ref(parent), series: series ? ref(series) : undefined, showArtwork: artwork(parent, series) };
  }

  /** Player caption tracks for a title, across its available files. */
  async subtitlesForItem(itemId: string) {
    const rows = await this.database.select({ id: mediaSubtitles.id, language: mediaSubtitles.language, label: mediaSubtitles.label, forced: mediaSubtitles.forced })
      .from(mediaSubtitles).innerJoin(mediaFiles, eq(mediaFiles.id, mediaSubtitles.mediaFileId))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      .where(and(eq(mediaFiles.mediaItemId, itemId), eq(mediaFiles.available, true), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt)))
      .orderBy(desc(mediaSubtitles.forced), mediaSubtitles.label);
    return rows.map((row) => ({ id: row.id, language: row.language ?? undefined, label: row.label, forced: row.forced, url: `/api/v1/subtitles/${row.id}` }));
  }

  /** Storage key for a subtitle track, so the API can stream the WebVTT file. */
  async subtitle(id: string) {
    const [row] = await this.database.select({ storageKey: mediaSubtitles.storageKey, mediaItemId: mediaFiles.mediaItemId })
      .from(mediaSubtitles).innerJoin(mediaFiles, eq(mediaFiles.id, mediaSubtitles.mediaFileId)).where(eq(mediaSubtitles.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * A collection and its available parts in release order, for collection pages.
   * With `includeGaps`, the members TMDB lists but the library lacks are appended as
   * `inLibrary: false` placeholders; without it no expected-member query runs at all.
   */
  /**
   * Every provider collection the viewer can see something of, for the browse
   * page. The member count is of visible titles, so a restricted account sees
   * honest numbers — and no collection whose every member is above its limit.
   */
  async collectionsOverview() {
    const rows = await this.database
      .select({
        id: collections.id, name: collections.name, posterPath: collections.posterPath,
        total: sql<number>`count(distinct ${mediaItems.id})`,
      })
      .from(collections)
      .innerJoin(collectionMembers, eq(collectionMembers.collectionId, collections.id))
      .innerJoin(mediaItems, eq(mediaItems.id, collectionMembers.mediaItemId))
      .where(and(eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt)))
      .groupBy(collections.id, collections.name, collections.posterPath)
      .orderBy(collections.name);
    return rows.map((row) => ({ id: row.id, name: row.name, posterUrl: imageLocalUrl(row.posterPath), count: Number(row.total) }));
  }

  async collection(collectionId: string, includeGaps = false) {
    const [collection] = await this.database.select({ id: collections.id, name: collections.name, posterPath: collections.posterPath }).from(collections).where(eq(collections.id, collectionId)).limit(1);
    if (!collection) return null;
    const rows = await this.database.select({ item: mediaItems }).from(collectionMembers)
      .innerJoin(mediaItems, eq(mediaItems.id, collectionMembers.mediaItemId))
      .where(and(eq(collectionMembers.collectionId, collectionId), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt)))
      .orderBy(collectionMembers.position, mediaItems.sortTitle);
    const items = rows.map(({ item }) => item);
    const quality = await this.qualityByItem(items.map((item) => item.id));
    const titles = items.map((item) => ({ ...toCatalogItem(item, null), badge: qualityBadge(quality.get(item.id)) }));
    const view = { id: collection.id, name: collection.name, posterUrl: imageLocalUrl(collection.posterPath), titles };
    if (!includeGaps) return view;
    return { ...view, missing: await this.missingCollectionMembers(collectionId) };
  }

  /**
   * Expected collection members with no local counterpart, oldest release first.
   * Membership counts as present even when archived/unavailable, so a title the
   * library owns is never mislabelled as missing.
   */
  private async missingCollectionMembers(collectionId: string) {
    const present = await this.database
      .select({ tmdbId: sql<string | null>`${mediaItems.providerIds}->>'tmdb'` })
      .from(collectionMembers)
      .innerJoin(mediaItems, eq(mediaItems.id, collectionMembers.mediaItemId))
      .where(eq(collectionMembers.collectionId, collectionId));
    const owned = new Set(present.map((row) => row.tmdbId).filter((value): value is string => Boolean(value)));
    const expected = await this.database.select({
      tmdbId: collectionExpectedMembers.tmdbId,
      title: collectionExpectedMembers.title,
      year: collectionExpectedMembers.year,
      releaseDate: collectionExpectedMembers.releaseDate,
      posterPath: collectionExpectedMembers.posterPath,
    }).from(collectionExpectedMembers)
      .where(eq(collectionExpectedMembers.collectionId, collectionId))
      .orderBy(asc(collectionExpectedMembers.releaseDate), asc(collectionExpectedMembers.title));
    return expected.filter((member) => !owned.has(member.tmdbId)).map((member) => ({
      tmdbId: member.tmdbId,
      title: member.title,
      year: member.year ?? undefined,
      releaseDate: member.releaseDate ?? undefined,
      posterUrl: imageLocalUrl(member.posterPath),
      inLibrary: false as const,
    }));
  }

  /** Every available top-level title tagged with a genre, for genre browse pages. */
  async genre(genreId: string) {
    const [genre] = await this.database.select({ id: genres.id, name: genres.name }).from(genres).where(eq(genres.id, genreId)).limit(1);
    if (!genre) return null;
    const rows = await this.database.select({ item: mediaItems }).from(mediaItemGenres)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemGenres.mediaItemId))
      .where(and(eq(mediaItemGenres.genreId, genreId), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), isNull(mediaItems.parentId), inArray(mediaItems.kind, ['movie', 'series'])))
      .orderBy(mediaItems.sortTitle);
    const items = rows.map(({ item }) => item);
    const quality = await this.qualityByItem(items.map((item) => item.id));
    const titles = items.map((item) => ({ ...toCatalogItem(item, null), badge: qualityBadge(quality.get(item.id)) }));
    return { id: genre.id, name: genre.name, titles };
  }

  /**
   * Categories for the browse index, merged by normalized name so a genre that
   * exists in several libraries (Movies and Shows both have "Action") appears
   * once and aggregates their titles. A missing libraryId spans every library.
   */
  async categories(libraryId?: string) {
    const scope = libraryId ? eq(genres.libraryId, libraryId) : undefined;
    const rows = await this.database
      .select({ key: genres.normalizedName, name: sql<string>`min(${genres.name})`, total: sql<number>`count(distinct ${mediaItems.id})` })
      .from(genres)
      .innerJoin(mediaItemGenres, eq(mediaItemGenres.genreId, genres.id))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemGenres.mediaItemId))
      .where(and(eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), isNull(mediaItems.parentId), inArray(mediaItems.kind, ['movie', 'series']), ...(scope ? [scope] : [])))
      .groupBy(genres.normalizedName)
      .orderBy(sql`min(${genres.name})`);
    return rows.map((row) => ({ key: row.key, name: row.name, count: Number(row.total) }));
  }

  /** Every available top-level title in a category, merged across same-named genres. */
  async category(key: string, libraryId?: string) {
    const scope = libraryId ? eq(genres.libraryId, libraryId) : undefined;
    const genreRows = await this.database.select({ id: genres.id, name: genres.name })
      .from(genres).where(and(eq(genres.normalizedName, key), ...(scope ? [scope] : [])));
    if (genreRows.length === 0) return null;
    const genreIds = genreRows.map((genre) => genre.id);
    const rows = await this.database.selectDistinct({ item: mediaItems }).from(mediaItemGenres)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemGenres.mediaItemId))
      .where(and(inArray(mediaItemGenres.genreId, genreIds), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), isNull(mediaItems.parentId), inArray(mediaItems.kind, ['movie', 'series'])))
      .orderBy(mediaItems.sortTitle);
    const items = rows.map(({ item }) => item);
    const quality = await this.qualityByItem(items.map((item) => item.id));
    const titles = items.map((item) => ({ ...toCatalogItem(item, null), badge: qualityBadge(quality.get(item.id)) }));
    return { key, name: genreRows[0].name, titles };
  }

  /** A person and every local title they are credited in, for actor pages. */
  async person(personId: string) {
    const [person] = await this.database.select({ id: people.id, name: people.name, profilePath: people.profilePath }).from(people).where(eq(people.id, personId)).limit(1);
    if (!person) return null;
    const rows = await this.database.select({ item: mediaItems, character: castCredits.character })
      .from(castCredits).innerJoin(mediaItems, eq(mediaItems.id, castCredits.mediaItemId))
      .where(and(eq(castCredits.personId, personId), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), inArray(mediaItems.kind, ['movie', 'series'])))
      .orderBy(castCredits.billingOrder, mediaItems.sortTitle);
    const titles = rows.map((row) => ({ ...toCatalogItem(row.item, null), character: row.character ?? undefined }));
    return { id: person.id, name: person.name, profileUrl: imageLocalUrl(person.profilePath), titles };
  }

  private async recommendationsForItem(itemId: string) {
    const rows = await this.database.select({ item: mediaItems })
      .from(recommendationEdges).innerJoin(mediaItems, eq(mediaItems.id, recommendationEdges.recommendedMediaItemId))
      .where(and(eq(recommendationEdges.sourceMediaItemId, itemId), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).orderBy(recommendationEdges.position);
    return rows.map((row) => toCatalogItem(row.item, null));
  }

  async search(libraryId: string | undefined, query: string) {
    const term = query.trim();
    if (term.length === 0) return { query: term, groups: [] as Array<{ id: string; label: string; items: SearchResult[] }> };
    // A missing libraryId searches every library so movies and shows held in
    // separate libraries are both reachable from one search box.
    const itemScope = libraryId ? eq(mediaItems.libraryId, libraryId) : undefined;
    const rows = await this.database.select().from(mediaItems)
      .where(and(eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), isNull(mediaItems.parentId), ilike(mediaItems.title, `%${term}%`), ...(itemScope ? [itemScope] : [])))
      .orderBy(mediaItems.sortTitle).limit(SEARCH_LIMIT);

    const movieIds = rows.filter((item) => item.kind === 'movie').map((item) => item.id);
    const seriesIds = rows.filter((item) => item.kind === 'series').map((item) => item.id);

    const durations = new Map<string, number | null>();
    if (movieIds.length > 0) {
      const files = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, durationSeconds: mediaFiles.durationSeconds })
        .from(mediaFiles).where(and(inArray(mediaFiles.mediaItemId, movieIds), eq(mediaFiles.available, true))).orderBy(...PREFERRED_FILE_ORDER);
      for (const [id, duration] of preferredDurations(files)) durations.set(id, duration);
    }

    const seasonCounts = new Map<string, number>();
    if (seriesIds.length > 0) {
      const seasons = await this.database.select({ parentId: mediaItems.parentId, total: count() })
        .from(mediaItems).where(and(inArray(mediaItems.parentId, seriesIds), eq(mediaItems.kind, 'season'), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt)))
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

    const peopleScope = libraryId ? eq(people.libraryId, libraryId) : undefined;
    const peopleRows = await this.database.select({ id: people.id, name: people.name, profilePath: people.profilePath })
      .from(people).where(and(ilike(people.name, `%${term}%`), ...(peopleScope ? [peopleScope] : [])))
      .orderBy(people.name).limit(SEARCH_LIMIT);
    const peopleResults: SearchResult[] = peopleRows.map((person) => ({ id: person.id, title: person.name, year: null, posterUrl: imageLocalUrl(person.profilePath), kind: 'person' }));

    const groups = [
      { id: 'movies', label: 'Movies', items: rows.filter((item) => item.kind === 'movie').map(toResult) },
      { id: 'shows', label: 'Shows', items: rows.filter((item) => item.kind === 'series').map(toResult) },
      { id: 'people', label: 'People', items: peopleResults },
    ].filter((group) => group.items.length > 0);
    return { query: term, groups };
  }
  async saveProgress(userId: string, mediaItemId: string, positionSeconds?: number, watched?: boolean) {
    const now = new Date();
    // Position is optional so "mark watched" can flip the flag without clobbering resume.
    await this.database.insert(playbackProgress)
      .values({ userId, mediaItemId, positionSeconds: positionSeconds ?? 0, watched: watched ?? false, lastWatchedAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [playbackProgress.userId, playbackProgress.mediaItemId], set: { ...(positionSeconds != null ? { positionSeconds } : {}), ...(watched != null ? { watched } : {}), lastWatchedAt: now, updatedAt: now } });
    this.events?.emit('playback.progress.updated', { userId, mediaItemId, positionSeconds: positionSeconds ?? 0, watched: watched ?? false });
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
  /**
   * Chapter markers for an item's playable file.
   *
   * New scans store chapters with the probe. A file scanned before that gets
   * one live header read here, persisted back so the look happens once.
   */
  async chapters(mediaItemId: string, probeFile: typeof ffprobeChapters = ffprobeChapters): Promise<Chapter[]> {
    const [row] = await this.database.select({
      fileId: mediaFiles.id, probe: mediaFiles.probe,
      relativePath: mediaFiles.relativePath, rootPath: libraries.rootPath,
    }).from(mediaFiles)
      .innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      .where(and(eq(mediaFiles.mediaItemId, mediaItemId), eq(mediaFiles.available, true), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).orderBy(...PREFERRED_FILE_ORDER).limit(1);
    if (!row) return [];

    const probe = row.probe as Record<string, unknown>;
    if (probeKnowsChapters(probe)) return chaptersOf(probe);

    let chapters: unknown[] = [];
    try { chapters = await probeFile(resolve(row.rootPath, row.relativePath)); }
    catch { /* an unreadable file simply has no chapters */ }
    const updated = { ...probe, chapters };
    await this.database.update(mediaFiles).set({ probe: updated, updatedAt: new Date() }).where(eq(mediaFiles.id, row.fileId));
    return chaptersOf(updated);
  }

  /** The detected intro segment for an item's playable file, if any. */
  async introMarker(mediaItemId: string) {
    const [row] = await this.database.select({ startSeconds: mediaIntroMarkers.startSeconds, endSeconds: mediaIntroMarkers.endSeconds })
      .from(mediaIntroMarkers)
      .innerJoin(mediaFiles, eq(mediaFiles.id, mediaIntroMarkers.mediaFileId))
      .where(and(eq(mediaFiles.mediaItemId, mediaItemId), eq(mediaFiles.available, true))).orderBy(...PREFERRED_FILE_ORDER).limit(1);
    return row ?? null;
  }
  /** The storyboard sprite descriptor for an item's playable file, if generated. */
  async previewSprite(mediaItemId: string) {
    const [row] = await this.database.select({ storageKey: mediaPreviewSprites.storageKey, columns: mediaPreviewSprites.columns, rows: mediaPreviewSprites.rows, interval: mediaPreviewSprites.interval, tileWidth: mediaPreviewSprites.tileWidth, tileHeight: mediaPreviewSprites.tileHeight })
      .from(mediaPreviewSprites)
      .innerJoin(mediaFiles, eq(mediaFiles.id, mediaPreviewSprites.mediaFileId))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      .where(and(eq(mediaFiles.mediaItemId, mediaItemId), eq(mediaFiles.available, true), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).orderBy(...PREFERRED_FILE_ORDER).limit(1);
    return row ?? null;
  }

  async playbackSource(mediaItemId: string) {
    const [file] = await this.database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, durationSeconds: mediaFiles.durationSeconds, probe: mediaFiles.probe, rootPath: libraries.rootPath })
      .from(mediaFiles).innerJoin(libraries, eq(libraries.id, mediaFiles.libraryId))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      .where(and(eq(mediaFiles.mediaItemId, mediaItemId), eq(mediaFiles.available, true), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).orderBy(...PREFERRED_FILE_ORDER).limit(1);
    if (!file) return null;
    return { fileId: file.id, relativePath: file.relativePath, rootPath: file.rootPath, durationSeconds: file.durationSeconds, probe: file.probe as Probe };
  }
  async localTrailerSource(mediaItemId: string) {
    const [trailer] = await this.database.select({ localPath: mediaTrailers.localPath }).from(mediaTrailers)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaTrailers.mediaItemId))
      .where(and(eq(mediaTrailers.mediaItemId, mediaItemId), eq(mediaTrailers.preferred, true), eq(mediaTrailers.status, 'ready'), isNotNull(mediaTrailers.localPath), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).limit(1);
    if (!trailer?.localPath || !this.trailerStorageRoot || !managedTrailerPath(this.trailerStorageRoot, trailer.localPath)) return null;
    try { if (!(await stat(resolve(trailer.localPath))).isFile()) return null; } catch { return null; }
    return { localPath: resolve(trailer.localPath) };
  }
  async home(libraryId: string | undefined, userId: string) {
    // A missing libraryId aggregates every library so movies and shows share one home.
    const scope = libraryId ? eq(mediaItems.libraryId, libraryId) : undefined;
    const items = await this.database.select({ item: mediaItems, progress: playbackProgress }).from(mediaItems).leftJoin(playbackProgress, and(eq(playbackProgress.mediaItemId, mediaItems.id), eq(playbackProgress.userId, userId))).where(and(eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), isNull(mediaItems.parentId), ...(scope ? [scope] : []))).orderBy(mediaItems.sortTitle);
    const fileScope = libraryId ? eq(mediaFiles.libraryId, libraryId) : undefined;
    const files = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, durationSeconds: mediaFiles.durationSeconds }).from(mediaFiles).where(and(eq(mediaFiles.available, true), ...(fileScope ? [fileScope] : []))).orderBy(...PREFERRED_FILE_ORDER);
    const durations = preferredDurations(files);
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
      .where(and(eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), eq(mediaItems.kind, 'episode'), ...(scope ? [scope] : [])))
      .orderBy(desc(mediaItems.createdAt)).limit(HOME_ROW_LIMIT);
    const episodes = episodeRows.map(({ item }) => ({ ...toCatalogItem(item, null), badge: undefined as string | undefined, genres: [] as string[], collection: undefined as string | undefined }));

    // Episodes the user is partway through, most recently watched first (posters, shows-only).
    const ongoingEpRows = await this.database.select({ item: mediaItems, progress: playbackProgress, duration: mediaFiles.durationSeconds })
      .from(playbackProgress)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackProgress.mediaItemId))
      .leftJoin(mediaFiles, and(eq(mediaFiles.mediaItemId, mediaItems.id), eq(mediaFiles.available, true)))
      .where(and(eq(playbackProgress.userId, userId), eq(mediaItems.kind, 'episode'), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt), eq(playbackProgress.watched, false), ...(scope ? [scope] : [])))
      .orderBy(desc(playbackProgress.lastWatchedAt), ...PREFERRED_FILE_ORDER).limit(HOME_ROW_LIMIT);
    const seenEpisode = new Set<string>();
    const ongoingEpisodes = ongoingEpRows
      .filter((row) => (seenEpisode.has(row.item.id) ? false : (seenEpisode.add(row.item.id), true)))
      .map(({ item, progress, duration }) => ({ ...toCatalogItem(item, progress, duration), badge: undefined as string | undefined, genres: [] as string[], collection: undefined as string | undefined }))
      .filter((episode) => episode.progress != null && episode.progress > 0 && episode.progress < 1);

    // Both episode rows borrow their show's artwork and name, so a tile is never
    // a blank frame and a viewer can tell which series an episode belongs to.
    const showContext = await this.episodeContext([...episodeRows.map(({ item }) => item), ...ongoingEpRows.map(({ item }) => item)]);
    const episodeTiles = this.withShowArtwork(episodes, showContext);
    const ongoingEpisodeTiles = this.withShowArtwork(ongoingEpisodes, showContext);

    // Watch list: movies the user saved, most recently added first.
    const watchOrder = await this.database.select({ mediaItemId: watchlistEntries.mediaItemId }).from(watchlistEntries)
      .where(eq(watchlistEntries.userId, userId)).orderBy(desc(watchlistEntries.createdAt));
    const movieById = new Map(movies.map((movie) => [movie.id, movie]));
    const seriesById = new Map(series.map((item) => [item.id, item]));
    const watchlist = watchOrder.map((row) => movieById.get(row.mediaItemId)).filter((movie): movie is typeof movies[number] => Boolean(movie)).slice(0, HOME_ROW_LIMIT);
    const watchlistShows = watchOrder.map((row) => seriesById.get(row.mediaItemId)).filter((item): item is typeof series[number] => Boolean(item)).slice(0, HOME_ROW_LIMIT);

    // Newly added movies, newest first by ingest time.
    const createdAtById = new Map(items.map(({ item }) => [item.id, item.createdAt]));
    const newlyAdded = [...movies].sort((a, b) => (createdAtById.get(b.id)?.getTime() ?? 0) - (createdAtById.get(a.id)?.getTime() ?? 0)).slice(0, HOME_ROW_LIMIT);

    const sections: Array<{ id: string; title: string; layout: 'poster' | 'card'; items: Array<typeof shape[number] & { seriesId?: string; seriesTitle?: string }> }> = [];

    // Movie rows mirror the classic home: resume, saved, then freshest. All movies-only (never mixed).
    const resume = movies.filter((item) => item.progress != null && item.progress > 0 && item.progress < 1).slice(0, HOME_ROW_LIMIT);
    if (resume.length > 0) sections.push({ id: 'continue-watching', title: 'Continue Watching', layout: 'card', items: resume });
    if (ongoingEpisodeTiles.length > 0) sections.push({ id: 'continue-watching-episodes', title: 'Continue Watching – Episodes', layout: 'poster', items: ongoingEpisodeTiles });
    if (watchlist.length > 0) sections.push({ id: 'watchlist', title: 'Watch List', layout: 'card', items: watchlist });
    if (newlyAdded.length > 0) sections.push({ id: 'newly-added', title: 'Newly Added', layout: 'card', items: newlyAdded });

    // Shows get their own rows: newest episodes as posters, newest series as backdrops.
    if (watchlistShows.length > 0) sections.push({ id: 'watchlist-shows', title: 'Watch List – Shows', layout: 'poster', items: watchlistShows });
    if (episodeTiles.length > 0) sections.push({ id: 'new-episodes', title: 'Newly Added Episodes', layout: 'poster', items: episodeTiles });
    const newlyAddedShows = [...series].sort((a, b) => (createdAtById.get(b.id)?.getTime() ?? 0) - (createdAtById.get(a.id)?.getTime() ?? 0)).slice(0, HOME_ROW_LIMIT);
    if (newlyAddedShows.length > 0) sections.push({ id: 'newly-added-shows', title: 'Newly Added Shows', layout: 'card', items: newlyAddedShows });

    // Hero spotlights a random movie (backdrop preferred) so the home varies between visits.
    const heroPool = movies.filter((movie) => movie.backdropUrl);
    const pool = heroPool.length > 0 ? heroPool : movies;
    const chosen = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : series[0] ?? shape[0] ?? null;
    // Flag whether the hero can play a locally-downloaded trailer as its background.
    const featured = chosen ? { ...chosen, hasLocalTrailer: (await this.localTrailerSource(chosen.id)) != null } : null;
    return { libraryId: libraryId ?? null, featured, sections };
  }
  /**
   * The little a link preview needs about a title. Deliberately ignores the
   * viewer: there is none, a chat app's crawler fetches the page anonymously.
   */
  async sharePreview(id: string): Promise<{ title: string; overview: string | null; kind: string; year: number | null; imageUrl: string | undefined } | null> {
    const [row] = await this.database.select({ title: mediaItems.title, overview: mediaItems.overview, kind: mediaItems.kind, year: mediaItems.year, posterPath: mediaItems.posterPath, backdropPath: mediaItems.backdropPath })
      .from(mediaItems).where(and(eq(mediaItems.id, id), isNull(mediaItems.archivedAt))).limit(1);
    if (!row) return null;
    return { title: row.title, overview: row.overview, kind: row.kind, year: row.year, imageUrl: imageLocalUrl(row.backdropPath) ?? imageLocalUrl(row.posterPath) };
  }

  async item(id: string, userId: string) {
    const [row] = await this.database.select({ item: mediaItems, progress: playbackProgress }).from(mediaItems).leftJoin(playbackProgress, and(eq(playbackProgress.mediaItemId, mediaItems.id), eq(playbackProgress.userId, userId))).where(and(eq(mediaItems.id, id), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).limit(1); if (!row) return null;
    const childRows = await this.database.select({ item: mediaItems, progress: playbackProgress }).from(mediaItems).leftJoin(playbackProgress, and(eq(playbackProgress.mediaItemId, mediaItems.id), eq(playbackProgress.userId, userId))).where(and(eq(mediaItems.parentId, id), eq(mediaItems.available, true), this.withinMaturity, isNull(mediaItems.archivedAt))).orderBy(mediaItems.seasonNumber, mediaItems.episodeNumber, mediaItems.sortTitle);
    const childFiles = await this.database.select({ mediaItemId: mediaFiles.mediaItemId, durationSeconds: mediaFiles.durationSeconds }).from(mediaFiles).innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId)).where(and(eq(mediaItems.parentId, id), eq(mediaFiles.available, true))).orderBy(...PREFERRED_FILE_ORDER);
    const children = serializeCatalogChildren(childRows, preferredDurations(childFiles));
    const files = await this.database.select({ id: mediaFiles.id, relativePath: mediaFiles.relativePath, durationSeconds: mediaFiles.durationSeconds }).from(mediaFiles).where(and(eq(mediaFiles.mediaItemId, id), eq(mediaFiles.available, true))).orderBy(...PREFERRED_FILE_ORDER);
    const [quality, genreMap, collectionMap, cast, recommendations, inWatchlist, subtitles, nextEpisode, trailers, localTrailer, ancestry] = await Promise.all([
      this.qualityByItem([id]), this.genresByItem([id]), this.collectionByItem([id]), this.castForItem(id), this.recommendationsForItem(id), this.isWatchlisted(userId, id), this.subtitlesForItem(id), this.nextEpisode(row.item),
      this.database.select({ site: mediaTrailers.site, key: mediaTrailers.key, name: mediaTrailers.name, type: mediaTrailers.type, official: mediaTrailers.official, preferred: mediaTrailers.preferred, localAvailable: sql<boolean>`${mediaTrailers.status} = 'ready' and ${mediaTrailers.localPath} is not null` }).from(mediaTrailers).where(eq(mediaTrailers.mediaItemId, id)).orderBy(desc(mediaTrailers.preferred), desc(mediaTrailers.publishedAt)),
      this.localTrailerSource(id),
      this.showAncestry(row.item),
    ]);
    const profile = quality.get(id) ?? null;
    const { showArtwork, ...showRefs } = ancestry;
    const base = toCatalogItem(row.item, row.progress, files[0]?.durationSeconds);
    return {
      ...base,
      ...showRefs,
      // Episodes rarely carry a poster and seasons rarely a backdrop, so the
      // show's art fills the page rather than leaving an empty frame.
      posterUrl: base.posterUrl ?? showArtwork?.posterUrl,
      backdropUrl: base.backdropUrl ?? showArtwork?.backdropUrl,
      inWatchlist,
      watched: row.progress?.watched ?? false,
      originalTitle: row.item.originalTitle ?? undefined,
      releaseDate: row.item.releaseDate ?? undefined,
      addedAt: row.item.createdAt.toISOString(),
      tagline: row.item.tagline ?? undefined,
      contentRating: row.item.contentRating ?? undefined,
      providerRating: row.item.providerRating ?? undefined,
      runtime: formatRuntime(files[0]?.durationSeconds),
      quality: profile ? { badge: qualityBadge(profile), resolutionLabel: profile.resolutionLabel, dynamicRange: profile.dynamicRange, videoCodec: profile.videoCodec, audioCodec: profile.audioCodec, audioChannels: profile.audioChannels } : undefined,
      genres: genreMap.get(id) ?? [],
      collection: collectionMap.get(id),
      cast,
      recommendations,
      hasLocalTrailer: localTrailer != null,
      trailers: trailers.map((trailer) => ({ ...trailer, localAvailable: trailer.preferred && localTrailer != null })),
      subtitles,
      nextEpisodeId: nextEpisode?.id,
      nextEpisode,
      children,
      files,
    };
  }
}

export function managedTrailerPath(storageRoot: string, path: string): boolean {
  const relation = relative(resolve(storageRoot), resolve(path));
  return relation !== '' && !relation.startsWith('..') && !isAbsolute(relation);
}

function seasonLabel(total: number): string | undefined {
  if (total <= 0) return 'Series';
  return `${total} season${total === 1 ? '' : 's'}`;
}

export function toCatalogItem(item: typeof mediaItems.$inferSelect, progress: typeof playbackProgress.$inferSelect | null, duration?: number | null) { return { id: item.id, libraryId: item.libraryId, kind: item.kind, title: item.title, year: item.year, overview: item.overview, posterUrl: imageLocalUrl(item.posterPath), backdropUrl: imageLocalUrl(item.backdropPath), logoUrl: imageLocalUrl(item.logoPath), seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, progress: progress?.watched ? 1 : progress && duration && duration > 0 ? Math.min(1, Math.max(0, progress.positionSeconds / duration)) : undefined }; }

export function serializeCatalogChildren(rows: Array<{ item: typeof mediaItems.$inferSelect; progress: typeof playbackProgress.$inferSelect | null }>, durations: Map<string, number | null>) { return rows.map(({ item, progress }) => toCatalogItem(item, progress, durations.get(item.id))); }
