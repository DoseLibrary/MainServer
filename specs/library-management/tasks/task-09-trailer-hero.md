# Task 09: Local trailer hero playback

Status: complete

## Implementation notes

`catalog.home()` now attaches `hasLocalTrailer` to the featured item (reusing `localTrailerSource`, which requires a preferred/ready/managed local file on an available, non-archived item). `CatalogItem.hasLocalTrailer?`. Home sets `featured.videoSrc = api.trailerUrl(id)` when the flag is set; `LibraryPage` already forwards `videoSrc`/`videoPoster` to `Hero`, which plays the trailer as the background and falls back to the static backdrop (and respects reduced motion). No render-time reference to YouTube. Test asserts `home.featured.hasLocalTrailer` defaults false.

Wave: 4

Depends on: Task 06 (local trailer endpoint)

## Description

Play the locally-downloaded trailer as the hero video background on Home/Details, falling back to the static backdrop when none exists.

## Files to Create/Modify

- `src/components/media/Hero.tsx` (use local trailer video source; graceful fallback) + its test
- `src/routes/Home.tsx` and/or `src/routes/CatalogDetails.tsx` (pass trailer source into Hero)
- `src/lib/api.ts` (trailer source resolution; already added in Task 06 — consume here)
- `src/server/catalog-service.ts` (include a `trailerUrl`/`hasTrailer` field on featured/details payloads if not present) + tests

## Technical Details

- Hero already supports an optional video-trailer background; wire the local `GET /api/v1/media/:id/trailer` URL as its source only when a trailer exists.
- Respect reduced-motion and existing hero behavior (mute, autoplay policy, fade to controls). No layout shift when falling back to the static backdrop.
- Keep all sources local; never reference YouTube at render time.

## Acceptance Criteria

- When a local trailer exists, the hero plays it as the background; otherwise it shows the static backdrop with no error.
- Reduced-motion and existing hero interactions are preserved.
- No network calls to external trailer hosts at render.

## Verification

- `bun run test -- Hero`, `bun run test -- Home` / `CatalogDetails`, `bun run test -- catalog-service`
- `bun run lint`, `bun run build`
