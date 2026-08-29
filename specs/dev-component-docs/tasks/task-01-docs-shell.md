# Task 01: Documentation shell

**Status:** complete

## Description

Replace the long gallery presentation with the reusable shell for a focused component documentation page. Establish responsive desktop and mobile navigation, selection state, and the preview/code presentation primitives that the catalog task will populate.

## Files ownership

### Files to modify

- `src/dev/DevGallery.tsx`

### Files to create

- `src/dev/components/DevDocsShell.tsx`
- `src/dev/components/ComponentExample.tsx`
- `src/dev/components/CodeBlock.tsx`

Do not modify component implementation files or production routing in this task.

## Technical details

- Keep `DevGallery` as the route-level entry point.
- Use URL-addressable selection under `/dev` with browser-native APIs or existing React Router APIs; do not add routing or state dependencies.
- Render a persistent labelled sidebar on desktop and an accessible menu on narrow screens.
- The current component navigation item must expose `aria-current="page"`.
- The mobile control must expose its expanded state, allow dismissal, and close when a component is selected.
- `ComponentExample` should compose a titled live-preview region and a `CodeBlock` without owning catalog data.
- `CodeBlock` accepts an exact source string, renders `pre > code`, preserves whitespace, supports horizontal overflow, and copies that exact string.
- Copy success/failure is communicated accessibly. Treat unavailable or rejected clipboard APIs safely.
- Reuse existing Button/Modal or Radix-backed primitives where they improve accessibility; add no dependencies.

## Steps

1. Extract the shared shell, example panel, and code block from the existing monolithic gallery.
2. Implement responsive desktop and mobile navigation using a temporary small shell fixture.
3. Implement focused selection with deterministic fallback for an absent or invalid component key.
4. Add the static-source code display and copy interaction.
5. Preserve theme switching and visually verify keyboard focus and narrow-screen overflow.

## Acceptance criteria

- `/dev` displays one focused documentation item rather than every section in a long page.
- Desktop and mobile users can reach every supplied navigation item.
- The selected item is visually distinct and programmatically current.
- Selection is URL-addressable and invalid selection falls back safely.
- A live preview and semantic, copyable code block render through shared presentation components.
- No new dependency is introduced.
- The production-only route behavior is untouched.

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
```
