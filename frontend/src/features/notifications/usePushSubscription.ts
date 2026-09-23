import { useEffect, useState } from "react";

import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/features/notifications/api";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's pre-standard flag for "launched from the home screen".
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// PushManager.subscribe() wants the VAPID key as a raw Uint8Array, but the
// backend hands it back base64url-encoded (see generate_vapid_keys.py).
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const isSupported = "serviceWorker" in navigator && "PushManager" in window;
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(setSubscription)
      .catch(() => setSubscription(null));
  }, [isSupported]);

  async function enable() {
    setLoading(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("permission-denied");
      }
      const [registration, publicKey] = await Promise.all([navigator.serviceWorker.ready, getVapidPublicKey()]);
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await subscribePush(sub.toJSON() as PushSubscriptionJSON);
      setSubscription(sub);
    } catch {
      setError("enable-failed");
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await unsubscribePush(endpoint);
      setSubscription(null);
    } catch {
      setError("disable-failed");
    } finally {
      setLoading(false);
    }
  }

  return {
    isSupported,
    needsInstallHint: isIOS() && !isStandalone(),
    isEnabled: subscription !== null,
    loading,
    error,
    enable,
    disable,
  };
}
