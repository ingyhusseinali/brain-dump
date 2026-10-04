import { useState } from "react";
import type { Item, SnoozePreset } from "../../supabase/functions/_shared/schedule";
import { AREA_ICON, AREA_LABEL, KIND_LABEL, formatWhen } from "../lib/labels";

interface Props {
  item: Item;
  why?: string;
  highlight?: boolean;
  onDone: () => void;
  onReopen: () => void;
  onSnooze: (preset: SnoozePreset) => void;
  onArchive: () => void;
}

const SNOOZES: [SnoozePreset, string][] = [
  ["later", "In 2 hours"],
  ["tonight", "Tonight"],
  ["tomorrow", "Tomorrow"],
  ["next_week", "Next week"],
];

export function ItemRow({ item, why, highlight, onDone, onReopen, onSnooze, onArchive }: Props) {
  const [open, setOpen] = useState(false);
  const done = item.status === "done";
  const checkable = item.kind === "task" || item.kind === "reminder" || item.kind === "goal";

  return (
    <li className={`item area-${item.area} ${done ? "is-done" : ""} ${highlight ? "is-highlight" : ""}`}>
      <div className="item-main">
        {checkable ? (
          <button
            className="check"
            aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
            onClick={done ? onReopen : onDone}
          >
            {done ? "✓" : ""}
          </button>
        ) : (
          <span className="kind-dot" aria-hidden>
            {item.kind === "idea" ? "💡" : "📝"}
          </span>
        )}
        <button className="item-body" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="item-title">{item.title}</span>
          <span className="item-meta">
            <span className="chip area-chip">
              {AREA_ICON[item.area]} {AREA_LABEL[item.area]}
            </span>
            {item.kind !== "task" && <span className="chip subtle">{KIND_LABEL[item.kind]}</span>}
            {item.remind_at && !done && <span className="chip when">{formatWhen(item.remind_at)}</span>}
            {item.status === "snoozed" && item.snoozed_until && (
              <span className="chip subtle">Snoozed till {formatWhen(item.snoozed_until)}</span>
            )}
          </span>
          {why && <span className="item-why">{why}</span>}
        </button>
      </div>
      {open && (
        <div className="item-more">
          {item.details && <p className="item-details">{item.details}</p>}
          {!done && (
            <div className="row-actions">
              {SNOOZES.map(([preset, label]) => (
                <button
                  key={preset}
                  className="pill"
                  onClick={() => {
                    onSnooze(preset);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
              <button className="pill quiet" onClick={onArchive}>
                Let it go
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
