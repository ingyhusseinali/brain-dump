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
  folder_id: string | null;
  output_id: string | null;
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
  day_start_weekday: number; // minutes after local midnight
  day_start_weekend: number;
  weekend_days: number[]; // 0 = Sunday ... 6 = Saturday
  last_digest_on: string | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * An ignored reminder comes back with growing gaps: 2h, 3h, 5h, then next-day spacing.
 * Ordinary reminders stop after MAX_NUDGES; a drafted email waiting to be sent keeps
 * going for longer, because procrastinating on sending is exactly what it's there for.
 */
export const RENUDGE_GAPS_MS = [2 * HOUR, 3 * HOUR, 5 * HOUR, 18 * HOUR, 24 * HOUR];
export const MAX_NUDGES = 3;
export const MAX_NUDGES_FOR_DRAFT = 6;

export function maxNudges(item: Item): number {
  return item.output_id ? MAX_NUDGES_FOR_DRAFT : MAX_NUDGES;
}

export function renudgeGap(nudgeCount: number): number {
  return RENUDGE_GAPS_MS[Math.min(Math.max(nudgeCount - 1, 0), RENUDGE_GAPS_MS.length - 1)];
}

function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { minutes: Number(get("hour")) * 60 + Number(get("minute")), day };
}

/** Minutes after local midnight. */
export function localMinutes(at: Date, timeZone: string): number {
  return localParts(at, timeZone).minutes;
}

/** When this person's day starts today, in minutes after local midnight. */
export function dayStart(profile: Profile, now: Date): number {
  const { day } = localParts(now, profile.timezone);
  return profile.weekend_days.includes(day) ? profile.day_start_weekend : profile.day_start_weekday;
}

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
    } else if (item.nudge_count < maxNudges(item) && t - last >= renudgeGap(item.nudge_count)) {
      out.push({ item, reason: "again" });
    }
  }
  return out;
}

/** True once per local day, from the moment the person's day starts (workday or weekend time). */
export function digestDue(profile: Profile, now: Date): boolean {
  if (localMinutes(now, profile.timezone) < dayStart(profile, now)) return false;
  return profile.last_digest_on !== localDate(now, profile.timezone);
}

/** Once per local day, at or after `minute`, outside quiet hours. */
export function dailyDue(minute: number, lastOn: string | null, profile: Profile, now: Date): boolean {
  if (inQuietHours(localHour(now, profile.timezone), profile.quiet_start, profile.quiet_end)) return false;
  if (localMinutes(now, profile.timezone) < minute) return false;
  return lastOn !== localDate(now, profile.timezone);
}

export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export interface PrayerTime {
  name: PrayerName;
  at: Date;
}

/** Other nudges hold off for this long after the adhan, so prayer isn't interrupted. */
export const PRAYER_HOLD_MS = 20 * 60 * 1000;

/** The prayer whose time has just come and hasn't been announced yet. */
export function prayerDue(times: PrayerTime[], now: Date, lastSentKey: string | null, dateKey: string): PrayerTime | null {
  const t = now.getTime();
  for (const p of times) {
    const at = p.at.getTime();
    if (at <= t && t - at < PRAYER_HOLD_MS && lastSentKey !== `${dateKey}:${p.name}`) return p;
  }
  return null;
}

export function inPrayerHold(times: PrayerTime[], now: Date): boolean {
  const t = now.getTime();
  return times.some((p) => p.at.getTime() <= t && t - p.at.getTime() < PRAYER_HOLD_MS);
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

/** Untouched this long, an ordinary task quietly leaves the active list instead of piling up. */
export const RETIRE_AFTER_DAYS = 21;

/**
 * Tasks that have been ignored for weeks: not important, no date, not part of a folder.
 * Ideas, notes, goals and anything with a reminder are never retired.
 */
export function staleToRetire(items: Item[], now: Date): Item[] {
  const cutoff = now.getTime() - RETIRE_AFTER_DAYS * DAY;
  return items.filter(
    (i) =>
      i.status === "open" &&
      i.kind === "task" &&
      i.priority >= 2 &&
      !i.remind_at &&
      !i.folder_id &&
      Date.parse(i.updated_at) < cutoff,
  );
}

// ---- Cycle tracking ----
// Dates are local calendar days as "YYYY-MM-DD".

export interface Cycle {
  started_on: string;
  ended_on: string | null;
}

export const DEFAULT_CYCLE_DAYS = 28;
export const DEFAULT_PERIOD_DAYS = 6;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/** Average cycle and period length from recent history, ignoring gaps that look like missed logs. */
export function cycleStats(cycles: Cycle[]): { cycleDays: number; periodDays: number } {
  const sorted = [...cycles].sort((a, b) => a.started_on.localeCompare(b.started_on)).slice(-7);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1].started_on, sorted[i].started_on);
    if (gap >= 20 && gap <= 45) gaps.push(gap);
  }
  const lengths = sorted
    .filter((c) => c.ended_on)
    .map((c) => daysBetween(c.started_on, c.ended_on!) + 1)
    .filter((n) => n >= 2 && n <= 10);
  const avg = (xs: number[], fallback: number) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : fallback);
  return { cycleDays: avg(gaps, DEFAULT_CYCLE_DAYS), periodDays: avg(lengths, DEFAULT_PERIOD_DAYS) };
}

function latestStart(cycles: Cycle[], today: string): Cycle | null {
  return [...cycles].filter((c) => c.started_on <= today).sort((a, b) => b.started_on.localeCompare(a.started_on))[0] ?? null;
}

/** True during a period: from a logged start until its logged end, or the usual length if no end is logged. */
export function onPeriod(cycles: Cycle[], today: string): boolean {
  const last = latestStart(cycles, today);
  if (!last) return false;
  if (last.ended_on) return today <= last.ended_on;
  return daysBetween(last.started_on, today) < cycleStats(cycles).periodDays;
}

/**
 * Estimated fertile window for the current cycle: ovulation is about 14 days before the
 * next period, and the window runs from 5 days before ovulation to the day after.
 * An estimate from logged periods only.
 */
export function fertileWindow(cycles: Cycle[], today: string): { start: string; ovulation: string; end: string } | null {
  const last = latestStart(cycles, today);
  if (!last) return null;
  const { cycleDays } = cycleStats(cycles);
  const ovulation = addDays(last.started_on, cycleDays - 14);
  return { start: addDays(ovulation, -5), ovulation, end: addDays(ovulation, 1) };
}
