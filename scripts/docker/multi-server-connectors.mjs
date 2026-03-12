import { execFileSync } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(new URL('../..', import.meta.url).pathname)
const composeFile = join(repoRoot, 'docker/multi-server/docker-compose.yml')
const hubUrl = process.env.CODEXUI_HUB_URL?.trim() || 'http://127.0.0.1:4300'
const containerHubUrl = process.env.CODEXUI_CONTAINER_HUB_URL?.trim() || 'http://172.17.0.1:4300'
const username = process.env.CODEXUI_TEST_USERNAME?.trim() || 'test'
const password = process.env.CODEXUI_TEST_PASSWORD?.trim() || 'testtest'
const connectorVersion = process.env.CODEXUI_CONNECTOR_VERSION?.trim() || '0.1.5'
const services = ['codex-cli-a', 'codex-cli-b', 'codex-cli-c']
const connectors = services.map((service) => ({
  service,
  id: service.replace('codex-cli-', 'lab-'),
  name: service.replace('codex-cli-', 'LAB-').toUpperCase(),
  hostname: `${service}.lab`,
}))

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8', ...options }).trim()
}

async function postJson(url, payload, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
}

async function deleteRequest(url, headers = {}) {
  return fetch(url, { method: 'DELETE', headers: { Accept: 'application/json', ...headers } })
}

async function listConnectors(cookie) {
  const response = await fetch(`${hubUrl}/codex-api/connectors?includeStats=1`, {
    headers: { Accept: 'application/json', Cookie: cookie },
  })
  if (!response.ok) {
    throw new Error(`Failed to list connectors: ${response.status}`)
  }
  return await response.json()
}

async function main() {
  const loginResponse = await postJson(`${hubUrl}/auth/login`, { username, password })
  if (!loginResponse.ok) throw new Error(`Login failed: ${loginResponse.status}`)
  const cookieHeader = loginResponse.headers.get('set-cookie')
  if (!cookieHeader) throw new Error('Missing auth cookie')
  const cookie = cookieHeader.split(';', 1)[0]

  const packInfo = JSON.parse(run('npm', ['pack', '--json'], { cwd: repoRoot }))
  const packageFile = Array.isArray(packInfo) ? packInfo[0]?.filename : ''
  if (!packageFile) throw new Error('Failed to pack connector package')
  const tarballPath = join(repoRoot, packageFile)
  const tarballBase = packageFile

  try {
    for (const connector of connectors) {
      try {
        await deleteRequest(`${hubUrl}/codex-api/connectors/${encodeURIComponent(connector.id)}`, { Cookie: cookie })
      } catch {}

      const createResponse = await postJson(`${hubUrl}/codex-api/connectors`, {
        id: connector.id,
        name: connector.name,
        hubAddress: hubUrl,
      }, { Cookie: cookie })
      if (!createResponse.ok) {
        throw new Error(`Failed to create connector ${connector.id}: ${createResponse.status}`)
      }
      const createBody = await createResponse.json()
      const bootstrapToken = createBody?.data?.bootstrapToken
      if (typeof bootstrapToken !== 'string' || bootstrapToken.length === 0) {
        throw new Error(`Missing bootstrap token for ${connector.id}`)
      }

      const exchangeResponse = await postJson(`${hubUrl}/codex-api/connectors/${encodeURIComponent(connector.id)}/bootstrap-exchange`, {
        hostname: connector.hostname,
        platform: 'linux',
        connectorVersion,
      }, { Authorization: `Bearer ${bootstrapToken}` })
      if (!exchangeResponse.ok) {
        throw new Error(`Failed bootstrap exchange for ${connector.id}: ${exchangeResponse.status}`)
      }
      const exchangeBody = await exchangeResponse.json()
      const credentialToken = exchangeBody?.data?.credentialToken
      if (typeof credentialToken !== 'string' || credentialToken.length === 0) {
        throw new Error(`Missing credential token for ${connector.id}`)
      }

      run('docker', ['compose', '-f', composeFile, 'cp', tarballPath, `${connector.service}:/tmp/${tarballBase}`], { cwd: repoRoot })
      run('docker', ['compose', '-f', composeFile, 'exec', '-T', connector.service, 'sh', '-lc', `set -eu
pkill -f "codexui-connector connect --hub ${containerHubUrl} --connector ${connector.id}" || true
npm install -g /tmp/${tarballBase} >/tmp/codexui-${connector.id}-install.log 2>&1
mkdir -p \"$HOME/.codexui-connector\"
printf '%s' '${credentialToken}' > \"$HOME/.codexui-connector/${connector.id}.token\"
chmod 600 \"$HOME/.codexui-connector/${connector.id}.token\"
nohup codexui-connector connect --hub \"${containerHubUrl}\" --connector \"${connector.id}\" --token-file \"$HOME/.codexui-connector/${connector.id}.token\" --allow-insecure-http >/tmp/codexui-${connector.id}.log 2>&1 &
`], { cwd: repoRoot })
    }

    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      const body = await listConnectors(cookie)
      const byId = new Map((body?.data?.connectors ?? []).map((row) => [row.id, row]))
      const allConnected = connectors.every((connector) => byId.get(connector.id)?.connected === true)
      if (allConnected) {
        console.log(JSON.stringify({ data: { connectors: connectors.map((connector) => byId.get(connector.id)) } }, null, 2))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    const finalBody = await listConnectors(cookie)
    console.log(JSON.stringify(finalBody, null, 2))
    throw new Error('Timed out waiting for all lab connectors to connect')
  } finally {
    try { unlinkSync(tarballPath) } catch {}
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
