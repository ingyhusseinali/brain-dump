import { useState } from "react";
import { ItemRow } from "./ItemRow";
import type { useBrain } from "../lib/items";
import { sortDump } from "../lib/dumps";
import { AREA_ICON, AREA_LABEL, KIND_LABEL } from "../lib/labels";
import { AREAS, type Area, type ItemKind } from "../../supabase/functions/_shared/schedule";

const KINDS: ItemKind[] = ["task", "reminder", "goal", "idea", "note"];

export function Everything({ brain }: { brain: ReturnType<typeof useBrain> }) {
  const { items, unsorted, actions } = brain;
  const [area, setArea] = useState<Area | "all">("all");
  const [kind, setKind] = useState<ItemKind | "all">("all");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = items.filter(
    (i) =>
      (area === "all" || i.area === area) &&
      (kind === "all" || i.kind === kind) &&
      (!q || i.title.toLowerCase().includes(q) || i.details?.toLowerCase().includes(q)),
  );
  const active = matches.filter((i) => i.status === "open" || i.status === "snoozed");
  const done = matches.filter((i) => i.status === "done");
  const counts = Object.fromEntries(AREAS.map((a) => [a, items.filter((i) => i.area === a && i.status !== "done").length]));

  const row = (i: (typeof items)[number]) => (
    <ItemRow
      key={i.id}
      item={i}
      onDone={() => void actions.done(i.id)}
      onReopen={() => void actions.reopen(i.id)}
      onSnooze={(p) => void actions.snooze(i.id, p)}
      onArchive={() => void actions.archive(i.id)}
    />
  );

  return (
    <div className="page">
      <h1>Everything</h1>
      <input className="search" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="chips" role="group" aria-label="Life area">
        <button className={`pill ${area === "all" ? "is-on" : ""}`} onClick={() => setArea("all")}>
          All areas
        </button>
        {AREAS.map((a) => (
          <button key={a} className={`pill ${area === a ? "is-on" : ""}`} onClick={() => setArea(a)}>
            {AREA_ICON[a]} {AREA_LABEL[a]} {counts[a] ? <span className="count">{counts[a]}</span> : null}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Type">
        <button className={`pill ${kind === "all" ? "is-on" : ""}`} onClick={() => setKind("all")}>
          Everything
        </button>
        {KINDS.map((k) => (
          <button key={k} className={`pill ${kind === k ? "is-on" : ""}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}s
          </button>
        ))}
      </div>

      {unsorted.length > 0 && (
        <section>
          <h2 className="section-title">Still sorting</h2>
          <ul className="list">
            {unsorted.map((d) => (
              <li key={d.id} className="item dump">
                <p>{d.body}</p>
                {d.error && (
                  <button className="pill" onClick={() => void sortDump(d.id)}>
                    Try sorting again
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length ? <ul className="list">{active.map(row)}</ul> : <p className="muted">Nothing here.</p>}

      {done.length > 0 && (
        <section>
          <button className="link" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide" : "Show"} {done.length} done this week
          </button>
          {showDone && <ul className="list">{done.map(row)}</ul>}
        </section>
      )}
    </div>
  );
}
