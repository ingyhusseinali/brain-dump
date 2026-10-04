import { useEffect, useState } from "react";
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import type { useProfile } from "../lib/profile";
import { timeZone } from "../lib/supabase";
import { daysBetween, fertileWindow, localDate, onPeriod } from "../../supabase/functions/_shared/schedule";

type ProfileState = ReturnType<typeof useProfile>;

const PRAYERS = [
  ["fajr", "Fajr"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
] as const;

function nextPrayer(lat: number, lng: number): { name: string; at: Date } | null {
  const now = new Date();
  for (const day of [now, new Date(now.getTime() + 86_400_000)]) {
    const t = new PrayerTimes(new Coordinates(lat, lng), day, CalculationMethod.Egyptian());
    for (const [key, name] of PRAYERS) if (t[key] > now) return { name, at: t[key] };
  }
  return null;
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Quran, prayer and cycle: small, calm cards that need one tap at most. */
export function Daily({ state }: { state: ProfileState }) {
  const { profile, cycles, markQuranRead, logPeriod } = state;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!profile) return null;

  const today = localDate(new Date(), timeZone);
  const period = profile.cycle_tracking && onPeriod(cycles, today);
  const window = profile.cycle_tracking ? fertileWindow(cycles, today) : null;
  const readToday = profile.quran_last_read === today;
  const prayer =
    profile.prayer_reminders && !period && profile.latitude !== null && profile.longitude !== null
      ? nextPrayer(profile.latitude, profile.longitude)
      : null;
  const lastStart = cycles.find((c) => c.started_on <= today);

  return (
    <section className="daily" aria-label="Daily">
      {profile.quran_daily && (
        <div className={`daily-card ${readToday ? "is-done" : ""}`}>
          <div>
            <p className="daily-title">
              📖 {period ? "Listen to" : "Quran"} · page {readToday ? profile.quran_page - 1 || 604 : profile.quran_page}
            </p>
            <p className="muted small">
              {readToday
                ? `Done for today${profile.quran_streak > 1 ? ` · ${profile.quran_streak} days in a row` : ""} 🤍`
                : period
                  ? "Listening or dhikr, about 5 minutes"
                  : `About 5 minutes${profile.quran_streak > 1 ? ` · ${profile.quran_streak}-day streak` : ""}`}
            </p>
          </div>
          {!readToday && (
            <div className="daily-actions">
              <a className="pill" href={`https://quran.com/page/${profile.quran_page}`} target="_blank" rel="noreferrer">
                Open
              </a>
              <button className="pill" onClick={() => void markQuranRead()}>
                {period ? "Listened ✓" : "Read ✓"}
              </button>
            </div>
          )}
        </div>
      )}

      {prayer && (
        <div className="daily-card">
          <p className="daily-title">🕌 Next: {prayer.name}</p>
          <p className="muted small">{fmtTime(prayer.at)}</p>
        </div>
      )}

      {profile.cycle_tracking && (
        <div className="daily-card">
          <div>
            {period ? (
              <>
                <p className="daily-title">🤍 Period · day {lastStart ? daysBetween(lastStart.started_on, today) + 1 : 1}</p>
                <p className="muted small">{profile.prayer_reminders ? "Prayer reminders are paused. Rest well." : "Rest well."}</p>
              </>
            ) : window && today >= window.start && today <= window.end ? (
              <>
                <p className="daily-title">🌸 Likely fertile days</p>
                <p className="muted small">
                  {fmtDay(window.start)} to {fmtDay(window.end)}, ovulation around {fmtDay(window.ovulation)}. An estimate.
                </p>
              </>
            ) : window && today < window.start ? (
              <>
                <p className="daily-title">🌸 Fertile window</p>
                <p className="muted small">
                  Likely from {fmtDay(window.start)} ({daysBetween(today, window.start)} days). An estimate.
                </p>
              </>
            ) : (
              <>
                <p className="daily-title">🌸 Cycle</p>
                <p className="muted small">Tap when your period starts, or just tell me.</p>
              </>
            )}
          </div>
          <div className="daily-actions">
            {period ? (
              <button className="pill" onClick={() => void logPeriod("end")}>
                It ended
              </button>
            ) : (
              <button className="pill" onClick={() => void logPeriod("start")}>
                Period started
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
