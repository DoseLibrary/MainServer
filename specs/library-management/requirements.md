# Requirements

## 1. Show naming compatibility

The shows parser must classify the following paths (library kind `shows`). Paths use `/`; the scanner normalizes `\`. Expected output is `series` / `season` / `episode`.

| Path | series | season | episode | Notes |
|------|--------|--------|---------|-------|
| `The flash/Season 1/The flash S01E01.mp4` | The flash | 1 | 1 | Reported real case (`D:\Shows\The flash\Season 1\The flash S01E01.mp4`). |
| `Show.Name/Season 01/Show.Name.S01E02.mkv` | Show Name | 1 | 2 | Dotted release name. |
| `Show Name/Season 2/Show Name s02e05.mkv` | Show Name | 2 | 5 | Lowercase marker. |
| `Show Name/Season 1/Show Name 1x03.mkv` | Show Name | 1 | 3 | `NxEE` marker. |
| `Show Name/Season 1/03 - Title.mkv` | Show Name | 1 | 3 | Bare episode number in season folder. |
| `Show Name/Season 1/Episode 4.mkv` | Show Name | 1 | 4 | `Episode N` in season folder. |
| `Show Name/S01/S01E06.mkv` | Show Name | 1 | 6 | Short `S01` season folder. |
| `Show Name/Series 3/Show Name S03E02.mkv` | Show Name | 3 | 2 | British `Series N` season folder. |
| `Show.Name.S01E01-E02.mkv` | Show Name | 1 | 1 | Multi-episode → first episode; do not misparse. |
| `Show.Name.S01E01E02.mkv` | Show Name | 1 | 1 | Multi-episode concatenated → first episode. |
| `Show Name/Season 1/Show Name S01E07 1080p WEB-DL x265.mkv` | Show Name | 1 | 7 | Release noise stripped from episode title. |
| `Show Name/Season 10/Show Name S10E11.mkv` | Show Name | 10 | 11 | Two-digit season and episode. |
| `Show Name/Specials/Show Name S00E01.mkv` | Show Name | 0 | 1 | Season 0 specials allowed. |

### Best-effort (documented, may return null rather than a wrong guess)

| Path | Behavior |
|------|----------|
| `[Group] Show Name - 24 [1080p].mkv` (anime absolute numbering, no season) | Optional: season 1, episode 24. If not implemented, return null — never a movie. |
| `Show Name/Season 1/Show.Name.102.mkv` (concatenated `SxEE` with no separator) | Only parse when a season folder is absent and digits are unambiguous; otherwise null. |
| `Daily Show/2021.03.14.mkv` (date-based) | Out of scope; return null. |

### Classification guards

- A file with a clear episode marker (`SxxExx`, `NxEE`, or a `Season N`/`Series N`/`Sxx` folder ancestor) that is scanned inside a **movies** library must be skipped, not imported as a movie.
- Ambiguous files must fail closed (return null) rather than produce a wrong season/episode identity.
- Parser must never throw on arbitrary path input.
- All existing `media-parser.test.ts` cases continue to pass; natural keys remain stable for already-supported formats.

## 2. Archive semantics

- Deleting a file sets `mediaFiles.available = false`. An item (movie or episode) with no available files is archived: `available = false` and `archivedAt` set to the reconciliation time.
- Season and series archive roll up: a season with no available episodes archives; a series with no available seasons archives.
- Re-appearance of a file clears the archive (`archivedAt = null`, `available = true`).
- Member-facing endpoints (home, search, genre, collection, person, details recommendations) never return archived items.
- Playback progress, watchlist entries, and enriched metadata are retained while archived.
- Admins can permanently remove an archived (or available) item, cascading to its files, progress, and relationships.

## 3. Filesystem watcher

- Watches each library `rootPath` recursively for create/modify/delete/rename of video files (`VIDEO_EXTENSIONS`).
- Events are debounced and coalesced; a burst of changes triggers at most one incremental scan pass per library within the debounce window.
- Add/modify runs the existing scan+enrich path for the affected library; delete triggers reconciliation that archives now-missing items.
- The watcher is resilient to transient errors and does not crash the server; it logs and continues.
- A configuration flag enables/disables watching; the periodic full scan remains as a backstop.

## 4. TMDB re-match

- `GET /api/v1/admin/tmdb/search?type=movie|series&q=` returns candidate matches (id, title, year, overview, poster) from TMDB — admin only.
- `POST /api/v1/admin/items/:id/match` `{ tmdbId }` reassigns the item's `providerIds.tmdb`, marks it user-matched, and re-runs enrichment for that item only, overriding the previous automatic match.
- Re-match must not touch unrelated items and must not require a full library scan.

## 5. Local trailers

- A plugin downloads the preferred YouTube trailer per matched title via `yt-dlp` to local storage and records the local file reference.
- `GET /api/v1/media/:id/trailer` streams the local trailer with range support, or 404 when none.
- The Hero uses the local trailer as its video background when present; falls back to the static backdrop otherwise.
- No trailer playback requires the internet after download.

## 6. Scrubber preview sprites

- A plugin generates storyboard sprite sheets per media file via `ffmpeg`, with settings for interval, tile dimensions, columns, and quality.
- Sprites and their coordinate metadata are cached locally and served for the `VideoPlayer` `thumbnails` prop.
- Generation is idempotent and skips files whose sprite is current.

## 7. Category navigation

- The navbar exposes a Categories entry that reaches genre pages (`/genre/:id`).
- A genres index lists available categories for the active library and links to each genre page.
- Focus/keyboard and existing navbar accessibility conventions are preserved.

## 8. Profile navbar entry (done)

- The navbar action button reads "Profile", links to `/profile`, and keeps the username in its accessible name. Works for members and admins.

## Global verification

- `bun run lint`, `bun run test`, `bun run build`, `bun run verify:production` all pass.
- `bun audit` reports no new advisories.
- No fixtures or dev-only code leak into `dist`.
