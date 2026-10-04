import { useEffect, useState } from "react";
import { Markdown } from "./Markdown";
import { RecipeView } from "./RecipeView";
import { OUTPUT_LABEL, composeLinks, splitSlides, type Output } from "../lib/library";
import { downloadPptx } from "../lib/pptx";

interface Props {
  output: Output;
  folderName: string | null;
  onClose: () => void;
  onDone: () => void;
  onCooked?: () => void;
}

/** Full-screen view of one draft: a slide presenter, an email ready to send, or a document. */
export function OutputView({ output, folderName, onClose, onDone, onCooked }: Props) {
  const [copied, setCopied] = useState(false);
  const [presenting, setPresenting] = useState(false);

  async function copy() {
    const text = output.type === "email" && output.email_subject ? `Subject: ${output.email_subject}\n\n${output.content}` : output.content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [downloading, setDownloading] = useState(false);
  async function download() {
    setDownloading(true);
    try {
      await downloadPptx(output);
    } finally {
      setDownloading(false);
    }
  }

  if (presenting) return <Presenter output={output} onExit={() => setPresenting(false)} />;

  return (
    <div className={`sheet type-${output.type}`} role="dialog" aria-modal="true" aria-label={output.title}>
      <header className="sheet-head">
        <button className="link" onClick={onClose}>
          ‹ Back
        </button>
        <span className="muted">{folderName ?? OUTPUT_LABEL[output.type]}</span>
      </header>
      <div className="sheet-body">
        <p className="eyebrow">{OUTPUT_LABEL[output.type]}</p>
        <h1 dir="auto">{output.title}</h1>
        <p className="muted">Updated {new Date(output.updated_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>

        <div className="row-actions">
          {output.type === "slides" && (
            <button className="primary" onClick={() => setPresenting(true)}>
              ▶ Present
            </button>
          )}
          {output.type === "slides" && (
            <button className="pill" onClick={() => void download()} disabled={downloading}>
              {downloading ? "Preparing…" : "⬇ PowerPoint"}
            </button>
          )}
          {output.type === "email" &&
            composeLinks(output).map((l) => (
              <a key={l.label} className={l.primary ? "primary" : "pill"} href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          <button className="pill" onClick={() => void copy()}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
          {output.type === "recipe" && onCooked && (
            <button className="primary" onClick={onCooked}>
              {output.last_cooked_on ? "Cooked it again 🍳" : "I cooked it 🍳"}
            </button>
          )}
          {output.status !== "done" && output.type !== "recipe" && (
            <button className="pill quiet" onClick={onDone}>
              {output.type === "email" ? "I sent it" : output.type === "learning" ? "Read it ✓" : output.type === "content" ? "Posted it ✓" : "Done with this"}
            </button>
          )}
        </div>

        {output.type === "email" && (
          <dl className="email-head">
            {output.email_to && (
              <>
                <dt>To</dt>
                <dd>{output.email_to}</dd>
              </>
            )}
            <dt>Subject</dt>
            <dd>{output.email_subject ?? output.title}</dd>
          </dl>
        )}

        {output.type === "slides" ? (
          <ol className="slide-list">
            {splitSlides(output.content).map((s, i) => (
              <li key={i} className="slide-card">
                <Markdown text={s.body} />
                {s.notes && <Markdown className="slide-notes" text={s.notes} />}
              </li>
            ))}
          </ol>
        ) : output.type === "recipe" ? (
          <RecipeView output={output} />
        ) : (
          <Markdown className="doc" text={output.content} />
        )}
      </div>
    </div>
  );
}

function Presenter({ output, onExit }: { output: Output; onExit: () => void }) {
  const slides = splitSlides(output.content);
  const [i, setI] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const next = () => setI((n) => Math.min(n + 1, slides.length - 1));
  const prev = () => setI((n) => Math.max(n - 1, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") next();
      if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let startX = 0;
  return (
    <div
      className="presenter"
      onTouchStart={(e) => (startX = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - startX;
        if (dx < -40) next();
        if (dx > 40) prev();
      }}
    >
      <div className="presenter-slide" onClick={next}>
        <Markdown text={slides[i]?.body ?? ""} />
      </div>
      {showNotes && slides[i]?.notes && <Markdown className="presenter-notes" text={slides[i].notes} />}
      <footer className="presenter-bar">
        <button onClick={onExit}>✕</button>
        <button onClick={prev} disabled={i === 0}>
          ‹
        </button>
        <span>
          {i + 1} / {slides.length}
        </span>
        <button onClick={next} disabled={i === slides.length - 1}>
          ›
        </button>
        <button onClick={() => setShowNotes((s) => !s)}>{showNotes ? "Hide notes" : "Notes"}</button>
      </footer>
    </div>
  );
}
