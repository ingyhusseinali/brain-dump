import { useEffect, useMemo, useRef, useState } from "react";
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { timeZone } from "../lib/supabase";
import type { useBrain } from "../lib/items";
import type { useProfile } from "../lib/profile";
import type { Plan } from "../lib/plan";
import { AREA_ICON, AREA_LABEL } from "../lib/labels";
import { fertileWindow, localDate, onPeriod, type Item } from "../../supabase/functions/_shared/schedule";

interface Props {
  brain: ReturnType<typeof useBrain>;
  profileState: ReturnType<typeof useProfile>;
  plan: Plan | null;
}

type Area = Item["area"];

const PRAYERS = [
  ["fajr", "Fajr"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
] as const;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const HOUR_PX = 56;
const BLOCK_MIN = 45; // reminders have no end time; draw them as a short block

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const minutesOf = (at: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).format(at).split(":");
  return Number(h) * 60 + Number(m);
};
const clock = (minutes: number) =>
  new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });

/** When an item lands on the calendar: its reminder time, or the moment its snooze ends. */
function itemWhen(i: Item): { date: string; minutes: number } | null {
  const at = i.status === "snoozed" && i.snoozed_until ? i.snoozed_until : i.remind_at;
  if (!at) return null;
  const d = new Date(at);
  return { date: localDate(d, timeZone), minutes: minutesOf(d) };
}

