# Task 06: Integration tests

**Status:** pending

**Depends on:** tasks 01–05

## Description

Add integration coverage across the completed page layer and expanded development documentation, then run every release gate.

## Files ownership

### Files to create or modify

- `src/pages/pages.integration.test.tsx`
- `src/dev/DevGallery.test.tsx`
- `scripts/verify-production.mjs` only if the existing verifier needs narrowly scoped strengthening for the new dev catalog markers

Do not redesign page APIs or catalog content in this task unless correcting a verified integration defect.

## Technical details

- Render all four page modules with representative typed props.
- Cover auth login/register fields and submission, server selection and operational states, library sections and empty/error handling, and movie/show details with supplied actions.
- Assert semantic landmarks/headings, accessible names, status/error announcements, disabled/busy states, href behavior, and callbacks rather than brittle Tailwind class strings.
- Extend dev-gallery tests to assert the `Pages` group, URL selection, mobile/desktop navigation contract, page state previews, and exact source rendering/copy behavior.
- Explicitly assert that the 14 original component entries remain available.
- Verify unknown selection fallback and browser back/forward behavior remain intact.
- Strengthen production verification only as needed to ensure `DevGallery`, `componentCatalog`, `pageCatalog`, page demo descriptions, and static example source are absent from `dist`.

## Acceptance criteria

- Tests cover all page variants and key supplied interactions without real network/navigation.
- Catalog tests prove both the new Pages section and preservation of the existing component documentation.
- Lint, all tests, production build, production exclusion, and audit pass with Bun.
- No commit or push is made.

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
bun audit
```
