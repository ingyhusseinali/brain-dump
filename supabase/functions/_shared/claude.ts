import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.5";
import { AREAS } from "./schedule.ts";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const MODEL = "claude-opus-5-5";

// Route around a safety-classifier refusal instead of losing the dump.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

const OUTPUT_TYPES = ["slides", "notes", "email", "document", "checklist"] as const;
const FOLDER_KINDS = ["class", "project", "general"] as const;

const Sorted = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["task", "reminder", "idea", "note", "goal"]),
      area: z.enum(AREAS),
      title: z.string(),
      details: z.string().nullable(),
      remind_at: z.string().nullable(),
      priority: z.number().int(),
      tags: z.array(z.string()),
      folder: z.string().nullable(),
      output_ref: z.string().nullable(),
    }),
  ),
  outputs: z.array(
    z.object({
      ref: z.string(),
      update_output_id: z.string().nullable(),
      folder: z.string(),
      folder_kind: z.enum(FOLDER_KINDS),
      folder_area: z.enum(AREAS),
      type: z.enum(OUTPUT_TYPES),
      title: z.string(),
      brief: z.string(),
    }),
  ),
  completed_item_ids: z.array(z.string()),
});
export type SortResult = z.infer<typeof Sorted>;
export type SortedItem = SortResult["items"][number];
export type OutputPlan = SortResult["outputs"][number];

const SORT_SYSTEM = `You are the organising brain behind a brain-dump app for someone with ADHD. They talk to it like talking to themselves: typing or speaking whatever comes to mind, often rambling, half-finished, with several things mixed together, sometimes while driving. Your job is to put every thought in its place and, where it helps, turn it into something ready to use.

1. Items. For each distinct thing in the dump, produce one item:
- kind: "reminder" if it has a specific time or date to be reminded at; "task" if it is something to do without a fixed time; "goal" for longer-term things they want to achieve or change in their life ("get fit", "save for a flat", "learn Spanish"); "idea" for ideas, plans, things to explore; "note" for facts, feelings or anything to just keep.
- title: short and concrete, at most about 8 words. Start tasks and reminders with a verb ("Call the dentist"). Keep their own words where you can.
- details: any extra context from the dump that would help later, or null.
- remind_at: an ISO 8601 timestamp with UTC offset when they mention a time or date ("tomorrow at 3", "Friday", "in an hour", "before the weekend"), resolved against the current local time given below, else null. With a date but no time, use 09:00 local. Vague deadlines ("soon", "this week") get a sensible time rather than null when it is a reminder or time-sensitive task.
- priority: 1 if urgent or clearly important to them, 3 if a someday or nice-to-have, otherwise 2.
- area: the life area it belongs to. One of: career (job, work, business), education (study, teaching, courses, learning), money (bills, budget, saving, debt), health (body, mind, sleep, food, exercise, appointments), home_family (household, chores, partner, children, parents, relatives), friends (friendships, social plans), personal (hobbies, self-care, admin about themselves, anything else), spiritual (meaning, reflection, gratitude, inner growth), religion (prayer, worship, fasting, religious study, community and obligations of their faith). Treat their faith with respect and take religious commitments as seriously as anything else.
- tags: 0 to 3 short lowercase topic words.
- folder: the name of the folder it belongs in, or null. Folders group things by a specific class, course, project, client, event or trip. Reuse an existing folder (exact name from the list given) whenever the thought clearly belongs to it; otherwise create a new one with a short, clear name ("Thursday Biology class", "Website redesign project"). Do not make folders for one-off life admin.
- output_ref: the ref of an output below that this item is about (for example the reminder to send a drafted email), or null.

2. Outputs. When a thought is raw material for something they will need to produce or use, draft it for them:
- "slides" when they are preparing a class, lesson, talk or presentation.
- "notes" for lesson materials, study notes, meeting prep or reference they will open later.
- "email" when a work idea or solution needs to be communicated to someone, or they say they should email or message someone.
- "document" for a proposal, plan, write-up or longer piece.
- "checklist" for a step-by-step list (packing, preparing an event, a process).
Only draft an output when it genuinely saves them work; a simple reminder stays a reminder. If an existing output in the same folder covers the same thing (for example today's class slides), update it rather than creating a duplicate: set update_output_id to its id. For each output give: a ref you invent ("o1", "o2"), the folder (required, same rules as above), folder_kind ("class" for a class, course or teaching; "project" for work projects; else "general"), folder_area, type, a clear title, and brief: everything from the dump the writer needs, plus what to produce. When you draft an email to send later, also add a reminder item ("Send the email to Ahmed about the API fix") for the next working morning at 09:00 local unless they said otherwise, with output_ref pointing at the email.

3. Done things. They never tick things off by hand. If the dump says or clearly implies that something on their open list is done ("sent the email to Ahmed", "finally booked the dentist"), put that item's id in completed_item_ids. Only when you are confident; do not create a new item for something they just reported finishing.

Do not invent things they did not say, do not lecture, and do not drop anything: if part of the dump fits nowhere, keep it as a note.`;

