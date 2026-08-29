# Dose MainServer — setup, metadata, and offline behaviour

## Metadata provider token

Rich catalog metadata (descriptions, dates, ratings, genres, cast, collections,
recommendations, and artwork) comes from TMDB during scans. Configure a token:

1. Create `.env.local` in the MainServer root.
2. Add `TMDB_API_TOKEN=<your TMDB v4 read token>`.
3. Restart the dev server (`bun run dev`) or the container.

Without a token, scans still index files and derive technical/quality profiles
from ffprobe, but titles, artwork, and relationships are not fetched. The health
endpoint reports `metadata.tmdb: "configured" | "not_configured"`.

## Enrichment and refresh behaviour

- Enrichment runs during a scan for newly discovered or changed files. It writes
  additive fields and replaces provider-owned relationship sets idempotently, so a
  repeated scan never accumulates duplicate genres, cast, memberships, or edges.
- Unchanged files are skipped by a scan. To backfill metadata for existing titles
  — for example after adding a token or bumping the enrichment model — use the
  **Refresh metadata** action (admin only) in Manage libraries, which calls
  `POST /api/v1/libraries/:id/refresh`.
- Refresh is version-gated: it re-enriches titles whose stored enrichment version
  is older than the current model. Pass `?force=true` to re-enrich everything.
- Refresh is idempotent and isolates per-title failures; a transient provider
  error is reported without erasing previously valid metadata.

## Offline guarantees

After enrichment, the catalog is fully local:

- Browsing (home), search, details, cast, collections, and recommendations read
  only from the database.
- All artwork is downloaded once during enrichment and served from the local image
  API (`/api/v1/images/...`), which resizes and caches variants on demand. Catalog
  responses never contain a provider hostname.
- Playback planning (direct play / remux / per-track transcode) is derived from
  stored ffprobe data and performs no network calls.

The only flows that reach the internet are scans and explicit metadata refreshes.
`src/server/enrichment-offline.test.ts` enforces this by rejecting outbound network
access and verifying home, search, details, and playback planning still work.
