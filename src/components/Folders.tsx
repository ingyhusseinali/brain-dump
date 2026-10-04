import { useState } from "react";
import { ItemRow } from "./ItemRow";
import { OutputCard } from "./OutputCard";
import type { useBrain } from "../lib/items";
import type { Folder, useLibrary } from "../lib/library";
import { AREA_ICON } from "../lib/labels";

interface Props {
  brain: ReturnType<typeof useBrain>;
  library: ReturnType<typeof useLibrary>;
  onOpenOutput: (id: string) => void;
}

const GROUPS: [Folder["kind"], string][] = [
  ["class", "Classes"],
  ["project", "Projects"],
  ["general", "Other"],
];

/** Everything Claude has filed, by class and project. Nothing here needs organising by hand. */
export function Folders({ brain, library, onOpenOutput }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const folder = library.folders.find((f) => f.id === openId);

  if (folder) {
    const outputs = library.outputs.filter((o) => o.folder_id === folder.id);
    const items = brain.items.filter((i) => i.folder_id === folder.id && i.status !== "archived");
    return (
      <div className="page">
        <button className="link" onClick={() => setOpenId(null)}>
          ‹ All folders
        </button>
        <header className={`folder-hero area-${folder.area}`}>
          <span className="folder-hero-icon" aria-hidden>
            {AREA_ICON[folder.area]}
          </span>
          <h1>{folder.name}</h1>
        </header>
        {outputs.length > 0 && (
          <>
            <h2 className="section-title">Prepared for you</h2>
            <ul className="list">
              {outputs.map((o) => (
                <OutputCard key={o.id} output={o} folderName={null} onOpen={() => onOpenOutput(o.id)} />
              ))}
            </ul>
          </>
        )}
        {items.length > 0 && (
          <>
            <h2 className="section-title">Thoughts and to-dos</h2>
            <ul className="list">
              {items.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  onDone={() => void brain.actions.done(i.id)}
                  onReopen={() => void brain.actions.reopen(i.id)}
                  onSnooze={(p) => void brain.actions.snooze(i.id, p)}
                  onArchive={() => void brain.actions.archive(i.id)}
                />
              ))}
            </ul>
          </>
        )}
        {!outputs.length && !items.length && <p className="muted">Nothing in here yet.</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Folders</h1>
      <p className="muted">Claude files your thoughts here by class and project. Talk about a class or project and it appears.</p>
      {GROUPS.map(([kind, label]) => {
        const folders = library.folders.filter((f) => f.kind === kind);
        if (!folders.length) return null;
        return (
          <section key={kind}>
            <h2 className="section-title">{label}</h2>
            <ul className="list">
              {folders.map((f) => {
                const drafts = library.outputs.filter((o) => o.folder_id === f.id).length;
                const open = brain.items.filter((i) => i.folder_id === f.id && i.status === "open").length;
                return (
                  <li key={f.id}>
                    <button className={`output-card folder-card area-${f.area}`} onClick={() => setOpenId(f.id)}>
                      <span className="output-icon" aria-hidden>
                        {AREA_ICON[f.area]}
                      </span>
                      <span className="output-text">
                        <span className="item-title">{f.name}</span>
                        <span className="muted">
                          {[drafts && `${drafts} prepared`, open && `${open} open`].filter(Boolean).join(" · ") || "Empty"}
                        </span>
                      </span>
                      <span aria-hidden className="chev">
                        ›
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!library.folders.length && <p className="muted">No folders yet.</p>}
    </div>
  );
}
