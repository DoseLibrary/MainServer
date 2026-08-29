# Task 03 — admin API and profile UI

Status: pending

## Files to Create
- `src/routes/PluginManager.tsx`

## Files to Modify
- `src/server/routes.ts`
- `src/lib/api.ts`
- `src/routes/Profile.tsx`

## Description
Expose admin-only list/update/run/history endpoints and add Plugins management to Profile. Render last status, last/next run, schedule, enable toggle, settings controls, run-now action, and recent failure details. Add tests.

## Acceptance Criteria
- Non-admin mutation is forbidden.
- Invalid cron/settings return actionable 400 responses.
- Saved settings survive reload.
- UI distinguishes never-run, running, success, and failure.

