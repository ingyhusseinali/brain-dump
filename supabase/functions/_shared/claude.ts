import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.5";
import { AREAS } from "./schedule.ts";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const MODEL = "claude-opus-5-5";

// Route around a safety-classifier refusal instead of losing the dump.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

const SortedItems = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["task", "reminder", "idea", "note", "goal"]),
      area: z.enum(AREAS),
      title: z.string(),
      details: z.string().nullable(),
      remind_at: z.string().nullable(),
      priority: z.number().int(),
      tags: z.array(z.string()),
    }),
  ),
});
export type SortedItem = z.infer<typeof SortedItems>["items"][number];

const SORT_SYSTEM = `You organise brain dumps for someone with ADHD. They type or speak whatever is in their head, often rambling, half-finished, with several things mixed together. Your job is to turn one dump into separate, clear items so nothing gets lost.

For each distinct thing in the dump, produce one item:
- kind: "reminder" if it has a specific time or date to be reminded at; "task" if it is something to do without a fixed time; "goal" for longer-term things they want to achieve or change in their life ("get fit", "save for a flat", "learn Spanish"); "idea" for ideas, plans, things to explore; "note" for facts, feelings or anything to just keep.
- title: short and concrete, at most about 8 words. Start tasks and reminders with a verb ("Call the dentist"). Keep their own words where you can.
- details: any extra context from the dump that would help later, or null.
- remind_at: an ISO 8601 timestamp with UTC offset when they mention a time or date ("tomorrow at 3", "Friday", "in an hour", "before the weekend"), resolved against the current local time given below, else null. With a date but no time, use 09:00 local. Vague deadlines ("soon", "this week") get a sensible time rather than null when it is a reminder or time-sensitive task.
- priority: 1 if urgent or clearly important to them, 3 if a someday or nice-to-have, otherwise 2.
- area: the life area it belongs to. One of: career (job, work, business), education (study, courses, learning), money (bills, budget, saving, debt), health (body, mind, sleep, food, exercise, appointments), home_family (household, chores, partner, children, parents, relatives), friends (friendships, social plans), personal (hobbies, self-care, admin about themselves, anything else), spiritual (meaning, reflection, gratitude, inner growth), religion (prayer, worship, fasting, religious study, community and obligations of their faith). Treat their faith with respect and take religious commitments as seriously as anything else.
- tags: 0 to 3 short lowercase topic words (like "work", "health", "family", "money").

Do not invent things they did not say, do not lecture, and do not drop anything: if part of the dump fits nowhere, keep it as a note. A dump with one thing in it produces one item.`;

export async function sortDump(body: string, now: Date, timeZone: string): Promise<SortedItem[]> {
  const localNow = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(SortedItems) },
    system: SORT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Current local time: ${localNow} (time zone ${timeZone}, UTC now ${now.toISOString()}).\n\n<dump>\n${body}\n</dump>`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Could not sort dump (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output.items.map((item) => ({
    ...item,
    priority: Math.min(3, Math.max(1, item.priority)),
    remind_at: item.remind_at && !Number.isNaN(Date.parse(item.remind_at)) ? new Date(item.remind_at).toISOString() : null,
  }));
}

const Plan = z.object({
  headline: z.string(),
  entries: z.array(
    z.object({
      item_id: z.string().nullable(),
      new_task: z
        .object({ title: z.string(), details: z.string().nullable(), priority: z.number().int(), area: z.enum(AREAS) })
        .nullable(),
      why: z.string(),
    }),
  ),
});
export type PlanOutput = z.infer<typeof Plan>;

const PLAN_SYSTEM = `You write today's to-do list for someone with ADHD, from everything they have dumped into their brain-dump app: tasks, reminders, ideas, notes and longer-term goals.

The list must feel doable, not overwhelming:
- 3 to 7 entries, ordered in the order they should do them. Put anything overdue or due today first.
- Each entry either points at an existing open item (set item_id to its id, new_task null), or adds a new concrete step (item_id null, new_task set). Every entry sets exactly one of the two.
- Their life areas are career, education, money, health, home_family, friends, personal, spiritual and religion. Keep the list balanced: work and admin should not crowd out health, family, friends, spiritual life and religious practice. Notice areas that have had nothing done recently (see area_activity).
- Look for what they are missing: a goal with no recent progress, something they mentioned repeatedly, a reminder that keeps getting snoozed, a loose end implied by their notes. For those, add one small, specific next step as a new_task ("Book a 20-minute slot to update CV" rather than "Work on career"). At most 2 new tasks a day, and never duplicate an open item.
- new_task.title: verb first, at most about 8 words. priority 1 to 3 (1 = most important).
- why: one short, kind line on why it is on today's list ("Due today", "Moves your fitness goal forward", "Been waiting 9 days, 10 minutes should do it"). Never guilt-trip.
- headline: a short, warm line for the top of the page, at most 8 words.`;

export interface PlanInputItem {
  id: string;
  kind: string;
  area: string;
  title: string;
  details: string | null;
  remind_at: string | null;
  priority: number;
  status: string;
  days_untouched: number;
  times_nudged: number;
}

export async function writePlan(
  items: PlanInputItem[],
  recentlyDone: string[],
  areaActivity: Record<string, string>,
  now: Date,
  timeZone: string,
): Promise<PlanOutput> {
  const localNow = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "full", timeStyle: "short" }).format(now);
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(Plan) },
    system: PLAN_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Local time: ${localNow}.\n\n` +
          `Open items:\n${JSON.stringify(items, null, 1)}\n\n` +
          `Done in the last 3 days: ${recentlyDone.length ? recentlyDone.join("; ") : "nothing yet"}\n\n` +
          `area_activity (days since anything was done in each area): ${JSON.stringify(areaActivity)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Could not write plan (stop_reason: ${response.stop_reason})`);
  }
  const known = new Set(items.map((i) => i.id));
  const seen = new Set<string>();
  // Keep only entries that reference a real item once, or that add a new task.
  const entries = response.parsed_output.entries.filter((e) => {
    if (e.item_id) {
      if (!known.has(e.item_id) || seen.has(e.item_id)) return false;
      seen.add(e.item_id);
      return true;
    }
    return Boolean(e.new_task?.title);
  });
  return { headline: response.parsed_output.headline, entries };
}
