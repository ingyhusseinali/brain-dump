import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import { registerServiceWorker } from "./lib/push";
import { useBrain } from "./lib/items";
import { usePlan } from "./lib/plan";
import { useLibrary } from "./lib/library";
import { Folders } from "./components/Folders";
import { OutputView } from "./components/OutputView";
import { Login } from "./components/Login";
import { Today } from "./components/Today";
import { Everything } from "./components/Everything";
import { Settings } from "./components/Settings";

type View = "today" | "folders" | "all" | "settings";

function initialView(): View {
  const v = new URLSearchParams(location.search).get("view");
  return v === "folders" || v === "all" || v === "settings" ? v : "today";
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
  const library = useLibrary(userId);
  const [outputId, setOutputId] = useState<string | null>(() => new URLSearchParams(location.search).get("output"));
  const output = library.outputs.find((o) => o.id === outputId);

  // Tapping a notification while the app is open focuses the item it was about.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "open") return;
      const params = new URL(e.data.url).searchParams;
      if (params.get("output")) setOutputId(params.get("output"));
      setView(params.get("view") === "folders" ? "folders" : "today");
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  if (output) {
    return (
      <OutputView
        output={output}
        folderName={library.folders.find((f) => f.id === output.folder_id)?.name ?? null}
        onClose={() => setOutputId(null)}
        onDone={() => {
          void library.setOutputStatus(output.id, "done");
          // "Sent it" also clears the reminder to send it.
          for (const i of brain.items) if (i.output_id === output.id && i.status !== "done") void brain.actions.done(i.id);
          setOutputId(null);
        }}
      />
    );
  }

  return (
    <>
      <main>
        {view === "today" && (
          <Today brain={brain} today={today} library={library} highlightId={highlightId} onOpenOutput={setOutputId} />
        )}
        {view === "folders" && <Folders brain={brain} library={library} onOpenOutput={setOutputId} />}
        {view === "all" && <Everything brain={brain} />}
        {view === "settings" && <Settings userId={userId} email={email} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["today", "☀️", "Today"],
            ["folders", "📁", "Folders"],
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
