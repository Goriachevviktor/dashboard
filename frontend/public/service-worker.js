self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  const title = payload.title || 'Дашборд руководителя';
  const options = {
    body: payload.body || '',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    data: { url: payload.url || '/dashboard.html' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let requestedUrl;
  try {
    requestedUrl = new URL(event.notification.data?.url || '/dashboard.html', self.location.origin);
  } catch {
    requestedUrl = new URL('/dashboard.html', self.location.origin);
  }
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : `${self.location.origin}/dashboard.html`;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
