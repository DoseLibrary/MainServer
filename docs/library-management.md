# Library management — watcher, archiving, re-match, trailers, sprites

This covers the operator surface added by the `library-management` mission. It
complements [setup.md](./setup.md) (metadata token and offline guarantees).

## Show naming conventions

Episodes are recognised from a broad set of layouts inside a **shows** library:

- Season folders: `Season 1`, `Season 01`, British `Series 3`, short `S01`.
- Inline markers: `S01E01`, `S01.E01`, lowercase, and release noise (`1080p`, etc.).
- In-folder episodes: `Episode 4`, `Ep 4`, `E4`, or a bare number (`04 - Title`).
- Multi-episode files (`S01E01-E02`, `S01E01E02`) map to the first episode.

A file carrying an episode marker inside a **movies** library is skipped, never
filed as a bogus movie. Parsing is driven by `library.kind`, so if a show library
is mistyped `movies`, its episodes will not appear — fix the library kind and
rescan. See `src/server/media-parser.ts`.

## Filesystem watcher

A recursive watcher (chokidar) reconciles libraries live: added/changed files are
scanned and enriched; deleted files are archived (below). It is off by default in
tests and controlled by environment:

- `LIBRARY_WATCH_ENABLED` (default `true`) — enable/disable the watcher.
- `LIBRARY_WATCH_DEBOUNCE_MS` (default `1000`, range 50–60000) — coalesce bursts of
  filesystem events before reconciling.

Library roots are tracked dynamically, so adding or removing a library updates the
watched set without a restart.

## Archive lifecycle and the admin media table

Deleting a file (or removing it from a library) **soft-archives** the title rather
than dropping it: `media_items.archived_at` is stamped. Archived titles are hidden
from all member-facing reads (home, search, categories, playback, trailers,
sprites) but remain visible to admins.

Manage them from **Profile → Media** (`MediaAdmin`):

- Filter All / Archived, search by title, sort by title or archived date.
- Per-title **Re-match** (below) and a two-step **Remove** (permanent, cascades to
  files, progress, and relationships).

Backing endpoints (admin-only): `GET /api/v1/admin/items`, `DELETE
/api/v1/admin/items/:id`.

## Manual TMDB re-match

When a title matched the wrong TMDB entry, re-match it from the media info page
(admin **Re-match metadata**) or the admin media table:

1. Search TMDB by title (`POST /api/v1/admin/items/:id/match/search`).
2. Pick the correct result to reassign and re-enrich (`.../match`).

Re-match is force-enrichment: it overwrites provider-owned fields and artwork, and
the manual choice persists across later rescans. Artwork candidates prefer
English-tagged (text) art first. See `metadata-match-service.ts` and
`artwork-service.ts`.

## Trailer plugin (local, offline)

The **Trailer Fetcher** plugin downloads YouTube trailers locally with `yt-dlp`, so
playback and the trailer hero never hot-link YouTube. Trailers stream from
`GET /api/v1/media/:id/trailer` (range requests) and the fullscreen trailer button
opens them in the app player.

Settings: preferred languages, include clips, maximum quality, storage
subdirectory, plus the update controls below.

### yt-dlp: install, path, and keeping it current

`yt-dlp` is **not** committed to the repo (see `.gitignore`). Provide it one of:

- Install at setup to a directory on `PATH` (recommended: pin a release and verify
  its SHA256), or
- Install via a package manager (`pipx install yt-dlp`, `brew`, `winget`), or
- Bake it into the container image.

Point the server at the binary with `YT_DLP_PATH` (default `yt-dlp`, resolved from
`PATH`). Use an absolute path for a bundled/pinned copy, e.g.
`YT_DLP_PATH=/opt/dose/bin/yt-dlp`.

Because YouTube changes often, the plugin keeps `yt-dlp` fresh automatically:

- `autoUpdate` (default on) runs `yt-dlp -U` before a run when the update interval
  has elapsed, throttled by a `.yt-dlp-updated` sentinel in the trailer storage root.
- `updateIntervalDays` (default 7) sets that cadence — effective weekly updates,
  since the plugin runs on its configured schedule.
- On a **failed download**, the plugin self-updates once and retries before marking
  the trailer failed. `yt-dlp -U` only works for a standalone binary; a
  package-manager install cannot self-update, and that failure is ignored safely.

Trailers only play when downloaded locally, and a large library rarely wants one per
title. `storageLimitGb` (default 0 = unlimited) caps the disk space managed trailers
may use. Titles are processed newest-added first, so the newest fill the budget and
older ones stay metadata-only; lowering the cap later evicts trailers of the oldest
titles until usage fits. The run summary reports `capped`, `evicted`, and usage.

If `yt-dlp` is missing, the plugin degrades to metadata only (no crash) and the run
summary says so.

## Preview sprite plugin (scrubber storyboards)

The **Preview Sprites** plugin builds one tiled storyboard sheet per file with
`ffmpeg`, used for scrubber hover previews. Settings: interval (seconds per tile),
columns, tile width/height, and max tiles. Generation is idempotent (a signature of
the source + settings) and degrades gracefully when `ffmpeg` is absent. Served via
`GET /api/v1/media/:id/sprites` (descriptor) and `.../sprites/sheet` (JPEG).

## Categories in the navbar

The navbar exposes **Categories** → `/categories` (an index merged by genre name
across libraries, with counts) → `/category/:key` (a grid). Per-genre pages at
`/genre/:id` and detail genre chips are unchanged.

## Required external binaries

- **yt-dlp** — local trailer downloads (`YT_DLP_PATH`). Optional; degrades to
  metadata only.
- **ffmpeg** / **ffprobe** — transcoding, subtitle extraction, technical profiles,
  and preview sprites. ffprobe data also powers offline playback planning.

## Offline verification

`src/server/library-management.e2e.test.ts` proves the mission end-to-end with the
network disabled after setup: mixed show/movie naming imports, search returns both
Movies and Shows groups, archiving hides a title from members while the admin table
keeps it, re-match re-enriches offline, and the trailer/sprite endpoints serve local
files (binaries mocked).
