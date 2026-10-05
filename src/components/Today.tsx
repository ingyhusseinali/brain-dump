import { useMemo, useState } from "react";
import { FREE_MODE } from "./Capture";
import { OutputCard } from "./OutputCard";
import { Daily } from "./Daily";
import { Focus } from "./Focus";
import type { useProfile } from "../lib/profile";
import type { useLibrary } from "../lib/library";
import { ItemRow } from "./ItemRow";
import type { useBrain } from "../lib/items";
import type { usePlan } from "../lib/plan";
import { AREAS, pickNow, type Area, type Item } from "../../supabase/functions/_shared/schedule";
import { AREA_ICON, AREA_LABEL } from "../lib/labels";
import { countOpen, type ListSpec } from "../lib/lists";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// Shown as tiles when nothing is filed yet.
const STARTER: Area[] = ["career", "education", "personal", "health", "money", "home_family"];

interface Props {
  brain: ReturnType<typeof useBrain>;
  today: ReturnType<typeof usePlan>;
  library: ReturnType<typeof useLibrary>;
  profileState: ReturnType<typeof useProfile>;
  highlightId: string | null;
  onOpenOutput: (id: string) => void;
  onOpenList: (spec: ListSpec) => void;
  onOpenSettings: () => void;
  onAdd: () => void;
}

