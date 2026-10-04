import { useMemo, useState } from "react";
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { timeZone } from "../lib/supabase";
import type { useBrain } from "../lib/items";
import type { useProfile } from "../lib/profile";
import type { Plan } from "../lib/plan";
import { AREA_ICON } from "../lib/labels";
import { fertileWindow, localDate, onPeriod, type Item } from "../../supabase/functions/_shared/schedule";

interface Props {
  brain: ReturnType<typeof useBrain>;
  profileState: ReturnType<typeof useProfile>;
  plan: Plan | null;
}

interface Entry {
  key: string;
  minutes: number | null; // null = any time that day
  icon: string;
  title: string;
  note?: string;
  done?: boolean;
  itemId?: string;
}

const PRAYERS = [
  ["fajr", "Fajr"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const minutesOf = (at: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).format(at).split(":");
  return Number(h) * 60 + Number(m);
};
const clock = (minutes: number) =>
  new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** When an item lands on the calendar: its reminder time, or the day its snooze ends. */
function itemDate(i: Item): { date: string; minutes: number | null } | null {
  const at = i.status === "snoozed" && i.snoozed_until ? i.snoozed_until : i.remind_at;
  if (!at) return null;
  const d = new Date(at);
  return { date: localDate(d, timeZone), minutes: minutesOf(d) };
}

/** Everything with a time, by day and by month: reminders, plans, prayers and cycle days. */
export function Calendar({ brain, profileState, plan }: Props) {
  const today = localDate(new Date(), timeZone);
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(today);
  const { profile, cycles } = profileState;

  const byDate = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of brain.items) {
      if (i.status === "archived") continue;
      const when = itemDate(i);
      if (!when) continue;
      map.set(when.date, [...(map.get(when.date) ?? []), i]);
    }
    return map;
  }, [brain.items]);

  function entriesFor(date: string): Entry[] {
    const list: Entry[] = [];
    for (const i of byDate.get(date) ?? []) {
      const when = itemDate(i)!;
      list.push({ key: i.id, minutes: when.minutes, icon: AREA_ICON[i.area], title: i.title, done: i.status === "done", itemId: i.id, note: i.kind === "reminder" ? "Reminder" : undefined });
    }
    // Today's list from the morning plan, for things without a set time.
    if (date === today && plan) {
      for (const e of plan.entries) {
        const i = brain.items.find((x) => x.id === e.item_id);
        if (!i || list.some((l) => l.itemId === i.id)) continue;
        list.push({ key: `plan-${i.id}`, minutes: null, icon: AREA_ICON[i.area], title: i.title, done: i.status === "done", itemId: i.id, note: "On today's list" });
      }
    }
    if (profile?.prayer_reminders && profile.latitude !== null && profile.longitude !== null && !(profile.cycle_tracking && onPeriod(cycles, date))) {
      const t = new PrayerTimes(new Coordinates(profile.latitude, profile.longitude), new Date(`${date}T12:00:00`), CalculationMethod.Egyptian());
      for (const [k, name] of PRAYERS) list.push({ key: k, minutes: minutesOf(t[k]), icon: "🕌", title: name, note: "Prayer" });
    }
    if (profile?.cooking_daily) list.push({ key: "meal", minutes: profile.cooking_minute, icon: "🍳", title: "What to cook today", note: "Daily idea" });
    if (profile?.learning_daily) list.push({ key: "learn", minutes: profile.learning_minute, icon: "🌱", title: "5-minute learning bite" });
    return list.sort((a, b) => (a.minutes ?? -1) - (b.minutes ?? -1));
  }

  const cycleMark = (date: string) => {
    if (!profile?.cycle_tracking) return "";
    if (onPeriod(cycles, date)) return "is-period";
    const w = fertileWindow(cycles, date);
    return w && date >= w.start && date <= w.end ? "is-fertile" : "";
  };

  return (
    <div className="page">
      <div className="cal-head">
        <h1>Calendar</h1>
        <div className="chips">
          <button className={`pill ${mode === "day" ? "is-on" : ""}`} onClick={() => setMode("day")}>
            Day
          </button>
          <button className={`pill ${mode === "month" ? "is-on" : ""}`} onClick={() => setMode("month")}>
            Month
          </button>
        </div>
      </div>

      {mode === "day" ? (
        <DayView
          day={day}
          today={today}
          entries={entriesFor(day)}
          mark={cycleMark(day)}
          onMove={(n) => setDay(addDays(day, n))}
          onToday={() => setDay(today)}
          actions={brain.actions}
        />
      ) : (
        <MonthView
          day={day}
          today={today}
          counts={(date) => (byDate.get(date) ?? []).filter((i) => i.status !== "done").length}
          mark={cycleMark}
          onMove={(n) => {
            const [y, m] = day.split("-").map(Number);
            const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
            setDay(d.toISOString().slice(0, 10));
          }}
          onPick={(date) => {
            setDay(date);
            setMode("day");
          }}
        />
      )}
      <p className="muted small">
        Tell me about plans with a time ("dentist Thursday 5pm", or a photo of a schedule) and they show up here. Outlook and Teams meetings can be
        connected later.
      </p>
    </div>
  );
}

