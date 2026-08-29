# Decisions

- Keep the completed V2 frontend and evolve `MainServer/v2` into the unified Dose
  repository; legacy repositories remain read-only migration references.
- Use a modular monolith: one deployable Dose container and one PostgreSQL
  container. Scanner/transcode work may run as in-process background jobs first.
- Use PostgreSQL rather than MongoDB. Identity, libraries, episodes, permissions,
  and playback state are relational; JSONB remains available for flexible media
  probe/provider metadata.
- Persist container-relative media locations, never Windows/Linux host paths.
  Compose maps arbitrary host folders onto explicit `/media/...` destinations.
- Mount media read-only by default. Use `/config` for durable generated assets and
  `/transcode` for disposable FFmpeg output.
- Preserve owned Radix/Tailwind components, the development gallery, and the
  dark-first V2 design.
- Remove server registration, content-server authorization, and server picker;
  users authenticate directly with their local Dose instance.
- Prefer TypeScript throughout the application to share contracts with the UI.
- Jellyfin is the existing self-hosted alternative and a useful behavioral
  reference, but it does not replace the requested Dose product/UI migration.

## Implemented platform choices

- Fastify serves the versioned API and built Vite application from one process.
- Drizzle owns the typed PostgreSQL schema and checked-in SQL migrations.
- Bun 1.3.10 is pinned for dependency installation, builds, migrations, and the
  production server; FFmpeg is installed in the runtime image for later probes.
- Docker/runtime work is deferred at the user's request while application and
  frontend design/implementation continue. Local lint, tests, and builds remain
  required for each application wave.
- Local development uses embedded PGlite rather than SQLite. It has the same
  zero-service workflow while executing the production PostgreSQL schema,
  migrations, JSONB behavior, constraints, and query dialect. Docker production
  remains PostgreSQL 17.
- A fresh embedded development database is automatically seeded with
  `admin`/`admin` (overridable through `DOSE_DEV_USERNAME` and
  `DOSE_DEV_PASSWORD`). Seeding refuses non-development or non-embedded
  databases; production setup retains its 10-character minimum.
- Native embedded development accepts accessible absolute host library paths
  (including Windows drive paths). Docker/production retains realpath-verified
  containment below `/media`; the relaxed mode is selected only for development
  with PGlite.
- TMDB remains an optional scan-time provider. Missing configuration is surfaced
  at startup, health, and the admin profile. Adding a token and rescanning also
  enriches unchanged files; fetched artwork remains local for offline browsing.
- Browser authentication uses an opaque HttpOnly SameSite session cookie. Only
  a SHA-256 token digest is stored; passwords use Argon2id.
- Library roots are container paths strictly beneath `/media`; creation resolves
  real paths and rejects missing directories, files, and symlink escapes.
- Scans run asynchronously and return immediately. Filesystem discovery,
  per-file ingestion, ffprobe, and TMDB use separately bounded concurrency.
- TMDB enrichment is optional and failure-isolated. Its client uses a global
  request budget, shared 429 pause with Retry-After, bounded TTL dedup cache,
  transient retries, jitter, and request timeouts.
- Media files carry a last-seen scan generation. Missing reconciliation uses a
  constant-size query rather than a path anti-list, avoiding PostgreSQL's bind
  ceiling for large libraries.
- Catalog responses expose only local `/api/v1/images/...` artwork URLs. Scans
  download TMDB artwork into `/config/images` and backfill unchanged catalog
  items, so browsing does not require TMDB after a scan.
- Local artwork variants use Sharp/libvips. The image endpoint accepts bounded
  dimensions, fit, format, and quality; generated variants are persisted under
  `/config/images/.variants` and served with immutable browser caching.
- Playback negotiation returns a direct range URL when the source is compatible,
  otherwise it carries a validated opaque server plan into the stream endpoint.
  FFmpeg copies compatible tracks and only encodes incompatible tracks into a
  fragmented MP4. Non-MP4 transcode delivery is explicitly rejected for now.
- The browser builds a conservative capability profile with `canPlayType` and
  sends it before playback. The frontend always mounts the exact stream URL
  selected by the server, keeping direct-play/transcode decisions server-owned.
- `/profile` is the authenticated account hub. Member views contain only local
  account/privacy information; administrator controls are rendered from the
  server-provided role and reuse the existing library/family management flows.
