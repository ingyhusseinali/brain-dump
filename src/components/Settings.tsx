import { useEffect, useState } from "react";
import { supabase, timeZone } from "../lib/supabase";
import { enablePush, isStandalone, pushState, sendTestNotification, type PushState } from "../lib/push";
import type { useProfile } from "../lib/profile";

const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromTime = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hours = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>
        {label}
        {hint && <span className="muted small block">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Settings({ state, email }: { state: ReturnType<typeof useProfile>; email: string }) {
  const { profile, save } = state;
  const [push, setPush] = useState<PushState | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    void pushState().then(setPush);
  }, []);

  async function turnOn() {
    setPushError(null);
    try {
      setPush(await enablePush());
    } catch (err) {
      setPushError((err as Error).message);
    }
  }

  function turnOnPrayer(on: boolean) {
    if (!on) return void save({ prayer_reminders: false });
    setLocating(true);
    // Location is only used to work out prayer times; rounded to about 1 km.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void save({
          prayer_reminders: true,
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
        });
      },
      () => {
        setLocating(false);
        // Without location, fall back to Cairo.
        void save({ prayer_reminders: true, latitude: 30.04, longitude: 31.24 });
      },
      { enableHighAccuracy: false, timeout: 15_000 },
    );
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="card">
        <h2>Nudges</h2>
        {push === "needs-install" && (
          <p>
            To get reminders on iPhone, add this app to your Home Screen first: tap <strong>Share</strong>, then{" "}
            <strong>Add to Home Screen</strong>, then open it from there and come back here.
          </p>
        )}
        {push === "off" && (
          <button className="primary" onClick={() => void turnOn()}>
            Turn on reminders on this device
          </button>
        )}
        {push === "on" && (
          <p>
            Reminders are on for this device.{" "}
            <button className="link inline" onClick={() => void sendTestNotification()}>
              Send a test
            </button>
          </p>
        )}
        {push === "blocked" && <p>Notifications are blocked. Allow them for this app in your phone's Settings, then reopen it.</p>}
        {push === "unsupported" && <p>This browser can't show reminders. On iPhone, use Safari and add the app to your Home Screen.</p>}
        {pushError && <p className="error">{pushError}</p>}
        <p className="muted small">Turn this on separately on your phone and your laptop.</p>
      </section>

      {profile && (
        <>
          <section className="card">
            <h2>Your day</h2>
            <label className="field">
              Workdays start around
              <input type="time" value={toTime(profile.day_start_weekday)} onChange={(e) => void save({ day_start_weekday: fromTime(e.target.value) })} />
            </label>
            <label className="field">
              Weekends start around
              <input type="time" value={toTime(profile.day_start_weekend)} onChange={(e) => void save({ day_start_weekend: fromTime(e.target.value) })} />
            </label>
            <div className="field">
              Weekend days
              <div className="chips wrap">
                {DAYS.map((d, i) => {
                  const on = profile.weekend_days.includes(i);
                  return (
                    <button
                      key={d}
                      className={`pill ${on ? "is-on" : ""}`}
                      onClick={() => void save({ weekend_days: on ? profile.weekend_days.filter((x) => x !== i) : [...profile.weekend_days, i] })}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="row-fields">
              <label className="field">
                Quiet from
                <select value={profile.quiet_start} onChange={(e) => void save({ quiet_start: Number(e.target.value) })}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                until
                <select value={profile.quiet_end} onChange={(e) => void save({ quiet_end: Number(e.target.value) })}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted small">Your list arrives when your day starts. No nudges in quiet hours. Time zone: {timeZone}.</p>
          </section>

          <section className="card">
            <h2>Faith</h2>
            <Toggle
              label={locating ? "Prayer reminders (finding your location…)" : "Prayer reminders"}
              hint="At each prayer time. Other nudges wait 20 minutes after the adhan."
              checked={profile.prayer_reminders}
              onChange={turnOnPrayer}
            />
            {profile.prayer_reminders && (
              <Toggle label="Include Fajr" hint="Even during quiet hours." checked={profile.prayer_fajr} onChange={(v) => void save({ prayer_fajr: v })} />
            )}
            <Toggle
              label="One page of Quran a day"
              hint={`Next: page ${profile.quran_page}. A gentle nudge in the evening if it's not read yet.`}
              checked={profile.quran_daily}
              onChange={(v) => void save({ quran_daily: v })}
            />
            {profile.quran_daily && (
              <label className="field">
                Continue from page
                <input
                  type="number"
                  min={1}
                  max={604}
                  value={profile.quran_page}
                  onChange={(e) => void save({ quran_page: Math.min(604, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </label>
            )}
          </section>

          <section className="card">
            <h2>Learning</h2>
            <Toggle
              label="A 5-minute learning bite every day"
              hint="Alternates between your faith and new ideas: science, history, psychology and more."
              checked={profile.learning_daily}
              onChange={(v) => void save({ learning_daily: v })}
            />
            {profile.learning_daily && (
              <label className="field">
                Arrives at
                <input type="time" value={toTime(profile.learning_minute)} onChange={(e) => void save({ learning_minute: fromTime(e.target.value) })} />
              </label>
            )}
          </section>

          <section className="card">
            <h2>Cycle</h2>
            <Toggle
              label="Track my cycle"
              hint="Pauses prayer reminders during your period and gives a heads-up before your likely fertile days. Tell me when it starts and ends, or tap on the Today page."
              checked={profile.cycle_tracking}
              onChange={(v) => void save({ cycle_tracking: v })}
            />
            {profile.cycle_tracking && (
              <p className="muted small">
                Fertile days are estimated from your logged periods and get more accurate over a few cycles. Ovulation tests or your doctor
                can confirm them. Only you can see this data.
              </p>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2>Account</h2>
        <p className="muted">Signed in as {email}.</p>
        {!isStandalone() && <p className="muted small">Tip: add this app to your Home Screen or dock so it's one tap away.</p>}
        <button className="pill" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}
