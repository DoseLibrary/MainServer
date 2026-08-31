import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.ts';
import { mediaItems, playbackProgress, userCollectionItems, userCollections, watchlistEntries } from './db/schema.ts';

/** Portable reference to a title: provider ids first, title+year as the fallback. */
export const watchDataMatch = z.object({
  tmdbId: z.string().trim().min(1).max(32).optional(),
  imdbId: z.string().trim().min(1).max(32).optional(),
  title: z.string().trim().min(1).max(500),
  year: z.number().int().min(1800).max(2200).optional(),
  kind: z.enum(['movie', 'series', 'season', 'episode']),
});

export const watchDataDocument = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  progress: z.array(z.object({
    match: watchDataMatch,
    positionSeconds: z.number().int().min(0).max(1_000_000).default(0),
    watched: z.boolean().default(false),
    lastWatchedAt: z.string().optional(),
  })).max(100_000).default([]),
  watchlist: z.array(z.object({ match: watchDataMatch })).max(100_000).default([]),
  collections: z.array(z.object({
    name: z.string().trim().min(1).max(128),
    overview: z.string().trim().max(2000).optional(),
    items: z.array(watchDataMatch).max(10_000).default([]),
  })).max(1000).default([]),
});

export type WatchDataMatch = z.infer<typeof watchDataMatch>;
export type WatchDataDocument = z.infer<typeof watchDataDocument>;
export type WatchDataProgressEntry = { match: WatchDataMatch; positionSeconds: number; watched: boolean; lastWatchedAt?: string };
export interface WatchDataImportSummary {
  matched: number;
  written: number;
  unmatched: WatchDataMatch[];
}

/** Lowercased, punctuation- and article-folded title, mirroring `sort_title` intent. */
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const asDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

/**
 * Portable watch data: export by natural key so a document re-imports on any Dose
 * install, and import additively (furthest position, OR of watched, unions
 * elsewhere) so re-running the same document changes nothing. Also the matching
 * seam every external history importer reuses.
 */
export class WatchDataService {
  constructor(private readonly database: Database) {}

  /** The caller's progress, watchlist, and personal collections with no internal ids. */
  async exportFor(userId: string): Promise<WatchDataDocument> {
    const progressRows = await this.database.select({ item: mediaItems, progress: playbackProgress })
      .from(playbackProgress).innerJoin(mediaItems, eq(mediaItems.id, playbackProgress.mediaItemId))
      .where(eq(playbackProgress.userId, userId));
    const watchlistRows = await this.database.select({ item: mediaItems })
      .from(watchlistEntries).innerJoin(mediaItems, eq(mediaItems.id, watchlistEntries.mediaItemId))
      .where(eq(watchlistEntries.userId, userId));
    const collectionRows = await this.database.select({ collection: userCollections, item: mediaItems })
      .from(userCollections)
      .leftJoin(userCollectionItems, eq(userCollectionItems.userCollectionId, userCollections.id))
      .leftJoin(mediaItems, eq(mediaItems.id, userCollectionItems.mediaItemId))
      .where(eq(userCollections.userId, userId))
      .orderBy(userCollections.name, userCollectionItems.position);

    const collections = new Map<string, { name: string; overview?: string; items: WatchDataMatch[] }>();
    for (const row of collectionRows) {
      const existing = collections.get(row.collection.id)
        ?? { name: row.collection.name, overview: row.collection.overview ?? undefined, items: [] };
      if (row.item) existing.items.push(toMatch(row.item));
      collections.set(row.collection.id, existing);
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: progressRows.map(({ item, progress }) => ({
        match: toMatch(item),
        positionSeconds: progress.positionSeconds,
        watched: progress.watched,
        lastWatchedAt: progress.lastWatchedAt.toISOString(),
      })),
      watchlist: watchlistRows.map(({ item }) => ({ match: toMatch(item) })),
      collections: [...collections.values()],
    };
  }

  /** Resolves a portable match to a local item id: TMDB id → IMDB id → title+year. */
  async resolveMatch(match: WatchDataMatch): Promise<string | null> {
    const tmdbId = sql`${mediaItems.providerIds}->>'tmdb'`;
    const imdbId = sql`coalesce(${mediaItems.providerIds}->>'imdb_id', ${mediaItems.providerIds}->>'imdb')`;
    if (match.tmdbId) {
      const [row] = await this.database.select({ id: mediaItems.id }).from(mediaItems)
        .where(and(eq(tmdbId, match.tmdbId), eq(mediaItems.kind, match.kind))).limit(1);
      if (row) return row.id;
    }
    if (match.imdbId) {
      const [row] = await this.database.select({ id: mediaItems.id }).from(mediaItems)
        .where(and(eq(imdbId, match.imdbId), eq(mediaItems.kind, match.kind))).limit(1);
      if (row) return row.id;
    }
    // Title fallback is folded in SQL so the comparison never pulls the catalog into memory.
    const normalized = sql`btrim(regexp_replace(regexp_replace(lower(coalesce(${mediaItems.userTitle}, ${mediaItems.title})), '^(the|a|an)[[:space:]]+', ''), '[^a-z0-9]+', ' ', 'g'))`;
    const effectiveYear = sql`coalesce(${mediaItems.userYear}, ${mediaItems.year})`;
    const yearClause = match.year == null
      ? undefined
      : or(isNull(effectiveYear), eq(effectiveYear, match.year));
    const [row] = await this.database.select({ id: mediaItems.id }).from(mediaItems)
      .where(and(eq(mediaItems.kind, match.kind), eq(normalized, normalizeTitle(match.title)), ...(yearClause ? [yearClause] : []))).limit(1);
    return row?.id ?? null;
  }

