import { ItemRow } from "./ItemRow";
import type { useBrain } from "../lib/items";
import { itemsFor, listTitle, type ListSpec } from "../lib/lists";

/** One list (a smart list, a life area or a search), with a way back. */
export function ListView({ spec, brain, onBack }: { spec: ListSpec; brain: ReturnType<typeof useBrain>; onBack: () => void }) {
  const { actions } = brain;
  const items = itemsFor(spec, brain.items);
  const { icon, label } = listTitle(spec);
  const left = items.filter((i) => i.status !== "done").length;

  return (
    <div className={`page ${"area" in spec ? `area-${spec.area}` : ""}`}>
      <header className="screen-head">
        <button className="back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1>
          <span className="head-icon" aria-hidden>
            {icon}
          </span>{" "}
          {label}
        </h1>
        <span className="muted small">{left ? `${left} left` : ""}</span>
      </header>
      {items.length ? (
        <ul className="list rows">
          {items.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              onDone={() => void actions.done(i.id)}
              onReopen={() => void actions.reopen(i.id)}
              onSnooze={(p) => void actions.snooze(i.id, p)}
              onArchive={() => void actions.archive(i.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="empty">Nothing here yet. 🌱</p>
      )}
    </div>
  );
}
