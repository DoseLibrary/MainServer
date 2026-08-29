# Tier 2 Media Components

Implementation-ready specification for typed, presentational React/Tailwind media components.

## Scope

- Poster, carousel, hero, and navbar components under `src/components/media/`.
- Responsive layout, keyboard accessibility, and resilient image loading/fallback states.
- A development gallery and shared/integration tests.
- No backend, authentication, API, persistence, routing, or data-fetching work.

## Execution Plan

- **Wave 1 (parallel):** tasks 01-04. Each task exclusively owns its named component file and, if created, its matching test file.
- **Wave 2:** task 05, after Wave 1. It owns `src/dev/DevGallery.tsx` and shared/integration tests only.

## Task Status

- [x] Task 01: Poster
- [x] Task 02: Carousel
- [x] Task 03: Hero
- [x] Task 04: Navbar
- [x] Task 05: Gallery and shared tests

Run all verification from `MainServer` with Bun. Do not commit or push as part of these tasks.
