# Task 05: Development pages catalog

**Status:** pending

**Depends on:** tasks 01–04

## Description

Extend the existing development documentation into a component-and-page catalog. Add realistic mocked page previews while preserving every existing component entry and exact source example.

## Files ownership

### Files to create

- `src/dev/pageCatalog.tsx`

### Files to modify (minimal integration only)

- `src/dev/DevGallery.tsx`
- `src/dev/components/DevDocsShell.tsx`
- If required for category typing only: `src/dev/componentCatalog.tsx`

Do not edit production page implementations or rewrite existing component examples.

## Technical details

- Add a `Pages` group to the existing shell navigation; generalize the category type rather than duplicating the docs shell.
- Preserve all 14 existing UI/Media entries, their live previews, and their explicit static `source` strings exactly.
- Add focused entries for Auth, Server Picker, Library, and Media Details. Include meaningful state entries/previews for loading, empty, and error conditions so visual changes can be evaluated.
- Keep all fixture objects, generated data-URI artwork, and no-op/demo callbacks inside `src/dev/pageCatalog.tsx`.
- Pair each preview with an explicit static source string that accurately represents the example. Never derive code from rendered JSX or function serialization.
- Full-page previews should have a bounded/documentation-friendly viewport without breaking the page component's responsive behavior; identify the preview state clearly.
- Keep URL selection, mobile navigation, theme toggle, copy behavior, and invalid-selection fallback working.
- Ensure all new dev modules remain behind the current `import.meta.env.DEV` dynamic import boundary.

## Acceptance criteria

- Navigation includes distinct UI, Media, and Pages groups.
- Every page and its important states can be selected directly through `/dev`.
- The original 14 components are still documented with unchanged exact source snippets.
- Mock content cannot enter production page modules or production bundles.
- No new dependency is introduced.

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
```
