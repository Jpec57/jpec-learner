// Push-notification handlers, folded into the generated PWA service worker
// via workbox.importScripts (see vite.config.ts). The backend's hourly digest
// job (app/services/push.py) sends a push once a day per user when they have
// reviews due.

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "JpecLearner";
  const options = {
    body: data.body || "You have cards due for review.",
    icon: "/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // navigator.setAppBadge isn't reliably callable from service-worker
      // scope across browsers (notably Safari), so tell any open tab to
      // refetch the due count and update the badge itself instead.
      self.clients.matchAll({ type: "window" }).then((clients) => {
        for (const client of clients) client.postMessage({ type: "PUSH_RECEIVED" });
      }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
