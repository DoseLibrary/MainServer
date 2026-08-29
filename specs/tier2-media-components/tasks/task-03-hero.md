# Task 03: Hero

Status: complete

## Description

Create a typed responsive media hero with backdrop artwork, copy, and optional calls to action.

## Files to Create/Modify

- `src/components/media/Hero.tsx` (exclusive)
- Optional: `src/components/media/Hero.test.tsx` (exclusive)

## Technical Details

- Accept typed image, title, optional eyebrow/description/metadata, action content, alignment, and class overrides.
- Use an accessible image strategy with loading placeholder, failure fallback, readable overlay contrast, and stable responsive sizing.
- Actions must retain their native link/button semantics and visible keyboard focus.

## Steps

1. Define and export a presentational props API.
2. Implement responsive artwork, overlay, fallback, and content layout.
3. Add focused tests if useful; do not edit shared tests or the gallery.

## Acceptance Criteria

- Content remains legible with loaded, loading, failed, or absent artwork.
- Layout adapts without overflow on mobile and desktop.
- All actions are keyboard reachable with meaningful accessible names.
- Contains no fetching, auth, API, or routing decisions.

## Verification

- `bun run test -- Hero`
- `bun run lint`
- `bun run build`
