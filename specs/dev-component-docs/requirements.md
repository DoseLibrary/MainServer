# Requirements: Dev component documentation

## Context

The current `src/dev/DevGallery.tsx` renders all examples in one long page. Replace that presentation with a small documentation experience similar in spirit to shadcn/ui or Radix: a component menu, a focused detail view, a live preview, and readable source code. This remains an internal development aid rather than a production feature or a general-purpose documentation platform.

## Functional requirements

1. The docs navigation contains one entry for each of the 10 UI primitives and 4 media components already present in the repository.
2. Selecting an entry shows only that component's focused documentation view and gives the selected entry a programmatically exposed current state (`aria-current`).
3. Desktop layouts show a persistent sidebar. Narrow layouts expose the same navigation through an accessible menu trigger and dismissible mobile panel.
4. Each component view contains a meaningful title, a brief description, a rendered live preview covering useful variants or states, and a readable code block.
5. Each code block has a clearly labelled copy action. Successful copy provides accessible user feedback; clipboard failure must not crash or corrupt the page.
6. Displayed code comes from an explicit, static source string paired with the preview. It must exactly represent the authored example and preserve whitespace. Do not use `outerHTML`, React internals, `Function#toString`, or generated approximation.
7. Component selection must be linkable within `/dev` (a query parameter or nested/hash location is acceptable) and a missing/unknown selection must fall back predictably to the first component.
8. Existing theme toggle and component interactions remain usable inside the new shell.
9. The implementation adds no dependency or external docs framework.
10. The route and all documentation modules remain development-only. The existing production exclusion check must continue to pass, and production bundles must not contain docs copy or catalog code.

## Component inventory

### UI

- Button
- Input
- Spinner
- Skeleton
- Card
- Modal
- Toast
- Dropdown Menu
- Avatar
- Tabs

### Media

- Poster
- Carousel
- Hero
- Navbar

## Accessibility and responsive behavior

- Navigation is labelled and keyboard operable.
- The selected link uses `aria-current="page"`.
- The mobile trigger has an accessible name and reflects expanded state.
- The mobile panel has a clear close path, closes after selection, and handles focus using existing accessible primitives where practical.
- Code is exposed with semantic `pre`/`code` elements and retains readable overflow behavior.
- Copy status is announced without forcing focus movement.
- Focus indicators remain visible, and previews do not introduce inaccessible placeholder controls.

## Non-goals

- Storybook, MDX, syntax-highlighting packages, generated API documentation, search, editable playgrounds, or versioned documentation.
- New application components or redesigning the existing component APIs.
- Production documentation routes.

## Verification

Use Bun exclusively:

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
bun audit
```
