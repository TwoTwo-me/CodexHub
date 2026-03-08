# Skill Manager / 5-Connector Lab / Hook Settings / Chat Markdown Report

_Date: 2026-03-09_

## Scope completed

1. Renamed **Skills Hub** to **Skill Manager** in the shell and split the experience into:
   - **OpenAI Skills**
   - **Skills Hub**
2. Added source-aware skill identity and install routing (`source + skillId`).
3. Restored relay-backed Hook Settings discovery by exposing connector method/notification catalogs.
4. Added safe markdown rendering for thread messages without using raw HTML in the chat path.
5. Brought up a **5-container** Codex / oh-my-codex lab, connected all 5 containers to the Hub, and validated live skill installs.

## Key implementation notes

### Skill Manager
- Community source remains connector/server-scoped and continues to use the community GitHub source.
- OpenAI source is now handled separately instead of pretending it matches the community repo shape.
- Installed skills are reconciled by canonical identity rather than plain name.

### Hook Settings
- Relay-backed servers no longer depend on an empty method catalog.
- Connector method catalog and notification catalog are now bridged back to the Hub so `config/read`, `configRequirements/read`, and config write methods can be detected.

### Chat markdown
- Chat messages now render:
  - headings
  - paragraphs
  - blockquotes
  - ordered/unordered lists
  - fenced code blocks
  - links
  - existing markdown images
- The chat path does **not** use `v-html`.
- Unsupported syntax falls back to plain text.

### 5-container lab
- Multi-server Docker lab now runs 5 Codex containers.
- Each container uses only a materialized `auth.json` from the host.
- Host `.omx` session state is not copied into the lab.
- `oh-my-codex` is installed in the lab image and smoke-checked via `omx setup --scope user --force` and `omx doctor`.
- A connector bootstrap script now provisions and connects all 5 lab containers to the Hub.

## Validation

### Build
```bash
npm run build
```

### Contract / integration
```bash
npm run test:multi-server
```

Result:
- **69 passed**

### Playwright
```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4313 npx playwright test \
  tests/playwright/skills-hub-server-scope.spec.ts \
  tests/playwright/settings-tabs-hook-settings.spec.ts \
  tests/playwright/chat-markdown-rendering.spec.ts \
  --reporter=line
```

Result:
- **3 passed**

### Docker lab smoke
```bash
npm run docker:multi-server:up
npm run docker:multi-server:smoke
npm run docker:multi-server:connect
```

Validated:
- 5 containers are up
- Codex auth is present
- oh-my-codex bootstrap succeeds
- connectors `lab-a` .. `lab-e` are connected to the Hub

### Live skill install verification (`test / testtest`)
Validated against `serverId=lab-a`:
- **OpenAI Skills** install: `.curated/openai-docs` ✅
- **Skills Hub** install: `homeofe/openclaw-docker` ✅

## Screenshots
- `docs/screenshots/skills-hub-server-scope-desktop.png`
- `docs/screenshots/settings-hook-settings-tab-desktop.png`
- `docs/screenshots/chat-markdown-rendering-desktop.png`

## Commits
- `a4a7a99` — Add Skill Manager sources and relay catalogs
- `358af17` — Render markdown blocks in thread messages
- `65f4553` — Add lab connector bootstrap automation
