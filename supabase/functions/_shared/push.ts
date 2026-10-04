import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:brain-dump@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

export interface PushMessage {
  title: string;
  body: string;
  url?: string; // path inside the app to open on tap
  tag?: string; // same tag replaces an older notification instead of stacking
}

/** Sends to every device the person has enabled. Returns how many deliveries succeeded. */
export async function sendToUser(db: SupabaseClient, userId: string, message: PushMessage): Promise<number> {
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw error;

  let delivered = 0;
  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60 * 6 },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the device unsubscribed or the app was removed. Forget it.
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push failed", status, err);
        }
      }
    }),
  );
  return delivered;
}
