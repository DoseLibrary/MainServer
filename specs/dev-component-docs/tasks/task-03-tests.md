# Task 03: Documentation tests and release gates

**Status:** complete

## Description

Add focused tests for the documentation experience and run the full Bun verification suite. Cover the behaviors most likely to regress: complete navigation, focused selection, URL fallback, mobile menu accessibility, exact copy behavior, and development-only exclusion.

## Files ownership

### Files to create

- `src/dev/DevGallery.test.tsx`

### Files to modify

- Existing test setup or production-exclusion verification files only if a minimal compatibility adjustment is required

Do not change component or gallery behavior merely to bypass a failing assertion.

## Technical details

- Render within any required providers/router context already used by the application.
- Assert all 14 component names are available through navigation and that only the selected focused view is presented.
- Verify a navigation selection updates current state and the URL-addressable selection.
- Verify an invalid component key falls back deterministically.
- Exercise the mobile trigger's accessible name and expanded state, selection dismissal, and current navigation semantics.
- Mock the Clipboard API and assert the copied value equals the catalog's exact source string, including whitespace. Also cover a rejected/unavailable clipboard without an unhandled error.
- Assert semantic `pre` and `code` rendering and accessible copy feedback.
- Keep tests resilient: prefer role/name/current-state queries over implementation classes or snapshots.
- Retain or strengthen the production exclusion verification so catalog identifiers and distinctive docs text cannot appear in the production output.

## Steps

1. Add gallery rendering and complete navigation coverage.
2. Add selection, current-item, invalid-selection, and mobile-menu behavior tests.
3. Add exact clipboard success and failure tests plus semantic code assertions.
4. Run the complete test suite and correct genuine regressions within owned test/integration files.
5. Run lint, production build, explicit dev-exclusion verification, and dependency audit.

## Acceptance criteria

- Tests cover all 14 navigation entries and focused component switching.
- Tests cover `aria-current`, accessible mobile menu state/dismissal, and invalid selection fallback.
- Tests prove the copy action writes the exact static source string and fails safely.
- Tests verify semantic code presentation and accessible status feedback.
- Existing UI/media tests still pass.
- Production builds exclude `/dev`, the catalog, and docs-specific text.
- Lint, test, build, exclusion verification, and audit gates all pass.

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
bun audit
```
