type PwaConfig = {
  vapidPublicKey: string
  subject: string
}

type StoredBrowserSubscription = {
  endpoint: string
  createdAtIso: string
  updatedAtIso: string
  failureCount?: number
  platform?: string
  userAgent?: string
  lastSuccessAtIso?: string
  lastFailureAtIso?: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/gu, '+').replace(/_/gu, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0))
}

export function isBrowserNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function ensurePwaShellRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (!isBrowserNotificationSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export async function getPwaConfig(): Promise<PwaConfig> {
  const response = await fetch('/codex-api/pwa/config')
  const payload = (await response.json()) as unknown
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  if (!response.ok || !data) {
    throw new Error(readString(envelope?.error) || 'Failed to load browser notification config')
  }
  return {
    vapidPublicKey: readString(data.vapidPublicKey),
    subject: readString(data.subject),
  }
}

export async function getStoredBrowserSubscriptions(): Promise<StoredBrowserSubscription[]> {
  const response = await fetch('/codex-api/pwa/subscriptions')
  const payload = (await response.json()) as unknown
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  const rows = Array.isArray(data?.subscriptions) ? data.subscriptions : []
  if (!response.ok) {
    throw new Error(readString(envelope?.error) || 'Failed to load browser notification subscriptions')
  }
  return rows
    .map((row) => {
      const record = asRecord(row)
      if (!record) return null
      const endpoint = readString(record.endpoint)
      if (!endpoint) return null
      return {
        endpoint,
        createdAtIso: readString(record.createdAtIso),
        updatedAtIso: readString(record.updatedAtIso),
        ...(typeof record.failureCount === 'number' ? { failureCount: record.failureCount } : {}),
        ...(readString(record.platform) ? { platform: readString(record.platform) } : {}),
        ...(readString(record.userAgent) ? { userAgent: readString(record.userAgent) } : {}),
        ...(readString(record.lastSuccessAtIso) ? { lastSuccessAtIso: readString(record.lastSuccessAtIso) } : {}),
        ...(readString(record.lastFailureAtIso) ? { lastFailureAtIso: readString(record.lastFailureAtIso) } : {}),
      }
    })
    .filter((row): row is StoredBrowserSubscription => row !== null)
}

async function persistBrowserSubscription(subscription: Record<string, unknown>): Promise<StoredBrowserSubscription> {
  const response = await fetch('/codex-api/pwa/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription,
      platform: navigator.platform || navigator.userAgent,
      userAgent: navigator.userAgent,
    }),
  })
  const payload = (await response.json()) as unknown
  const envelope = asRecord(payload)
  const data = asRecord(envelope?.data)
  if (!response.ok || !data) {
    throw new Error(readString(envelope?.error) || 'Failed to save browser notification subscription')
  }
  return {
    endpoint: readString(data.endpoint),
    createdAtIso: readString(data.createdAtIso),
    updatedAtIso: readString(data.updatedAtIso),
    ...(readString(data.platform) ? { platform: readString(data.platform) } : {}),
    ...(readString(data.userAgent) ? { userAgent: readString(data.userAgent) } : {}),
  }
}

export async function enableBrowserNotifications(): Promise<StoredBrowserSubscription> {
  if (!isBrowserNotificationSupported()) {
    throw new Error('This browser does not support service worker push notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const { vapidPublicKey } = await getPwaConfig()
  if (!vapidPublicKey) {
    throw new Error('Hub push notifications are not configured.')
  }

  const registration = await ensurePwaShellRegistered()
  if (!registration) {
    throw new Error('Failed to register the service worker for notifications.')
  }

  const existingSubscription = await registration.pushManager.getSubscription()
  const activeSubscription = existingSubscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
  })
  return await persistBrowserSubscription(activeSubscription.toJSON() as Record<string, unknown>)
}

export async function disableBrowserNotifications(endpointHint?: string): Promise<void> {
  if (!isBrowserNotificationSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  const endpoint = subscription?.endpoint || endpointHint || ''
  if (endpoint) {
    await fetch('/codex-api/pwa/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
  }
  if (subscription) {
    await subscription.unsubscribe().catch(() => {})
  }
}
