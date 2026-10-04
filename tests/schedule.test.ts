import { describe, expect, it } from "vitest";
import {
  MAX_NUDGES,
  MAX_NUDGES_FOR_DRAFT,
  dayStart,
  cycleStats,
  onPeriod,
  fertileWindow,
  inPrayerHold,
  prayerDue,
  digestDue,
  dueNudges,
  inQuietHours,
  localDate,
  pickNow,
  planCandidates,
  snoozeUntil,
  staleToRetire,
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
    folder_id: null,
    output_id: null,
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

  it("keeps chasing an unsent email draft for longer, with growing gaps", () => {
    const draft = { remind_at: hoursAgo(30), output_id: "o1" };
    expect(dueNudges([item({ ...draft, last_nudged_at: hoursAgo(19), nudge_count: 4 })], now)[0].reason).toBe("again");
    expect(dueNudges([item({ ...draft, last_nudged_at: hoursAgo(10), nudge_count: 4 })], now)).toEqual([]);
    expect(dueNudges([item({ ...draft, last_nudged_at: hoursAgo(30), nudge_count: MAX_NUDGES_FOR_DRAFT })], now)).toEqual([]);
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

  const profile: Profile = {
    timezone: "Africa/Cairo",
    quiet_start: 22,
    quiet_end: 7,
    day_start_weekday: 465,
    day_start_weekend: 570,
    weekend_days: [6, 0],
    last_digest_on: null,
  };

  it("sends the morning list once per local day after the day starts", () => {
    // 12:00 UTC is 15:00 in Cairo.
    expect(digestDue(profile, now)).toBe(true);
    expect(digestDue({ ...profile, last_digest_on: localDate(now, "Africa/Cairo") }, now)).toBe(false);
  });

  it("starts the day later on weekends", () => {
    // 2026-10-04 is a Sunday. 06:00 UTC is 09:00 in Cairo.
    const sundayNine = new Date("2026-10-04T06:00:00Z");
    expect(dayStart(profile, sundayNine)).toBe(570);
    expect(digestDue(profile, sundayNine)).toBe(false);
    // Monday 05:00 UTC is 08:00 in Cairo, after the 07:45 workday start.
    expect(digestDue(profile, new Date("2026-10-05T05:00:00Z"))).toBe(true);
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

describe("staleToRetire", () => {
  const old = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  it("retires only old, ordinary, undated tasks", () => {
    const stale = item({ title: "stale", updated_at: old });
    const keep = [
      item({ updated_at: old, priority: 1 }),
      item({ updated_at: old, remind_at: old }),
      item({ updated_at: old, kind: "idea" }),
      item({ updated_at: old, kind: "goal" }),
      item({ updated_at: old, folder_id: "f1" }),
      item(),
    ];
    expect(staleToRetire([stale, ...keep], now).map((i) => i.title)).toEqual(["stale"]);
  });
});

describe("prayer", () => {
  const times = [
    { name: "dhuhr" as const, at: new Date("2026-10-04T08:45:00Z") },
    { name: "asr" as const, at: new Date("2026-10-04T12:00:00Z") },
  ];
  it("announces a prayer once, right when it comes in", () => {
    const at = new Date("2026-10-04T12:05:00Z");
    expect(prayerDue(times, at, null, "2026-10-04")?.name).toBe("asr");
    expect(prayerDue(times, at, "2026-10-04:asr", "2026-10-04")).toBeNull();
    expect(prayerDue(times, new Date("2026-10-04T12:40:00Z"), null, "2026-10-04")).toBeNull();
  });
  it("holds other nudges just after the adhan", () => {
    expect(inPrayerHold(times, new Date("2026-10-04T12:10:00Z"))).toBe(true);
    expect(inPrayerHold(times, new Date("2026-10-04T12:30:00Z"))).toBe(false);
  });
});

describe("cycle tracking", () => {
  const cycles = [
    { started_on: "2026-07-10", ended_on: "2026-07-15" },
    { started_on: "2026-08-08", ended_on: "2026-08-13" },
    { started_on: "2026-09-06", ended_on: null },
  ];
  it("learns cycle and period length from history", () => {
    expect(cycleStats(cycles)).toEqual({ cycleDays: 29, periodDays: 6 });
    expect(cycleStats([])).toEqual({ cycleDays: 28, periodDays: 6 });
  });
  it("knows when a period is on, using the logged end or the usual length", () => {
    expect(onPeriod(cycles, "2026-09-11")).toBe(true);
    expect(onPeriod(cycles, "2026-09-12")).toBe(false);
    expect(onPeriod(cycles, "2026-08-13")).toBe(true);
    expect(onPeriod([], "2026-08-13")).toBe(false);
  });
  it("estimates the fertile window around ovulation", () => {
    // 29-day cycle from 6 Sep: ovulation about 21 Sep.
    expect(fertileWindow(cycles, "2026-09-15")).toEqual({ start: "2026-09-16", ovulation: "2026-09-21", end: "2026-09-22" });
  });
});
