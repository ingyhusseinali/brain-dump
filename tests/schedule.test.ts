import { describe, expect, it } from "vitest";
import {
  MAX_NUDGES,
  digestDue,
  dueNudges,
  inQuietHours,
  localDate,
  pickNow,
  planCandidates,
  snoozeUntil,
  type Item,
  type Profile,
} from "../supabase/functions/_shared/schedule";

const now = new Date("2026-10-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

function item(over: Partial<Item> = {}): Item {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "task",
    area: "personal",
    origin: "dump",
    title: "Thing",
    details: null,
    remind_at: null,
    priority: 2,
    tags: [],
    status: "open",
    snoozed_until: null,
    nudge_count: 0,
    last_nudged_at: null,
    created_at: hoursAgo(1),
    updated_at: hoursAgo(1),
    ...over,
  };
}

describe("dueNudges", () => {
  it("nudges a reminder once it is due", () => {
    const r = item({ kind: "reminder", remind_at: hoursAgo(0.1) });
    expect(dueNudges([r], now)).toEqual([{ item: r, reason: "due" }]);
  });

  it("does not nudge future reminders", () => {
    expect(dueNudges([item({ remind_at: new Date(now.getTime() + 60_000).toISOString() })], now)).toEqual([]);
  });

  it("re-nudges an ignored reminder after two hours, up to the limit", () => {
    const base = { remind_at: hoursAgo(5), last_nudged_at: hoursAgo(2.5) };
    expect(dueNudges([item({ ...base, nudge_count: 1 })], now)[0].reason).toBe("again");
    expect(dueNudges([item({ ...base, nudge_count: MAX_NUDGES })], now)).toEqual([]);
    expect(dueNudges([item({ remind_at: hoursAgo(5), last_nudged_at: hoursAgo(1), nudge_count: 1 })], now)).toEqual([]);
  });

  it("wakes snoozed items whose snooze is over", () => {
    const s = item({ status: "snoozed", snoozed_until: hoursAgo(0.5) });
    expect(dueNudges([s], now)).toEqual([{ item: s, reason: "snooze_over" }]);
    expect(dueNudges([item({ status: "snoozed", snoozed_until: new Date(now.getTime() + 1).toISOString() })], now)).toEqual([]);
  });

  it("ignores done items", () => {
    expect(dueNudges([item({ status: "done", remind_at: hoursAgo(1) })], now)).toEqual([]);
  });
});

describe("quiet hours and the morning list", () => {
  it("handles quiet hours that cross midnight", () => {
    expect(inQuietHours(23, 22, 8)).toBe(true);
    expect(inQuietHours(3, 22, 8)).toBe(true);
    expect(inQuietHours(8, 22, 8)).toBe(false);
    expect(inQuietHours(14, 13, 15)).toBe(true);
  });

  const profile: Profile = { timezone: "Africa/Cairo", quiet_start: 22, quiet_end: 8, digest_hour: 9, last_digest_on: null };

  it("sends the morning list once per local day after the chosen hour", () => {
    // 12:00 UTC is 15:00 in Cairo.
    expect(digestDue(profile, now)).toBe(true);
    expect(digestDue({ ...profile, last_digest_on: localDate(now, "Africa/Cairo") }, now)).toBe(false);
    expect(digestDue({ ...profile, digest_hour: 16 }, now)).toBe(false);
  });
});

describe("what to show", () => {
  it("puts overdue things first and leaves notes and goals out of the Now list", () => {
    const overdue = item({ title: "overdue", remind_at: hoursAgo(1), priority: 3 });
    const important = item({ title: "important", priority: 1 });
    const note = item({ title: "note", kind: "note", priority: 1 });
    const goal = item({ title: "goal", kind: "goal", priority: 1 });
    expect(pickNow([note, goal, important, overdue], now).map((i) => i.title)).toEqual(["overdue", "important"]);
  });

  it("always gives Claude every goal when planning", () => {
    const goals = Array.from({ length: 3 }, (_, n) => item({ kind: "goal", title: `goal ${n}` }));
    const tasks = Array.from({ length: 50 }, () => item());
    const picked = planCandidates([...tasks, ...goals], now, 10);
    expect(picked.filter((i) => i.kind === "goal")).toHaveLength(3);
    expect(picked).toHaveLength(13);
  });

  it("snoozes to sensible local times", () => {
    const local = new Date(2026, 9, 4, 20, 30); // Sunday 20:30 local
    expect(snoozeUntil("later", local).getTime() - local.getTime()).toBe(2 * 3_600_000);
    expect(snoozeUntil("tonight", local).getDate()).toBe(5); // already past 19:00, so tomorrow evening
    const nextWeek = snoozeUntil("next_week", local);
    expect([nextWeek.getDay(), nextWeek.getHours()]).toEqual([1, 9]);
  });
});
