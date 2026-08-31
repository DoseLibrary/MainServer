# Library Management

Turn Dose from a scan-once catalog into a living, self-maintaining library: media appears and disappears automatically as files change on disk, shows are recognized across many naming conventions, administrators can correct or remove titles, and presentation gains locally-served trailers and scrubber previews. Everything stays offline-first — only metadata fetch and trailer download touch the network.

## Scope

- Automatically detect filesystem changes in configured libraries and reconcile the catalog (add, update, archive).
- Recognize TV episodes across the naming conventions real users have on disk.
- Archive titles whose files were deleted instead of hard-deleting them: hidden from member-facing pages, retained and editable by admins.
- Give administrators a sortable media table to review, re-match metadata for, and remove titles.
- Let administrators correct a mistaken match by searching TMDB and reassigning the provider identity, then re-enriching.
- Download YouTube trailers to local storage and play them as the hero background.
- Generate scrubber preview sprite sheets as a configurable plugin and serve them to the player.
- Make category (genre) pages reachable from the navbar.
- Replace the username navbar button with a Profile entry that works for members. (Done.)

## Explicit Non-Goals

- Real-time collaborative editing or multi-admin conflict resolution.
- Full manual metadata authoring (free-text overrides beyond re-matching provider identity) — deferred to a later mission.
- Cloud/remote library sources; watching is local-filesystem only.
- Date-based daily-show and pure absolute-numbering anime as first-class identities (best-effort only; see requirements).
- Persistent per-user profile settings UI beyond the existing Profile route (the Profile entry is the seam for later work).

## Key Decisions

- **Watcher reconciles, scanner is authoritative.** The watcher debounces filesystem events and triggers the existing incremental scan/enrich path rather than mutating the catalog directly. A periodic full scan remains the backstop.
- **Archive is soft state on the item, driven by file availability.** A deleted file marks its `mediaFiles.available = false`; an item with no available files becomes archived (`available = false` plus an explicit `archivedAt`). Playback progress, watchlist, and metadata are preserved. Admins can hard-remove.
- **Library kind stays authoritative for movie-vs-episode classification.** A file with a clear episode marker found inside a `movies` library is skipped (not imported as a bogus movie) so a mistyped library can be diagnosed instead of silently polluting the catalog.
- **Parsing is additive and test-driven.** Every supported convention is a row in the requirements compatibility table with an expected parse; ambiguous inputs must fail closed rather than guess a wrong episode.
- **Trailers and sprites are plugins with settings**, reusing the existing plugin framework (`trailer-fetcher` pattern). Downloaded trailers and generated sprites are cached locally and served through the local media/image APIs — never hot-linked.
- **yt-dlp and ffmpeg are external binaries** invoked by plugins; their absence degrades gracefully (plugin reports unavailable, catalog still works).
- **Re-match reuses the enrichment pipeline.** Reassigning a TMDB id re-runs enrichment for that item only; user-initiated re-match overrides the existing match even when automatic refresh would not.

## Execution Plan

- **Wave 1 — Independent foundations:** robust show naming (parser); category navigation.
- **Wave 2 — Data and watching:** archive schema + read-path filtering; library file watcher; TMDB re-match backend.
- **Wave 3 — Media plugins:** local trailer download; scrubber preview sprite generation.
- **Wave 4 — Admin and presentation UI:** admin media table (archive review, remove, re-match); local trailer hero playback.
- **Wave 5 — Verification:** end-to-end offline verification and docs.

Tasks in the same wave own non-overlapping files and may run in parallel. A wave starts only after its dependencies pass verification (`bun run lint`, `bun run test`, `bun run build`, `bun run verify:production`).

## Task Status

- [x] Task 01: Robust show naming and episode classification
- [x] Task 02: Category pages in the navbar
- [x] Task 03: Archive schema and member-facing filtering
- [x] Task 04: Library filesystem watcher and reconciliation
- [x] Task 05: TMDB re-match backend
- [x] Task 06: Local trailer download plugin
- [x] Task 07: Scrubber preview sprite plugin
- [x] Task 08: Admin media table (archive review, remove, re-match)
- [x] Task 09: Local trailer hero playback
- [ ] Task 10: End-to-end offline verification and docs
- [x] Profile navbar entry (shipped ahead of the spec)
