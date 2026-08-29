# Task 05: Gallery and Shared Tests

Status: complete

## Description

Integrate all Wave 1 components into the development gallery and add cross-component accessibility and resilience coverage.

## Files to Create/Modify

- `src/dev/DevGallery.tsx` (exclusive)
- `src/components/media/media.integration.test.tsx` (exclusive shared/integration test)

## Technical Details

- Begin only after tasks 01-04 are complete; consume their public APIs without taking ownership of their component or individual test files.
- Add representative loaded, loading, failed-image, sparse-content, and responsive examples to the gallery.
- Test keyboard navigation/menu behavior, accessible names and states, fallback rendering, and representative component composition with Vitest/Testing Library.
- Keep fixtures local and deterministic; make no network/API calls.

## Steps

1. Review the completed Wave 1 exports and compose representative gallery sections.
2. Add integration tests for shared accessibility and image-failure expectations.
3. Run the full Bun quality gates and fix only files owned by this task; report upstream defects to the owning Wave 1 task.

## Acceptance Criteria

- Gallery displays all four components across representative states without network access.
- Shared tests exercise keyboard behavior, responsive-safe composition, and image loading/fallback behavior.
- No backend, auth, API, persistence, or production routing behavior is introduced.
- Full lint, test, and build commands pass.

## Verification

- `bun run test`
- `bun run lint`
- `bun run build`