/** One calm view of the day and the month: a week strip, an hour-by-hour day, and a month you can open. */
export function Calendar({ brain, profileState, plan }: Props) {
  const today = localDate(new Date(), timeZone);
  const [day, setDay] = useState(today);
  const [monthOpen, setMonthOpen] = useState(false);
  const { profile, cycles } = profileState;

  const timed = useMemo(() => {
    const map = new Map<string, { item: Item; minutes: number }[]>();
    for (const item of brain.items) {
      if (item.status === "archived") continue;
      const when = itemWhen(item);
      if (when) map.set(when.date, [...(map.get(when.date) ?? []), { item, minutes: when.minutes }]);
    }
    for (const list of map.values()) list.sort((a, b) => a.minutes - b.minutes);
    return map;
  }, [brain.items]);

  const cycleMark = (date: string): "period" | "fertile" | null => {
    if (!profile?.cycle_tracking) return null;
    if (onPeriod(cycles, date)) return "period";
    const w = fertileWindow(cycles, date);
    return w && date >= w.start && date <= w.end ? "fertile" : null;
  };
  const areasOn = (date: string) => [...new Set((timed.get(date) ?? []).filter((t) => t.item.status !== "done").map((t) => t.item.area))].slice(0, 3);

  const anyTime =
    day === today && plan
      ? plan.entries
          .map((e) => brain.items.find((i) => i.id === e.item_id))
          .filter((i): i is Item => !!i && !(timed.get(day) ?? []).some((t) => t.item.id === i.id))
      : [];

  const prayers =
    profile?.prayer_reminders && profile.latitude !== null && profile.longitude !== null && cycleMark(day) !== "period"
      ? (() => {
          const t = new PrayerTimes(new Coordinates(profile.latitude!, profile.longitude!), new Date(`${day}T12:00:00`), CalculationMethod.Egyptian());
          return PRAYERS.map(([k, name]) => ({ name, minutes: minutesOf(t[k]) }));
        })()
      : [];

  const routines = [
    profile?.cooking_daily ? { key: "meal", icon: "🍳", title: "What to cook", minutes: profile.cooking_minute } : null,
    profile?.learning_daily ? { key: "learn", icon: "🌱", title: "Learning bite", minutes: profile.learning_minute } : null,
  ].filter((r): r is { key: string; icon: string; title: string; minutes: number } => !!r);

  const weekStart = addDays(day, -weekday(day));
  // The grid starts when their day starts (or earlier if something is planned earlier); earlier prayers sit above it.
  const dayStartMin = profile ? (profile.weekend_days.includes(weekday(day)) ? profile.day_start_weekend : profile.day_start_weekday) : 7 * 60;
  const events = timed.get(day) ?? [];
  const startHour = Math.min(Math.floor(dayStartMin / 60), ...events.map((t) => Math.floor(t.minutes / 60)));
  const early = prayers.filter((p) => p.minutes < startHour * 60);
  const open = events.filter((t) => t.item.status !== "done").length + anyTime.filter((i) => i.status !== "done").length;
  const mark = cycleMark(day);
  const title = new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="page cal">
      <header className="cal-top">
        <button className="cal-title" onClick={() => setMonthOpen(!monthOpen)} aria-expanded={monthOpen}>
          {title} <span aria-hidden>{monthOpen ? "▴" : "▾"}</span>
        </button>
        {day !== today && (
          <button className="pill" onClick={() => setDay(today)}>
            Today
          </button>
        )}
      </header>

      {monthOpen ? (
        <MonthGrid
          day={day}
          today={today}
          areasOn={areasOn}
          mark={cycleMark}
          onMove={(n) => {
            const [y, m] = day.split("-").map(Number);
            setDay(new Date(Date.UTC(y, m - 1 + n, 1, 12)).toISOString().slice(0, 10));
          }}
          onPick={(date) => {
            setDay(date);
            setMonthOpen(false);
          }}
        />
      ) : (
        <div className="week">
          <button className="week-arrow" aria-label="Previous week" onClick={() => setDay(addDays(day, -7))}>
            ‹
          </button>
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => (
            <button
              key={date}
              className={`week-day ${date === day ? "is-selected" : ""} ${date === today ? "is-today" : ""}`}
              onClick={() => setDay(date)}
              aria-label={new Date(`${date}T12:00:00Z`).toDateString()}
            >
              <span className="week-wd">{WEEKDAYS[weekday(date)]}</span>
              <span className="week-num">{Number(date.slice(8))}</span>
              <Dots areas={areasOn(date)} mark={cycleMark(date)} />
            </button>
          ))}
          <button className="week-arrow" aria-label="Next week" onClick={() => setDay(addDays(day, 7))}>
            ›
          </button>
        </div>
      )}

      <h2 className="cal-day-title">
        {day === today ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })}
        <span className="muted"> · {new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" })}</span>
      </h2>
      <p className="muted small cal-summary">
        {open === 0 ? "Nothing planned. A free day 🌿" : `${open} ${open === 1 ? "thing" : "things"} planned`}
        {early.length > 0 && ` · ${early.map((p) => `🕌 ${p.name} ${clock(p.minutes)}`).join(" · ")}`}
      </p>
      {mark && <p className={`cal-note is-${mark}`}>{mark === "period" ? "🤍 Period day. Prayer reminders are paused." : "🌸 Likely fertile day (an estimate)"}</p>}

      {anyTime.length > 0 && (
        <section className="anytime">
          <p className="eyebrow">Any time today</p>
          {anyTime.map((i) => (
            <label key={i.id} className={`anytime-row area-${i.area} ${i.status === "done" ? "is-done" : ""}`}>
              <input
                type="checkbox"
                checked={i.status === "done"}
                onChange={() => void (i.status === "done" ? brain.actions.reopen(i.id) : brain.actions.done(i.id))}
              />
              <span dir="auto">{i.title}</span>
            </label>
          ))}
        </section>
      )}

      <DayGrid
        isToday={day === today}
        events={events}
        prayers={prayers.filter((p) => !early.includes(p))}
        routines={routines}
        startHour={startHour}
        actions={brain.actions}
      />

      <p className="muted small">
        Say plans with a time ("dentist Thursday 5pm") or dump a photo of a schedule, and they appear here. Outlook and Teams meetings can be connected
        later.
      </p>
    </div>
  );
}

function Dots({ areas, mark }: { areas: Area[]; mark: "period" | "fertile" | null }) {
  return (
    <span className="dots" aria-hidden>
      {areas.map((a) => (
        <span key={a} className={`dot area-${a}`} />
      ))}
      {mark && <span className={`dot-cycle is-${mark}`} />}
    </span>
  );
}

