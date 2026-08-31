import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { castCredits, collectionExpectedMembers, collectionMembers, collections, genres, mediaItemGenres, mediaItems, people, recommendationEdges } from './db/schema.ts';
import type { TmdbClient, TmdbCollectionMetadata, TmdbMetadata } from './tmdb.ts';
import type { ImageStore } from './images.ts';
import { maturityLevel } from './maturity.ts';
import type { PluginEventBus } from './plugins/events.ts';

/** Bump when the enrichment model changes so unchanged files can be backfilled. */
export const ENRICHMENT_VERSION = 1;

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const CAST_LIMIT = 20;
const RECOMMENDATION_LIMIT = 20;

function normalizeGenre(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim();
}

/**
 * Applies rich provider metadata onto a local catalog item: additive item
 * fields, normalized genres, billed cast, collection membership, and
 * recommendation edges that resolve to available local items. Relationship
 * sets are replaced idempotently so repeated scans never accumulate duplicates.
 */
export class EnrichmentService {
  constructor(private readonly database: Database, private readonly tmdb: TmdbClient, private readonly images: ImageStore, private readonly events?: PluginEventBus) {}

  async enrich(libraryId: string, itemId: string, kind: 'movie' | 'series', title: string, year?: number, providerId?: number, userMatched = false): Promise<boolean> {
    const attemptAt = new Date();
    let metadata: TmdbMetadata | null = null;
    // Explicit admin matches survive later scans. Normal enrichment discovers the
    // marker itself so every caller (including filesystem ingestion) follows the
    // stored provider id instead of accidentally title-searching a new match.
    const [existing] = await this.database.select({ providerIds: mediaItems.providerIds }).from(mediaItems).where(eq(mediaItems.id, itemId)).limit(1);
    const storedId = Number(existing?.providerIds.tmdb);
    const hasStoredUserMatch = existing?.providerIds.tmdbUserMatched === 'true' && Number.isInteger(storedId) && storedId > 0;
    const preserveUserMatch = userMatched || hasStoredUserMatch;
    const effectiveProviderId = hasStoredUserMatch ? storedId : providerId;
    // A refresh with a known provider id re-fetches the same title; a first pass searches by name.
    try { metadata = effectiveProviderId ? await this.tmdb.getById(kind, effectiveProviderId) : await this.tmdb.find(kind, title, year); } catch { metadata = null; }
    if (!metadata) {
      // Record the attempt but preserve any previously valid metadata.
      await this.database.update(mediaItems).set({ enrichmentLastAttemptAt: attemptAt, updatedAt: new Date() }).where(eq(mediaItems.id, itemId));
      return false;
    }
    // The full TMDB collection powers the "missing from collection" view. Fetched
    // outside the transaction and best-effort: a provider hiccup leaves the previously
    // recorded membership untouched instead of aborting enrichment.
    let expected: TmdbCollectionMetadata['parts'] | null = null;
    if (metadata.collection) {
      try { expected = (await this.tmdb.getCollection(metadata.collection.id))?.parts ?? null; } catch { expected = null; }
    }
    await this.database.transaction(async (tx) => {
      await tx.update(mediaItems).set({
        originalTitle: preserveUserMatch ? metadata.originalTitle ?? null : metadata.originalTitle,
        releaseDate: preserveUserMatch ? metadata.releaseDate ?? null : metadata.releaseDate,
        year: preserveUserMatch ? metadata.year ?? null : metadata.year ?? undefined,
        overview: preserveUserMatch ? metadata.overview ?? null : metadata.overview,
        tagline: preserveUserMatch ? metadata.tagline ?? null : metadata.tagline,
        providerRating: preserveUserMatch ? metadata.rating ?? null : metadata.rating,
        contentRating: preserveUserMatch ? metadata.contentRating ?? null : metadata.contentRating,
        maturityLevel: maturityLevel(metadata.contentRating),
        posterPath: preserveUserMatch ? metadata.posterPath ?? null : metadata.posterPath,
        backdropPath: preserveUserMatch ? metadata.backdropPath ?? null : metadata.backdropPath,
        logoPath: preserveUserMatch ? metadata.logoPath ?? null : metadata.logoPath,
        providerIds: { tmdb: String(metadata.id), ...metadata.externalIds, ...(preserveUserMatch ? { tmdbUserMatched: 'true' } : {}) },
        metadataSource: 'tmdb',
        enrichmentVersion: ENRICHMENT_VERSION,
        enrichmentLastAttemptAt: attemptAt,
        enrichmentLastSuccessAt: attemptAt,
        updatedAt: new Date(),
      }).where(eq(mediaItems.id, itemId));

      await this.replaceGenres(tx, libraryId, itemId, metadata);
      await this.replaceCast(tx, libraryId, itemId, metadata);
      await this.applyCollection(tx, libraryId, itemId, metadata, expected);
      await this.replaceRecommendations(tx, libraryId, itemId, metadata);
      if (kind === 'series') {
        // Providers rate the show, not each episode; children inherit the series
        // level so a parental limit filters them with one comparison.
        await tx.update(mediaItems)
          .set({ maturityLevel: maturityLevel(metadata.contentRating) })
          .where(eq(mediaItems.id, itemId));
        await tx.execute(sql`
          update ${mediaItems} set maturity_level = ${maturityLevel(metadata.contentRating)}
          where ${mediaItems.libraryId} = ${libraryId}
            and (${mediaItems.parentId} = ${itemId}
              or ${mediaItems.parentId} in (select id from ${mediaItems} where parent_id = ${itemId}))
        `);
      }
    });

    // Emitted after the transaction commits so a handler that reads the item sees it.
    this.events?.emit('media.item.enriched', { libraryId, mediaItemId: itemId, kind, providerIds: { tmdb: String(metadata.id), ...metadata.externalIds } });

    await this.cacheArtwork(metadata, expected);
    return true;
  }

