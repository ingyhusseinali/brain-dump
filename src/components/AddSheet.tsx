import { useState } from "react";
import { Capture } from "./Capture";

const TYPES = [
  ["Task", "✅"],
  ["Note", "📝"],
  ["Idea", "💡"],
  ["Worry", "💭"],
  ["Goal", "🎯"],
  ["Remind", "⏰"],
] as const;

/** The + button's sheet: type or say anything; picking a type is optional and just helps Claude file it. */
export function AddSheet({ onClose }: { onClose: () => void }) {
  const [hint, setHint] = useState<string | undefined>();
  return (
    <div className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="add-panel">
        <header className="add-head">
          <button className="back" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <h2 id="add-title">Add new</h2>
          <span />
        </header>
        <p className="add-q">What's on your mind?</p>
        <Capture hint={hint} onSaved={onClose} autoFocus />
        <div className="type-grid" role="group" aria-label="What is it? (optional)">
          {TYPES.map(([label, icon]) => (
            <button
              key={label}
              className={`type-chip type-${label.toLowerCase()} ${hint === label ? "is-on" : ""}`}
              aria-pressed={hint === label}
              onClick={() => setHint((h) => (h === label ? undefined : label))}
            >
              <span aria-hidden>{icon}</span> {label}
            </button>
          ))}
        </div>
        <p className="muted small">Not sure what it is? Skip this, Claude will sort it.</p>
      </div>
    </div>
  );
}
