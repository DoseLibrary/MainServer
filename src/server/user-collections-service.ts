import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.ts';
import { mediaItems, userCollectionItems, userCollections } from './db/schema.ts';
import { toCatalogItem } from './catalog-service.ts';

export const userCollectionInput = z.object({
  name: z.string().trim().min(1).max(128),
  overview: z.string().trim().max(2000).optional(),
});
export const userCollectionPatch = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  overview: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export const userCollectionOrder = z.object({ mediaItemIds: z.array(z.string().uuid()).max(1000) });

export type UserCollectionInput = z.infer<typeof userCollectionInput>;
export type UserCollectionPatch = z.infer<typeof userCollectionPatch>;

/** Raised when a collection does not exist or belongs to another user; callers answer 404. */
export class UserCollectionNotFoundError extends Error {
  constructor() { super('User collection not found'); this.name = 'UserCollectionNotFoundError'; }
}

/**
 * Named per-user collections and their membership. Every operation is scoped by
 * `userId`, so one user can never read or mutate another's collection. Membership
 * survives archival: an unavailable title stays a member but is hidden from the
 * presented item list.
 */
export class UserCollectionsService {
  constructor(private readonly database: Database) {}

  /** The caller's collections, newest name-ordered, each with its membership count. */
  async list(userId: string) {
    const rows = await this.database.select({
      id: userCollections.id,
      name: userCollections.name,
      overview: userCollections.overview,
      itemCount: sql<number>`count(${userCollectionItems.mediaItemId})::int`,
    }).from(userCollections)
      .leftJoin(userCollectionItems, eq(userCollectionItems.userCollectionId, userCollections.id))
      .where(eq(userCollections.userId, userId))
      .groupBy(userCollections.id, userCollections.name, userCollections.overview)
      .orderBy(asc(userCollections.name));
    return rows.map((row) => ({ id: row.id, name: row.name, overview: row.overview ?? undefined, itemCount: row.itemCount }));
  }

  /** One collection with its visible items in position order. */
  async get(userId: string, collectionId: string) {
    const collection = await this.owned(userId, collectionId);
    const rows = await this.database.select({ item: mediaItems }).from(userCollectionItems)
      .innerJoin(mediaItems, eq(mediaItems.id, userCollectionItems.mediaItemId))
      .where(and(eq(userCollectionItems.userCollectionId, collectionId), eq(mediaItems.available, true), isNull(mediaItems.archivedAt)))
      .orderBy(asc(userCollectionItems.position), asc(mediaItems.sortTitle));
    return {
      id: collection.id,
      name: collection.name,
      overview: collection.overview ?? undefined,
      items: rows.map(({ item }) => toCatalogItem(item, null)),
    };
  }

  async create(userId: string, input: UserCollectionInput) {
    const [created] = await this.database.insert(userCollections)
      .values({ userId, name: input.name, overview: input.overview ?? null }).returning();
    return { id: created!.id, name: created!.name, overview: created!.overview ?? undefined, itemCount: 0 };
  }

  async update(userId: string, collectionId: string, patch: UserCollectionPatch) {
    await this.owned(userId, collectionId);
    const [updated] = await this.database.update(userCollections)
      .set({ ...(patch.name != null ? { name: patch.name } : {}), ...(patch.overview !== undefined ? { overview: patch.overview } : {}), updatedAt: new Date() })
      .where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId))).returning();
    return { id: updated!.id, name: updated!.name, overview: updated!.overview ?? undefined };
  }

  async remove(userId: string, collectionId: string) {
    await this.owned(userId, collectionId);
    await this.database.delete(userCollections).where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId)));
  }

  /** Appends a title to the end of the collection; adding a member again is a no-op. */
  async addItem(userId: string, collectionId: string, mediaItemId: string) {
    await this.owned(userId, collectionId);
    const [{ next } = { next: 0 }] = await this.database
      .select({ next: sql<number>`coalesce(max(${userCollectionItems.position}), -1)::int + 1` })
      .from(userCollectionItems).where(eq(userCollectionItems.userCollectionId, collectionId));
    await this.database.insert(userCollectionItems)
      .values({ userCollectionId: collectionId, mediaItemId, position: next })
      .onConflictDoNothing();
    return this.get(userId, collectionId);
  }

  async removeItem(userId: string, collectionId: string, mediaItemId: string) {
    await this.owned(userId, collectionId);
    await this.database.delete(userCollectionItems)
      .where(and(eq(userCollectionItems.userCollectionId, collectionId), eq(userCollectionItems.mediaItemId, mediaItemId)));
    return this.get(userId, collectionId);
  }

  /** Rewrites positions in one transaction; ids not in the collection are ignored. */
  async reorder(userId: string, collectionId: string, mediaItemIds: string[]) {
    await this.owned(userId, collectionId);
    await this.database.transaction(async (tx) => {
      const present = mediaItemIds.length === 0 ? [] : await tx.select({ mediaItemId: userCollectionItems.mediaItemId })
        .from(userCollectionItems)
        .where(and(eq(userCollectionItems.userCollectionId, collectionId), inArray(userCollectionItems.mediaItemId, mediaItemIds)));
      const known = new Set(present.map((row) => row.mediaItemId));
      let position = 0;
      for (const mediaItemId of mediaItemIds) {
        if (!known.has(mediaItemId)) continue;
        await tx.update(userCollectionItems).set({ position })
          .where(and(eq(userCollectionItems.userCollectionId, collectionId), eq(userCollectionItems.mediaItemId, mediaItemId)));
        position += 1;
      }
    });
    return this.get(userId, collectionId);
  }

  private async owned(userId: string, collectionId: string) {
    const [collection] = await this.database.select().from(userCollections)
      .where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId))).limit(1);
    if (!collection) throw new UserCollectionNotFoundError();
    return collection;
  }
}
