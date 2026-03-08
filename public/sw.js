self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {
    title: 'CodexUI notification',
    body: 'A new notification is available.',
    tag: 'codexui-default',
    data: {
      url: '/hooks',
      badgeCount: 0,
    },
  }

  try {
    const parsed = event.data ? event.data.json() : null
    if (parsed && typeof parsed === 'object') {
      payload = {
        ...payload,
        ...parsed,
        data: {
          ...payload.data,
          ...(parsed.data && typeof parsed.data === 'object' ? parsed.data : {}),
        },
      }
    }
  } catch {
    // best-effort parsing only
  }

  const notificationPromise = self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    badge: '/icon.svg',
    icon: '/icon.svg',
    data: payload.data,
  })

  const badgeCount = Number(payload?.data?.badgeCount ?? 0)
  const badgePromise = typeof self.navigator?.setAppBadge === 'function' && Number.isFinite(badgeCount) && badgeCount > 0
    ? self.navigator.setAppBadge(badgeCount).catch(() => {})
    : Promise.resolve()

  event.waitUntil(Promise.all([notificationPromise, badgePromise]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification?.data ?? {}
  const url = typeof data.url === 'string' && data.url.length > 0 ? data.url : '/hooks'

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      const clientUrl = new URL(client.url)
      if (clientUrl.origin === self.location.origin) {
        await client.focus()
        client.navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
