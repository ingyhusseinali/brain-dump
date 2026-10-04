// Suggests what to cook today for the signed-in person ("What should I cook?" on the Today page).
// Each call picks again, so tapping "Something else" gives a new idea.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { suggestMeal } from "../_shared/meal.ts";
import { isWeekend } from "../_shared/schedule.ts";
import { NoAIError } from "../_shared/claude.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return json({ error: "Not signed in" }, 401);

  const { timezone } = await req.json().catch(() => ({}));
  const tz = typeof timezone === "string" && timezone ? timezone : "UTC";
  try {
    const { data: profile } = await db.from("profiles").select("weekend_days").eq("user_id", auth.user.id).single();
    const now = new Date();
    const meal = await suggestMeal(db, auth.user.id, tz, now, isWeekend(profile?.weekend_days ?? [6, 0], now, tz));
    return json({ meal });
  } catch (err) {
    console.error(err);
    return err instanceof NoAIError
      ? json({ error: "Claude picks a new meal on its next round. Save more recipes for more choice." }, 503)
      : json({ error: "Could not think of a meal right now" }, 502);
  }
});
