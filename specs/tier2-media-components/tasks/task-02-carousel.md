# Task 02: Carousel

Status: complete

## Description

Create a typed horizontal media carousel that composes arbitrary React items.

## Files to Create/Modify

- `src/components/media/Carousel.tsx` (exclusive)
- Optional: `src/components/media/Carousel.test.tsx` (exclusive)

## Technical Details

- Accept typed items/content, accessible label, and optional heading/class overrides.
- Use responsive horizontal overflow with previous/next controls that scroll by a predictable viewport-relative amount.
- Controls must be native buttons with accessible names, visible focus, disabled boundary behavior, and keyboard operability.
- Preserve child image loading/fallback behavior rather than introducing data or image-fetching logic.

## Steps

1. Define a composable typed API and semantic structure.
2. Implement responsive scrolling and boundary-aware controls.
3. Add focused interaction tests if useful; do not edit shared tests or the gallery.

## Acceptance Criteria

- Items remain usable by touch, mouse, and keyboard at mobile and desktop widths.
- Controls expose correct names and disabled states and do not trap focus.
- Empty content renders safely without unusable controls.
- Contains no backend, auth, API, or app-state logic.

## Verification

- `bun run test -- Carousel`
- `bun run lint`
- `bun run build`
