# Catalog Enrichment Requirements

## Functional Requirements

1. Movie parsing extracts a clean title and optional four-digit release year from common dotted, underscored, spaced, bracketed, and parenthesized release names.
2. Episode parsing supports case-insensitive `S01E02` and `1x02` forms and can derive a season number from a `Season 01`-style directory when it is absent from the filename.
3. Parsing preserves Unicode letters and punctuation in real titles, strips common release noise after the identity portion, and produces stable natural keys.
4. Scans enrich movies, series, seasons, and episodes with available titles, original titles, overview/description, release or air date, year, tagline, runtime, content rating, provider rating, genres, collection membership, and provider IDs.
5. A title can have ordered cast credits containing provider person ID, name, character, billing order, and a locally cached profile image.
6. Movie collections persist their provider ID, name, overview when available, local poster/backdrop artwork, and ordered local membership.
7. Provider recommendations are stored as edges and catalog responses include only available local items that resolve by provider ID.
8. ffprobe-derived technical metadata produces a deterministic quality profile including resolution label, video codec, audio codec/channel layout, HDR/SDR, and bitrate when available.
9. Quality badges are available in home, search, and details responses without running ffprobe during a read request.
10. All provider images needed by the catalog are downloaded to the server media store. Catalog responses expose local image API URLs only.
11. The local image API continues to resize and cache variants on demand; enrichment stores the original local asset once rather than downloading every display size.
12. Existing catalog items can be backfilled or explicitly refreshed without requiring file modification or a full destructive rescan.
13. Refreshes preserve playback progress, availability, file relationships, and user-authored metadata fields.
14. Catalog details expose description, year/date, runtime, quality, genres, collection, cast, seasons/episodes, and local recommendations where applicable.
15. Home and search expose year, runtime/season count, quality badge, genres/category, and collection label where available.
16. Runtime browsing, searching, image display, details, and playback make no TMDB or other internet requests.

## Technical Requirements

- Support both embedded PGlite development and PostgreSQL Docker deployments with the same Drizzle schema and migrations.
- Add indexed relational tables for genres, people/cast credits, collections/membership, and recommendation edges; use unique constraints that make provider refreshes idempotent.
- Define explicit provider DTOs at the TMDB boundary. Do not leak raw TMDB payloads into catalog services or frontend contracts.
- Use TMDB detail calls with appropriate appended responses where practical to reduce requests, while retaining the existing concurrency, rate-limit, timeout, retry, and cache behavior.
- Match provider results conservatively using media kind, normalized title, year/date, and provider IDs. A failed or ambiguous match must not overwrite a previously valid match.
- Enrichment failures are isolated per media item and recorded as actionable scan/refresh warnings; they must not abort unrelated files.
- Store enrichment version and last-attempt/last-success timestamps so unchanged files can be backfilled when the enrichment model changes.
- Store technical profile data derived at scan time, including ffprobe fields needed for HDR and quality decisions.
- Local artwork paths must be validated, contained within the configured media store, atomically written, and safe to serve through the existing image endpoint.
- API serializers must batch relationship queries and avoid per-item N+1 queries for home, search, details, and recommendations.
- Frontend rendering must tolerate partial metadata and missing/broken local images without collapsing layout.

## Legacy Parser Compatibility Corpus

At minimum, tests must cover:

- `The.Matrix.1999.1080p.BluRay.mkv` -> movie `The Matrix`, year `1999`
- `Amélie (2001).mkv` -> movie `Amélie`, year `2001`
- `Spider-Man.No.Way.Home.2021.2160p.mkv` -> movie punctuation retained, year `2021`
- `Show.Name.S01E02.Episode.Title.mkv` -> series, season 1, episode 2
- `Show Name 1x02 Episode Title.mkv` -> series, season 1, episode 2
- `Show Name/Season 03/04 - Episode Title.mkv` -> season 3, episode 4
- lower- and mixed-case season/episode markers
- malformed filenames returning a safe fallback or `null`, never throwing

## Data Precedence

1. User-authored override, when the product has an explicit override field.
2. Stable local file identity and ffprobe technical data.
3. Valid persisted provider metadata.
4. Newly fetched provider metadata.
5. Filename-derived display fallback.

## Quality Gates

- Focused unit tests for parsing, provider mapping, technical profile derivation, and serializers.
- Migration smoke tests against embedded PGlite and PostgreSQL-compatible SQL.
- Integration tests for scan/refresh idempotency and local-only recommendation resolution.
- HTTP tests proving enriched endpoints require authentication and return only local image URLs.
- An offline integration test blocks outbound network after enrichment and verifies home, search, details, images, and playback planning still work.
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run verify:production`

