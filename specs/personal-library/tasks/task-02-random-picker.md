# Task 02: Random picker (backend + modal)

Status: complete

Wave: 1

Depends on: none

## Description

Give users a guided way to pick something to watch: fully random, or narrowed by
genre / year / rating / kind, landing on the media info page.

## Files to Create/Modify

- `src/server/catalog-service.ts` (`randomItem(filters)`) + `catalog-service.test.ts`
- `src/server/routes.ts` (`GET /api/v1/catalog/random`) + `routes.test.ts`
- `src/lib/api.ts` (`randomItem`, filter type)
- `src/components/media/RandomPickerModal.tsx` (new) + test
- Navbar entry to open the modal (`Home.tsx`/navbar) + test update

## Technical Details

- `randomItem({ kind?, genre?, yearMin?, yearMax?, ratingMin? })` selects one
  top-level, `available`, non-archived item matching all provided filters, uniformly
  at random. Prefer DB-side randomness (`order by random() limit 1`) scoped by the
  same visibility clauses the catalog uses; genre filter joins the genre tables.
- Route validates filters with zod (coerce numbers, bound ranges); returns the item's
  id (and enough to preview) or 404 when the pool is empty.
- Modal: "Surprise me" plus optional controls (kind, genre select from existing
  genres, year range, min rating). On pick → `navigate('/media/:id')`. Loading and
  empty ("nothing matches — loosen filters") states.

## Acceptance Criteria

- Requirements 2.1–2.5.
- Empty pool returns 404 and the modal shows the empty state, not a crash.
- Repeated calls vary the result across a non-trivial pool (statistical, not fixed).

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
