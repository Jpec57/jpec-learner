import { api } from "@/lib/api";

export async function getDueCount(): Promise<number> {
  const { data } = await api.get<{ total_due: number }>("/reviews/due-count");
  return data.total_due;
}

export async function getVapidPublicKey(): Promise<string> {
  const { data } = await api.get<{ public_key: string }>("/notifications/vapid-public-key");
  return data.public_key;
}

export async function subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post("/notifications/subscribe", {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys!.p256dh, auth: subscription.keys!.auth },
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await api.delete("/notifications/subscribe", { params: { endpoint } });
}
