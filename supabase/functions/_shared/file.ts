import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { NoAIError, sortDump, writeOutput, type DumpImage, type OutputPlan, type SortResult } from "./claude.ts";
import { sendToUser } from "./push.ts";
import { localDate } from "./schedule.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const DAY = 86_400_000;

export interface DumpRow {
  id: string;
  body: string;
  image_paths: string[];
}

const MEDIA_TYPES: Record<string, DumpImage["media_type"]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Photos attached to a dump, from the private storage bucket. */
async function loadImages(db: SupabaseClient, paths: string[]): Promise<DumpImage[]> {
  const images: DumpImage[] = [];
  for (const path of paths.slice(0, 6)) {
    const { data, error } = await db.storage.from("dump-images").download(path);
    if (error || !data) {
      console.error("image download failed", path, error);
      continue;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
    images.push({ media_type: MEDIA_TYPES[ext] ?? "image/jpeg", data: encodeBase64(new Uint8Array(await data.arrayBuffer())) });
  }
  return images;
}

/** Claims a dump for filing. False if it's done or another run is already on it. */
export async function claimDump(db: SupabaseClient, dumpId: string, now: Date): Promise<boolean> {
  const stale = new Date(now.getTime() - 10 * 60_000).toISOString();
  const { data } = await db
    .from("dumps")
    .update({ processing_started_at: now.toISOString() })
    .eq("id", dumpId)
    .is("processed_at", null)
    .or(`processing_started_at.is.null,processing_started_at.lt.${stale}`)
    .select("id");
  return (data?.length ?? 0) > 0;
}

/** Claims, files and records the outcome of one dump. */
export async function processDump(
  db: SupabaseClient,
  userId: string,
  dump: DumpRow,
  timeZone: string,
): Promise<FileResult | null> {
  if (!(await claimDump(db, dump.id, new Date()))) return null;
  try {
    const result = await fileDump(db, userId, dump, timeZone, new Date());
    await db.from("dumps").update({ processed_at: new Date().toISOString(), error: null }).eq("id", dump.id);
    return result;
  } catch (err) {
    if (err instanceof NoAIError) {
      // Free setup: leave it waiting for Claude's next round, not marked as failed.
      await db.from("dumps").update({ processing_started_at: null }).eq("id", dump.id);
      return null;
    }
    console.error("filing failed", dump.id, err);
    // The raw dump is already saved; record the failure so the app can offer a retry.
    await db
      .from("dumps")
      .update({ error: String((err as Error).message ?? err), processing_started_at: null })
      .eq("id", dump.id);
    throw err;
  }
}

export interface FileResult {
  items: number;
  outputs: number;
  completed: number;
}

/**
 * Puts one dump in its place: items into folders, drafts (slides, notes, emails...)
 * written or updated, and anything they said they finished marked done.
 */
export async function fileDump(
  db: SupabaseClient,
  userId: string,
  dump: DumpRow,
  timeZone: string,
  now: Date,
): Promise<FileResult> {
  const images = await loadImages(db, dump.image_paths ?? []);
  const { data: profile } = await db
    .from("profiles")
    .select("about_me, currency, monthly_budget, budget_categories, last_budget_alert_for")
    .eq("user_id", userId)
    .single();
  const currency: string = profile?.currency ?? "EGP";
  const { data: goals } = await db.from("savings_goals").select("id, title, target, saved").eq("user_id", userId).eq("status", "active");
  const aboutMe: string = profile?.about_me ?? "";
  const [folders, outputs, open] = await Promise.all([
    db.from("folders").select("id, name, kind").eq("user_id", userId).eq("archived", false),
    db
      .from("outputs")
      .select("id, folder_id, type, title")
      .eq("user_id", userId)
      .neq("status", "archived")
      .gte("updated_at", new Date(now.getTime() - 60 * DAY).toISOString())
      .order("updated_at", { ascending: false })
      .limit(40),
    db
      .from("items")
      .select("id, title")
      .eq("user_id", userId)
      .in("status", ["open", "snoozed"])
      .order("updated_at", { ascending: false })
      .limit(150),
  ]);
  for (const r of [folders, outputs, open]) if (r.error) throw r.error;

  const folderIds = new Map<string, string>((folders.data ?? []).map((f) => [f.name.toLowerCase(), f.id]));
  const folderNames = new Map<string, string>((folders.data ?? []).map((f) => [f.id, f.name]));

  const sorted = await sortDump(dump.body, images, now, timeZone, {
    folders: (folders.data ?? []).map((f) => ({ name: f.name, kind: f.kind })),
    outputs: (outputs.data ?? []).map((o) => ({
      id: o.id,
      folder: o.folder_id ? folderNames.get(o.folder_id) ?? null : null,
      type: o.type,
      title: o.title,
    })),
    openItems: open.data ?? [],
    aboutMe,
    currency,
    savingsGoals: (goals ?? []).map((g) => ({ title: g.title, target: Number(g.target), saved: Number(g.saved) })),
  });

  async function folderId(name: string | null, kind = "general", area = "personal"): Promise<string | null> {
    if (!name?.trim()) return null;
    const key = name.trim().toLowerCase();
    const known = folderIds.get(key);
    if (known) return known;
    const { data, error } = await db
      .from("folders")
      .insert({ user_id: userId, name: name.trim(), kind, area })
      .select("id")
      .single();
    if (error) {
      // Another dump created it at the same moment.
      const { data: existing } = await db.from("folders").select("id").eq("user_id", userId).ilike("name", name.trim()).maybeSingle();
      if (!existing) throw error;
      folderIds.set(key, existing.id);
      return existing.id;
    }
    folderIds.set(key, data.id);
    return data.id;
  }

  // Create folders for outputs first so their kind and area come from the output plan.
  for (const o of sorted.outputs) await folderId(o.folder, o.folder_kind, o.folder_area);

  // Write all drafts in parallel. A failed draft never blocks the rest of the dump.
  const outputIds = new Map<string, string>();
  await Promise.all(
    sorted.outputs.map(async (plan: OutputPlan) => {
      try {
        let existing: string | null = null;
        if (plan.update_output_id) {
          const { data } = await db.from("outputs").select("content").eq("id", plan.update_output_id).single();
          existing = data?.content ?? null;
        }
        const written = await writeOutput(plan, dump.body, images, existing, now, timeZone, aboutMe);
        const row = {
          folder_id: await folderId(plan.folder, plan.folder_kind, plan.folder_area),
          type: plan.type,
          title: plan.title,
          content: written.content,
          email_to: written.email_to,
          email_subject: written.email_subject,
          email_account: plan.type === "email" ? plan.email_account ?? "personal" : null,
        };
        if (plan.update_output_id && existing !== null) {
          const { data: prev } = await db.from("outputs").select("source_dump_ids").eq("id", plan.update_output_id).single();
          const { error } = await db
            .from("outputs")
            .update({ ...row, status: "draft", source_dump_ids: [...(prev?.source_dump_ids ?? []), dump.id] })
            .eq("id", plan.update_output_id);
          if (error) throw error;
          outputIds.set(plan.ref, plan.update_output_id);
        } else {
          const { data, error } = await db
            .from("outputs")
            .insert({ ...row, user_id: userId, source_dump_ids: [dump.id] })
            .select("id")
            .single();
          if (error) throw error;
          outputIds.set(plan.ref, data.id);
        }
      } catch (err) {
        console.error("draft failed", plan.type, plan.title, err);
      }
    }),
  );

  if (sorted.items.length) {
    const rows = [];
    for (const { folder, output_ref, ...item } of sorted.items) {
      rows.push({
        ...item,
        user_id: userId,
        dump_id: dump.id,
        folder_id: await folderId(folder, "general", item.area),
        output_id: output_ref ? outputIds.get(output_ref) ?? null : null,
      });
    }
    const { error } = await db.from("items").insert(rows);
    if (error) throw error;
  }

  if (sorted.completed_item_ids.length) {
    await db
      .from("items")
      .update({ status: "done", completed_at: now.toISOString() })
      .eq("user_id", userId)
      .in("id", sorted.completed_item_ids);
  }

  // Remember lasting facts about their life for every future dump, list and draft.
  const facts = sorted.about_me_additions.map((f) => f.trim()).filter((f) => f && !aboutMe.includes(f));
  if (facts.length) {
    const next = [aboutMe.trim(), ...facts.map((f) => `- ${f}`)].filter(Boolean).join("\n").slice(-6000);
    await db.from("profiles").update({ about_me: next }).eq("user_id", userId);
  }

  for (const e of sorted.cycle_events) {
    if (e.type === "period_start") {
      await db.from("cycles").upsert({ user_id: userId, started_on: e.date }, { onConflict: "user_id,started_on" });
    } else {
      const { data: open } = await db
        .from("cycles")
        .select("id")
        .eq("user_id", userId)
        .is("ended_on", null)
        .lte("started_on", e.date)
        .order("started_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) await db.from("cycles").update({ ended_on: e.date }).eq("id", open.id);
    }
  }

  await applyMoney(db, userId, dump.id, sorted, goals ?? [], currency, profile, now, timeZone);

  return { items: sorted.items.length, outputs: outputIds.size, completed: sorted.completed_item_ids.length };
}

/** Records spending, income and savings, new savings goals and budget changes, then warns once if the month's budget is nearly used. */
async function applyMoney(
  db: SupabaseClient,
  userId: string,
  dumpId: string,
  sorted: SortResult,
  goals: { id: string; title: string; target: number; saved: number }[],
  currency: string,
  profile: { monthly_budget: number | null; budget_categories: Record<string, number> | null; last_budget_alert_for: string | null } | null,
  now: Date,
  timeZone: string,
) {
  const byTitle = new Map(goals.map((g) => [g.title.trim().toLowerCase(), { ...g, saved: Number(g.saved), target: Number(g.target) }]));

  for (const g of sorted.new_savings_goals) {
    if (byTitle.has(g.title.trim().toLowerCase())) continue;
    const { data } = await db
      .from("savings_goals")
      .insert({ user_id: userId, title: g.title.trim(), target: g.target, currency: g.currency || currency, deadline: /^\d{4}-\d{2}-\d{2}$/.test(g.deadline ?? "") ? g.deadline : null })
      .select("id, title, target, saved")
      .single();
    if (data) byTitle.set(data.title.toLowerCase(), { ...data, saved: 0, target: Number(data.target) });
  }

  if (sorted.money_entries.length) {
    const rows = sorted.money_entries.map((m) => {
      const goal = m.goal_title ? byTitle.get(m.goal_title.trim().toLowerCase()) : undefined;
      if (goal && m.kind === "saving") goal.saved += m.amount;
      return {
        user_id: userId,
        kind: m.kind,
        amount: Math.round(m.amount * 100) / 100,
        currency: m.currency || currency,
        category: m.kind === "income" ? "income" : m.kind === "saving" ? "savings" : m.category,
        note: m.note,
        happened_on: m.date,
        goal_id: goal?.id ?? null,
        dump_id: dumpId,
      };
    });
    const { error } = await db.from("money_entries").insert(rows);
    if (error) throw error;
    for (const g of byTitle.values()) {
      if (!rows.some((r) => r.goal_id === g.id)) continue;
      await db.from("savings_goals").update({ saved: g.saved, status: g.saved >= g.target ? "reached" : "active" }).eq("id", g.id);
    }
  }

  let budget = profile?.monthly_budget ?? null;
  if (sorted.budget) {
    const categories = { ...(profile?.budget_categories ?? {}) };
    for (const c of sorted.budget.categories) categories[c.category] = c.amount;
    if (sorted.budget.monthly_total !== null) budget = sorted.budget.monthly_total;
    await db.from("profiles").update({ monthly_budget: budget, budget_categories: categories }).eq("user_id", userId);
  }

  // One gentle heads-up per month at 80%, and one at 100%.
  if (!budget || !sorted.money_entries.some((m) => m.kind === "expense")) return;
  const month = localDate(now, timeZone).slice(0, 7);
  const { data: spent } = await db
    .from("money_entries")
    .select("amount")
    .eq("user_id", userId)
    .eq("kind", "expense")
    .gte("happened_on", `${month}-01`);
  const total = (spent ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const level = total >= budget ? 100 : total >= budget * 0.8 ? 80 : 0;
  const key = `${month}:${String(level).padStart(3, "0")}`; // "080" sorts before "100"
  if (!level || (profile?.last_budget_alert_for ?? "") >= key) return;
  await db.from("profiles").update({ last_budget_alert_for: key }).eq("user_id", userId);
  await sendToUser(db, userId, {
    title: level === 100 ? "💰 This month's budget is used up" : "💰 80% of this month's budget used",
    body: `${Math.round(total).toLocaleString("en")} of ${Math.round(budget).toLocaleString("en")} ${currency} spent. Tap to see where it went.`,
    url: "?view=money",
    tag: "budget",
  });
}
