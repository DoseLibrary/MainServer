# Task 03: Rich TMDB Metadata Client

Status: complete

Wave: 1

## Description

Extend the provider boundary to return typed movie, series, season, episode, collection, cast, genre, image, and recommendation metadata.

## Files to Create/Modify

- `src/server/tmdb.ts` (exclusive)
- `src/server/tmdb.test.ts` (exclusive)

## Technical Details

- Define internal DTOs rather than exposing raw response records.
- Prefer detail requests with appended credits, recommendations, content ratings/release dates, and external IDs where supported.
- Include season/episode detail lookup and collection detail lookup.
- Retain bounded concurrency, throttling, retry/backoff, timeout, and cache semantics.
- Validate and length-bound all external values and image paths.

## Acceptance Criteria

- Typed mapping covers every enrichment field required by the schema.
- Partial or malformed provider responses degrade safely.
- Rate limiting and retry tests remain deterministic.
- No provider call is introduced into catalog read or playback paths.

## Verification

- `bun run test -- tmdb`
- `bun run lint`