export function Today({ brain, today, library, profileState, highlightId, onOpenOutput, onOpenList, onOpenSettings, onAdd }: Props) {
  const [focusing, setFocusing] = useState(false);
  const [query, setQuery] = useState("");
  const { items, actions } = brain;
  const { plan, writing, failed, rewrite } = today;
  const waiting = brain.unsorted.filter((d) => !d.error).length;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Plan entries in order, skipping anything deleted or let go since it was written.
  const planned = (plan?.entries ?? [])
    .map((e) => ({ item: byId.get(e.item_id), why: e.why }))
    .filter((e): e is { item: Item; why: string } => !!e.item && e.item.status !== "archived");
  const doneCount = planned.filter((e) => e.item.status === "done").length;
  const allDone = planned.length > 0 && doneCount === planned.length;

  // Urgent things that arrived after the list was written.
  const plannedIds = new Set(planned.map((e) => e.item.id));
  const since = plan ? Date.parse(plan.generated_at) : 0;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const fresh = items.filter(
    (i) =>
      !plannedIds.has(i.id) &&
      i.status === "open" &&
      Date.parse(i.created_at) > since &&
      (i.priority === 1 || (i.remind_at && Date.parse(i.remind_at) <= endOfToday.getTime())),
  );

  // Drafts Claude made in the last few days that haven't been used yet.
  const ready = library.outputs
    .filter((o) => o.status === "draft" && o.type !== "recipe" && Date.now() - Date.parse(o.updated_at) < 3 * 86_400_000)
    .slice(0, 3);
  const folderName = (id: string | null) => library.folders.find((f) => f.id === id)?.name ?? null;

  const fallback = !plan ? pickNow(items, new Date()) : [];

  // Category tiles: the busiest life areas, or a starter set before anything is filed.
  const counts = AREAS.map((a) => ({ a, n: countOpen({ area: a }, items) }));
  const used = counts.filter((c) => c.n > 0).sort((x, y) => y.n - x.n);
  const tiles = used.length ? used.slice(0, 6) : STARTER.map((a) => ({ a, n: 0 }));
  const row = (item: Item, why?: string) => (
    <ItemRow
      key={item.id}
      item={item}
      why={why}
      highlight={item.id === highlightId}
      onDone={() => void actions.done(item.id)}
      onReopen={() => void actions.reopen(item.id)}
      onSnooze={(p) => void actions.snooze(item.id, p)}
      onArchive={() => void actions.archive(item.id)}
    />
  );

  if (focusing) {
    const queue = planned.length ? planned.filter((e) => e.item.status !== "done") : fallback.map((item) => ({ item, why: undefined }));
    return <Focus queue={queue} onDone={(id) => void actions.done(id)} onClose={() => setFocusing(false)} />;
  }

  return (
    <div className="page home">
      <header className="home-head">
        <div>
          <h1>
            {greeting()}, Ingy <span aria-hidden>☀️</span>
          </h1>
          <p className="muted">What's on your mind today?</p>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
          ⚙️
        </button>
      </header>

      <form
        className="search-wrap"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) onOpenList({ query: query.trim() });
        }}
      >
        <span aria-hidden>🔍</span>
        <input type="search" placeholder="Search your brain dump…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>

      {!items.length && !brain.unsorted.length && !plan && !writing && (
        <button className="welcome" onClick={onAdd}>
          <strong>Start here 👋</strong>
          <span>
            Tap + and tell me about your life, in English or Arabic, as messy as you like: work, studies, deadlines, home, family and
            friends. I'll sort it all into place.
          </span>
        </button>
      )}

      <ul className="tiles">
        {tiles.map(({ a, n }) => (
          <li key={a} className={`area-${a}`}>
            <button className="tile" onClick={() => onOpenList({ area: a })}>
              <span className="tile-icon" aria-hidden>
                {AREA_ICON[a]}
              </span>
              <span className="tile-label">{AREA_LABEL[a]}</span>
              <span className="tile-count">{n}</span>
            </button>
          </li>
        ))}
        {tiles.length % 2 === 1 && (
          <li className="area-all">
            <button className="tile" onClick={() => onOpenList({ smart: "all" })}>
              <span className="tile-icon" aria-hidden>
                🗂
              </span>
              <span className="tile-label">All items</span>
              <span className="tile-count">{countOpen({ smart: "all" }, items)}</span>
            </button>
          </li>
        )}
      </ul>

      {waiting > 0 && (
        <p className="inbox-card" role="status">
          <span aria-hidden>📥</span>
          {waiting === 1 ? "1 thought" : `${waiting} thoughts`} waiting.{" "}
          {FREE_MODE ? "Claude sorts them every hour, and they'll pop into place." : "Sorting now…"}
        </p>
      )}

      <section className="today" aria-labelledby="today-title">
        <header className="today-head">
          <div>
            <h2 id="today-title">Today</h2>
            <p className="muted small">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              {plan?.headline ? ` · ${plan.headline}` : ""}
            </p>
          </div>
          {planned.length > 0 && (
            <span className="progress" aria-label={`${doneCount} of ${planned.length} done`}>
              {doneCount}/{planned.length}
            </span>
          )}
        </header>

        {writing && <p className="muted">Writing today's list from everything you've told me…</p>}
        {failed && !writing && <p className="muted">I couldn't write today's list just now. Here's what looks most pressing.</p>}

        {planned.length > 0 && !allDone && (
          <button className="link focus-btn" onClick={() => setFocusing(true)}>
            🎯 Just show me one thing
          </button>
        )}
        {planned.length > 0 && <ol className="list rows">{planned.map((e) => row(e.item, e.why))}</ol>}
        {allDone && <p className="celebrate">All done for today. That's genuinely great. 🎉</p>}

        {!plan && !writing && fallback.length > 0 && <ol className="list rows">{fallback.map((i) => row(i))}</ol>}
        {!plan && !writing && !fallback.length && (
          <p className="muted">Nothing here yet. Just talk: whatever is on your mind goes in the box above, and I'll sort, file and prepare things for you.</p>
        )}

        {fresh.length > 0 && (
          <>
            <h2 className="section-title">New since this list was written</h2>
            <ol className="list rows">{fresh.map((i) => row(i))}</ol>
          </>
        )}

        {plan && (
          <p className="muted small">
            Tick things off as you go (tap again to untick). Anything left over is rethought tomorrow.{" "}
            <button className="link inline" onClick={() => void rewrite()} disabled={writing}>
              Rewrite now
            </button>
          </p>
        )}
      </section>

      {ready.length > 0 && (
        <section aria-labelledby="ready-title">
          <h2 id="ready-title" className="section-title">
            Ready for you
          </h2>
          <ul className="list">
            {ready.map((o) => (
              <OutputCard key={o.id} output={o} folderName={folderName(o.folder_id)} onOpen={() => onOpenOutput(o.id)} />
            ))}
          </ul>
        </section>
      )}

      <Daily state={profileState} outputs={library.outputs} onOpenOutput={onOpenOutput} />
    </div>
  );
}
