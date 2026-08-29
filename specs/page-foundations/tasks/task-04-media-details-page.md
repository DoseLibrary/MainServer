# Task 04: Media details page

**Status:** pending

## Description

Create a unified movie/show details composition based on the strongest parts of the original detail routes: immersive artwork, clear metadata and actions, overview, and related collections.

## Files ownership

### Files to create

- `src/pages/MediaDetailsPage.tsx`
- Optional: `src/pages/MediaDetailsPage.test.tsx`

Do not modify media primitives, the dev catalog, router, or another task's page file.

## Technical details

- Export a discriminated movie/show details model and public page props.
- Compose existing Hero, Poster, Carousel, Navbar, Button, Skeleton, and Card primitives where suitable.
- Common content includes artwork, title, metadata, overview, optional badges, and supplied primary/secondary actions.
- Movie data may include cast and recommendations. Show data may include seasons; season selection is a supplied href/callback.
- Support loading and error states, optional back/navigation affordances passed by props, absent artwork, and sparse metadata.
- Keep collections accessible and responsive. Cast may use compact cards/avatars; recommendations and seasons should reuse Poster/Carousel rather than introduce a new media tile.
- Do not implement playback, watchlist/watched mutation, routing, metadata/image editing, or remote requests.

## Acceptance criteria

- Both movie and show detail shapes render through one coherent typed page API.
- Actions and collection selections are supplied externally and remain keyboard operable.
- Missing art, loading, and error states are stable and understandable.
- The production module contains no mocked data or service coupling.

## Verification

```powershell
bun run lint
bun run test
bun run build
```
