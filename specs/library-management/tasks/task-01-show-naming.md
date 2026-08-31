# Task 01: Robust show naming and episode classification

Status: complete

Wave: 1

## Description

Extend the shows branch of the parser to recognize the naming conventions in `requirements.md` §1, and add the movies-library episode guard. This is the concrete fix behind the "search only returns movies" report: episodes that fail to parse (or land in a mistyped library) are currently miscategorized.

## Files to Create/Modify

- `src/server/media-parser.ts` (exclusive)
- `src/server/media-parser.test.ts` (exclusive)

## Technical Details

- Support season-folder variants: `Season N`, `Season NN`, `S01`, and British `Series N` as season-folder ancestors, in addition to inline `SxxExx` and `NxEE` markers.
- Support `Episode N` and bare `NN` episode files inside a recognized season folder.
- Handle multi-episode files (`S01E01-E02`, `S01E01E02`) by taking the first episode; never misparse them into a wrong single identity.
- Add the classification guard: when `kind === 'movies'` but the stem/ancestors carry a clear episode marker, return null (skip) instead of emitting a movie.
- Keep Unicode-aware, explicit case-insensitive groups. No `[A-z]`/`[S|s]` bugs. Preserve stable natural keys for already-supported formats.
- Season 0 (specials) is valid; keep `validEpisodeNumbers` allowing season >= 0.
- Best-effort rows (anime absolute, concatenated `102`, date-based) may return null; document intent in comments and tests.

## Acceptance Criteria

- Every mandatory row in requirements §1 parses to the expected identity, including the real `The flash/Season 1/The flash S01E01.mp4` case.
- Movies-library files with episode markers return null (guarded), not a movie.
- Ambiguous inputs fail closed; parser never throws.
- All pre-existing parser tests still pass; natural keys unchanged for existing formats.

## Verification

- `bun run test -- media-parser`
- `bun run lint`