  /** Applies progress entries for one user; unmatched entries are reported, never fatal. */
  async importProgress(userId: string, entries: WatchDataProgressEntry[]): Promise<WatchDataImportSummary> {
    const unmatched: WatchDataMatch[] = [];
    let matched = 0;
    let written = 0;
    for (const entry of entries) {
      const mediaItemId = await this.resolveMatch(entry.match);
      if (!mediaItemId) { unmatched.push(entry.match); continue; }
      matched += 1;
      if (await this.mergeProgress(userId, mediaItemId, entry)) written += 1;
    }
    return { matched, written, unmatched };
  }

  /** Applies a whole export document to the caller. Idempotent by construction. */
  async importDocument(userId: string, document: WatchDataDocument): Promise<WatchDataImportSummary> {
    const summary = await this.importProgress(userId, document.progress);

    for (const entry of document.watchlist) {
      const mediaItemId = await this.resolveMatch(entry.match);
      if (!mediaItemId) { summary.unmatched.push(entry.match); continue; }
      summary.matched += 1;
      const inserted = await this.database.insert(watchlistEntries).values({ userId, mediaItemId }).onConflictDoNothing().returning();
      if (inserted.length > 0) summary.written += 1;
    }

    for (const collection of document.collections) {
      const collectionId = await this.ensureCollection(userId, collection.name, collection.overview);
      for (const match of collection.items) {
        const mediaItemId = await this.resolveMatch(match);
        if (!mediaItemId) { summary.unmatched.push(match); continue; }
        summary.matched += 1;
        const [{ next } = { next: 0 }] = await this.database
          .select({ next: sql<number>`coalesce(max(${userCollectionItems.position}), -1)::int + 1` })
          .from(userCollectionItems).where(eq(userCollectionItems.userCollectionId, collectionId));
        const inserted = await this.database.insert(userCollectionItems)
          .values({ userCollectionId: collectionId, mediaItemId, position: next })
          .onConflictDoNothing().returning();
        if (inserted.length > 0) summary.written += 1;
      }
    }
    return summary;
  }

  /** Furthest position wins, watched is sticky, newest timestamp survives. */
  private async mergeProgress(userId: string, mediaItemId: string, entry: WatchDataProgressEntry) {
    const lastWatchedAt = asDate(entry.lastWatchedAt) ?? new Date();
    const [existing] = await this.database.select().from(playbackProgress)
      .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.mediaItemId, mediaItemId))).limit(1);
    if (!existing) {
      await this.database.insert(playbackProgress)
        .values({ userId, mediaItemId, positionSeconds: entry.positionSeconds, watched: entry.watched, lastWatchedAt })
        .onConflictDoNothing();
      return true;
    }
    const positionSeconds = Math.max(existing.positionSeconds, entry.positionSeconds);
    const watched = existing.watched || entry.watched;
    const newest = existing.lastWatchedAt > lastWatchedAt ? existing.lastWatchedAt : lastWatchedAt;
    if (positionSeconds === existing.positionSeconds && watched === existing.watched && newest.getTime() === existing.lastWatchedAt.getTime()) return false;
    await this.database.update(playbackProgress)
      .set({ positionSeconds, watched, lastWatchedAt: newest, updatedAt: new Date() })
      .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.mediaItemId, mediaItemId)));
    return true;
  }

  /** Merges by name so importing twice reuses the collection instead of duplicating it. */
  private async ensureCollection(userId: string, name: string, overview?: string) {
    const [existing] = await this.database.select({ id: userCollections.id }).from(userCollections)
      .where(and(eq(userCollections.userId, userId), eq(userCollections.name, name))).limit(1);
    if (existing) return existing.id;
    const [created] = await this.database.insert(userCollections)
      .values({ userId, name, overview: overview ?? null }).returning({ id: userCollections.id });
    return created!.id;
  }
}

function toMatch(item: typeof mediaItems.$inferSelect): WatchDataMatch {
  const providerIds = item.providerIds ?? {};
  return {
    tmdbId: providerIds.tmdb,
    imdbId: providerIds.imdb_id ?? providerIds.imdb,
    title: item.userTitle ?? item.title,
    year: item.userYear ?? item.year ?? undefined,
    kind: item.kind,
  };
}
