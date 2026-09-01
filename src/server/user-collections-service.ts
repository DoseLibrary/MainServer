import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.ts';
import { mediaItems, userCollectionItems, userCollections } from './db/schema.ts';
import { toCatalogItem } from './catalog-service.ts';
import { imageFileName, imageLocalUrl } from './images.ts';

export const userCollectionInput = z.object({
  name: z.string().trim().min(1).max(128),
  overview: z.string().trim().max(2000).optional(),
});
export const userCollectionPatch = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  overview: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export const userCollectionOrder = z.object({ mediaItemIds: z.array(z.string().uuid()).max(1000) });
/**
 * Setting a cover: either bytes the user uploaded (a data URL, so the request
 * stays plain JSON) or the poster of a title already in the collection.
 */
export const userCollectionImage = z.union([
  z.object({ dataUrl: z.string().regex(/^data:image\/(png|jpeg|jpg|webp|avif|gif);base64,[A-Za-z0-9+/=]+$/).max(12_000_000) }),
  z.object({ mediaItemId: z.string().uuid() }),
]);

export type UserCollectionInput = z.infer<typeof userCollectionInput>;
export type UserCollectionPatch = z.infer<typeof userCollectionPatch>;
export type UserCollectionImage = z.infer<typeof userCollectionImage>;

/** Filename prefix of covers this service wrote, so cleanup never touches provider art. */
const UPLOAD_PREFIX = 'collection';

/** What stores an uploaded cover. Kept narrow so tests can hand in a fake. */
export interface CollectionImageStore {
  save(data: Buffer, prefix?: string): Promise<string>;
  remove(name: string): Promise<void>;
}

/** Raised when a cover cannot be set; callers answer 400. */
export class UserCollectionImageError extends Error {
  constructor(message: string) { super(message); this.name = 'UserCollectionImageError'; }
}

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
  constructor(private readonly database: Database, private readonly images?: CollectionImageStore) {}

  /** The caller's collections, newest name-ordered, each with its membership count. */
  async list(userId: string) {
    const rows = await this.database.select({
      id: userCollections.id,
      name: userCollections.name,
      overview: userCollections.overview,
      imageName: userCollections.imageName,
      itemCount: sql<number>`count(${userCollectionItems.mediaItemId})::int`,
    }).from(userCollections)
      .leftJoin(userCollectionItems, eq(userCollectionItems.userCollectionId, userCollections.id))
      .where(eq(userCollections.userId, userId))
      .groupBy(userCollections.id, userCollections.name, userCollections.overview, userCollections.imageName)
      .orderBy(asc(userCollections.name));
    return rows.map((row) => ({ id: row.id, name: row.name, overview: row.overview ?? undefined, imageUrl: imageLocalUrl(row.imageName), itemCount: row.itemCount }));
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
      imageUrl: imageLocalUrl(collection.imageName),
      items: rows.map(({ item }) => toCatalogItem(item, null)),
    };
  }

  async create(userId: string, input: UserCollectionInput) {
    const [created] = await this.database.insert(userCollections)
      .values({ userId, name: input.name, overview: input.overview ?? null }).returning();
    return { id: created!.id, name: created!.name, overview: created!.overview ?? undefined, imageUrl: undefined, itemCount: 0 };
  }

  async update(userId: string, collectionId: string, patch: UserCollectionPatch) {
    await this.owned(userId, collectionId);
    const [updated] = await this.database.update(userCollections)
      .set({ ...(patch.name != null ? { name: patch.name } : {}), ...(patch.overview !== undefined ? { overview: patch.overview } : {}), updatedAt: new Date() })
      .where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId))).returning();
    return { id: updated!.id, name: updated!.name, overview: updated!.overview ?? undefined, imageUrl: imageLocalUrl(updated!.imageName) };
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

  /**
   * Point a collection at a cover, from an upload or from a member's poster.
   *
   * Provider posters are shared by every title that uses them, so only files
   * this service wrote itself are ever deleted when a cover is replaced.
   */
  async setImage(userId: string, collectionId: string, choice: UserCollectionImage) {
    const collection = await this.owned(userId, collectionId);
    let imageName: string;
    if ('dataUrl' in choice) {
      if (!this.images) throw new UserCollectionImageError('Uploads are unavailable');
      const bytes = Buffer.from(choice.dataUrl.slice(choice.dataUrl.indexOf(',') + 1), 'base64');
      if (bytes.length === 0) throw new UserCollectionImageError('That file is empty');
      try { imageName = await this.images.save(bytes, UPLOAD_PREFIX); }
      catch { throw new UserCollectionImageError('That file is not an image we can read'); }
    } else {
      // Only a title already in the collection can lend its poster, so this
      // never reveals whether some other item exists.
      const [row] = await this.database.select({ posterPath: mediaItems.posterPath }).from(userCollectionItems)
        .innerJoin(mediaItems, eq(mediaItems.id, userCollectionItems.mediaItemId))
        .where(and(eq(userCollectionItems.userCollectionId, collectionId), eq(userCollectionItems.mediaItemId, choice.mediaItemId)))
        .limit(1);
      if (!row) throw new UserCollectionImageError('That title is not in this collection');
      const name = row.posterPath ? imageFileName(row.posterPath) : '';
      if (!name) throw new UserCollectionImageError('That title has no poster to use');
      imageName = name;
    }
    await this.database.update(userCollections).set({ imageName, updatedAt: new Date() })
      .where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId)));
    await this.discardUpload(collection.imageName, imageName);
    return this.get(userId, collectionId);
  }

  async clearImage(userId: string, collectionId: string) {
    const collection = await this.owned(userId, collectionId);
    await this.database.update(userCollections).set({ imageName: null, updatedAt: new Date() })
      .where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId)));
    await this.discardUpload(collection.imageName, null);
    return this.get(userId, collectionId);
  }

  /** Removes a superseded upload; a shared provider poster is left in place. */
  private async discardUpload(previous: string | null, next: string | null) {
    if (!previous || previous === next) return;
    if (!previous.startsWith(`${UPLOAD_PREFIX}-`)) return;
    await this.images?.remove(previous);
  }

  private async owned(userId: string, collectionId: string) {
    const [collection] = await this.database.select().from(userCollections)
      .where(and(eq(userCollections.id, collectionId), eq(userCollections.userId, userId))).limit(1);
    if (!collection) throw new UserCollectionNotFoundError();
    return collection;
  }
}