export interface SortContext {
  folders: { name: string; kind: string }[];
  outputs: { id: string; folder: string | null; type: string; title: string }[];
  openItems: { id: string; title: string }[];
}

export async function sortDump(body: string, now: Date, timeZone: string, context: SortContext): Promise<SortResult> {
  const localNow = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(Sorted) },
    system: SORT_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Current local time: ${localNow} (time zone ${timeZone}, UTC now ${now.toISOString()}).\n\n` +
          `Existing folders: ${JSON.stringify(context.folders)}\n` +
          `Recent outputs: ${JSON.stringify(context.outputs)}\n` +
          `Open items: ${JSON.stringify(context.openItems)}\n\n` +
          `<dump>\n${body}\n</dump>`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Could not sort dump (stop_reason: ${response.stop_reason})`);
  }
  const knownOutputs = new Set(context.outputs.map((o) => o.id));
  const knownItems = new Set(context.openItems.map((i) => i.id));
  return {
    items: response.parsed_output.items.map((item) => ({
      ...item,
      priority: Math.min(3, Math.max(1, item.priority)),
      remind_at: item.remind_at && !Number.isNaN(Date.parse(item.remind_at)) ? new Date(item.remind_at).toISOString() : null,
    })),
    outputs: response.parsed_output.outputs.map((o) => ({
      ...o,
      update_output_id: o.update_output_id && knownOutputs.has(o.update_output_id) ? o.update_output_id : null,
    })),
    completed_item_ids: response.parsed_output.completed_item_ids.filter((id) => knownItems.has(id)),
  };
}

const Written = z.object({
  content: z.string(),
  email_to: z.string().nullable(),
  email_subject: z.string().nullable(),
});
export type WrittenOutput = z.infer<typeof Written>;

const WRITE_SYSTEM = `You turn someone's spoken or typed thoughts into a finished, ready-to-use piece of work for them. They have ADHD and will open this later (in class, at work the next morning), so it must be clear, well structured and usable as-is. Write in their voice and language, keep their ideas and facts, and fill gaps only with sensible structure, never with invented facts, names, figures or quotes.

Format the content as Markdown:
- slides: one slide per section, slides separated by a line containing only ---. Each slide starts with "# " and a short title, then 3 to 5 concise bullets. Add speaker notes after a line "Notes:" when useful. Start with a title slide and end with a summary or questions slide. Aim for 6 to 12 slides unless the material calls for fewer.
- notes: headings and bullets they can glance at while teaching or working; include an outline, key points, examples and any activities or questions.
- email: the email body only, ready to send, short paragraphs, friendly and professional, with a greeting and sign-off. Set email_subject; set email_to to the recipient's name or address if they said who it is for, else null.
- document: a clear structured write-up with headings.
- checklist: Markdown task list ("- [ ] step"), grouped under headings if long.
Set email_to and email_subject to null for anything that is not an email.

When an existing version is given, produce the complete updated version that merges the new thoughts in, keeping everything still relevant.`;

export async function writeOutput(
  plan: Pick<OutputPlan, "type" | "title" | "brief" | "folder">,
  dump: string,
  existing: string | null,
  now: Date,
  timeZone: string,
): Promise<WrittenOutput> {
  const localNow = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "full", timeStyle: "short" }).format(now);
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 32000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(Written) },
    system: WRITE_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Local time: ${localNow}.\nFolder: ${plan.folder}\nType: ${plan.type}\nTitle: ${plan.title}\n\n` +
          `What to produce:\n${plan.brief}\n\n<their_words>\n${dump}\n</their_words>` +
          (existing ? `\n\n<existing_version>\n${existing}\n</existing_version>` : ""),
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Could not write ${plan.type} (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
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
