# Wave 2 family users slice — 2026-08-28

## Outcome

Added administrator-managed household accounts across the API and V2 frontend.
Administrators can list, create, update, reset passwords for, disable, and
delete other users. Members never receive administration controls.

## Safety behavior

- API responses use a sanitized managed-user projection.
- Acting administrators cannot disable, demote, delete, or reset themselves in
  the family manager.
- The final enabled administrator cannot be removed, disabled, or demoted.
- Invariants are serialized under a PostgreSQL advisory transaction lock.
- Disables, password resets, and deletes revoke affected sessions.
- Duplicate and invariant conflicts have stable 409 responses.
- Failed password resets retain the dialog/input and announce the error.

## Verification

- `bun run lint`: pass
- `bun run test`: pass, 90/90 tests across 12 files
- `bun run build`: pass
- Independent security/integration review: PASS after one fix cycle

## Remaining work

- Scanner/prober and catalog ingestion.
- Browse/search API with real media presentation in the V2 library.
- Live PostgreSQL concurrency/cascade integration coverage is deferred with
  runtime/Docker work.
