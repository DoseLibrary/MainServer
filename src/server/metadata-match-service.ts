import { eq } from 'drizzle-orm';
import type { Database } from './db/client.ts';
import { mediaItems } from './db/schema.ts';
import type { EnrichmentService } from './enrichment.ts';
import type { TmdbClient } from './tmdb.ts';

export class MatchItemNotFoundError extends Error {}
export class MatchUnsupportedKindError extends Error {}
export class TmdbMatchNotFoundError extends Error {}

/** Admin-only orchestration for explicit TMDB searches and single-item re-matches. */
export class MetadataMatchService {
  constructor(private readonly database: Database, private readonly tmdb: TmdbClient, private readonly enrichment: EnrichmentService) {}

  search(kind: 'movie' | 'series', query: string) { return this.tmdb.searchTitles(kind, query); }

  async match(itemId: string, tmdbId: number) {
    const [item] = await this.database.select({ id: mediaItems.id, libraryId: mediaItems.libraryId, kind: mediaItems.kind, title: mediaItems.title, year: mediaItems.year })
      .from(mediaItems).where(eq(mediaItems.id, itemId)).limit(1);
    if (!item) throw new MatchItemNotFoundError();
    if (item.kind !== 'movie' && item.kind !== 'series') throw new MatchUnsupportedKindError();
    const matched = await this.enrichment.enrich(item.libraryId, item.id, item.kind, item.title, item.year ?? undefined, tmdbId, true);
    if (!matched) throw new TmdbMatchNotFoundError();
    const [updated] = await this.database.select().from(mediaItems).where(eq(mediaItems.id, item.id)).limit(1);
    return updated;
  }
}
