# Task 05: Marathon queue

Status: complete

Wave: 3

Depends on: none

## Description

Queue titles for marathon night and auto-advance through the queue during playback.

## Files to Create/Modify

- `src/server/db/schema.ts` + migration (`playback_queue`)
- `src/server/queue-service.ts` (new) + test
- `src/server/routes.ts` (`/api/v1/me/queue`: list/add/remove/reorder/clear) +
  `routes.test.ts`
- `src/lib/api.ts` (queue ops + types)
- `src/routes/Queue.tsx` (new, from Profile/navbar) + test
- `src/routes/Watch.tsx` (advance to next queued item on ended) + test
- `src/routes/CatalogDetails.tsx` ("Add to queue" action)

## Technical Details

- `playback_queue`: `userId fk cascade`, `mediaItemId fk cascade`, `position int`,
  `addedAt`, unique (userId, mediaItemId). Ordered per user.
- Service: add (append, idempotent), remove, reorder (transactional position rewrite),
  clear, and `next(userId, afterMediaItemId)` returning the next available,
  non-archived queued item (skipping archived/unavailable).
- Watch route: when launched in marathon mode (e.g. `/watch/:id?queue=1`), the player's
  existing `onNext`/`onEnded` seam advances to `next(...)`; exhausting the queue ends
  gracefully. Playback does not delete watched items from the queue automatically.
- Queue view: ordered list with remove/reorder, a "Start marathon" button, and a
  flag on any archived/unavailable entry.

## Acceptance Criteria

- Requirements 5.1–5.5.
- Auto-advance skips archived items and stops cleanly at the end.
- Add is idempotent; reorder persists.

## Verification

- `bun run lint` · `bun run test` · `bun run build` · `bun run verify:production`
