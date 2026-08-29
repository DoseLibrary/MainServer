# Unified Dose migration plan

- [x] Foundation: V2 React UI, component library, representative pages, tests.
- [x] Discovery: map legacy topology, schemas, media APIs, and current worktree.
  - [ ] Wave 1 — application platform
  - [x] Add a typed API entry point co-located with the V2 frontend.
  - [x] Add PostgreSQL access, migrations, configuration validation, and health.
  - [x] Add production container and Compose stack with durable/read-only mounts.
  - [ ] Prove clean startup, migration, API health, and production UI serving.
    - [x] One-command embedded development startup and migration smoke test.
- [ ] Wave 2 — local library and family identity
  - [ ] First-run admin setup, login/session lifecycle, and user administration.
    - [x] First administrator setup, login/logout, and protected session bootstrap.
    - [x] Administrator family-user management.
    - [x] Profile page with role-gated administrator dashboard.
  - [x] Library CRUD using stable container paths and access validation.
  - [x] Scanner/prober jobs with idempotent media upserts and rescan semantics.
  - [x] Browse API and V2 page integration.
  - [ ] Catalog search API and frontend search experience.
    - [x] Catalog search API with local artwork URLs.
    - [x] Debounced navbar search wired to live grouped results.
- [ ] Wave 3 — playback and personal state
  - [x] Direct-play/range streaming with authorization and path containment.
  - [x] Negotiated remux/per-track transcoding to fragmented MP4.
  - [x] Scan-time local artwork cache and local image serving.
  - [x] On-demand bounded artwork resizing with persistent variant caching.
  - [x] Frontend playback route with browser capability negotiation.
  - [x] Responsive local artwork variants across home, details, search, and player.
  - [ ] Per-user progress, watched state, continue-watching, and next episode.
  - [ ] Audio/subtitle discovery and playback selection.
  - [ ] Migration coverage matrix, end-to-end tests, docs, and legacy retirement.

Each wave requires focused tests, full lint/typecheck/build, Compose-relevant
verification, and an independent diff review before the next wave.
