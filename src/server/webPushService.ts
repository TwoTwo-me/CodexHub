import webpush from 'web-push'
import { appendFile } from 'node:fs/promises'
import { readMetadataValue, writeMetadataValue } from './sqliteStore.js'
import {
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsForUser,
  markPushSubscriptionFailure,
  markPushSubscriptionSuccess,
  type StoredPushSubscription,
} from './pushSubscriptionStore.js'

const VAPID_PUBLIC_KEY_METADATA = 'web-push-vapid-public-key'
const VAPID_PRIVATE_KEY_METADATA = 'web-push-vapid-private-key'
const DEFAULT_SUBJECT = 'mailto:codexui@example.invalid'

type HookPushNotificationPayload = {
  title: string
  body: string
  url: string
  tag: string
  badgeCount?: number
  serverLabel?: string
  projectLabel?: string
  threadTitle?: string
  command?: string
}

type WebPushImplementation = {
  sendNotification: (subscription: unknown, payload: string, options?: unknown) => Promise<unknown>
  generateVAPIDKeys: () => { publicKey: string; privateKey: string }
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
}

let webPushImpl: WebPushImplementation = webpush as unknown as WebPushImplementation
let vapidInitialized = false

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getPushSubject(): string {
  const envSubject = process.env.CODEXUI_PUSH_SUBJECT?.trim()
  return envSubject && envSubject.length > 0 ? envSubject : DEFAULT_SUBJECT
}

function ensureVapidKeys(): { publicKey: string; privateKey: string; subject: string } {
  let publicKey = readString(readMetadataValue(VAPID_PUBLIC_KEY_METADATA))
  let privateKey = readString(readMetadataValue(VAPID_PRIVATE_KEY_METADATA))
  if (!publicKey || !privateKey) {
    const generated = webPushImpl.generateVAPIDKeys()
    publicKey = generated.publicKey
    privateKey = generated.privateKey
    writeMetadataValue(VAPID_PUBLIC_KEY_METADATA, publicKey)
    writeMetadataValue(VAPID_PRIVATE_KEY_METADATA, privateKey)
  }

  const subject = getPushSubject()
  if (!vapidInitialized) {
    webPushImpl.setVapidDetails(subject, publicKey, privateKey)
    vapidInitialized = true
  }

  return { publicKey, privateKey, subject }
}

function toNotificationBody(payload: HookPushNotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    data: {
      url: payload.url,
      badgeCount: payload.badgeCount ?? 0,
      serverLabel: payload.serverLabel ?? '',
      projectLabel: payload.projectLabel ?? '',
      threadTitle: payload.threadTitle ?? '',
      command: payload.command ?? '',
    },
  })
}

function isSubscriptionGone(error: unknown): boolean {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : NaN
  return statusCode === 404 || statusCode === 410
}

async function sendToSubscription(
  subscription: StoredPushSubscription,
  payload: HookPushNotificationPayload,
): Promise<boolean> {
  const sinkPath = process.env.CODEXUI_PUSH_TEST_SINK_PATH?.trim()
  if (sinkPath) {
    await appendFile(sinkPath, `${JSON.stringify({
      endpoint: subscription.endpoint,
      payload,
    })}\n`, 'utf8')
    markPushSubscriptionSuccess(subscription.endpoint)
    return true
  }

  ensureVapidKeys()
  try {
    await webPushImpl.sendNotification(subscription.subscription, toNotificationBody(payload), {
      TTL: 60,
      urgency: 'high',
      topic: payload.tag,
    })
    markPushSubscriptionSuccess(subscription.endpoint)
    return true
  } catch (error) {
    if (isSubscriptionGone(error)) {
      deletePushSubscriptionByEndpoint(subscription.endpoint)
      return false
    }
    markPushSubscriptionFailure(subscription.endpoint)
    return false
  }
}

export function getWebPushClientConfig(): { vapidPublicKey: string; subject: string } {
  const { publicKey, subject } = ensureVapidKeys()
  return {
    vapidPublicKey: publicKey,
    subject,
  }
}

export async function sendHookPushNotificationsToUser(
  userId: string,
  payload: HookPushNotificationPayload,
): Promise<{ sent: number; total: number }> {
  const subscriptions = listPushSubscriptionsForUser(userId)
  let sent = 0
  for (const subscription of subscriptions) {
    if (await sendToSubscription(subscription, payload)) {
      sent += 1
    }
  }
  return {
    sent,
    total: subscriptions.length,
  }
}

export function setWebPushImplementationForTests(implementation: WebPushImplementation | null): void {
  webPushImpl = implementation ?? (webpush as unknown as WebPushImplementation)
  vapidInitialized = false
}
