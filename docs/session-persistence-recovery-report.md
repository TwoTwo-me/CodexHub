# Session Persistence and Recovery Report

_Date: 2026-03-09_

## Scope
- Persist authenticated browser sessions across normal Hub restart/redeploy.
- Persist login/signup throttling across restart.
- Add pre-MFA recovery flows:
  - admin-assisted password reset from the existing Admin surface
  - local CLI last-admin recovery
- Record recovery events in an audit table.
- Correct deployment documentation so persistence guarantees match reality.

## Delivered

### 1. Durable auth state
Implemented a SQLite-backed `AuthStateStore` and moved browser-session plus auth rate-limit state out of process-local maps.

Delivered behaviors:
- authenticated browser sessions survive restart/redeploy when the same `CODEX_HOME/codexui/hub.sqlite` volume is reused
- login/signup rate-limit state survives restart
- session tokens are stored **hashed-at-rest** (`token_hash`), not plaintext
- `setupRequired`, `mustChangeUsername`, `mustChangePassword`, and `bootstrapState` remain derived from the user row, not duplicated in session rows
- proxy-aware rate limiting now follows the same trusted-local-proxy model used elsewhere in the Hub

### 2. Recovery flows
Delivered phase-1 recovery surfaces:
- **ordinary recovery**: authenticated admin-triggered password reset from the existing Admin page/API
- **last-admin recovery**: local CLI recovery on the Hub host

Delivered recovery semantics:
- password recovery/reset revokes all active sessions for the target user
- recovery events are recorded in `auth_recovery_audit`
- no self-service reset, email reset, or TOTP reset was added in this phase

### 3. Documentation updates
Updated deployment docs to state exactly what persists and how restart/redeploy recovery behaves.

## TDD Evidence

### Step 1 — durable sessions and durable throttling
**RED**
Command:
```bash
npm run build:cli && node --test tests/multi-server/auth-session-persistence.test.mjs
```
Initial failures recorded in:
- `artifacts/session-persistence-recovery/step1-red-auth-session.log`

Observed failing evidence:
- missing `auth_sessions` table
- login rate-limit did not survive restart (`401 !== 429`)
- signup rate-limit did not survive restart (`202 !== 429`)

**GREEN**
Command:
```bash
npm run build:cli && node --test tests/multi-server/auth-session-persistence.test.mjs
```
Passing evidence recorded in:
- `artifacts/session-persistence-recovery/step1-green-auth-session.log`

Result:
- **3/3 passing**

### Step 2 — admin-assisted recovery, audit persistence, and local CLI last-admin recovery
**RED**
Command:
```bash
npm run build:cli && node --test tests/multi-server/admin-recovery-contract.test.mjs
```
Initial failures recorded in:
- `artifacts/session-persistence-recovery/step2-red-admin-recovery.log`

Observed failing evidence:
- recovery endpoint was missing/ineffective (`200 !== 401` for old password after supposed recovery)
- non-admin caller was not rejected as expected (`200 !== 403`)
- local CLI recovery command was missing/incorrect (`unknown option '--password-stdin'`)

**GREEN**
Command:
```bash
npm run build:cli && node --test tests/multi-server/admin-recovery-contract.test.mjs
```
Passing evidence recorded in:
- `artifacts/session-persistence-recovery/step2-green-admin-recovery.log`

Result:
- **3/3 passing**

## Verification

### Build
Command:
```bash
npm run build
```
Result:
- **PASS**

### Full multi-server suite
Command:
```bash
npm run test:multi-server
```
Result:
- **PASS**
- **75/75 passing**
- Evidence: `artifacts/session-persistence-recovery/final-test-multi-server.log`

### Playwright UI verification
Command:
```bash
npx playwright test tests/playwright/admin-recovery-ui.spec.ts --reporter=line
```
Result:
- **PASS**
- **1/1 passing**
- Evidence: `artifacts/session-persistence-recovery/final-playwright-admin-recovery.log`

### Diagnostics
Modified implementation files were checked with file-level diagnostics and returned zero diagnostics:
- `src/server/authStateStore.ts`
- `src/server/authMiddleware.ts`
- `src/server/userStore.ts`
- `src/server/codexAppServerBridge.ts`
- `src/cli/index.ts`
- `src/components/content/AdminPanel.vue`

## Screenshots
- Admin recovery UI (desktop): `docs/screenshots/admin-recovery-ui-desktop.png`

## Rollout Notes
- Deploy against the existing persistent `CODEX_HOME` / `hub.sqlite` volume.
- Existing users may experience a one-time reauthentication at cutover depending on whether old in-memory sessions were still active during deploy.
- After rollout:
  1. verify `/auth/session` stays authenticated across a normal restart
  2. verify rate-limit state still blocks after restart
  3. verify admin reset revokes the target user’s active sessions
  4. verify last-admin CLI recovery works from the Hub host

## Rollback Notes
- Roll back by redeploying the previous build.
- Treat new auth-state tables as additive data; the reverted build may ignore them.
- Force logout as needed during rollback to avoid split auth semantics.
- Preserve `users` data and bootstrap state in SQLite.

## Changed Files
### Implementation
- `src/server/authStateStore.ts`
- `src/server/authMiddleware.ts`
- `src/server/httpServer.ts`
- `src/server/sqliteStore.ts`
- `src/server/userStore.ts`
- `src/server/codexAppServerBridge.ts`
- `src/cli/index.ts`
- `src/components/content/AdminPanel.vue`
- `src/App.vue`

### Tests
- `tests/multi-server/auth-session-persistence.test.mjs`
- `tests/multi-server/admin-recovery-contract.test.mjs`
- `tests/playwright/admin-recovery-ui.spec.ts`

### Docs / Evidence
- `docs/hub-docker-deployment.md`
- `docs/session-persistence-recovery-report.md`
- `docs/screenshots/admin-recovery-ui-desktop.png`
