import { useEffect, useState } from "react";
import type { Item } from "../../supabase/functions/_shared/schedule";

interface Props {
  queue: { item: Item; why?: string }[];
  onDone: (id: string) => void;
  onClose: () => void;
}

/** One thing, big, with a short timer. For when a list is too much. */
export function Focus({ queue, onDone, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const current = queue[index];

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  const left = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : 0;

  return (
    <div className="focus" role="dialog" aria-modal="true" aria-label="Just one thing">
      <button className="focus-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {current ? (
        <div className="focus-body">
          <p className="eyebrow">Just this one</p>
          <h1 dir="auto">{current.item.title}</h1>
          {current.why && <p className="muted">{current.why}</p>}
          {endsAt ? (
            <p className="timer" aria-live="polite">
              {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Time! How did it go?"}
            </p>
          ) : (
            <button className="primary big" onClick={() => setEndsAt(Date.now() + 5 * 60_000)}>
              Start a 5-minute timer
            </button>
          )}
          <div className="row-actions center">
            <button
              className="pill"
              onClick={() => {
                onDone(current.item.id);
                setEndsAt(null);
                setIndex((i) => i + 1);
              }}
            >
              Done ✓
            </button>
            <button
              className="pill quiet"
              onClick={() => {
                setEndsAt(null);
                setIndex((i) => i + 1);
              }}
            >
              Not now →
            </button>
          </div>
        </div>
      ) : (
        <div className="focus-body">
          <h1>That's the list. 🎉</h1>
          <p className="muted">Anything you skipped will come back tomorrow, rethought.</p>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
