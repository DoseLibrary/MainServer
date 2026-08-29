# Task 01: Poster

Status: complete

## Description

Create a reusable typed poster card for cover art, metadata, and an optional action/link.

## Files to Create/Modify

- `src/components/media/Poster.tsx` (exclusive)
- Optional: `src/components/media/Poster.test.tsx` (exclusive)

## Technical Details

- Accept typed props for image source, title, optional subtitle/badge, aspect ratio/class overrides, and optional interaction.
- Render a stable aspect-ratio image area with loading treatment and an accessible fallback after image failure.
- Preserve native link/button semantics, visible focus, and responsive text truncation.

## Steps

1. Define and export the props and component.
2. Implement responsive Tailwind presentation and image load/error state.
3. Add focused tests if useful; do not edit shared tests or the gallery.

## Acceptance Criteria

- Renders required and optional content correctly.
- Broken or loading images do not collapse layout or expose a broken-image icon.
- Interactive variants are keyboard reachable and visibly focused.
- Contains no fetching, routing logic, auth, or backend coupling.

## Verification

- `bun run test -- Poster`
- `bun run lint`
- `bun run build`