  /**
   * Enriches a scanned episode and its season with TMDB metadata (episode name,
   * overview, air date, still; season poster/overview). Requires the parent
   * series to already carry a TMDB provider id — otherwise there is nothing to
   * resolve against and the call is a no-op. Only defined fields are written so
   * a partial provider response never wipes existing data.
   */
  async enrichEpisode(
    seriesItemId: string,
    seasonItemId: string,
    episodeItemId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<void> {
    const [series] = await this.database.select({ providerIds: mediaItems.providerIds, libraryId: mediaItems.libraryId }).from(mediaItems).where(eq(mediaItems.id, seriesItemId)).limit(1);
    const seriesTmdb = Number(series?.providerIds.tmdb);
    if (!Number.isInteger(seriesTmdb) || seriesTmdb < 1) return;

    const attemptAt = new Date();
    const [season, episode] = await Promise.all([
      this.tmdb.getSeason(seriesTmdb, seasonNumber).catch(() => null),
      this.tmdb.getEpisode(seriesTmdb, seasonNumber, episodeNumber).catch(() => null),
    ]);

    if (season) {
      await this.database.update(mediaItems).set({
        title: season.title,
        overview: season.overview,
        releaseDate: season.airDate,
        year: season.year ?? undefined,
        posterPath: season.posterPath,
        providerIds: { tmdb: String(season.id) },
        metadataSource: 'tmdb',
        enrichmentVersion: ENRICHMENT_VERSION,
        enrichmentLastAttemptAt: attemptAt,
        enrichmentLastSuccessAt: attemptAt,
        updatedAt: new Date(),
      }).where(eq(mediaItems.id, seasonItemId));
    }

    if (episode) {
      await this.database.update(mediaItems).set({
        title: episode.title,
        overview: episode.overview,
        releaseDate: episode.airDate,
        year: episode.year ?? undefined,
        providerRating: episode.rating,
        backdropPath: episode.stillPath,
        providerIds: { tmdb: String(episode.id) },
        metadataSource: 'tmdb',
        enrichmentVersion: ENRICHMENT_VERSION,
        enrichmentLastAttemptAt: attemptAt,
        enrichmentLastSuccessAt: attemptAt,
        updatedAt: new Date(),
      }).where(eq(mediaItems.id, episodeItemId));
    } else {
      await this.database.update(mediaItems).set({ enrichmentLastAttemptAt: attemptAt, updatedAt: new Date() }).where(eq(mediaItems.id, episodeItemId));
    }

    if (episode) this.events?.emit('media.item.enriched', { libraryId: series!.libraryId, mediaItemId: episodeItemId, kind: 'episode', providerIds: { tmdb: String(episode.id) } });

    for (const path of [season?.posterPath, episode?.stillPath]) {
      if (!path) continue;
      try { await this.images.cache(path); } catch { /* offline-first best effort */ }
    }
  }

  private async replaceGenres(tx: Tx, libraryId: string, itemId: string, metadata: TmdbMetadata) {
    const links: { genreId: string; position: number }[] = [];
    for (const [position, genre] of metadata.genres.entries()) {
      const normalizedName = normalizeGenre(genre.name);
      if (!normalizedName) continue;
      const [row] = await tx.insert(genres)
        .values({ libraryId, providerSource: 'tmdb', providerId: String(genre.id), name: genre.name, normalizedName })
        .onConflictDoUpdate({ target: [genres.libraryId, genres.normalizedName], set: { name: genre.name, providerId: String(genre.id), updatedAt: new Date() } })
        .returning({ id: genres.id });
      if (row) links.push({ genreId: row.id, position });
    }
    await tx.delete(mediaItemGenres).where(eq(mediaItemGenres.mediaItemId, itemId));
    if (links.length > 0) await tx.insert(mediaItemGenres).values(links.map((link) => ({ mediaItemId: itemId, genreId: link.genreId, position: link.position })));
  }

  private async replaceCast(tx: Tx, libraryId: string, itemId: string, metadata: TmdbMetadata) {
    const credits: { personId: string; character?: string; billingOrder: number }[] = [];
    for (const credit of metadata.cast.slice(0, CAST_LIMIT)) {
      const [row] = await tx.insert(people)
        .values({ libraryId, providerSource: 'tmdb', providerId: String(credit.personId), name: credit.name, profilePath: credit.profilePath })
        .onConflictDoUpdate({ target: [people.libraryId, people.providerSource, people.providerId], set: { name: credit.name, profilePath: credit.profilePath, updatedAt: new Date() } })
        .returning({ id: people.id });
      if (row) credits.push({ personId: row.id, character: credit.character, billingOrder: credit.order });
    }
    await tx.delete(castCredits).where(eq(castCredits.mediaItemId, itemId));
    if (credits.length > 0) await tx.insert(castCredits).values(credits.map((credit) => ({ mediaItemId: itemId, personId: credit.personId, character: credit.character, billingOrder: credit.billingOrder })));
  }

  private async applyCollection(tx: Tx, libraryId: string, itemId: string, metadata: TmdbMetadata, expected: TmdbCollectionMetadata['parts'] | null = null) {
    if (!metadata.collection) {
      await tx.delete(collectionMembers).where(eq(collectionMembers.mediaItemId, itemId));
      return;
    }
    const collection = metadata.collection;
    const [row] = await tx.insert(collections)
      .values({ libraryId, providerSource: 'tmdb', providerId: String(collection.id), name: collection.name, posterPath: collection.posterPath, backdropPath: collection.backdropPath })
      .onConflictDoUpdate({ target: [collections.libraryId, collections.providerSource, collections.providerId], set: { name: collection.name, posterPath: collection.posterPath, backdropPath: collection.backdropPath, updatedAt: new Date() } })
      .returning({ id: collections.id });
    if (!row) return;
    await tx.insert(collectionMembers)
      .values({ collectionId: row.id, mediaItemId: itemId, position: metadata.year ?? 0 })
      .onConflictDoUpdate({ target: [collectionMembers.mediaItemId], set: { collectionId: row.id, position: metadata.year ?? 0, updatedAt: new Date() } });
    await this.replaceExpectedMembers(tx, row.id, expected);
  }

  /** Records every member TMDB lists for a collection so absent ones are still known offline. */
  private async replaceExpectedMembers(tx: Tx, collectionId: string, expected: TmdbCollectionMetadata['parts'] | null) {
    if (!expected || expected.length === 0) return;
    await tx.insert(collectionExpectedMembers)
      .values(expected.map((part) => ({ collectionId, tmdbId: String(part.id), title: part.title, year: part.year ?? null, releaseDate: part.releaseDate ?? null, posterPath: part.posterPath ?? null })))
      .onConflictDoUpdate({
        target: [collectionExpectedMembers.collectionId, collectionExpectedMembers.tmdbId],
        set: {
          title: sql`excluded.title`,
          year: sql`excluded.year`,
          releaseDate: sql`excluded.release_date`,
          posterPath: sql`excluded.poster_path`,
          updatedAt: new Date(),
        },
      });
    const keep = expected.map((part) => String(part.id));
    await tx.delete(collectionExpectedMembers)
      .where(and(eq(collectionExpectedMembers.collectionId, collectionId), notInArray(collectionExpectedMembers.tmdbId, keep)));
  }

  private async replaceRecommendations(tx: Tx, libraryId: string, itemId: string, metadata: TmdbMetadata) {
    await tx.delete(recommendationEdges).where(eq(recommendationEdges.sourceMediaItemId, itemId));
    const providerIds = metadata.recommendations.slice(0, RECOMMENDATION_LIMIT).map((rec) => String(rec.id));
    if (providerIds.length === 0) return;
    const tmdbId = sql`${mediaItems.providerIds}->>'tmdb'`;
    const resolved = await tx.select({ id: mediaItems.id, tmdb: tmdbId })
      .from(mediaItems)
      .where(and(eq(mediaItems.libraryId, libraryId), eq(mediaItems.available, true), inArray(tmdbId, providerIds)));
    const byProvider = new Map(resolved.map((row) => [row.tmdb, row.id]));
    const edges = providerIds.flatMap((providerId, position) => {
      const recommendedId = byProvider.get(providerId);
      return recommendedId && recommendedId !== itemId ? [{ sourceMediaItemId: itemId, recommendedMediaItemId: recommendedId, position }] : [];
    });
    if (edges.length > 0) await tx.insert(recommendationEdges).values(edges).onConflictDoNothing();
  }

  private async cacheArtwork(metadata: TmdbMetadata, expected: TmdbCollectionMetadata['parts'] | null = null) {
    // Expected-member posters are cached now so the offline "missing" placeholders still have art.
    const paths = [metadata.posterPath, metadata.backdropPath, metadata.logoPath, metadata.collection?.posterPath, metadata.collection?.backdropPath, ...metadata.cast.slice(0, CAST_LIMIT).map((credit) => credit.profilePath), ...(expected ?? []).map((part) => part.posterPath)];
    for (const path of paths) {
      try { await this.images.cache(path); } catch { /* offline-first best effort; a failed download never aborts the scan */ }
    }
  }
}
