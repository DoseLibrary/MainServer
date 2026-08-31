# Task 07 — admin plugin routes

Status: complete

## Files to Modify
- `src/routes/router.tsx`, `src/routes/AdminRoute.tsx`
- `src/routes/PluginsPage.tsx`, `src/routes/PluginDetailPage.tsx`, `src/routes/plugin-ui.tsx`
- `src/routes/Profile.tsx`

## Description
Plugin settings move off one flat page. `/admin/plugins` lists installed plugins with an inline enable toggle; `/admin/plugins/:id` carries settings grouped by `field.group`, the schedule, run/actions, and run history from `api.pluginRuns`. `/profile/plugins` redirects. `AdminRoute` keeps members off the pages the server would 403 anyway.

## Follow-up (same wave)
Full admin area built out: `/admin` overview (cards + server status, moved from Profile), `/admin/libraries`, `/admin/users`, `/admin/media` — the former modal managers (`LibraryManager`, `FamilyManager`, `MediaAdmin`) gained an `embedded` mode and render as pages inside `AdminShell` (navbar + section tabs); confirmation dialogs remain modals. The navbar gained a hover-opening account dropdown (`UserMenu`) carrying Profile/Collections/Queue, admin links for administrators, and Sign out; Profile's Administration card grid was replaced by a single link to `/admin`.

## Acceptance Criteria
- The list page renders no settings form; each row links to its detail page.
- The detail page renders each declared widget kind and shows the events the plugin reacts to.
- A rejected field is shown inline on the field, not as a bare banner.
- `/profile/plugins` redirects to `/admin/plugins`; a member is sent back to `/profile`.
