type PwaConfig = {
  vapidPublicKey: string
  subject: string
}

export type StoredBrowserSubscription = {
  id: string
  endpoint: string
  deviceAlias?: string
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

function normalizeStoredBrowserSubscription(payload: unknown): StoredBrowserSubscription | null {
  const record = asRecord(payload)
  if (!record) return null

  const id = readString(record.id)
  const endpoint = readString(record.endpoint)
  if (!id || !endpoint) return null

  return {
    id,
    endpoint,
    deviceAlias: readString(record.deviceAlias) || undefined,
    createdAtIso: readString(record.createdAtIso),
    updatedAtIso: readString(record.updatedAtIso),
    ...(typeof record.failureCount === 'number' ? { failureCount: record.failureCount } : {}),
    ...(readString(record.platform) ? { platform: readString(record.platform) } : {}),
    ...(readString(record.userAgent) ? { userAgent: readString(record.userAgent) } : {}),
    ...(readString(record.lastSuccessAtIso) ? { lastSuccessAtIso: readString(record.lastSuccessAtIso) } : {}),
    ...(readString(record.lastFailureAtIso) ? { lastFailureAtIso: readString(record.lastFailureAtIso) } : {}),
  }
}

async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isBrowserNotificationSupported()) return null
  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

async function deleteBrowserNotificationDeviceById(id: string): Promise<void> {
  const response = await fetch(`/codex-api/pwa/subscriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status === 204) {
    return
  }

  const payload = (await response.json()) as unknown
  const envelope = asRecord(payload)
  if (!response.ok) {
    throw new Error(readString(envelope?.error) || 'Failed to delete browser notification device')
  }
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
    .map(normalizeStoredBrowserSubscription)
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
  const normalized = normalizeStoredBrowserSubscription(envelope?.data)
  if (!response.ok || !normalized) {
    throw new Error(readString(envelope?.error) || 'Failed to save browser notification subscription')
  }
  return normalized
}

export async function renameBrowserNotificationDevice(id: string, deviceAlias: string): Promise<StoredBrowserSubscription> {
  const response = await fetch(`/codex-api/pwa/subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ deviceAlias }),
  })
  const payload = (await response.json()) as unknown
  const envelope = asRecord(payload)
  const normalized = normalizeStoredBrowserSubscription(envelope?.data)
  if (!response.ok || !normalized) {
    throw new Error(readString(envelope?.error) || 'Failed to rename browser notification device')
  }
  return normalized
}

export async function getCurrentBrowserSubscriptionEndpoint(): Promise<string> {
  return (await getCurrentPushSubscription())?.endpoint ?? ''
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

export async function disableBrowserNotifications(subscription?: Pick<StoredBrowserSubscription, 'id' | 'endpoint'>): Promise<boolean> {
  if (!isBrowserNotificationSupported()) return false
  const localSubscription = await getCurrentPushSubscription()
  const localEndpoint = localSubscription?.endpoint ?? ''
  const targetEndpoint = subscription?.endpoint || localEndpoint
  const isCurrentBrowserDevice = Boolean(localEndpoint && targetEndpoint && localEndpoint === targetEndpoint)

  if (subscription?.id) {
    await deleteBrowserNotificationDeviceById(subscription.id)
  } else if (targetEndpoint) {
    await fetch('/codex-api/pwa/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: targetEndpoint }),
    })
  }

  if (isCurrentBrowserDevice && localSubscription) {
    await localSubscription.unsubscribe().catch(() => {})
  }

  return isCurrentBrowserDevice
}
