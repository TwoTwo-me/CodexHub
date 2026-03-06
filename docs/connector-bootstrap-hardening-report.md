# Connector Bootstrap Hardening Report

## Operational context

This hardening now ships as part of the Docker-first CodexUI Hub deployment. Operators typically create Connectors from the Hub Settings page and install them onto remote hosts with `codexui-connector`.

Date: 2026-03-07

## Goal

Replace the previous single-token connector onboarding model with a safer split between:
- **bootstrap install token** (short-lived, single-use)
- **durable relay credential** (steady-state runtime auth)

## Delivered

### 1. Backend / relay model
- Connector registry now tracks bootstrap metadata and durable credential state separately.
- Relay hub runtime auth is hydrated from the durable credential only.
- Added `POST /codex-api/connectors/:id/bootstrap-exchange`.
- `rotate-token` now invalidates the active durable credential and reissues install state.

### 2. Connector CLI
- `provision` now returns bootstrap metadata.
- Added `install` command that exchanges the bootstrap token.
- `install --token-file` rewrites the same file with the durable credential.
- `connect` remains the steady-state runtime command.

### 3. Settings UI
- Added install-state visualization:
  - `Pending install`
  - `Connected`
  - `Offline`
  - `Expired bootstrap`
  - `Reinstall required`
- Exposed bootstrap timestamps in the detail panel.
- Replaced generic token rotation UX with **Reissue install token**.
- Generated install command now uses `codexui-connector install`.

## TDD evidence

### Contract / backend
- `tests/multi-server/connector-registration-per-user.test.mjs`
- `tests/multi-server/connector-management-contract.test.mjs`

### CLI / package
- `tests/multi-server/connector-provisioning-package.test.mjs`
- `tests/multi-server/relay-connector-provisioning.test.mjs`

### UI / Playwright
- `tests/playwright/settings-connectors.spec.ts`

## Final verification

- `npm run build` ✅
- `npm run test:multi-server` ✅
- `npx playwright test tests/playwright/settings-connectors.spec.ts --reporter=line` ✅

## Screenshots

- `.artifacts/screenshots/settings-connectors-desktop.png`
- `.artifacts/screenshots/settings-connectors-expired-desktop.png`

## Commit sequence

- `07f0cd5` — Split connector bootstrap tokens from relay credentials
- `861f539` — Add bootstrap-aware connector install flow
- `a1a1381` — Show connector bootstrap lifecycle in settings
