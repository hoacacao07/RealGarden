/* NativeScape FL service worker: weather alert push notifications only (no offline caching). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Garden alert", body: "Open your garden for the task list.", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch { /* plain text payload */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, data: { url: data.url }, icon: "/favicon.ico", badge: "/favicon.ico", requireInteraction: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if ("focus" in w) { w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
