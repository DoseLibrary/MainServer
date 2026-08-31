import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.ts';
import { mediaItems, playbackQueue } from './db/schema.ts';
import { toCatalogItem } from './catalog-service.ts';

export const queueItemBody = z.object({ mediaItemId: z.string().uuid() });
export const queueOrder = z.object({ mediaItemIds: z.array(z.string().uuid()).max(1000) });

/**
 * The per-user marathon queue: an ordered list of titles to play in sequence.
 * Unavailable or archived entries stay in the queue (the file may come back) but
 * are flagged for the queue view and skipped when playback advances.
 */
export class QueueService {
  constructor(private readonly database: Database) {}

  /** The caller's queue in play order, each entry flagged when it cannot be played. */
  async list(userId: string) {
    const rows = await this.database.select({ item: mediaItems }).from(playbackQueue)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackQueue.mediaItemId))
      .where(eq(playbackQueue.userId, userId))
      .orderBy(asc(playbackQueue.position), asc(playbackQueue.addedAt));
    return rows.map(({ item }) => ({ ...toCatalogItem(item, null), unavailable: !item.available || item.archivedAt != null }));
  }

  /** Appends a title to the end of the queue; queueing it again is a no-op. */
  async add(userId: string, mediaItemId: string) {
    const [{ next } = { next: 0 }] = await this.database
      .select({ next: sql<number>`coalesce(max(${playbackQueue.position}), -1)::int + 1` })
      .from(playbackQueue).where(eq(playbackQueue.userId, userId));
    await this.database.insert(playbackQueue).values({ userId, mediaItemId, position: next }).onConflictDoNothing();
    return this.list(userId);
  }

  async remove(userId: string, mediaItemId: string) {
    await this.database.delete(playbackQueue)
      .where(and(eq(playbackQueue.userId, userId), eq(playbackQueue.mediaItemId, mediaItemId)));
    return this.list(userId);
  }

  async clear(userId: string) {
    await this.database.delete(playbackQueue).where(eq(playbackQueue.userId, userId));
    return [];
  }

  /** Rewrites positions in one transaction; ids not in the queue are ignored. */
  async reorder(userId: string, mediaItemIds: string[]) {
    await this.database.transaction(async (tx) => {
      const present = mediaItemIds.length === 0 ? [] : await tx.select({ mediaItemId: playbackQueue.mediaItemId })
        .from(playbackQueue)
        .where(and(eq(playbackQueue.userId, userId), inArray(playbackQueue.mediaItemId, mediaItemIds)));
      const known = new Set(present.map((row) => row.mediaItemId));
      let position = 0;
      for (const mediaItemId of mediaItemIds) {
        if (!known.has(mediaItemId)) continue;
        await tx.update(playbackQueue).set({ position })
          .where(and(eq(playbackQueue.userId, userId), eq(playbackQueue.mediaItemId, mediaItemId)));
        position += 1;
      }
    });
    return this.list(userId);
  }

  /**
   * The next playable queued title. Without `afterMediaItemId` this is the head of
   * the queue; with it, the first playable entry ordered after that item. Archived
   * and unavailable entries are skipped rather than removed — playback never edits
   * the queue on the user's behalf.
   */
  async next(userId: string, afterMediaItemId?: string) {
    const rows = await this.database.select({ item: mediaItems, position: playbackQueue.position }).from(playbackQueue)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackQueue.mediaItemId))
      .where(eq(playbackQueue.userId, userId))
      .orderBy(asc(playbackQueue.position), asc(playbackQueue.addedAt));
    const start = afterMediaItemId ? rows.findIndex(({ item }) => item.id === afterMediaItemId) : -1;
    // An item played outside the queue leaves `start` at -1, so we fall back to the head.
    const candidates = rows.slice(start + 1);
    const found = candidates.find(({ item }) => item.available && item.archivedAt == null);
    return found ? toCatalogItem(found.item, null) : null;
  }

  /** True when the title is already queued, for media-page affordances. */
  async contains(userId: string, mediaItemId: string) {
    const [row] = await this.database.select({ mediaItemId: playbackQueue.mediaItemId }).from(playbackQueue)
      .where(and(eq(playbackQueue.userId, userId), eq(playbackQueue.mediaItemId, mediaItemId))).limit(1);
    return Boolean(row);
  }

  /** Ids of the caller's playable queued titles, oldest position first. */
  async playableIds(userId: string) {
    const rows = await this.database.select({ id: mediaItems.id }).from(playbackQueue)
      .innerJoin(mediaItems, eq(mediaItems.id, playbackQueue.mediaItemId))
      .where(and(eq(playbackQueue.userId, userId), eq(mediaItems.available, true), isNull(mediaItems.archivedAt)))
      .orderBy(asc(playbackQueue.position), asc(playbackQueue.addedAt));
    return rows.map((row) => row.id);
  }
}