function DayView({ day, today, entries, mark, onMove, onToday, actions }: {
  day: string;
  today: string;
  entries: Entry[];
  mark: string;
  onMove: (n: number) => void;
  onToday: () => void;
  actions: ReturnType<typeof useBrain>["actions"];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const now = minutesOf(new Date());
  const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  let nowShown = day !== today;
  return (
    <>
      <div className="cal-nav">
        <button className="pill" aria-label="Previous day" onClick={() => onMove(-1)}>
          ‹
        </button>
        <button className="link" onClick={onToday}>
          {day === today ? `Today · ${label}` : label}
        </button>
        <button className="pill" aria-label="Next day" onClick={() => onMove(1)}>
          ›
        </button>
      </div>
      {mark && <p className={`cal-cycle ${mark}`}>{mark === "is-period" ? "🤍 Period day" : "🌸 Likely fertile day (an estimate)"}</p>}
      <ol className="timeline">
        {entries.map((e) => {
          const showNow = !nowShown && e.minutes !== null && e.minutes > now;
          if (showNow) nowShown = true;
          return (
            <li key={e.key}>
              {showNow && <div className="now-line">Now · {clock(now)}</div>}
              <button className={`tl-row ${e.done ? "is-done" : ""}`} disabled={!e.itemId} aria-expanded={open === e.key} onClick={() => setOpen(open === e.key ? null : e.key)}>
                <span className="tl-time">{e.minutes === null ? "Any time" : clock(e.minutes)}</span>
                <span className="tl-icon" aria-hidden>
                  {e.icon}
                </span>
                <span className="tl-text">
                  <span dir="auto">{e.title}</span>
                  {e.note && <span className="muted small block">{e.note}</span>}
                </span>
              </button>
              {open === e.key && e.itemId && (
                <div className="tl-actions">
                  {e.done ? (
                    <button className="pill" onClick={() => void actions.reopen(e.itemId!)}>
                      Not done
                    </button>
                  ) : (
                    <>
                      <button className="pill" onClick={() => void actions.done(e.itemId!)}>
                        Done ✓
                      </button>
                      <button className="pill" onClick={() => void actions.snooze(e.itemId!, "tomorrow")}>
                        Tomorrow
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {entries.length === 0 && <p className="muted">Nothing planned. A free day.</p>}
    </>
  );
}

function MonthView({ day, today, counts, mark, onMove, onPick }: {
  day: string;
  today: string;
  counts: (date: string) => number;
  mark: (date: string) => string;
  onMove: (n: number) => void;
  onPick: (date: string) => void;
}) {
  const [y, m] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return (
    <>
      <div className="cal-nav">
        <button className="pill" aria-label="Previous month" onClick={() => onMove(-1)}>
          ‹
        </button>
        <strong>{first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
        <button className="pill" aria-label="Next month" onClick={() => onMove(1)}>
          ›
        </button>
      </div>
      <div className="month-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="month-wd">
            {w}
          </span>
        ))}
        {cells.map((date, i) =>
          date ? (
            <button key={date} className={`month-day ${date === today ? "is-today" : ""} ${mark(date)}`} onClick={() => onPick(date)}>
              <span>{Number(date.slice(8))}</span>
              {counts(date) > 0 && <span className="month-count">{counts(date)}</span>}
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>
      <p className="muted small legend">
        <span className="dot" /> things planned · <span className="swatch is-period" /> period · <span className="swatch is-fertile" /> likely fertile
      </p>
    </>
  );
}
