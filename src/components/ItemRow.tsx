import { useState } from "react";
import type { Item, SnoozePreset } from "../../supabase/functions/_shared/schedule";
import { AREA_LABEL, KIND_LABEL, formatWhen } from "../lib/labels";

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

/** One clean row: a circle to tick (and untick), the title, and a small coloured line saying where it belongs. */
export function ItemRow({ item, why, highlight, onDone, onReopen, onSnooze, onArchive }: Props) {
  const [open, setOpen] = useState(false);
  const done = item.status === "done";
  const meta = [
    AREA_LABEL[item.area],
    item.kind !== "task" ? KIND_LABEL[item.kind] : null,
    item.remind_at && !done ? formatWhen(item.remind_at) : null,
    item.status === "snoozed" && item.snoozed_until ? `Snoozed till ${formatWhen(item.snoozed_until)}` : null,
  ].filter(Boolean);

  return (
    <li className={`item area-${item.area} ${done ? "is-done" : ""} ${highlight ? "is-highlight" : ""}`}>
      <div className="item-main">
        <button
          className="check"
          aria-pressed={done}
          aria-label={done ? `Untick "${item.title}"` : `Tick "${item.title}"`}
          onClick={done ? onReopen : onDone}
        >
          {done ? "✓" : ""}
        </button>
        <button className="item-body" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="item-title">{item.title}</span>
          <span className="item-meta">
            <span className="dot" aria-hidden />
            {meta.join(" · ")}
          </span>
        </button>
        <span className={`item-chev ${open ? "is-open" : ""}`} aria-hidden>
          ›
        </span>
      </div>
      {open && (
        <div className="item-more">
          {why && <p className="item-why">{why}</p>}
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
