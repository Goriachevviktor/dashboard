const CACHE_VERSION = "dashboard-pwa-rescue-v3";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("dashboard-pwa-"))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", () => {
  // Rescue mode: do not intercept requests. The app must always load fresh HTML.
});
self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Dashboard";
  const options = {
    body: payload.body || "Новое уведомление",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-maskable-icon-192.png",
    tag: payload.tag || "dashboard-notification",
    data: { url: payload.url || "/dashboard.html" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/dashboard.html", self.location.origin).href;
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url === targetUrl && "focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
