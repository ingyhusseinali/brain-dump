import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import { registerServiceWorker } from "./lib/push";
import { useBrain } from "./lib/items";
import { usePlan } from "./lib/plan";
import { Login } from "./components/Login";
import { Today } from "./components/Today";
import { Everything } from "./components/Everything";
import { Settings } from "./components/Settings";

type View = "today" | "all" | "settings";

function initialView(): View {
  const v = new URLSearchParams(location.search).get("view");
  return v === "all" || v === "settings" ? v : "today";
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void registerServiceWorker();
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="page">
        <h1>Almost there</h1>
        <p>This copy of Brain Dump isn't connected to its database yet. See SETUP.md.</p>
      </div>
    );
  }
  if (session === undefined) return null;
  if (!session) return <Login />;
  return <SignedIn userId={session.user.id} email={session.user.email ?? ""} />;
}

function SignedIn({ userId, email }: { userId: string; email: string }) {
  const [view, setView] = useState<View>(initialView);
  const [highlightId] = useState(() => new URLSearchParams(location.search).get("item"));
  const brain = useBrain(userId);
  const today = usePlan(userId);

  // Tapping a notification while the app is open focuses the item it was about.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "open") setView(e.data.url?.includes("view=all") ? "all" : "today");
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  return (
    <>
      <main>
        {view === "today" && <Today brain={brain} today={today} highlightId={highlightId} />}
        {view === "all" && <Everything brain={brain} />}
        {view === "settings" && <Settings userId={userId} email={email} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["today", "☀️", "Today"],
            ["all", "🗂", "Everything"],
            ["settings", "⚙️", "Settings"],
          ] as const
        ).map(([v, icon, label]) => (
          <button key={v} className={view === v ? "is-on" : ""} onClick={() => setView(v)} aria-current={view === v ? "page" : undefined}>
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
