import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { writeLearning } from "./claude.ts";
import type { Item } from "./schedule.ts";

/** Today's track: faith and general knowledge in turn, plus certification study when they have topics set. */
export function learningTrack(now: Date, studyTopics: string): "faith" | "general" | "study" {
  const dayNumber = Math.floor(now.getTime() / 86_400_000);
  const tracks = studyTopics.trim() ? (["faith", "study", "general"] as const) : (["faith", "general"] as const);
  return tracks[dayNumber % tracks.length];
}

/** Writes today's learning bite into the "Daily learning" folder. */
export async function createLearningBite(
  db: SupabaseClient,
  userId: string,
  items: Item[],
  now: Date,
  aboutMe: string,
  studyTopics: string,
): Promise<{ id: string | null; title: string; teaser: string; track: "faith" | "general" | "study" }> {
  const track = learningTrack(now, studyTopics);
  const { data: recent } = await db
    .from("outputs")
    .select("title")
    .eq("user_id", userId)
    .eq("type", "learning")
    .order("created_at", { ascending: false })
    .limit(30);
  const interests = [...new Set(items.filter((i) => i.kind === "goal" || i.kind === "idea").map((i) => i.title))].slice(0, 10);
  const bite = await writeLearning(track, (recent ?? []).map((r) => r.title), interests, now, aboutMe, studyTopics);

  let { data: folder } = await db.from("folders").select("id").eq("user_id", userId).ilike("name", "Daily learning").maybeSingle();
  if (!folder) {
    ({ data: folder } = await db
      .from("folders")
      .insert({ user_id: userId, name: "Daily learning", kind: "general", area: "education" })
      .select("id")
      .single());
  }
  const { data: output } = await db
    .from("outputs")
    .insert({ user_id: userId, folder_id: folder?.id ?? null, type: "learning", title: bite.title, content: bite.content })
    .select("id")
    .single();
  return { id: output?.id ?? null, title: bite.title, teaser: bite.teaser, track };
}
