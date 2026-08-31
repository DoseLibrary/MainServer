# Task 02: Category pages in the navbar

Status: complete

Wave: 1

## Implementation notes

Genres are stored per library, so the categories index merges by normalized name across libraries (matching the aggregated home/search model). `catalog-service.categories(libraryId?)` lists `{key,name,count}` merged by `normalizedName`; `category(key, libraryId?)` aggregates titles across same-named genres. Endpoints `GET /catalog/categories` and `GET /catalog/categories/:key` (both accept optional `libraryId`). New routes `/categories` (`CategoriesPage`) and `/category/:key` (`CategoryPage`); Home navbar gained a Categories item. The existing per-library `/genre/:id` page and detail-page genre chips are left as-is.

## Description

Make genre/category pages reachable from the navbar. Genre pages already exist at `/genre/:id`; there is no way to reach them and no genres index.

## Files to Create/Modify

- `src/routes/CategoriesPage.tsx` (new) + `src/routes/CategoriesPage.test.tsx` (new)
- `src/routes/router.tsx` (add `/categories` route)
- `src/routes/Home.tsx` (populate navbar `items` with a Categories entry)
- `src/lib/api.ts` (add a categories/genres list call if not present)
- `src/server/catalog-service.ts` + `src/server/routes.ts` (genres-list endpoint if not already exposed)
- Relevant `*.test.ts(x)` for any new endpoint/list

## Technical Details

- Add a `Categories` navbar item that routes to a genres index for the active library.
- The index lists genres (name, count where cheap) and links each to the existing `/genre/:id` page.
- Reuse existing genre query helpers; return only genres with at least one available (non-archived) title.
- Preserve navbar accessibility (focus classes, `aria-current`) and the existing presentational `Navbar`/`LibraryPage` contracts — pass items via the `navigation.items` prop rather than hard-coding into the shell.

## Acceptance Criteria

- The navbar shows a Categories entry on the library view; activating it opens the genres index.
- Each listed genre links to its `/genre/:id` page.
- Archived-only genres do not appear.
- Keyboard/focus behavior matches other navbar items.

## Verification

- `bun run test -- Categories` and `bun run test -- Home`
- `bun run lint`
