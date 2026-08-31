# Task 04: User-created collections

Status: complete

Wave: 2

Depends on: none (sequence after Task 03 within the wave — shared catalog/routes/api files)

## Description

Let users create, edit, and delete their own named collections and add/remove titles.

## Files to Create/Modify

- `src/server/db/schema.ts` + migration (`user_collections`, `user_collection_items`)
- `src/server/user-collections-service.ts` (new) + test
- `src/server/routes.ts` (CRUD under `/api/v1/me/collections`) + `routes.test.ts`
- `src/lib/api.ts` (collection CRUD + item add/remove/reorder, types)
- `src/routes/UserCollections.tsx` (new, from Profile) + test
- `src/routes/CatalogDetails.tsx` ("Add to collection" action) + test

## Technical Details

- `user_collections`: `id pk`, `userId fk on delete cascade`, `name not null`,
  `overview?`, timestamps. `user_collection_items`: `userCollectionId fk cascade`,
  `mediaItemId fk cascade`, `position int default 0`, `addedAt`, unique
  (userCollectionId, mediaItemId).
- Service enforces ownership on every op; add is idempotent; reorder rewrites
  positions transactionally. List a collection with its items resolved to catalog
  cards, excluding archived/unavailable from presentation (membership preserved).
- UI: "My Collections" management (create/rename/delete, drag or up/down reorder,
  remove item); media info gains an "Add to collection" menu (existing collections +
  create-new inline).

## Acceptance Criteria

- Requirements 4.1–4.5.
- A user cannot read or mutate another user's collection (403/404).
- Archived items stay in membership but don't render on the collection view.

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
