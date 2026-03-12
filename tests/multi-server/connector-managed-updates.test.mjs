import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoDir = resolve(__dirname, '../..')

async function loadConnectorModule() {
  const moduleUrl = pathToFileURL(resolve(repoDir, 'dist-cli/connector.js')).href
  return await import(`${moduleUrl}?t=${Date.now()}`)
}

test('connector package telemetry reports the installed package version', async () => {
  const module = await loadConnectorModule()
  assert.equal(typeof module.readConnectorVersion, 'function')

  const reportedVersion = await module.readConnectorVersion()
  assert.equal(reportedVersion, '0.1.5')
})

test('managed connector runtime bundle rewrites the runner script and preserves restart exit handling', async () => {
  const module = await loadConnectorModule()
  assert.equal(typeof module.createManagedConnectorRuntimeState, 'function')
  assert.equal(typeof module.ensureManagedConnectorRuntimeBundle, 'function')

  const tempHome = await mkdtemp(resolve(tmpdir(), 'codexui-managed-runner-'))
  const statePath = resolve(tempHome, 'edge-alpha.state.json')
  const packageSpec = module.CONNECTOR_NPM_PACKAGE_SPEC
  const state = module.createManagedConnectorRuntimeState({
    connectorId: 'edge-alpha',
    hubAddress: 'https://hub.example.test',
    tokenFilePath: resolve(tempHome, 'edge-alpha.token'),
    packageSpec,
    runnerMode: 'script',
    currentVersion: '0.1.5',
  })

  const firstBundle = await module.ensureManagedConnectorRuntimeBundle(statePath, state)
  const firstRunner = await readFile(firstBundle.runnerPath, 'utf8')
  assert.match(firstRunner, /set \+e/u)
  assert.match(firstRunner, /STATUS=\$\?/u)
  assert.match(firstRunner, /if \[ "\$STATUS" -eq 75 \]; then/u)

  await writeFile(firstBundle.runnerPath, '# old runner\n', 'utf8')
  const secondBundle = await module.ensureManagedConnectorRuntimeBundle(statePath, state)
  const rewrittenRunner = await readFile(secondBundle.runnerPath, 'utf8')
  assert.doesNotMatch(rewrittenRunner, /# old runner/u)
  assert.match(rewrittenRunner, /continue/u)
})

test('managed connector job failure reporting rethrows restart signals and only reports real failures', async () => {
  const module = await loadConnectorModule()
  assert.equal(typeof module.reportManagedConnectorJobFailure, 'function')
  assert.equal(typeof module.RelayConnectorControlSignal, 'function')

  let reported = 0
  await assert.rejects(
    module.reportManagedConnectorJobFailure(
      async () => {
        throw new module.RelayConnectorControlSignal('restart')
      },
      async () => {
        reported += 1
      },
    ),
  )
  assert.equal(reported, 0)

  await module.reportManagedConnectorJobFailure(
    async () => {
      throw new Error('boom')
    },
    async (error) => {
      assert.match(String(error), /boom/u)
      reported += 1
    },
  )
  assert.equal(reported, 1)
})

test('managed connector update stages a verified artifact and finalizes the pending job after restart', async () => {
  const module = await loadConnectorModule()
  assert.equal(typeof module.createManagedConnectorRuntimeState, 'function')
  assert.equal(typeof module.writeManagedConnectorRuntimeState, 'function')
  assert.equal(typeof module.readManagedConnectorRuntimeState, 'function')
  assert.equal(typeof module.applyManagedConnectorJob, 'function')
  assert.equal(typeof module.finalizeManagedConnectorJob, 'function')

  const tempHome = await mkdtemp(resolve(tmpdir(), 'codexui-managed-update-'))
  const statePath = resolve(tempHome, 'edge-alpha.state.json')
  const packageSpec = module.CONNECTOR_NPM_PACKAGE_SPEC
  await module.writeManagedConnectorRuntimeState(statePath, module.createManagedConnectorRuntimeState({
    connectorId: 'edge-alpha',
    hubAddress: 'https://hub.example.test',
    tokenFilePath: resolve(tempHome, 'edge-alpha.token'),
    packageSpec,
    runnerMode: 'script',
    currentVersion: '0.1.5',
  }))

  const statuses = []
  const applyResult = await module.applyManagedConnectorJob({
    runtimeStateFile: statePath,
    job: {
      id: 'job-1',
      action: 'update',
      targetVersion: '0.1.5',
      artifact: {
        version: '0.1.5',
        artifactUrl: 'https://downloads.example.test/codexui-connector-0.1.5.tgz',
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    },
  }, {
    downloadArtifact: async () => ({
      packageSpec: resolve(tempHome, 'connector-0.1.5.tgz'),
      version: '0.1.5',
    }),
    validatePackageSpec: async () => ({ version: '0.1.5' }),
    reportStatus: async (status) => {
      statuses.push(status.status)
    },
  })

  assert.equal(applyResult.restartRequested, true)
  assert.deepEqual(statuses, ['downloading', 'verifying', 'applying', 'restarting'])
  const stagedState = await module.readManagedConnectorRuntimeState(statePath)
  assert.equal(stagedState.packageSpec, resolve(tempHome, 'connector-0.1.5.tgz'))
  assert.equal(stagedState.previousPackageSpec, packageSpec)
  assert.equal(stagedState.pendingJobId, 'job-1')
  assert.equal(stagedState.pendingTargetVersion, '0.1.5')

  const finalizeStatuses = []
  const finalizeResult = await module.finalizeManagedConnectorJob({
    runtimeStateFile: statePath,
    currentVersion: '0.1.5',
  }, {
    reportStatus: async (status) => {
      finalizeStatuses.push(status.status)
    },
  })

  assert.equal(finalizeResult.restartRequested, false)
  assert.deepEqual(finalizeStatuses, ['healthy'])
  const finalState = await module.readManagedConnectorRuntimeState(statePath)
  assert.equal(finalState.packageSpec, resolve(tempHome, 'connector-0.1.5.tgz'))
  assert.equal(finalState.pendingJobId, undefined)
  assert.equal(finalState.currentVersion, '0.1.5')
})
