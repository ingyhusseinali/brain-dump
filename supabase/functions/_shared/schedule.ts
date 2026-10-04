// Pure follow-up logic, shared by the nudge function (Deno) and the app (browser).
// No imports, so both runtimes can load it as-is.

export type ItemKind = "task" | "reminder" | "idea" | "note" | "goal";
export const AREAS = ["career", "education", "money", "health", "home_family", "friends", "personal", "spiritual", "religion"] as const;
export type Area = (typeof AREAS)[number];

export type ItemStatus = "open" | "snoozed" | "done" | "archived";

export interface Item {
  id: string;
  kind: ItemKind;
  area: Area;
  origin: "dump" | "plan" | "email";
  title: string;
  details: string | null;
  remind_at: string | null;
  priority: number; // 1 = most important
  tags: string[];
  status: ItemStatus;
  snoozed_until: string | null;
  nudge_count: number;
  last_nudged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  timezone: string;
  quiet_start: number;
  quiet_end: number;
  digest_hour: number;
  last_digest_on: string | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A reminder that nobody acted on is re-sent this often, up to MAX_NUDGES times in total. */
export const RENUDGE_AFTER_MS = 2 * HOUR;
export const MAX_NUDGES = 3;

export function localHour(at: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at);
  return Number(hour);
}

export function localDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export type NudgeReason = "due" | "again" | "snooze_over";

export interface Nudge {
  item: Item;
  reason: NudgeReason;
}

/** Items that should trigger a notification right now. */
export function dueNudges(items: Item[], now: Date): Nudge[] {
  const t = now.getTime();
  const out: Nudge[] = [];
  for (const item of items) {
    if (item.status === "snoozed") {
      if (item.snoozed_until && Date.parse(item.snoozed_until) <= t) out.push({ item, reason: "snooze_over" });
      continue;
    }
    if (item.status !== "open" || !item.remind_at) continue;
    const remindAt = Date.parse(item.remind_at);
    if (remindAt > t) continue;
    const last = item.last_nudged_at ? Date.parse(item.last_nudged_at) : null;
    if (last === null || last < remindAt) {
      out.push({ item, reason: "due" });
    } else if (item.nudge_count < MAX_NUDGES && t - last >= RENUDGE_AFTER_MS) {
      out.push({ item, reason: "again" });
    }
  }
  return out;
}

/** True once per local day, at or after the person's digest hour. */
export function digestDue(profile: Profile, now: Date): boolean {
  const hour = localHour(now, profile.timezone);
  if (inQuietHours(hour, profile.quiet_start, profile.quiet_end)) return false;
  if (hour < profile.digest_hour) return false;
  return profile.last_digest_on !== localDate(now, profile.timezone);
}

function isActive(item: Item, now: Date): boolean {
  if (item.status === "open") return true;
  return item.status === "snoozed" && !!item.snoozed_until && Date.parse(item.snoozed_until) <= now.getTime();
}

/**
 * Score for the "Now" view. Higher means show sooner.
 * Overdue things first, then things due in the next day, then important tasks,
 * then things that have sat untouched for a while so they don't silently rot.
 */
export function score(item: Item, now: Date): number {
  const t = now.getTime();
  let s = (4 - item.priority) * 10; // priority 1 => 30, 3 => 10
  if (item.remind_at) {
    const until = Date.parse(item.remind_at) - t;
    if (until <= 0) s += 100;
    else if (until <= DAY) s += 50;
    else if (until <= 3 * DAY) s += 15;
  }
  if (item.kind === "task") s += 8;
  if (item.kind === "idea" || item.kind === "note" || item.kind === "goal") s -= 15;
  const ageDays = (t - Date.parse(item.updated_at)) / DAY;
  s += Math.min(ageDays, 14); // slowly float neglected items up
  return s;
}

/** The 1 to 3 things worth looking at right now. */
export function pickNow(items: Item[], now: Date, limit = 3): Item[] {
  return items
    .filter((i) => isActive(i, now) && i.kind !== "note" && i.kind !== "goal")
    .sort((a, b) => score(b, now) - score(a, now))
    .slice(0, limit);
}

/** What Claude sees when writing today's list: the most pressing open items plus every goal. */
export function planCandidates(items: Item[], now: Date, limit = 40): Item[] {
  const active = items.filter((i) => isActive(i, now));
  const goals = active.filter((i) => i.kind === "goal");
  const rest = active
    .filter((i) => i.kind !== "goal")
    .sort((a, b) => score(b, now) - score(a, now))
    .slice(0, limit);
  return [...goals, ...rest];
}

/** Snooze presets in local time: "later" (+2h), "tonight" (19:00), "tomorrow" (09:00), "next week" (Mon 09:00). */
export type SnoozePreset = "later" | "tonight" | "tomorrow" | "next_week";

export function snoozeUntil(preset: SnoozePreset, now: Date): Date {
  const d = new Date(now);
  switch (preset) {
    case "later":
      return new Date(now.getTime() + 2 * HOUR);
    case "tonight":
      d.setHours(19, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    case "tomorrow":
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    case "next_week": {
      const daysToMonday = ((8 - d.getDay()) % 7) || 7;
      d.setDate(d.getDate() + daysToMonday);
      d.setHours(9, 0, 0, 0);
      return d;
    }
  }
}
