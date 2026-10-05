import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase, timeZone } from "./lib/supabase";
import { localDate } from "../supabase/functions/_shared/schedule";
import { registerServiceWorker, serviceWorkers } from "./lib/push";
import { useBrain } from "./lib/items";
import { usePlan } from "./lib/plan";
import { useLibrary } from "./lib/library";
import { useProfile } from "./lib/profile";
import { Folders } from "./components/Folders";
import { OutputView } from "./components/OutputView";
import { Login } from "./components/Login";
import { Today } from "./components/Today";
import { Lists } from "./components/Lists";
import { ListView } from "./components/ListView";
import { More } from "./components/More";
import { AddSheet } from "./components/AddSheet";
import type { ListSpec } from "./lib/lists";
import { Settings } from "./components/Settings";
import { Calendar } from "./components/Calendar";
import { Money } from "./components/Money";
import { useMoney } from "./lib/money";

type View = "today" | "lists" | "calendar" | "more" | "folders" | "money" | "settings";

function initialView(): View {
  const v = new URLSearchParams(location.search).get("view");
  if (v === "all") return "lists";
  return v === "calendar" || v === "folders" || v === "money" || v === "settings" || v === "lists" || v === "more" ? v : "today";
}

// Which bottom tab a screen belongs to.
const TAB_OF: Record<View, View> = { today: "today", lists: "lists", calendar: "calendar", more: "more", folders: "more", money: "more", settings: "more" };

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
  const [view, setViewRaw] = useState<View>(initialView);
  const [list, setList] = useState<{ spec: ListSpec; from: View } | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const setView = (v: View) => {
    setList(null);
    setFolderId(null);
    setViewRaw(v);
    window.scrollTo(0, 0);
  };
  const openList = (spec: ListSpec) => {
    setList({ spec, from: view });
    window.scrollTo(0, 0);
  };
  const [highlightId] = useState(() => new URLSearchParams(location.search).get("item"));
  const brain = useBrain(userId);
  const today = usePlan(userId);
  const library = useLibrary(userId);
  const profileState = useProfile(userId);
  const money = useMoney(userId);
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
    const workers = serviceWorkers();
    workers?.addEventListener("message", onMessage);
    return () => workers?.removeEventListener("message", onMessage);
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
        onCooked={() => {
          void library.markCooked(output.id, localDate(new Date(), timeZone));
          setOutputId(null);
        }}
      />
    );
  }

  return (
    <>
      <main>
        {list && <ListView spec={list.spec} brain={brain} onBack={() => setList(null)} />}
        {!list && view === "today" && (
          <Today
            brain={brain}
            today={today}
            library={library}
            profileState={profileState}
            highlightId={highlightId}
            onOpenOutput={setOutputId}
            onOpenList={openList}
            onOpenSettings={() => setView("settings")}
            onAdd={() => setAdding(true)}
          />
        )}
        {!list && view === "lists" && (
          <Lists
            brain={brain}
            library={library}
            onOpenList={openList}
            onOpenFolder={(id) => {
              setFolderId(id);
              setViewRaw("folders");
            }}
          />
        )}
        {!list && view === "more" && <More onGo={setView} />}
        {!list && view === "calendar" && (
          <Calendar
            brain={brain}
            profileState={profileState}
            plan={today.plan}
          />
        )}
        {!list && view === "money" && <Money money={money} profileState={profileState} brain={brain} />}
        {!list && view === "folders" && (
          <Folders
            key={folderId ?? "all"}
            brain={brain}
            library={library}
            onOpenOutput={setOutputId}
            startId={folderId}
            onBack={() => setView(folderId ? "lists" : "more")}
          />
        )}
        {!list && view === "settings" && <Settings state={profileState} email={email} />}
      </main>
      {(view === "today" || view === "lists" || view === "calendar") && !adding && (
        <button className="fab" onClick={() => setAdding(true)} aria-label="Add a thought">
          +
        </button>
      )}
      {adding && <AddSheet onClose={() => setAdding(false)} />}
      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["today", "🏠", "Home"],
            ["lists", "☰", "My Lists"],
            ["calendar", "📅", "Calendar"],
            ["more", "•••", "More"],
          ] as const
        ).map(([v, icon, label]) => (
          <button
            key={v}
            className={`tab-${v} ${TAB_OF[view] === v && !list ? "is-on" : ""} ${list && TAB_OF[list.from] === v ? "is-on" : ""}`}
            onClick={() => setView(v)}
            aria-current={TAB_OF[view] === v ? "page" : undefined}
          >
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
