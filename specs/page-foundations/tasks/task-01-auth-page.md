# Task 01: Auth page

**Status:** pending

## Description

Create the shared, typed authentication page used for login and registration previews. Preserve the old screen's simple branded, backdrop-led character while using the current neutral theme and accessible form primitives.

## Files ownership

### Files to create

- `src/pages/AuthPage.tsx`
- Optional: `src/pages/AuthPage.test.tsx`

Do not modify any dev catalog, router, or another task's page file.

## Technical details

- Export the page and its public prop types.
- Model `mode: 'login' | 'register'`; registration includes email while login does not.
- Accept brand text/image, backdrop image, heading/copy, alternate-mode label/href, submitting state, field errors, form error, and `onSubmit` as props.
- Submit typed form values through the supplied callback. Do not implement authentication or persistence.
- Use semantic `main`/`form`, labelled inputs, password autocomplete hints, an announced form error, and a disabled/busy submit action.
- Keep the form readable over missing or loaded artwork and collapse cleanly on mobile.

## Acceptance criteria

- Login and registration render from one component without duplicated page shells.
- Keyboard submission and the supplied callback work.
- Busy and error states are accessible and visually clear.
- No network, router, cookie, fixture, or app-store dependency exists.
- The task's focused tests, if added, pass.

## Verification

```powershell
bun run lint
bun run test
bun run build
```
