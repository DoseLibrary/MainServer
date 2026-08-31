# Task 08: Admin media table (archive review, remove, re-match)

Status: complete

## Implementation notes

`catalog-service.adminMediaList({archived,sort,direction,limit,offset,query})` returns `{items,total}` (top-level movie/series only, joined library name, poster URL, archived+archivedAt) and `removeItem(id)` hard-deletes with DB cascade. Routes `GET /api/v1/admin/items` (admin-guarded, paged/sortable/searchable) + `DELETE /api/v1/admin/items/:id`. `api.adminMediaItems` + `api.deleteItem`. UI: `MediaAdmin.tsx` modal (opened from a new "Media" admin card in Profile) — All/Archived filter, search, per-title Re-match (reuses `searchTmdb`/`matchTmdb` via a `RematchPanel`) and two-step Remove. Tests: catalog-service (list/search/remove+cascade), routes (admin-only, 204/404), MediaAdmin render.
Note: the raw `adminItems` method (Task 03 groundwork, all kinds, used by archive tests) was left intact; `adminMediaList` is the shaped/paged table query.

Wave: 4

Depends on: Task 03 (archive/admin queries), Task 05 (re-match backend)

## Description

Give admins a sortable table of library media to review archived titles, edit/correct metadata via TMDB re-match, and permanently remove titles. This is the admin surface Filip asked for: "a table where we can sort on archived etc to edit metadata / remove them."

## Files to Create/Modify

- `src/server/catalog-service.ts` or `admin-service.ts` (paged, sortable admin listing incl. archived + `archivedAt`) + tests
- `src/server/routes.ts` (`GET /api/v1/admin/items` list; `DELETE /api/v1/admin/items/:id` remove) + `src/server/routes.test.ts`
- `src/routes/MediaAdmin.tsx` (new) + `src/routes/MediaAdmin.test.tsx`
- `src/routes/router.tsx` (route) and a link from `Profile.tsx` (admin-only)
- `src/lib/api.ts` (list/remove/re-match client calls)

## Technical Details

- Admin list endpoint: paginate and sort by title, year, kind, added date, and archived state / `archivedAt`; filter by archived vs available and by library.
- Remove endpoint hard-deletes an item and cascades files, progress, and relationships (schema cascades where defined; explicit cleanup otherwise). Confirm destructive action in the UI.
- Re-match UI: search TMDB (Task 05), show candidates with poster/title/year, select to reassign and re-enrich; reflect the updated match inline.
- Reuse existing admin auth guards and the presentational component library; keep table keyboard-accessible. Do not hard-code data into presentational components.

## Acceptance Criteria

- Admins can list, sort (including by archived/`archivedAt`), and filter media.
- Selecting a candidate re-matches and re-enriches the item; the row reflects the new metadata.
- Remove permanently deletes with confirmation; members can no longer see it.
- Non-admins cannot reach the table or its endpoints.

## Verification

- `bun run test -- MediaAdmin`, `bun run test -- routes`, `bun run test -- admin` / `catalog-service`
- `bun run lint`, `bun run build`
