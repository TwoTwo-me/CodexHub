import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

test('multi-server compose defines five codex lab containers', async () => {
  const composePath = resolve(repoRoot, 'docker', 'multi-server', 'docker-compose.yml')
  const content = await readFile(composePath, 'utf8')

  for (const service of ['codex-cli-a', 'codex-cli-b', 'codex-cli-c', 'codex-cli-d', 'codex-cli-e']) {
    assert.match(content, new RegExp(`^\\s{2}${service}:`, 'm'))
  }

  for (const port of ['19101', '19102', '19103', '19104', '19105']) {
    assert.match(content, new RegExp(`127\\.0\\.0\\.1:${port}:9\\d{3}`))
  }
})

test('codex lab Dockerfile installs oh-my-codex and tmux prerequisites', async () => {
  const dockerfilePath = resolve(repoRoot, 'docker', 'multi-server', 'Dockerfile.codex-cli')
  const content = await readFile(dockerfilePath, 'utf8')

  assert.match(content, /npm install --global @openai\/codex@\$\{CODEX_CLI_VERSION\}/)
  assert.match(content, /npm install --global oh-my-codex/)
  assert.match(content, /tmux/)
  assert.match(content, /git/)
})

test('prepare-codex-auth script materializes only auth.json', async () => {
  const scriptPath = resolve(repoRoot, 'scripts', 'docker', 'prepare-codex-auth.sh')
  await access(scriptPath, fsConstants.F_OK)
  const content = await readFile(scriptPath, 'utf8')

  assert.match(content, /install -m 600/)
  assert.match(content, /Only allowlisted auth\.json was materialized\./)
  assert.match(content, /find \"\$TARGET_DIR\" -mindepth 1 -maxdepth 1 ! -name/)
})

test('multi-server smoke bootstraps oh-my-codex and checks for session leakage', async () => {
  const scriptPath = resolve(repoRoot, 'scripts', 'docker', 'multi-server-smoke.sh')
  const content = await readFile(scriptPath, 'utf8')

  assert.match(content, /services=\(codex-cli-a codex-cli-b codex-cli-c codex-cli-d codex-cli-e\)/)
  assert.match(content, /omx setup --scope user --force/)
  assert.match(content, /omx doctor/)
  assert.match(content, /test ! -e \/root\/\.omx\/state\/sessions/)
})
