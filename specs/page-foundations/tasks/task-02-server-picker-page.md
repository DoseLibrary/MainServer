# Task 02: Server picker page

**Status:** pending

## Description

Create the page that lets a signed-in user choose a content server. It replaces the original bare server boxes with a clear, responsive selection surface and explicit operational states.

## Files ownership

### Files to create

- `src/pages/ServerPickerPage.tsx`
- Optional: `src/pages/ServerPickerPage.test.tsx`

Do not modify any dev catalog, router, or another task's page file.

## Technical details

- Export typed server item and page props.
- A server includes a stable id, name, optional address/description, and optional availability/status presentation.
- Support either supplied href semantics or a supplied selection callback per item/page API; never navigate internally.
- Render loading, loaded, empty, and error states. Loading should reserve the card grid. Error accepts optional retry; empty accepts optional connect/add action.
- Use existing Card, Button, Skeleton/Spinner, and status-friendly semantic markup.
- Do not repeat the old automatic redirect for a single server; that decision belongs to application orchestration.

## Acceptance criteria

- Server choices are understandable and keyboard operable on mobile and desktop.
- Selection/retry/empty actions call only supplied props.
- Loading, empty, and error conditions are labelled and do not produce broken controls.
- No API, authentication, router, or mock-data logic exists.

## Verification

```powershell
bun run lint
bun run test
bun run build
```
