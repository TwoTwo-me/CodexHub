export const CONNECTOR_NPM_PACKAGE_SPEC = 'github:TwoTwo-me/codexUI#main'
export const CONNECTOR_BIN_NAME = 'codexui-connector'
const MASKED_TOKEN_PLACEHOLDER = '••••••••••••••••'

type ConnectorCommandInput = {
  command: 'install' | 'connect'
  hubAddress: string
  connectorId: string
  bootstrapToken?: string
  relayE2eeKeyId?: string
  tokenFilePath?: string
  allowInsecureHttp?: boolean
  packageSpec?: string
  runnerMode?: 'script' | 'systemd-user' | 'pm2-user' | 'manual' | 'unknown'
  runtimeStateFilePath?: string
}

function getTokenFilePath(connectorId: string, tokenFilePath?: string): string {
  return tokenFilePath?.trim() || `$HOME/.codexui-connector/${connectorId}.token`
}

function getPm2InstallRoot(): string {
  return '$HOME/.local/share/codexui-connector/pm2'
}

function getPm2BinaryPath(): string {
  return `${getPm2InstallRoot()}/node_modules/.bin/pm2`
}

function getSystemdUnitName(connectorId: string): string {
  return `codexui-connector-${connectorId}.service`
}

export function createManagedConnectorRunnerCommand(connectorId: string): string {
  return `$HOME/.config/codexui-connector/${connectorId}.sh`
}

function createConnectorExecPrefix(packageSpec = CONNECTOR_NPM_PACKAGE_SPEC): string[] {
  return [
    'npm',
    'exec',
    '--yes',
    `--package=${JSON.stringify(packageSpec)}`,
    '--',
    CONNECTOR_BIN_NAME,
  ]
}

export function createConnectorInstallCommand(input: Omit<ConnectorCommandInput, 'command'>): string {
  return createConnectorCommand({
    command: 'install',
    ...input,
  })
}

export function createConnectorConnectCommand(input: Omit<ConnectorCommandInput, 'command' | 'bootstrapToken'>): string {
  return createConnectorCommand({
    command: 'connect',
    ...input,
  })
}

export function createConnectorSystemdUserRegistrationCommand(
  input: Omit<ConnectorCommandInput, 'command' | 'bootstrapToken'>,
): string {
  const unitName = getSystemdUnitName(input.connectorId)
  const managedRunnerCommand = createManagedConnectorRunnerCommand(input.connectorId)

  return [
    'mkdir -p "$HOME/.config/systemd/user"',
    `cat > "$HOME/.config/systemd/user/${unitName}" <<'EOF'`,
    '[Unit]',
    `Description=CodexUI Connector (${input.connectorId})`,
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'Environment=CODEXUI_CONNECTOR_RUNNER_MODE_OVERRIDE=systemd-user',
    `ExecStart=${managedRunnerCommand}`,
    'Restart=always',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    'EOF',
    'systemctl --user daemon-reload',
    `systemctl --user enable --now ${unitName}`,
  ].join('\n')
}

export function createConnectorPm2RegistrationCommand(
  input: Omit<ConnectorCommandInput, 'command' | 'bootstrapToken'>,
): string {
  const pm2Name = `codexui-connector-${input.connectorId}`
  const managedRunnerCommand = createManagedConnectorRunnerCommand(input.connectorId)

  return [
    'mkdir -p "$HOME/.config/codexui-connector"',
    `if [ ! -x "${getPm2BinaryPath()}" ]; then npm install --prefix "${getPm2InstallRoot()}" pm2; fi`,
    'export PM2_HOME="$HOME/.pm2"',
    `CODEXUI_CONNECTOR_RUNNER_MODE_OVERRIDE=pm2-user "${getPm2BinaryPath()}" start ${JSON.stringify(managedRunnerCommand)} --name ${JSON.stringify(pm2Name)}`,
    `"${getPm2BinaryPath()}" save`,
  ].join('\n')
}

export function createConnectorCommand(input: ConnectorCommandInput): string {
  const parts = [
    ...createConnectorExecPrefix(input.packageSpec),
    input.command,
    `--hub ${JSON.stringify(input.hubAddress)}`,
    `--connector ${JSON.stringify(input.connectorId)}`,
  ]

  if (input.command === 'install') {
    const tokenFilePath = getTokenFilePath(input.connectorId, input.tokenFilePath)
    if (typeof input.bootstrapToken === 'string') {
      const inlineToken = input.bootstrapToken.length > 0 ? input.bootstrapToken : MASKED_TOKEN_PLACEHOLDER
      parts.push(`--token ${JSON.stringify(inlineToken)}`)
    }
    parts.push(`--token-file ${JSON.stringify(tokenFilePath)}`)
  } else {
    parts.push(`--token-file ${JSON.stringify(getTokenFilePath(input.connectorId, input.tokenFilePath))}`)
  }

  if (input.relayE2eeKeyId) {
    parts.push(`--key-id ${JSON.stringify(input.relayE2eeKeyId)}`)
    parts.push('--passphrase "<relay-passphrase>"')
  }

  if (input.runnerMode) {
    parts.push(`--runner-mode ${JSON.stringify(input.runnerMode)}`)
  }

  if (input.runtimeStateFilePath) {
    parts.push(`--runtime-state-file ${JSON.stringify(input.runtimeStateFilePath)}`)
  }

  if (input.packageSpec) {
    parts.push(`--package-spec ${JSON.stringify(input.packageSpec)}`)
  }

  if (input.allowInsecureHttp === true || input.hubAddress.startsWith('http://')) {
    parts.push('--allow-insecure-http')
  }

  return parts.join(' ')
}
