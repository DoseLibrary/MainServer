# Task 04: Navbar

Status: complete

## Description

Create a typed responsive media-site navbar with brand, navigation, and optional actions.

## Files to Create/Modify

- `src/components/media/Navbar.tsx` (exclusive)
- Optional: `src/components/media/Navbar.test.tsx` (exclusive)

## Technical Details

- Accept typed brand content/image, navigation items, active item identifier, and optional action content.
- Provide a mobile menu controlled by a native button with accurate `aria-expanded`/`aria-controls`; Escape closes it and focus behavior remains predictable.
- Brand imagery must have explicit accessible labeling and a loading/error fallback.
- Use presentation-only local UI state; do not inspect routes or authentication state.

## Steps

1. Define typed navigation and component props.
2. Implement desktop/mobile layouts, image states, and keyboard behavior.
3. Add focused tests if useful; do not edit shared tests or the gallery.

## Acceptance Criteria

- Navigation is semantic and fully operable with keyboard alone.
- Mobile menu state is announced, Escape closes it, and focus indicators are visible.
- Brand image failure renders a stable labeled fallback.
- Contains no router, backend, auth, or API integration.

## Verification

- `bun run test -- Navbar`
- `bun run lint`
- `bun run build`
