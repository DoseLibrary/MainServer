# Profile and administrator dashboard

## Outcome

- Added `/profile` and linked it from the authenticated navbar.
- Added account identity, role, privacy, and sign-out controls.
- Added admin-only library/family management entry points.
- Added live Dose server and PostgreSQL health indicators.
- Kept administration hidden for member accounts.

## Verification

- `bun run test`: 19 files, 140 tests passed.
- `bun run lint`: passed.
- `bun run build`: passed.
- `bun run verify:production`: passed.

## Review

PASS. Administrative mutations remain protected by backend authorization, the
UI gates controls using the authenticated role, and existing management dialogs
are reused without duplicating account or library state logic.
