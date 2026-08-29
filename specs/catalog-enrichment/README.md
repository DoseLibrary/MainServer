# Catalog Enrichment

Enrich scanned movies and shows into a complete, offline-first catalog: reliable filename identity, locally cached artwork, descriptions and dates, genres, collections, cast, technical quality, and recommendations that point only to playable local media.

## Scope

- Preserve and harden the useful filename parsing behavior from the legacy ContentServer.
- Fetch richer provider metadata during scan or explicit metadata refresh only.
- Persist all catalog text, relationships, provider identifiers, and artwork required by the UI.
- Derive quality badges from local ffprobe data rather than provider claims.
- Expose enriched home, search, details, collection, cast, and recommendation responses.
- Render the enriched data in the existing catalog UI without requiring internet access after enrichment.

## Explicit Non-Goals

- Browsing or playing titles that are not present in a configured local library.
- Calling TMDB from catalog read endpoints or during playback.
- Replacing user-edited metadata during an automatic refresh.
- Full person biographies, provider-hosted trailers, reviews, or social features.

## Key Decisions

- Legacy parsing is migration input, not code to copy verbatim. Keep support for release-style movie names, years, `S01E02`, `1x02`, and season folders while replacing unsafe character classes such as `[A-z]` and `[S|s]` with Unicode-aware, tested parsing.
- Local scan identity and ffprobe remain authoritative for file identity and technical properties. TMDB enriches presentation metadata.
- Posters, backdrops, collection art, season art, stills, and cast profile images are downloaded once and served through the local image API at requested sizes.
- Recommendations are persisted as provider relationships but returned only when the recommended provider ID resolves to an available local catalog item.
- Genres/categories, cast, collections, and recommendations use relational tables so they are queryable and refreshable without replacing unrelated item state.
- The initial cast limit is the first 20 billed actors per title. Crew enrichment is deferred.

## Execution Plan

- Wave 1: parser compatibility, persistence model, and provider contracts.
- Wave 2: enrichment pipeline and technical-quality extraction.
- Wave 3: catalog APIs and frontend API contracts.
- Wave 4: enriched catalog UI.
- Wave 5: backfill, offline verification, and integration hardening.

## Task Status

- [x] Task 01: Legacy-compatible filename parsing
- [x] Task 02: Enrichment persistence schema
- [x] Task 03: Rich TMDB metadata client
- [x] Task 04: Offline enrichment and artwork pipeline
- [x] Task 05: Technical media profile and quality badges (derivation + scan persistence; API exposure in Task 06)
- [x] Task 06: Enriched catalog API
- [x] Task 07: Frontend enrichment contracts and data wiring
- [x] Task 08: Details, discovery, and recommendation UI
- [x] Task 09: Backfill and end-to-end offline verification

