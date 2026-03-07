# Explorer / Hooks / SQLite / Approval Rollout Report

## Scope
This rollout completed the remaining phased work requested for the Hub UI and persistence model:

- **Phase A** — server-scoped explorer state
- **Phase B** — hook badges + hook inbox panel
- **Phase C** — open threads at the latest message
- **Phase D** — SQLite-backed Hub persistence
- **Phase E** — public signup + admin approval UI

## Delivered

### Phase A — Server-scoped explorer state
- Explorer project trees now stay scoped to the selected server.
- Workspace root labels/order/active state are isolated per **user + server**.
- Project collapse state is also server-scoped.
- Commit: `7fdbf26` — `Scope explorer state by server`

### Phase B — Hooks inbox and red-dot badges
- Added server/project/thread hook badges in the sidebar.
- Added a **Hooks** panel that lists pending hook requests in newest-first order.
- Clicking a hook entry opens the matching thread.
- Hook activity now lifts the most recently alerted project to the top.
- Commit: `82e6b8d` — `Add hook inbox and alert badges`

### Phase C — Open thread at latest message
- Opening a thread now jumps to the latest message instead of restoring a stale scroll position first.
- Commit: `38f106c` — `Open threads at the latest message`

### Phase D — SQLite-backed Hub persistence
- Hub user storage moved to SQLite (`codexui/hub.sqlite`).
- Global Hub state moved from `.codex-global-state.json` semantics into SQLite state entries.
- Existing auth/bootstrap hash flows continue to work.
- SQLite persistence is verified for restart survival and per-user registry storage.
- Commit: `20b11b5` — `Migrate hub persistence to SQLite`

### Phase E — Public signup + admin approval
- Added a login page with a **Request access** form.
- Public registrations are created as **pending**.
- Pending users cannot log in until approved by an admin.
- Admin panel now shows approval status and exposes **Approve {username}** actions.
- Commit: `c18fb2d` — `Add approval-driven admin UI flows`

## Verification

### Build
- `npm run build` ✅

### Contract / integration tests
- `npm run test:multi-server` ✅ (`37 passed`)
- Includes:
  - SQLite bootstrap/admin hash coverage
  - SQLite registry persistence coverage
  - public registration + admin approval contract coverage
  - connector/server/workspace regression coverage

### Playwright
- `npx playwright test tests/playwright --reporter=line` ✅ (`10 passed`)
- Includes:
  - explicit registration empty state
  - server-scoped explorer
  - hooks ordering + inbox navigation
  - thread open scroll-to-bottom
  - settings/connectors lifecycle
  - admin panel desktop/mobile captures
  - signup approval flow

## Screenshot inventory
- `.artifacts/screenshots/server-scoped-explorer-desktop.png` — server-scoped explorer tree
- `.artifacts/screenshots/hooks-sidebar-order-desktop.png` — hook badges + project ordering
- `.artifacts/screenshots/hooks-inbox-open-thread-desktop.png` — hook inbox panel and thread navigation
- `.artifacts/screenshots/thread-open-scroll-bottom-desktop.png` — thread opens at latest message
- `.artifacts/screenshots/explicit-registration-empty-state-desktop.png` — registration-only empty state
- `.artifacts/screenshots/phase2-admin-desktop.png` — admin panel desktop view
- `.artifacts/screenshots/phase2-admin-mobile.png` — admin panel mobile view
- `.artifacts/screenshots/signup-approval-admin-desktop.png` — pending user approval flow
- `.artifacts/screenshots/signup-approval-user-desktop.png` — approved user login result
- `.artifacts/screenshots/settings-connectors-desktop.png` — connector settings desktop view
- `.artifacts/screenshots/settings-connectors-expired-desktop.png` — expired bootstrap recovery state

## Notes
- The Hub is now persistence-backed by SQLite for user and Hub state storage.
- New users still see **no servers by default** until they explicitly register a local server or Connector.
- Connector isolation remains per authenticated user.
