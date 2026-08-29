# Wave 2 auth/library slice — 2026-08-28

## Outcome

Wired the unified API and V2 frontend through first-run administrator setup,
login/logout/session bootstrap, authenticated library listing, and admin-only
library creation/deletion. The obsolete server-picker flow is no longer part of
the live application path.

## Security and data behavior

- Argon2id passwords and random opaque session cookies with hashed DB tokens.
- Serialized first-admin creation and authenticated/admin route guards.
- Missing-user timing mitigation and stable duplicate-library HTTP 409 errors.
- Library paths must resolve to accessible directories contained beneath the
  real `/media` root; traversal and symlink escapes are rejected.
- Admin library manager supports movie/show roots and explicit safe deletion;
  family members receive read-only library access.

## Verification

- `bun run lint`: pass
- `bun run test`: pass, 78/78 tests across 11 files
- `bun run build`: pass
- `git diff --check`: pass
- Independent integration/security review: PASS after one fix cycle

## Remaining work

- Administrator creation/management of family member accounts.
- Scanner/prober and idempotent catalog ingestion.
- Real catalog browse/search endpoints and media cards.
- Live PostgreSQL integration coverage remains deferred with Docker/runtime work.
