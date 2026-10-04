// Sorts one dump into items. Called by the app right after it saves a dump,
// with the person's own login token, so row level security still applies.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sortDump } from "../_shared/claude.ts";

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

  const { dump_id, timezone } = await req.json().catch(() => ({}));
  if (typeof dump_id !== "string") return json({ error: "dump_id required" }, 400);

  const { data: dump, error } = await db.from("dumps").select("id, body, processed_at").eq("id", dump_id).single();
  if (error || !dump) return json({ error: "Dump not found" }, 404);
  if (dump.processed_at) return json({ ok: true, already: true });

  const { data: profile } = await db.from("profiles").select("timezone").eq("user_id", auth.user.id).single();
  // Keep the stored time zone in step with the device the person is using.
  const tz = typeof timezone === "string" && timezone ? timezone : profile?.timezone ?? "UTC";
  if (profile && tz !== profile.timezone) {
    await db.from("profiles").update({ timezone: tz }).eq("user_id", auth.user.id);
  }

  try {
    const items = await sortDump(dump.body, new Date(), tz);
    if (items.length) {
      const { error: insertError } = await db
        .from("items")
        .insert(items.map((item) => ({ ...item, dump_id: dump.id, user_id: auth.user!.id })));
      if (insertError) throw insertError;
    }
    await db.from("dumps").update({ processed_at: new Date().toISOString(), error: null }).eq("id", dump.id);
    return json({ ok: true, items: items.length });
  } catch (err) {
    console.error(err);
    // The raw dump is already saved; record the failure so the app can offer a retry.
    await db.from("dumps").update({ error: String((err as Error).message ?? err) }).eq("id", dump.id);
    return json({ error: "Sorting failed, your dump is saved" }, 502);
  }
});
