// The follow-up engine. A database cron job calls this every 5 minutes.
// Per person it: files any dump left behind, retires stale tasks, announces prayer times,
// sends due and ignored reminders (with fresh wording each time), sends the morning list,
// the daily learning bite and an evening Quran nudge.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sendToUser } from "../_shared/push.ts";
import { buildPlan } from "../_shared/plan.ts";
import { processDump } from "../_shared/file.ts";
import { suggestMeal } from "../_shared/meal.ts";
import { createLearningBite } from "../_shared/learning.ts";
import { prayerTimesFor } from "../_shared/prayer.ts";
import { hasAI, NUDGE_STYLES, writeNudge } from "../_shared/claude.ts";
import {
  dailyDue,
  fertileWindow,
  onPeriod,
  type Cycle,
  digestDue,
  dueNudges,
  inPrayerHold,
  inQuietHours,
  isWeekend,
  localDate,
  localHour,
  localMinutes,
  prayerDue,
  staleToRetire,
  type Item,
  type Nudge,
  type PrayerTime,
  type Profile,
} from "../_shared/schedule.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

interface FullProfile extends Profile {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  prayer_reminders: boolean;
  prayer_fajr: boolean;
  last_prayer_sent: string | null;
  quran_daily: boolean;
  quran_page: number;
  quran_last_read: string | null;
  last_quran_nudge_on: string | null;
  learning_daily: boolean;
  learning_minute: number;
  last_learning_on: string | null;
  cycle_tracking: boolean;
  about_me: string;
  study_topics: string;
  cooking_daily: boolean;
  cooking_minute: number;
  last_meal_on: string | null;
  meal_today_id: string | null;
  meal_pushed_on: string | null;
  last_fertile_nudge_for: string | null;
}

const PRAYER_LABEL: Record<string, [string, string]> = {
  fajr: ["Fajr", "الفجر"],
  dhuhr: ["Dhuhr", "الظهر"],
  asr: ["Asr", "العصر"],
  maghrib: ["Maghrib", "المغرب"],
  isha: ["Isha", "العشاء"],
};

function templateText(n: Nudge): { title: string; body: string } {
  const { item } = n;
  switch (n.reason) {
    case "due":
      return { title: item.output_id ? "Ready to send" : item.kind === "reminder" ? "Now's the time" : "Heads up", body: item.title };
    case "again":
      return { title: "Still on your list", body: `${item.title}. Done, or snooze it?` };
    case "snooze_over":
      return { title: "Back from snooze", body: item.title };
  }
}

/** Re-nudges get fresh, varied wording so they don't blur into background noise. */
async function nudgeText(n: Nudge, draftType: string | null): Promise<{ title: string; body: string }> {
  if (n.reason !== "again") return templateText(n);
  const style = NUDGE_STYLES[(n.item.nudge_count + n.item.title.length) % NUDGE_STYLES.length];
  try {
    return await writeNudge(
      { title: n.item.title, details: n.item.details, kind: n.item.kind, draft_type: draftType },
      style,
      n.item.nudge_count + 1,
    );
  } catch (err) {
    console.error("nudge text fell back to template", err);
    return templateText(n);
  }
}

