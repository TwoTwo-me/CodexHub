import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import {
  CHANNEL_ID_HEADER,
  DEFAULT_CHANNEL_ID,
  SERVER_ID_HEADER,
  buildServerRoutingHeaders,
  buildServerScopedEventUrl,
  buildServerScopedRequestInit,
} from '../../scripts/testing/server-routing-helpers.mjs'

test('buildServerRoutingHeaders injects normalized server id header', () => {
  const headers = buildServerRoutingHeaders('  alpha-node  ', DEFAULT_CHANNEL_ID, { 'Content-Type': 'application/json' })

  assert.equal(headers['Content-Type'], 'application/json')
  assert.equal(headers[SERVER_ID_HEADER], 'alpha-node')
  assert.equal(Object.prototype.hasOwnProperty.call(headers, CHANNEL_ID_HEADER), false)
})

test('buildServerRoutingHeaders omits server header when serverId is empty', () => {
  const headers = buildServerRoutingHeaders('   ', DEFAULT_CHANNEL_ID, { Accept: 'application/json' })

  assert.equal(headers.Accept, 'application/json')
  assert.equal(Object.prototype.hasOwnProperty.call(headers, SERVER_ID_HEADER), false)
  assert.equal(Object.prototype.hasOwnProperty.call(headers, CHANNEL_ID_HEADER), false)
})

test('buildServerRoutingHeaders includes channel header for agent routes', () => {
  const headers = buildServerRoutingHeaders('edge-primary', 'agent:remote-east', { Accept: 'application/json' })

  assert.equal(headers.Accept, 'application/json')
  assert.equal(headers[SERVER_ID_HEADER], 'edge-primary')
  assert.equal(headers[CHANNEL_ID_HEADER], 'agent:remote-east')
})

test('buildServerScopedRequestInit preserves body and adds server routing header', () => {
  const body = JSON.stringify({ method: 'threads/list', params: null })
  const init = buildServerScopedRequestInit({
    method: 'POST',
    body,
    serverId: 'server-eu-1',
    channelId: 'agent:edge-worker-1',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  assert.equal(init.method, 'POST')
  assert.equal(init.body, body)
  assert.equal(init.headers['Content-Type'], 'application/json')
  assert.equal(init.headers[SERVER_ID_HEADER], 'server-eu-1')
  assert.equal(init.headers[CHANNEL_ID_HEADER], 'agent:edge-worker-1')
})

test('buildServerScopedEventUrl appends serverId query for event stream routing', () => {
  const eventsUrl = buildServerScopedEventUrl('/codex-api/events', 'edge-a', 'agent:edge-a')
  const parsed = new URL(eventsUrl, 'http://localhost')

  assert.equal(parsed.pathname, '/codex-api/events')
  assert.equal(parsed.searchParams.get('serverId'), 'edge-a')
  assert.equal(parsed.searchParams.get('channelId'), 'agent:edge-a')
})

test('buildServerScopedRequestInit sends server routing header over HTTP', async () => {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      serverIdHeader: req.headers[SERVER_ID_HEADER],
    })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind local test server')
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/codex-api/rpc`,
      buildServerScopedRequestInit({
        method: 'POST',
        serverId: 'routing-test',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'health/ping', params: null }),
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].method, 'POST')
    assert.equal(requests[0].url, '/codex-api/rpc')
    assert.equal(requests[0].serverIdHeader, 'routing-test')
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
})

test('buildServerScopedRequestInit sends channel routing header over HTTP', async () => {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      serverIdHeader: req.headers[SERVER_ID_HEADER],
      channelIdHeader: req.headers[CHANNEL_ID_HEADER],
    })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind local test server')
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/codex-api/rpc`,
      buildServerScopedRequestInit({
        method: 'POST',
        serverId: 'relay-target',
        channelId: 'agent:relay-edge-1',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'health/ping', params: null }),
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].method, 'POST')
    assert.equal(requests[0].url, '/codex-api/rpc')
    assert.equal(requests[0].serverIdHeader, 'relay-target')
    assert.equal(requests[0].channelIdHeader, 'agent:relay-edge-1')
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
})
