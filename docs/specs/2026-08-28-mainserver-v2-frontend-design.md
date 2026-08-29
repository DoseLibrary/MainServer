# MainServer v2 — Frontend Rewrite & Base Component Library

Date: 2026-08-28
Status: Implemented
Branch: `v2` (wiped clean from v1 Next.js app; master swap comes later)

## Goal

Rewrite the DOSE MainServer frontend from Next.js (CSS modules) to a modern
Vite + React + TypeScript stack. First deliverable is a small, cohesive base
component library plus a shadcn-style dev gallery for browsing components. No
app/data wiring yet — clean foundation only.

## Stack

- **Vite + React + TypeScript**
- **Bun** for dependency management and package scripts
- **Zustand** for client state
- **Tailwind CSS** + **Radix UI** headless primitives (shadcn approach: copy-in
  components we own, styled with Tailwind + CSS-variable tokens)
- **React Router** for routing (needed for `/dev` now, app routes later)
- `@/` path alias → `src/`
- **Vitest + React Testing Library** for tests

Deliberately excluded (YAGNI for cut 1): auth, API clients, data fetching,
Storybook, i18n, the media composites.

## Component Library

Grounded in what the v1 MainServer actually used (posters, rows, backdrops,
menu, search, modals, spinners, toasts).

### Tier 1 — primitives (this cut)

Live in `src/components/ui/`. Each is a single focused file with a typed props
interface and variant support where it makes sense.

1. **Button** — variants (default/secondary/ghost/destructive), sizes, disabled.
2. **Input** — text input with label/error affordances.
3. **Spinner** — indeterminate loader.
4. **Skeleton** — loading placeholder block.
5. **Card** — surface container (header/content/footer slots).
6. **Modal** — Radix Dialog wrapper.
7. **Toast** — Radix Toast, with a small imperative helper/provider.
8. **DropdownMenu** — Radix DropdownMenu wrapper.
9. **Avatar** — Radix Avatar with fallback.
10. **Tabs** — Radix Tabs wrapper (also used by the gallery).

### Tier 2 — media composites (implemented)

Built on Tier 1: **Poster** (movie/episode/season share one), **Carousel/Row**,
**Hero/Backdrop**, **Navbar**. All remain presentational and data-source agnostic.

## Theming

shadcn-style design tokens as CSS variables (`--background`, `--foreground`,
`--primary`, `--muted`, `--border`, `--radius`, …), dark theme as default since
this is a media app. A single `cn()` helper (clsx + tailwind-merge) for
conditional class composition.

## Dev Gallery

- Route `/dev` renders a shadcn-docs-style gallery: one section per component
  showing its variants and states.
- **Dev-only:** the route and gallery code are gated behind
  `import.meta.env.DEV`. The router only registers `/dev` in dev, and the
  gallery module is dynamically imported so the production build tree-shakes it
  out entirely. Verified by checking the production bundle contains no gallery
  code.

## Structure

```
src/
  components/ui/     # Tier-1 primitives
  components/media/  # Tier-2 composites
  dev/               # gallery (dev-only)
  store/             # zustand stores
  lib/               # utils (cn, etc.)
  routes/            # router + route tree
  main.tsx
  index.css          # tailwind + tokens
```

## Testing

A render/smoke test per Tier-1 primitive (renders, key prop/variant applies).
Plus a check that the production build excludes `/dev`.

## Out of Scope / Later

- Backend/API integration, auth flows, real pages.
- Renaming `master` and swapping v2 in as the default branch.
