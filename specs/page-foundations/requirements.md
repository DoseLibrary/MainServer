# Requirements: Page foundations

## Goal

Create enough real page composition to evaluate DOSE's v2 visual direction without coupling the UI to unfinished services. Every page must be inspectable in `/dev` using local mock data, including important loading, empty, and error states.

## Shared requirements

1. Create four page modules under `src/pages/`: `AuthPage`, `ServerPickerPage`, `LibraryPage`, and `MediaDetailsPage`.
2. Pages are typed presentational components. Data, hrefs, submit handlers, selection handlers, retry handlers, and other actions arrive as props.
3. Pages do not call `fetch`, access cookies/local storage, import router APIs, mutate Zustand application state, or embed mock fixtures.
4. Reuse the existing Button, Input, Card, Spinner, Skeleton, Tabs, Navbar, Hero, Carousel, Poster, and other existing primitives where appropriate. Do not clone their behavior in page-local components.
5. Every page is responsive from narrow mobile layouts through desktop and retains visible keyboard focus, semantic headings, labelled navigation/forms/statuses, useful image alt text, and native link/button/form behavior.
6. Loading preserves the approximate final layout with skeletons or an appropriately labelled busy region. Empty and error states explain the condition and expose supplied recovery actions where applicable.
7. The development catalog adds a `Pages` group with mocked examples for all four pages and their meaningful variants. Fixtures and preview-only event handlers stay in `src/dev/`.
8. The existing 14 `UI` and `Media` catalog entries must remain present, behaviorally unchanged, and paired with their exact authored static source snippets.
9. Page examples have explicit static source strings rendered verbatim by the existing code block. Do not serialize JSX, DOM, or functions.
10. `/dev`, page catalog data, descriptions, fixtures, and example source remain absent from production bundles through the existing development-only import boundary.
11. Add no dependency and use Bun for all package operations and checks.

## Page requirements

### AuthPage

- Supports a typed `login` or `register` mode rather than separate duplicated layouts.
- Shows brand, heading, supporting copy, username and password fields, plus email in register mode.
- Uses a real form and supplied submit callback. Accepts controlled/default field values only where needed for demo/test composition.
- Supports submitting/disabled state and field/form-level error messaging with accessible associations.
- Provides a supplied alternate-mode href and label.

### ServerPickerPage

- Presents available content servers with name, address/status metadata, and a supplied selection callback or href.
- Supports loading, empty, and error variants. Error may expose a supplied retry callback; empty may expose a supplied connect/add action.
- A single server must still render predictably; automatic redirect belongs to future application logic.

### LibraryPage

- Composes Navbar, optional Hero, and ordered media sections using Carousel and Poster.
- Supports a home-style mixture of sections (continue watching, watchlist, newly added) and genre-driven movie/show lists through one typed model.
- Items expose supplied hrefs/callbacks; section-level links are optional.
- Supports loading, empty, and error states without fetching.

### MediaDetailsPage

- Supports `movie` and `show` variants through typed data.
- Displays backdrop/poster, title, metadata, overview, primary/secondary supplied actions, and optional badges.
- Movie details can show cast and recommendations; show details can show seasons. Keep both as presentational collections.
- Supports loading and error states and tolerates absent artwork/optional metadata.
- Playback, season/episode routing, metadata editing, image administration, watch-progress mutation, and API calls are out of scope.

## Development documentation

- `DevDocsShell` must support the new `Pages` category without hard-coding only UI/Media.
- Navigation remains URL-addressable, keyboard operable, and responsive; `aria-current="page"` continues to mark the selected entry.
- Selecting a page displays one focused full-width preview suitable for judging realistic layout, followed by exact copyable example code.
- Page previews should include separate catalog entries for useful states when that makes comparison easier; all remain grouped under `Pages`.

## Non-goals

- Production router wiring or route naming.
- API clients, authentication/session logic, server-token validation, persistence, sockets, search, player/casting, admin/settings, metadata editing, or real TMDB assets.
- A generic page builder, Storybook, MDX, fixture service, visual-regression framework, or new design dependency.

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
bun audit
```
