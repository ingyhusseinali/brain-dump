import { useEffect, useState } from "react";
import { supabase, timeZone } from "../lib/supabase";
import { enablePush, isStandalone, pushState, sendTestNotification, type PushState } from "../lib/push";

interface ProfileForm {
  quiet_start: number;
  quiet_end: number;
  digest_hour: number;
}

const hours = Array.from({ length: 24 }, (_, h) => h);
const label = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });

export function Settings({ userId, email }: { userId: string; email: string }) {
  const [push, setPush] = useState<PushState | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileForm | null>(null);

  useEffect(() => {
    void pushState().then(setPush);
    void supabase
      .from("profiles")
      .select("quiet_start, quiet_end, digest_hour")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => data && setProfile(data));
    // Keep reminders in this device's time zone.
    void supabase.from("profiles").update({ timezone: timeZone }).eq("user_id", userId);
  }, [userId]);

  async function turnOn() {
    setPushError(null);
    try {
      setPush(await enablePush());
    } catch (err) {
      setPushError((err as Error).message);
    }
  }

  async function save(changes: Partial<ProfileForm>) {
    setProfile((p) => (p ? { ...p, ...changes } : p));
    await supabase.from("profiles").update(changes).eq("user_id", userId);
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
            <button className="link" onClick={() => void sendTestNotification()}>
              Send a test
            </button>
          </p>
        )}
        {push === "blocked" && <p>Notifications are blocked. Allow them for this app in your phone's Settings, then reopen it.</p>}
        {push === "unsupported" && <p>This browser can't show reminders. On iPhone, use Safari and add the app to your Home Screen.</p>}
        {pushError && <p className="error">{pushError}</p>}
        <p className="muted">Turn this on separately on your phone and your laptop.</p>
      </section>

      {profile && (
        <section className="card">
          <h2>Your rhythm</h2>
          <label className="field">
            Morning list arrives at
            <select value={profile.digest_hour} onChange={(e) => void save({ digest_hour: Number(e.target.value) })}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {label(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Quiet from
            <select value={profile.quiet_start} onChange={(e) => void save({ quiet_start: Number(e.target.value) })}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {label(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Quiet until
            <select value={profile.quiet_end} onChange={(e) => void save({ quiet_end: Number(e.target.value) })}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {label(h)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">No nudges during quiet hours. Time zone: {timeZone}.</p>
        </section>
      )}

      <section className="card">
        <h2>Account</h2>
        <p className="muted">Signed in as {email}.</p>
        {!isStandalone() && <p className="muted">Tip: add this app to your Home Screen or dock so it's one tap away.</p>}
        <button className="pill" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}
