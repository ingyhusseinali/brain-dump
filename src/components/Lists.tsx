import { useState } from "react";
import type { useBrain } from "../lib/items";
import type { useLibrary } from "../lib/library";
import { AREA_ICON, AREA_LABEL } from "../lib/labels";
import { SMART, countOpen, type ListSpec } from "../lib/lists";
import { AREAS } from "../../supabase/functions/_shared/schedule";

interface Props {
  brain: ReturnType<typeof useBrain>;
  library: ReturnType<typeof useLibrary>;
  onOpenList: (spec: ListSpec) => void;
  onOpenFolder: (id: string) => void;
}

type Tab = "smart" | "areas" | "folders";

/** My Lists: ready-made lists, life areas, and the folders Claude made. */
export function Lists({ brain, library, onOpenList, onOpenFolder }: Props) {
  const [tab, setTab] = useState<Tab>("smart");
  const items = brain.items;

  return (
    <div className="page">
      <h1>My Lists</h1>
      <div className="segmented" role="tablist">
        {(
          [
            ["smart", "Smart lists"],
            ["areas", "Categories"],
            ["folders", "Folders"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "smart" && (
        <ul className="menu">
          {SMART.map((s) => {
            const n = countOpen({ smart: s.id }, items);
            return (
              <li key={s.id}>
                <button onClick={() => onOpenList({ smart: s.id })}>
                  <span className="menu-icon" aria-hidden>
                    {s.icon}
                  </span>
                  <span className="menu-label">{s.label}</span>
                  <span className={`menu-count ${s.id === "overdue" && n ? "is-warn" : ""}`}>{n}</span>
                  <span className="chev" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "areas" && (
        <ul className="menu">
          {AREAS.map((a) => (
            <li key={a} className={`area-${a}`}>
              <button onClick={() => onOpenList({ area: a })}>
                <span className="menu-icon tinted" aria-hidden>
                  {AREA_ICON[a]}
                </span>
                <span className="menu-label">{AREA_LABEL[a]}</span>
                <span className="menu-count">{countOpen({ area: a }, items)}</span>
                <span className="chev" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tab === "folders" &&
        (library.folders.length ? (
          <ul className="menu">
            {library.folders.map((f) => {
              const n = items.filter((i) => i.folder_id === f.id && i.status === "open").length + library.outputs.filter((o) => o.folder_id === f.id).length;
              return (
                <li key={f.id} className={`area-${f.area}`}>
                  <button onClick={() => onOpenFolder(f.id)}>
                    <span className="menu-icon tinted" aria-hidden>
                      {AREA_ICON[f.area]}
                    </span>
                    <span className="menu-label">{f.name}</span>
                    <span className="menu-count">{n}</span>
                    <span className="chev" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">Claude makes a folder whenever you talk about a class, project or big plan. 📁</p>
        ))}
    </div>
  );
}