async function runForUser(profile: FullProfile, items: Item[], now: Date) {
  const userId = profile.user_id;
  const today = localDate(now, profile.timezone);

  // Safety net: file any dump the app saved but couldn't get filed (closed too soon, no signal).
  const { data: waiting } = await db
    .from("dumps")
    .select("id, body, image_paths")
    .eq("user_id", userId)
    .is("processed_at", null)
    .is("error", null)
    .lt("created_at", new Date(now.getTime() - 2 * 60_000).toISOString())
    .order("created_at")
    .limit(3);
  // (In the free setup Claude files them on its own rounds instead.)
  for (const dump of hasAI() ? waiting ?? [] : []) await processDump(db, userId, dump, profile.timezone).catch(() => {});

  // Nothing to maintain: tasks ignored for weeks quietly step aside (they stay searchable).
  const stale = staleToRetire(items, now);
  if (stale.length) {
    await db.from("items").update({ status: "archived" }).in("id", stale.map((i) => i.id));
    items = items.filter((i) => !stale.includes(i));
  }

  const quiet = inQuietHours(localHour(now, profile.timezone), profile.quiet_start, profile.quiet_end);

  let cycles: Cycle[] = [];
  if (profile.cycle_tracking) {
    const { data } = await db.from("cycles").select("started_on, ended_on").eq("user_id", userId);
    cycles = data ?? [];
  }
  const period = profile.cycle_tracking && onPeriod(cycles, today);

  // Prayer times. Other nudges wait a little after each adhan.
  let prayers: PrayerTime[] = [];
  // During a period, prayer reminders pause.
  if (profile.prayer_reminders && !period && profile.latitude !== null && profile.longitude !== null) {
    prayers = prayerTimesFor(profile.latitude, profile.longitude, profile.timezone, now);
    const due = prayerDue(prayers, now, profile.last_prayer_sent, today);
    if (due && (!quiet || (due.name === "fajr" && profile.prayer_fajr))) {
      const [en, ar] = PRAYER_LABEL[due.name];
      await db.from("profiles").update({ last_prayer_sent: `${today}:${due.name}` }).eq("user_id", userId);
      await sendToUser(db, userId, { title: `${ar} · ${en}`, body: `It's time for ${en}. 🤍`, tag: "prayer" });
    }
  }
  const holdForPrayer = inPrayerHold(prayers, now);

  // Reminders.
  if (!quiet && !holdForPrayer) {
    const drafts = new Map<string, string>();
    const outputIds = items.map((i) => i.output_id).filter((id): id is string => !!id);
    if (outputIds.length) {
      const { data } = await db.from("outputs").select("id, type").in("id", outputIds);
      for (const o of data ?? []) drafts.set(o.id, o.type);
    }
    for (const n of dueNudges(items, now)) {
      if (n.reason === "snooze_over") {
        await db.from("items").update({ status: "open", snoozed_until: null }).eq("id", n.item.id);
        n.item.status = "open";
      }
      const text = await nudgeText(n, n.item.output_id ? drafts.get(n.item.output_id) ?? null : null);
      await sendToUser(db, userId, {
        ...text,
        url: n.item.output_id ? `?output=${n.item.output_id}` : `?item=${n.item.id}`,
        tag: n.item.id,
      });
      await db
        .from("items")
        .update({ last_nudged_at: now.toISOString(), nudge_count: n.reason === "again" ? n.item.nudge_count + 1 : 1 })
        .eq("id", n.item.id);
    }
  } else {
    // Snoozes still wake up so they show in the app; only the notification waits.
    const woken = dueNudges(items, now).filter((n) => n.reason === "snooze_over");
    if (woken.length) {
      await db.from("items").update({ status: "open", snoozed_until: null }).in("id", woken.map((n) => n.item.id));
    }
  }

  // Morning: today's list, written when the day starts (workday or weekend time).
  if (digestDue(profile, now)) {
    // Mark first so a slow or failed Claude call never causes a double morning message.
    await db.from("profiles").update({ last_digest_on: today }).eq("user_id", userId);
    const { plan } = items.length ? await buildPlan(db, userId, profile.timezone, now) : { plan: null };
    const count = plan?.entries.length ?? 0;
    const quran = profile.quran_daily ? ` Plus page ${profile.quran_page} of Quran.` : "";
    if (count || quran) {
      await sendToUser(db, userId, {
        title: plan?.headline ?? "Good morning",
        body: count ? `Your list is ready: ${count} ${count === 1 ? "thing" : "things"}, one at a time.${quran}` : quran.trim(),
        url: "?view=today",
        tag: "digest",
      });
    }
  }

  // Daily learning bite, alternating faith and general knowledge.
  if (profile.learning_daily && !holdForPrayer && dailyDue(profile.learning_minute, profile.last_learning_on, profile, now)) {
    if (hasAI()) {
      await db.from("profiles").update({ last_learning_on: today }).eq("user_id", userId);
      await sendLearningBite(userId, items, now, profile.about_me, profile.study_topics);
    } else {
      // Free setup: Claude writes the bite on its morning round; announce it once it's there.
      const { data: bite } = await db
        .from("outputs")
        .select("id, title")
        .eq("user_id", userId)
        .eq("type", "learning")
        .gte("created_at", new Date(now.getTime() - 20 * 3_600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bite) {
        await db.from("profiles").update({ last_learning_on: today }).eq("user_id", userId);
        await sendToUser(db, userId, { title: "🧠 5 minutes for your brain", body: bite.title, url: `?output=${bite.id}`, tag: "learning" });
      }
    }
  }

  // What to cook today, early enough to shop or defrost. If they already picked one in the app
  // (or Claude did on its morning round), this is the reminder for it.
  if (profile.cooking_daily && !holdForPrayer && dailyDue(profile.cooking_minute, profile.meal_pushed_on, profile, now)) {
    let meal: { outputId: string; title: string; teaser: string } | null = null;
    if (profile.last_meal_on === today && profile.meal_today_id) {
      const { data } = await db.from("outputs").select("id, title").eq("id", profile.meal_today_id).maybeSingle();
      if (data) meal = { outputId: data.id, title: data.title, teaser: "Tap for the recipe and ingredients." };
    } else if (hasAI()) {
      meal = await suggestMeal(db, userId, profile.timezone, now, isWeekend(profile.weekend_days, now, profile.timezone));
    }
    if (meal) {
      await db.from("profiles").update({ meal_pushed_on: today }).eq("user_id", userId);
      await sendToUser(db, userId, { title: `🍳 Tonight: ${meal.title}`, body: meal.teaser, url: `?output=${meal.outputId}`, tag: "meal" });
    }
  }

  // Evening Quran nudge if today's page isn't read yet: after Isha when prayer times are on, else 20:30.
  const isha = prayers.find((p) => p.name === "isha");
  const quranAfter = isha ? localMinutes(new Date(isha.at.getTime() + 30 * 60_000), profile.timezone) : 20 * 60 + 30;
  if (
    profile.quran_daily &&
    profile.quran_last_read !== today &&
    !holdForPrayer &&
    dailyDue(quranAfter, profile.last_quran_nudge_on, profile, now)
  ) {
    await db.from("profiles").update({ last_quran_nudge_on: today }).eq("user_id", userId);
    await sendToUser(db, userId, {
      title: "📖 Your page for today",
      body: period
        ? `Listen to page ${profile.quran_page} or do some dhikr, about 5 minutes. 🤍`
        : `Page ${profile.quran_page}, about 5 minutes. A calm way to end the day.`,
      url: "?view=today",
      tag: "quran",
    });
  }

  // Fertile window heads-up, once per cycle, after the day starts. Worded discreetly for the lock screen.
  if (profile.cycle_tracking && !quiet) {
    const window = fertileWindow(cycles, today);
    if (window && today >= window.start && today <= window.end && profile.last_fertile_nudge_for !== window.start) {
      await db.from("profiles").update({ last_fertile_nudge_for: window.start }).eq("user_id", userId);
      await sendToUser(db, userId, {
        title: "🌸 A gentle heads-up",
        body: "Your likely fertile days are here. Tap for the dates.",
        url: "?view=today",
        tag: "cycle",
      });
    }
  }
}

async function sendLearningBite(userId: string, items: Item[], now: Date, aboutMe: string, studyTopics: string) {
  const bite = await createLearningBite(db, userId, items, now, aboutMe, studyTopics);
  await sendToUser(db, userId, {
    title: bite.track === "faith" ? "🌙 5 minutes for your soul" : bite.track === "study" ? "🎓 5 minutes closer to certified" : "🧠 5 minutes for your brain",
    body: bite.teaser,
    url: bite.id ? `?output=${bite.id}` : "?view=today",
    tag: "learning",
  });
}

Deno.serve(async (req) => {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok } = await db.rpc("cron_secret_matches", { candidate: secret });
  if (!ok) return new Response("Forbidden", { status: 403 });

  const now = new Date();
  const { data: profiles, error } = await db.from("profiles").select("*");
  if (error) return new Response(error.message, { status: 500 });

  const results: Record<string, string> = {};
  for (const p of (profiles ?? []) as FullProfile[]) {
    const { data: items } = await db.from("items").select("*").eq("user_id", p.user_id).in("status", ["open", "snoozed"]);
    try {
      await runForUser(p, (items ?? []) as Item[], now);
      results[p.user_id] = "ok";
    } catch (err) {
      console.error("nudge failed for", p.user_id, err);
      results[p.user_id] = "error";
    }
  }
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
