# Dev component documentation

Turn the development-only `/dev` gallery into a compact component documentation site inspired by shadcn/ui and Radix Themes. It will provide responsive component navigation, one focused component page at a time, live previews, and exact copyable example source without adding a documentation framework.

## Constraints

- `/dev` remains available only through `import.meta.env.DEV` and absent from production output.
- Document all 14 existing components: Button, Input, Spinner, Skeleton, Card, Modal, Toast, Dropdown Menu, Avatar, Tabs, Poster, Carousel, Hero, and Navbar.
- Use existing React, Tailwind, Radix, Lucide, and project utilities only; add no dependency.
- Example code is stored as explicit static source strings and rendered verbatim. Do not derive it from JSX, the DOM, or function serialization.
- Work is local only: do not commit or push.

## Waves

Tasks are deliberately sequential because the docs shell, catalog, and tests share the development-gallery surface.

### Wave 1 — Documentation shell

- [x] [task-01-docs-shell](tasks/task-01-docs-shell.md)

### Wave 2 — Component catalog

- [x] [task-02-component-catalog](tasks/task-02-component-catalog.md)

### Wave 3 — Verification

- [x] [task-03-tests](tasks/task-03-tests.md)

## Task Status

- [x] task-01-docs-shell — Build the responsive navigation and focused documentation layout.
- [x] task-02-component-catalog — Add every component preview and its exact source example.
- [x] task-03-tests — Cover navigation, previews, copy behavior, accessibility, and production exclusion.

## Final gates

```powershell
bun run lint
bun run test
bun run build
bun run verify:production
bun audit
```
