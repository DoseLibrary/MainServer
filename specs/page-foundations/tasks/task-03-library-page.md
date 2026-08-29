# Task 03: Library page

**Status:** pending

## Description

Create the main browse page composition for server home, movie, and show libraries. Generalize the useful original structure—navigation, featured title, and ordered horizontal rows—without reproducing its data fetching or route coupling.

## Files ownership

### Files to create

- `src/pages/LibraryPage.tsx`
- Optional: `src/pages/LibraryPage.test.tsx`

Do not modify media primitives, the dev catalog, router, or another task's page file.

## Technical details

- Export typed navigation, featured-media, section, and library-item models plus page props.
- Compose the existing Navbar, Hero, Carousel, Poster, Button, and Skeleton primitives.
- Allow ordered arbitrary sections so home rows (popular, ongoing, watchlist, newly added) and genre rows use the same page.
- Items accept hrefs or supplied callbacks. Sections may expose an optional labelled href/action.
- Support loaded, loading, empty, and error states; accept retry behavior as a prop.
- Keep heading hierarchy sound, label each carousel, preserve horizontal scrolling on narrow viewports, and avoid nested interactive elements.
- Do not fetch, use sockets, select a random trailer, or wire application routes.

## Acceptance criteria

- A rich mocked home library and simpler movie/show genre libraries can be expressed through the exported props.
- Existing media components provide the visual behavior instead of page-local clones.
- All operational states render without layout collapse and supplied actions remain keyboard accessible.
- No API, router, store, or fixture dependency exists.

## Verification

```powershell
bun run lint
bun run test
bun run build
```
