# Chat Markdown + Pending Request Rail Report

_Date: 2026-03-09_

## Completed scope

1. Upgraded chat markdown rendering toward practical GitHub/GFM parity.
2. Moved pending thread requests out of the top of the transcript.
3. Added a bottom `ThreadRequestRail` between `QueuedMessages` and `ThreadComposer`.
4. Verified build, contract tests, Playwright, Docker rebuild/restart, and remote push.

## Implementation summary

### Markdown rendering
The chat renderer now supports a materially broader structured markdown set while still avoiding raw HTML injection in the chat path.

Covered in the renderer/tests:
- headings
- paragraphs
- ordered and unordered lists
- task lists
- blockquotes
- fenced code blocks
- links + bare URL autolinks
- emphasis / strong / strike
- thematic breaks
- tables
- existing file references and markdown images

### Pending request rail
Pending requests are no longer rendered at the top of `ThreadConversation`.

The final thread-area order is now:
1. `ThreadConversation`
2. `QueuedMessages`
3. `ThreadRequestRail`
4. `ThreadComposer`

The request rail preserves the existing request-response flow back into `App.vue` and continues to handle:
- approvals
- tool input
- tool call
- generic fallback requests

## Verification

### Build
```bash
npm run build
```
✅ passed

### Contract / integration
```bash
npm run test:multi-server
```
✅ passed — **69 tests**

### Playwright
```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 npx playwright test \
  tests/playwright/chat-markdown-rendering.spec.ts \
  tests/playwright/hook-alerts.spec.ts \
  tests/playwright/thread-open-scroll.spec.ts \
  --reporter=line
```
✅ passed — **3 tests**

### Live environment checks
Used `test / testtest` account for authenticated Hub-side validation alongside the existing live connector lab.

### Docker / runtime
- Hub rebuilt and restarted with Docker Compose
- Multi-server lab remained available
- Remote push completed

## Screenshots
- `docs/screenshots/chat-markdown-rendering-desktop.png`
- `docs/screenshots/hook-alerts-thread-approval-desktop.png`
- `docs/screenshots/thread-open-scroll-bottom-desktop.png`

## Commits
- `6c67de7` — Improve chat markdown GFM rendering
- `9ee2669` — Move pending requests above thread composer
- `caafedd` — Merge markdown and pending-request rail tracks
