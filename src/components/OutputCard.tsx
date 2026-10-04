import { OUTPUT_ICON, OUTPUT_LABEL, type Output } from "../lib/library";

export function OutputCard({ output, folderName, onOpen }: { output: Output; folderName: string | null; onOpen: () => void }) {
  return (
    <li>
      <button className={`output-card type-${output.type} ${output.status === "done" ? "is-done" : ""}`} onClick={onOpen}>
        <span className="output-icon" aria-hidden>
          {OUTPUT_ICON[output.type]}
        </span>
        <span className="output-text">
          <span className="item-title">{output.title}</span>
          <span className="muted">
            {OUTPUT_LABEL[output.type]}
            {folderName ? ` · ${folderName}` : ""}
          </span>
        </span>
        <span aria-hidden className="chev">
          ›
        </span>
      </button>
    </li>
  );
}
