import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { writeMeal } from "./claude.ts";
import { localDate } from "./schedule.ts";

const RECIPES_FOLDER = "Recipes";

async function recipesFolder(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data: found } = await db.from("folders").select("id").eq("user_id", userId).ilike("name", RECIPES_FOLDER).maybeSingle();
  if (found) return found.id;
  const { data } = await db
    .from("folders")
    .insert({ user_id: userId, name: RECIPES_FOLDER, kind: "general", area: "home_family" })
    .select("id")
    .single();
  return data?.id ?? null;
}

/**
 * Picks today's meal: a saved recipe when one fits, otherwise a new simple recipe,
 * saved in the Recipes folder. Returns the recipe's output id and a notification line.
 */
export async function suggestMeal(
  db: SupabaseClient,
  userId: string,
  timeZone: string,
  now: Date,
  weekend: boolean,
): Promise<{ outputId: string; title: string; teaser: string; why: string }> {
  const today = localDate(now, timeZone);
  const weekAgo = localDate(new Date(now.getTime() - 7 * 86_400_000), timeZone);
  const [{ data: profile }, { data: recipes }, { data: kitchen }] = await Promise.all([
    db.from("profiles").select("about_me, meal_today_id").eq("user_id", userId).single(),
    db.from("outputs").select("id, title, last_cooked_on, created_at").eq("user_id", userId).eq("type", "recipe").neq("status", "archived")
      .order("created_at", { ascending: false }).limit(80),
    db.from("items").select("title").eq("user_id", userId).eq("status", "open").contains("tags", ["kitchen"]).limit(10),
  ]);

  const all = recipes ?? [];
  const recent = all.filter((r) => (r.last_cooked_on && r.last_cooked_on >= weekAgo) || r.created_at >= new Date(now.getTime() - 7 * 86_400_000).toISOString());
  const idea = await writeMeal(
    all.filter((r) => !r.last_cooked_on || r.last_cooked_on < weekAgo).map((r) => ({ id: r.id, title: r.title, tried: !!r.last_cooked_on })),
    recent.map((r) => r.title),
    (kitchen ?? []).map((k) => k.title),
    now,
    timeZone,
    weekend,
    profile?.about_me ?? "",
  );

  let outputId = idea.saved_recipe_id;
  if (!outputId) {
    const { data, error } = await db
      .from("outputs")
      .insert({
        user_id: userId,
        folder_id: await recipesFolder(db, userId),
        type: "recipe",
        title: idea.title,
        content: idea.content ?? "",
      })
      .select("id")
      .single();
    if (error) throw error;
    outputId = data.id as string;
  }
  await db.from("profiles").update({ last_meal_on: today, meal_today_id: outputId }).eq("user_id", userId);
  return { outputId, title: idea.title, teaser: idea.teaser, why: idea.why };
}
