# Page foundations

Build the first presentational page layer for the DOSE v2 frontend and expose every page in the development-only documentation catalog with realistic mocked states. The slice translates the useful shape of the original MainServer screens into typed React components while deliberately postponing application routing, APIs, authentication, playback, and administration.

## Constraints

- Page components are typed, presentational, responsive, and composed from the existing UI and media components.
- Callbacks and links are supplied through props. Pages do not fetch, navigate, authenticate, or own server state.
- Mock data belongs only in the development catalog and tests; production page modules contain no fixtures.
- `/dev` remains guarded by `import.meta.env.DEV` and excluded from production output.
- The existing 14 component entries, their previews, and their exact static source snippets remain intact.
- Use the current Bun/React/Vite/Tailwind stack and add no dependency.
- Work remains local: do not commit or push.

## Legacy grounding

- `pages/login.js` and `pages/register.js`: centered branded authentication forms over a media backdrop.
- `pages/index.js`: content-server selection with loading and failure handling.
- `pages/server/[server]/index.js`, `movies/index.js`, and `shows/index.js`: navigation, featured media, and grouped horizontal rows.
- Movie/show detail routes: backdrop, poster, metadata, actions, overview, recommendations, cast/seasons.

## Waves

### Wave 1 — Page components (parallel)

- [ ] [task-01-auth-page](tasks/task-01-auth-page.md)
- [ ] [task-02-server-picker-page](tasks/task-02-server-picker-page.md)
- [ ] [task-03-library-page](tasks/task-03-library-page.md)
- [ ] [task-04-media-details-page](tasks/task-04-media-details-page.md)

Each task owns exclusive page files and may create only its own focused test file.

### Wave 2 — Development pages catalog

- [ ] [task-05-dev-pages-catalog](tasks/task-05-dev-pages-catalog.md)

### Wave 3 — Integration verification

- [ ] [task-06-integration-tests](tasks/task-06-integration-tests.md)

## Task status

- [x] task-01-auth-page — Authentication page shell and states.
- [x] task-02-server-picker-page — Server selection page and states.
- [x] task-03-library-page — Featured library page and grouped media rows.
- [x] task-04-media-details-page — Movie/show detail presentation.
- [x] task-05-dev-pages-catalog — Add a Pages section with mocked page examples.
- [x] task-06-integration-tests — Verify page behavior, catalog preservation, and production exclusion.

All final gates pass: `bun run lint`, `bun run test` (36), `bun run build`, `bun run verify:production`, `bun audit`.

## Final gates

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
bun audit
```
