// Push-notification handler scaffolding (Phase 7). Not registered yet — Phase 8
// wires up the real service worker (via vite-plugin-pwa) and will fold these
// handlers into it. Nothing currently sends a push (no scheduler/digest job
// exists on the backend), so this only documents the intended shape.

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "JpecLearner";
  const options = {
    body: data.body || "You have cards due for review.",
    icon: "/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
