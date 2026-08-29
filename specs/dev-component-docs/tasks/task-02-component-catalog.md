# Task 02: Complete component catalog

**Status:** complete

## Description

Populate the documentation shell with all existing UI and media components. Pair every rendered preview with an explicit source string that exactly matches the authored example shown to developers.

## Files ownership

### Files to modify

- `src/dev/DevGallery.tsx`

### Files to create

- `src/dev/componentCatalog.tsx`

### Files optionally modify

- `src/dev/components/DevDocsShell.tsx` only for integration adjustments required by the real catalog
- `src/dev/components/ComponentExample.tsx` only for integration adjustments required by the real catalog

Do not modify files under `src/components/ui/` or `src/components/media/`.

## Technical details

- Define a typed catalog with stable component ids, display names, short descriptions, category (`UI` or `Media`), live preview React nodes/render functions, and static source strings.
- Include exactly the current inventory: Button, Input, Spinner, Skeleton, Card, Modal, Toast, Dropdown Menu, Avatar, Tabs, Poster, Carousel, Hero, and Navbar.
- Group or label navigation entries by UI and Media while retaining one entry per component.
- Store source snippets as readable string literals adjacent to their preview definitions. The string must be the exact intended usage example, including imports where helpful; never introspect rendered output or serialize functions.
- Keep previews deterministic and local. Reuse embedded artwork fixtures so the page does not depend on network images.
- Preserve meaningful existing states: button variants, input error, loading visuals, card structure, interactive overlays/menus/toasts/tabs, avatar fallback, media image fallback, and responsive media compositions. Keep each focused page compact rather than exhaustive.
- Catalog modules must only be imported from the development-only `DevGallery` graph.

## Steps

1. Create the typed catalog and migrate all 14 existing examples from the monolithic gallery.
2. Add static source text for every preview and manually check it against the corresponding JSX.
3. Connect the catalog to the shell, grouped navigation, focused preview, and code block.
4. Verify interactive examples and theme switching.
5. Check desktop and mobile layouts for all components, especially wide Hero/Navbar/Carousel previews.

## Acceptance criteria

- Navigation contains one labelled entry for each of all 14 existing components.
- Selecting any entry shows its title, description, live preview, and readable/copyable source.
- Each displayed snippet is an explicit static string and accurately matches the live usage example.
- Interactive components remain operable in their previews.
- Media previews use local deterministic artwork and handle constrained widths.
- There are no component API changes and no new dependencies.
- Catalog and snippet content are excluded from the production bundle.

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
```
