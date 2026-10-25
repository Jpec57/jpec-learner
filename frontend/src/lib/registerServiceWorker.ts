// Keeps installed copies of the app up to date. Without this, a phone could
// keep running the previous version after a deploy until the app was fully
// closed, since the new service worker only takes over open pages on reload.
import { registerSW } from "virtual:pwa-register";

const CHECK_EVERY_MS = 30 * 60 * 1000;

export function registerServiceWorker() {
  // With registerType "autoUpdate", the page reloads itself once a new version is installed.
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {});
      };
      // Check when the app comes back to the foreground (phones rarely do a full reload) and periodically.
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
      setInterval(check, CHECK_EVERY_MS);
    },
  });
}
