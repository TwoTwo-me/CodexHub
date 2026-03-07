const fs = require('node:fs')
const path = require('node:path')

const envFile = process.env.CODEXUI_CONNECTOR_ENV_FILE || path.join(process.env.HOME || '/root', '.codexui-connector', 'edge-laptop.env')
const env = {}

if (fs.existsSync(envFile)) {
  const raw = fs.readFileSync(envFile, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    env[key] = value
  }
}

const args = [
  'exec',
  '--yes',
  `--package=${env.CODEXUI_CONNECTOR_PACKAGE_SPEC || 'github:TwoTwo-me/codexUI#main'}`,
  '--',
  'codexui-connector',
  'connect',
  '--hub', env.CODEXUI_CONNECTOR_HUB || 'https://hub.example.com',
  '--connector', env.CODEXUI_CONNECTOR_ID || 'edge-laptop',
  '--token-file', env.CODEXUI_CONNECTOR_TOKEN_FILE || path.join(process.env.HOME || '/root', '.codexui-connector', 'edge-laptop.token'),
]

if (env.CODEXUI_CONNECTOR_ALLOW_INSECURE_HTTP === '1') {
  args.push('--allow-insecure-http')
}
if (env.CODEXUI_CONNECTOR_VERBOSE === '1') {
  args.push('--verbose')
}
if (env.CODEXUI_CONNECTOR_KEY_ID) {
  args.push('--key-id', env.CODEXUI_CONNECTOR_KEY_ID)
}
if (env.CODEXUI_CONNECTOR_PASSPHRASE) {
  args.push('--passphrase', env.CODEXUI_CONNECTOR_PASSPHRASE)
}

module.exports = {
  apps: [
    {
      name: `codexui-connector-${env.CODEXUI_CONNECTOR_ID || 'edge-laptop'}`,
      script: 'npm',
      args,
      cwd: process.env.HOME || '/root',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      env: {
        HOME: process.env.HOME || '/root',
        ...env,
      },
    },
  ],
}
