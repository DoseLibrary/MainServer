# Wave 2 scanner/catalog slice — 2026-08-28

## Outcome

Added asynchronous mounted-library scanning, probing, optional TMDB enrichment,
persistent scan state, catalog APIs, and real catalog rendering in the V2 UI.

## Performance and resilience

- Immediate scan enqueue with in-memory and database duplicate coalescing.
- Bounded directory batches, fixed ingest workers, bounded ffprobe processes,
  and independently bounded/rate-limited TMDB requests.
- TMDB supports global 429 pauses, integer/HTTP-date Retry-After, exponential
  backoff with jitter, timeouts, deduplication, and a bounded TTL cache.
- Unchanged size/mtime files skip expensive probe and metadata work.
- Scan generations make missing-file reconciliation constant-size even above
  65,000 paths; hierarchy availability preserves series/seasons correctly.
- Heartbeats recover stale scans and prevent long discovery from false expiry.

## Frontend

- Library switching and real featured/section media mapping.
- Artwork, progress, media details, seasons, and episodes.
- Admin scan controls with non-overlapping bounded polling, cancellation,
  progress, failure, retry, and catalog refresh on completion.

## Verification

- `bun run lint`: pass
- `bun run test`: pass, 110/110 tests across 15 files
- `bun run build`: pass
- `git diff --check`: pass
- Independent performance/correctness review: PASS after three review cycles

## Remaining work

- Catalog search.
- Playback/range streaming and per-user progress writes.
- Continue Watching should sort by `lastWatchedAt` when playback UX is added.
- Live PostgreSQL/filesystem/TMDB integration testing remains deferred with
  Docker/runtime work.
