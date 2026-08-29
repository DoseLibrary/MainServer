# Requirements

## Functional

- Export typed React components that render entirely from props and perform no data fetching.
- Provide poster, carousel, hero, and navbar presentation patterns suitable for media content.
- Handle image loading and failure without broken-image UI; fallbacks must retain meaningful accessible labeling.
- Support responsive layouts from narrow mobile screens through desktop widths.
- Support keyboard operation for every interactive control, with visible focus treatment and semantic HTML/ARIA.

## Technical

- Use TypeScript, React, existing Tailwind utilities, and existing project helpers/dependencies where appropriate.
- Keep component APIs composable and avoid app-specific state, routes, backend types, auth, and API coupling.
- Prefer native controls and links; only add ARIA when native semantics are insufficient.
- Avoid new runtime dependencies unless explicitly approved.
- Tests use Vitest and Testing Library and must cover behavior rather than implementation details.

## Quality Gates

- `bun run lint`
- `bun run test`
- `bun run build`