function DayGrid({ isToday, events, prayers, routines, startHour, actions }: {
  isToday: boolean;
  events: { item: Item; minutes: number }[];
  prayers: { name: string; minutes: number }[];
  routines: { key: string; icon: string; title: string; minutes: number }[];
  startHour: number;
  actions: ReturnType<typeof useBrain>["actions"];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(() => minutesOf(new Date()));
  const scroller = useRef<HTMLDivElement>(null);
  const first = Math.max(0, startHour);
  const hours = Array.from({ length: 24 - first }, (_, i) => first + i);
  const top = (minutes: number) => ((minutes - first * 60) / 60) * HOUR_PX;

  useEffect(() => {
    const t = setInterval(() => setNow(minutesOf(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  // Overlapping reminders sit side by side.
  const placed = events.map((e, i) => {
    const overlapping = events.filter((o) => Math.abs(o.minutes - e.minutes) < BLOCK_MIN);
    return { ...e, col: overlapping.indexOf(e), cols: overlapping.length, key: `${e.item.id}-${i}` };
  });

  return (
    <div className="daygrid" ref={scroller} style={{ height: hours.length * HOUR_PX }}>
      {hours.map((h) => (
        <div key={h} className="hour" style={{ top: top(h * 60) }}>
          <span>{hourLabel(h)}</span>
        </div>
      ))}

      {prayers.map((p) => (
        <div key={p.name} className="prayer-line" style={{ top: top(p.minutes) }}>
          <span>🕌 {p.name} · {clock(p.minutes)}</span>
        </div>
      ))}

      {routines.map((r) => (
        <div key={r.key} className="routine" style={{ top: top(r.minutes) }}>
          {r.icon} {r.title}
        </div>
      ))}

      {placed.map(({ item, minutes, col, cols, key }) => (
        <div
          key={key}
          className={`event area-${item.area} ${item.status === "done" ? "is-done" : ""}`}
          style={{ top: top(minutes), height: (BLOCK_MIN / 60) * HOUR_PX - 4, left: `calc(3.6rem + (100% - 3.6rem) * ${col / cols})`, width: `calc((100% - 3.6rem) / ${cols} - 4px)` }}
        >
          <button className="event-body" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
            <span className="event-title" dir="auto">
              {AREA_ICON[item.area]} {item.title}
            </span>
            <span className="event-time">
              {clock(minutes)} · {AREA_LABEL[item.area]}
            </span>
          </button>
          {open === key && (
            <div className="event-actions">
              {item.status === "done" ? (
                <button className="pill" onClick={() => void actions.reopen(item.id)}>
                  Not done
                </button>
              ) : (
                <>
                  <button className="pill" onClick={() => void actions.done(item.id)}>
                    Done ✓
                  </button>
                  <button className="pill" onClick={() => void actions.snooze(item.id, "tomorrow")}>
                    Tomorrow
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {isToday && now >= first * 60 && (
        <div className="now" style={{ top: top(now) }}>
          <span />
        </div>
      )}
    </div>
  );
}

function MonthGrid({ day, today, areasOn, mark, onMove, onPick }: {
  day: string;
  today: string;
  areasOn: (date: string) => Area[];
  mark: (date: string) => "period" | "fertile" | null;
  onMove: (n: number) => void;
  onPick: (date: string) => void;
}) {
  const [y, m] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return (
    <div className="month">
      <div className="month-nav">
        <button className="week-arrow" aria-label="Previous month" onClick={() => onMove(-1)}>
          ‹
        </button>
        <button className="week-arrow" aria-label="Next month" onClick={() => onMove(1)}>
          ›
        </button>
      </div>
      <div className="month-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="month-wd">
            {w}
          </span>
        ))}
        {cells.map((date, i) =>
          date ? (
            <button key={date} className={`month-day ${date === today ? "is-today" : ""} ${date === day ? "is-selected" : ""}`} onClick={() => onPick(date)}>
              <span className="week-num">{Number(date.slice(8))}</span>
              <Dots areas={areasOn(date)} mark={mark(date)} />
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>
      <p className="legend muted small">
        <span className="dot area-career" /> work <span className="dot area-education" /> study <span className="dot area-home_family" /> family
        <span className="dot-cycle is-period" /> period <span className="dot-cycle is-fertile" /> fertile
      </p>
    </div>
  );
}
