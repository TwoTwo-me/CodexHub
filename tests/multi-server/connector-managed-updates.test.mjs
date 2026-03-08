import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
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
  assert.equal(reportedVersion, '0.1.4')
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
  await module.writeManagedConnectorRuntimeState(statePath, module.createManagedConnectorRuntimeState({
    connectorId: 'edge-alpha',
    hubAddress: 'https://hub.example.test',
    tokenFilePath: resolve(tempHome, 'edge-alpha.token'),
    packageSpec: 'github:TwoTwo-me/codexUI#main',
    runnerMode: 'script',
    currentVersion: '0.1.4',
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
  assert.equal(stagedState.previousPackageSpec, 'github:TwoTwo-me/codexUI#main')
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
