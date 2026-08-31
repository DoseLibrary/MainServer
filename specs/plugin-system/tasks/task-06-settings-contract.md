# Task 06 — declarative settings contract

Status: complete

## Files to Modify
- `src/server/plugins/types.ts`
- `src/server/routes.ts`
- `src/server/plugin-service.ts`
- `src/server/plugins/trailer-fetcher.ts`, `subtitle-extractor.ts`, `preview-sprites.ts`
- `src/lib/api.ts`

## Description
A plugin declares `fields: PluginFieldDescriptor[]` (text/password/path, number with min/max, boolean, select/multiselect with options, list) plus optional `actions` rendered as buttons. The admin API returns descriptors verbatim instead of guessing a widget from the type of a parsed default. `settingsSchema` remains the authority on what is accepted.

## Acceptance Criteria
- Enum settings render as a select; numeric constraints reach the client.
- Password values are never echoed; the response reports `secretsSet` and a save that omits the field keeps the stored value.
- Settings rejected by the plugin schema answer 400 with per-field messages, not 500.
- `POST /api/v1/plugins/:id/actions/:actionId` records a run exactly like a scheduled run.
