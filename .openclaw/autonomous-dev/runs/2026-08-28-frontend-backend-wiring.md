# Frontend/backend catalog and playback wiring

## Outcome

- Wired grouped, debounced navbar search to the authenticated catalog API.
- Added typed search and playback API client contracts.
- Added browser codec/container capability detection.
- Added `/watch/:id` with playback negotiation and the custom VideoPlayer.
- Added Play actions to playable movie/episode details.
- Requested purpose-sized local WebP variants for every live catalog surface.

## Verification

- `bun run test`: 18 files, 137 tests passed.
- `bun run lint`: passed.
- `bun run build`: passed.
- `bun run verify:production`: passed.

## Review

PASS. Queries and route identifiers are encoded, stale search responses are
ignored, server-selected stream URLs remain authoritative, and image variants
are bounded by the backend. Remaining playback metadata work is subtitles,
audio-track selection, progress persistence, and preview storyboard generation.
