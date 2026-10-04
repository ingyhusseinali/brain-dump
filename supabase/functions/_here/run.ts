// Claude's round for the free setup (no Claude API key).
//
// Does what the edge functions would do with the API: files waiting dumps, writes
// today's list, the learning bite and what to cook. Each time it needs Claude it
// writes the request to a file and waits for the answer file, which Claude in the
// project writes. Run from supabase/functions, in the background:
//
//   deno run -A _here/run.ts [dir]
//
// with SUPABASE_ACCESS_TOKEN set (or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).
//
// It prints "REQUEST <file>" for each request and "DONE" at the end (also written to <dir>/done.json).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1/base64";
import { answerWith, type AskRequest } from "../_shared/claude.ts";
import { connectFromToken } from "./project.ts";
import { processDump } from "../_shared/file.ts";
import { buildPlan } from "../_shared/plan.ts";
import { createLearningBite } from "../_shared/learning.ts";
import { suggestMeal } from "../_shared/meal.ts";
import { dayStart, isWeekend, localDate, localMinutes, type Item, type Profile } from "../_shared/schedule.ts";

const dir = Deno.args[0] ?? "/tmp/brain-here";
const WAIT_MS = 45 * 60_000;
await Deno.mkdir(dir, { recursive: true });

let count = 0;
const systemsSeen = new Map<string, string>();

async function sha(text: string) {
  return encodeBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).slice(0, 12);
}

answerWith(async (req: AskRequest) => {
  const id = String(++count).padStart(3, "0");
  const lines = [`# Request ${id}`, ""];
  if (req.problem) lines.push(`Your previous answer was rejected: ${req.problem}`, "Fix it and write the answer again.", "");

  const key = await sha(req.system);
  const seenIn = systemsSeen.get(key);
  lines.push("## Instructions", "");
  if (seenIn) lines.push(`Same instructions as request ${seenIn}.`);
  else {
    systemsSeen.set(key, id);
    lines.push(req.system);
  }

  lines.push("", "## Material", "");
  const parts = typeof req.content === "string" ? [{ type: "text" as const, text: req.content }] : req.content;
  let img = 0;
  for (const part of parts) {
    if (part.type === "text") lines.push(part.text);
    else {
      const ext = part.source.media_type.split("/")[1].replace("jpeg", "jpg");
      const file = `${dir}/${id}-image-${++img}.${ext}`;
      await Deno.writeFile(file, decodeBase64(part.source.data));
      lines.push(`(Attached photo: ${file})`);
    }
  }

  const answerFile = `${dir}/${id}-answer.json`;
  lines.push("", "## Answer", "", `Write JSON matching this schema to ${answerFile}:`, "", "```json", JSON.stringify(req.jsonSchema), "```");
  const requestFile = `${dir}/${id}-request.md`;
  await Deno.writeTextFile(requestFile, lines.join("\n"));
  await Deno.remove(answerFile).catch(() => {});
  console.log(`REQUEST ${requestFile}`);

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const text = await Deno.readTextFile(answerFile);
      await Deno.rename(answerFile, `${dir}/${id}-answered.json`);
      try {
        return JSON.parse(text);
      } catch (err) {
        return { invalid_json: String(err) };
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`No answer for request ${id}`);
});

await connectFromToken();
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const now = new Date();
const report: Record<string, unknown>[] = [];

const { data: profiles, error } = await db.from("profiles").select("*");
if (error) throw error;

for (const p of profiles ?? []) {
  const profile = p as Profile & Record<string, any>;
  const userId: string = profile.user_id;
  const tz = profile.timezone;
  const today = localDate(now, tz);
  const done: Record<string, unknown> = { user: userId.slice(0, 8) };

  // 1. Dumps waiting to be filed, oldest first.
  const { data: waiting } = await db
    .from("dumps")
    .select("id, body, image_paths")
    .eq("user_id", userId)
    .is("processed_at", null)
    .is("error", null)
    .order("created_at")
    .limit(20);
  done.filed = 0;
  for (const dump of waiting ?? []) {
    try {
      if (await processDump(db, userId, dump, tz)) done.filed = (done.filed as number) + 1;
    } catch (err) {
      console.error("filing failed", dump.id, err);
    }
  }

  // Filing can take a while (Claude answers each step), so look again at the clock and profile.
  const later = new Date();
  const { data: fresh } = await db.from("profiles").select("about_me, last_meal_on").eq("user_id", userId).single();
  Object.assign(profile, fresh);

  // Morning things are written from an hour and a half before their day starts.
  const morning = localMinutes(later, tz) >= dayStart(profile, later) - 90;
  if (!morning) {
    report.push(done);
    continue;
  }

  // 2. Today's list (replaces the simple list the app shows until then).
  try {
    const { created } = await buildPlan(db, userId, tz, later);
    done.plan = created ? "written" : "already there";
  } catch (err) {
    console.error("plan failed", err);
  }

  // 3. The learning bite, announced by the follow-up engine at their learning time.
  if (profile.learning_daily) {
    const { data: recent } = await db
      .from("outputs")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "learning")
      .gte("created_at", new Date(later.getTime() - 20 * 3_600_000).toISOString())
      .limit(1);
    if (!recent?.length) {
      const { data: items } = await db.from("items").select("*").eq("user_id", userId).in("status", ["open", "snoozed"]);
      try {
        const bite = await createLearningBite(db, userId, (items ?? []) as Item[], later, profile.about_me ?? "", profile.study_topics ?? "");
        done.learning = bite.title;
      } catch (err) {
        console.error("learning failed", err);
      }
    }
  }

  // 4. What to cook, reminded at their cooking time.
  if (profile.cooking_daily && profile.last_meal_on !== today) {
    try {
      const meal = await suggestMeal(db, userId, tz, later, isWeekend(profile.weekend_days, later, tz));
      done.meal = meal.title;
    } catch (err) {
      console.error("meal failed", err);
    }
  }
  report.push(done);
}

await Deno.writeTextFile(`${dir}/done.json`, JSON.stringify(report, null, 1));
console.log("DONE", JSON.stringify(report));
