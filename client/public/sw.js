// Service worker: shows push notifications and opens the right page when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  const url = data.url ?? '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Already looking at exactly this page – no need to buzz.
    if (windows.some((c) => c.focused && c.visibilityState === 'visible' && new URL(c.url).pathname === url)) return;
    await self.registration.showNotification(data.title ?? 'Holte Roklub', {
      body: data.body ?? '',
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (existing) {
      existing.postMessage({ type: 'navigate', url });
      return existing.focus();
    }
    return self.clients.openWindow(url);
  })());
});
