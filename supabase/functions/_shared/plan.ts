import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { writePlan } from "./claude.ts";
import { AREAS, localDate, planCandidates, type Item } from "./schedule.ts";

export interface PlanRow {
  plan_date: string;
  headline: string;
  entries: { item_id: string; why: string }[];
  generated_at: string;
}

const DAY = 86_400_000;

/**
 * Returns today's plan for a person, writing it with Claude if there isn't one yet
 * (or if `force` is set). New steps Claude suggests become real items, so ticking
 * them off works like any other item.
 */
export async function buildPlan(
  db: SupabaseClient,
  userId: string,
  timeZone: string,
  now: Date,
  force = false,
): Promise<{ plan: PlanRow; created: boolean }> {
  const planDate = localDate(now, timeZone);

  if (!force) {
    const { data: existing } = await db
      .from("plans")
      .select("plan_date, headline, entries, generated_at")
      .eq("user_id", userId)
      .eq("plan_date", planDate)
      .maybeSingle();
    if (existing) return { plan: existing as PlanRow, created: false };
  }

  const since = new Date(now.getTime() - 30 * DAY).toISOString();
  const [{ data: open, error }, { data: done }] = await Promise.all([
    db.from("items").select("*").eq("user_id", userId).in("status", ["open", "snoozed"]),
    db
      .from("items")
      .select("title, area, completed_at")
      .eq("user_id", userId)
      .eq("status", "done")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false }),
  ]);
  if (error) throw error;

  const candidates = planCandidates((open ?? []) as Item[], now);
  const lastDone = new Map<string, number>();
  for (const d of done ?? []) {
    const t = Date.parse(d.completed_at);
    if (t > (lastDone.get(d.area) ?? 0)) lastDone.set(d.area, t);
  }
  const areaActivity = Object.fromEntries(
    AREAS.map((a) => {
      const t = lastDone.get(a);
      return [a, t ? `${Math.floor((now.getTime() - t) / DAY)} days` : "nothing in 30+ days"];
    }),
  );
  const recentlyDone = (done ?? [])
    .filter((d) => now.getTime() - Date.parse(d.completed_at) < 3 * DAY)
    .map((d) => d.title);

  const output = await writePlan(
    candidates.map((i) => ({
      id: i.id,
      kind: i.kind,
      area: i.area,
      title: i.title,
      details: i.details,
      remind_at: i.remind_at,
      priority: i.priority,
      status: i.status,
      days_untouched: Math.floor((now.getTime() - Date.parse(i.updated_at)) / DAY),
      times_nudged: i.nudge_count,
    })),
    recentlyDone,
    areaActivity,
    now,
    timeZone,
  );

  const entries: PlanRow["entries"] = [];
  for (const e of output.entries) {
    if (e.item_id) {
      entries.push({ item_id: e.item_id, why: e.why });
    } else if (e.new_task) {
      const { data: created, error: insertError } = await db
        .from("items")
        .insert({
          user_id: userId,
          kind: "task",
          origin: "plan",
          area: e.new_task.area,
          title: e.new_task.title,
          details: e.new_task.details,
          priority: Math.min(3, Math.max(1, e.new_task.priority)),
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      entries.push({ item_id: created.id, why: e.why });
    }
  }

  const plan: PlanRow = { plan_date: planDate, headline: output.headline, entries, generated_at: now.toISOString() };
  const { error: upsertError } = await db.from("plans").upsert({ user_id: userId, ...plan });
  if (upsertError) throw upsertError;
  return { plan, created: true };
}
