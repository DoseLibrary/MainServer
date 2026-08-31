# Task 01: Per-user settings store and Profile settings UI

Status: complete

Wave: 1

Depends on: none

## Description

Add a persistent per-user settings store and surface it in Profile. This is the seam
the Profile navbar entry was created for and the home for the collection-gaps toggle
(Task 03) and future preferences.

## Files to Create/Modify

- `src/server/db/schema.ts` + new migration (`user_settings`)
- `src/server/user-settings-service.ts` (new) + test
- `src/server/routes.ts` (`GET`/`PUT /api/v1/me/settings`) + `routes.test.ts`
- `src/lib/api.ts` (`getSettings`, `updateSettings`, `UserSettings` type)
- `src/routes/Profile.tsx` (Settings section) + `Profile.test.tsx`

## Technical Details

- `user_settings`: `userId uuid pk references users(id) on delete cascade`,
  `showCollectionGaps boolean not null default false`, timestamps. One row per user,
  created on demand (`ensureSettings`).
- Service: `get(userId)` (creates default if absent), `update(userId, patch)`
  validated by a zod schema mirroring the columns.
- Routes are member-scoped via the existing `requireUser`; a user only ever touches
  their own row. No admin needed.
- Profile gains a Settings card with a labelled toggle bound to the setting; optimistic
  update with revert on failure, consistent with existing Profile actions.

## Acceptance Criteria

- Requirements 1.1–1.4.
- Toggling in Profile persists (reload shows the saved value).
- Deleting a user removes the settings row (cascade).

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
