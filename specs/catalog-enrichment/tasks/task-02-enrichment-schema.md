# Task 02: Enrichment Persistence Schema

Status: complete

Wave: 1

## Description

Add the durable, queryable persistence model for richer item metadata and relationships.

## Files to Create/Modify

- `src/server/db/schema.ts` (exclusive)
- `src/server/db/migrations/*catalog-enrichment*` (exclusive)
- Schema/migration tests owned by this task

## Technical Details

- Extend media items with additive fields such as original title, release date, tagline, rating/content rating, metadata timestamps/version, and optional user override fields.
- Add normalized genres, people, cast credits, collections, collection membership, and recommendation edges.
- Add a stored technical profile to media files or a dedicated one-to-one table.
- Use foreign keys, indexes, ordered relationship fields, provider uniqueness, and idempotent conflict keys.

## Acceptance Criteria

- Fresh databases and existing databases migrate successfully.
- Migrations work with PGlite and PostgreSQL.
- Duplicate refreshes cannot create duplicate credits, genres, memberships, or recommendation edges.
- Deleting a library/item cleans up enrichment relationships safely.

## Verification

- Run migration/schema tests
- `bun run test`
- `bun run lint`

