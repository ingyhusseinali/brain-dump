// The follow-up engine. A database cron job calls this every 5 minutes.
// It sends due reminders, re-nudges ignored ones, wakes snoozed items,
// and sends one gentle daily digest per person.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sendToUser } from "../_shared/push.ts";
import { buildPlan } from "../_shared/plan.ts";
import {
  digestDue,
  dueNudges,
  inQuietHours,
  localDate,
  localHour,
  type Item,
  type Nudge,
  type Profile,
} from "../_shared/schedule.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function nudgeText(n: Nudge): { title: string; body: string } {
  const { item } = n;
  switch (n.reason) {
    case "due":
      return { title: item.kind === "reminder" ? "Reminder" : "Heads up", body: item.title };
    case "again":
      return { title: "Still on your list", body: `${item.title}. Done, or snooze it?` };
    case "snooze_over":
      return { title: "Back from snooze", body: item.title };
  }
}

async function runForUser(userId: string, profile: Profile, items: Item[], now: Date) {
  const quiet = inQuietHours(localHour(now, profile.timezone), profile.quiet_start, profile.quiet_end);
  const nowIso = now.toISOString();

  for (const n of dueNudges(items, now)) {
    if (n.reason === "snooze_over") {
      // Wake it up even during quiet hours so it shows in the app; only the notification waits.
      await db.from("items").update({ status: "open", snoozed_until: null }).eq("id", n.item.id);
      n.item.status = "open";
    }
    if (quiet) continue;
    const text = nudgeText(n);
    await sendToUser(db, userId, { ...text, url: `?item=${n.item.id}`, tag: n.item.id });
    await db
      .from("items")
      .update({ last_nudged_at: nowIso, nudge_count: n.reason === "again" ? n.item.nudge_count + 1 : 1 })
      .eq("id", n.item.id);
  }

  if (digestDue(profile, now)) {
    // Mark first so a slow or failed Claude call never causes a double morning message.
    await db.from("profiles").update({ last_digest_on: localDate(now, profile.timezone) }).eq("user_id", userId);
    if (!items.length) return;
    const { plan } = await buildPlan(db, userId, profile.timezone, now);
    if (!plan.entries.length) return;
    const count = plan.entries.length;
    await sendToUser(db, userId, {
      title: plan.headline,
      body: `Your list for today is ready: ${count} ${count === 1 ? "thing" : "things"}, one at a time.`,
      url: "?view=today",
      tag: "digest",
    });
  }
}

Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok } = await db.rpc("cron_secret_matches", { candidate: secret });
  if (!ok) return new Response("Forbidden", { status: 403 });

  const now = new Date();
  const { data: profiles, error } = await db
    .from("profiles")
    .select("user_id, timezone, quiet_start, quiet_end, digest_hour, last_digest_on");
  if (error) return new Response(error.message, { status: 500 });

  const results: Record<string, string> = {};
  for (const p of profiles ?? []) {
    const { data: items } = await db
      .from("items")
      .select("*")
      .eq("user_id", p.user_id)
      .in("status", ["open", "snoozed"]);
    try {
      await runForUser(p.user_id, p, (items ?? []) as Item[], now);
      results[p.user_id] = "ok";
    } catch (err) {
      console.error("nudge failed for", p.user_id, err);
      results[p.user_id] = "error";
    }
  }
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
