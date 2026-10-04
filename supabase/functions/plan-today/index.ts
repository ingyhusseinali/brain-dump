// Returns today's to-do list for the signed-in person, writing it first if needed.
// The app calls this when the Today page opens; `force: true` rewrites it.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { buildPlan } from "../_shared/plan.ts";

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

  const { timezone, force } = await req.json().catch(() => ({}));
  const tz = typeof timezone === "string" && timezone ? timezone : "UTC";
  try {
    const { plan } = await buildPlan(db, auth.user.id, tz, new Date(), force === true);
    return json({ plan });
  } catch (err) {
    console.error(err);
    return json({ error: "Could not write today's list" }, 502);
  }
});
