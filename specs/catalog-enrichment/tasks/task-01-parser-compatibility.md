# Task 01: Legacy-Compatible Filename Parsing

Status: complete

Wave: 1

## Description

Expand the current typed parser using the useful behavior and examples from the legacy ContentServer movie and TV regexes.

## Files to Create/Modify

- `src/server/media-parser.ts` (exclusive)
- `src/server/media-parser.test.ts` (exclusive)

## Technical Details

- Support release-style movie title/year extraction, `SxxExx`, `NxEE`, and season-folder episode naming.
- Use Unicode-aware title handling and explicit case-insensitive groups; do not copy legacy `[A-z]` or `[S|s]` character-class bugs.
- Separate identity extraction from release-noise cleanup so behavior remains testable.
- Preserve stable natural keys and current return types unless an additive type is required.

## Acceptance Criteria

- Every compatibility example in `requirements.md` passes.
- Existing parser tests continue to pass.
- Parser never throws on arbitrary path strings.
- Ambiguous files do not silently become the wrong episode.

## Verification

- `bun run test -- media-parser`
- `bun run lint`

