# Catalog enrichment — Waves 1-2

Date: 2026-08-29

## Outcome

Reconciled `specs/catalog-enrichment` status with the codebase and advanced the mission.

- Wave 1 (Tasks 01-03) was already implemented but unmarked: hardened Unicode parser + full corpus tests, enrichment schema (genres, people, cast_credits, collections, collection_members, recommendation_edges, media_technical_profiles + additive media_items columns) with migration `0006_catalog-enrichment.sql`, and a rich TMDB DTO client (movie/series/season/episode/collection/cast/genre/recommendation, append_to_response, validation). Marked complete.
- Task 05 (quality profile): new `media-profile.ts` derives resolution label / codecs / channel layout / HDR / bitrate from ffprobe; scanner extended with color_transfer/primaries/space fields and now upserts `media_technical_profiles` per file.
- Task 04 (enrichment pipeline): new `enrichment.ts` `EnrichmentService` — transactional, idempotent replace of additive fields, genres, billed cast (top 20), collection membership, and recommendation edges resolved only to available local items; caches poster/backdrop/collection/cast artwork locally. Wired into scanner ingest, isolated per item.

## Files

- `src/server/media-profile.ts` (+test), `src/server/enrichment.ts` (+test)
- `src/server/scanner.ts` (ffprobe fields, technical profile upsert, enrichment call)
- spec task/README status updates

## Verification

- `bun run lint` clean
- `bun run test` — 175 passed (24 files)
- `bun run build` green (server tsc + client)

## Remaining (Waves 3-5)

- Task 06: enriched catalog API (expose genres/cast/collection/recommendations/quality in home, search, details serializers; batch queries, no N+1, local image URLs only).
- Task 07: frontend enrichment contracts + data wiring.
- Task 08: details/discovery/recommendation UI.
- Task 09: backfill/refresh entry point (unchanged files currently skip enrichment on rescan; needs enrichment-version-gated refresh) + offline end-to-end verification.

No commits/pushes (autonomy budget: no VCS mutations without explicit request).
