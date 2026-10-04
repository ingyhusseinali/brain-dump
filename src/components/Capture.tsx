import { useEffect, useRef, useState } from "react";
import { flushQueue, queuedCount, saveDump, shrinkImage } from "../lib/dumps";
import { useSpeech } from "../lib/speech";

const LANGS = [
  { code: "en-GB", label: "EN" },
  { code: "ar-EG", label: "عربي" },
] as const;

function savedLang(): string {
  try {
    return localStorage.getItem("brain-dump:lang") ?? "en-GB";
  } catch {
    return "en-GB";
  }
}

/** The one thing that must always be effortless: getting a thought out of your head. */
export function Capture() {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [usedVoice, setUsedVoice] = useState(false);
  const [lang, setLang] = useState(savedLang);
  const [toast, setToast] = useState<string | null>(null);
  const [queued, setQueued] = useState(queuedCount());
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const speech = useSpeech((phrase) => {
    setUsedVoice(true);
    setText((t) => (t ? `${t.trimEnd()} ${phrase}` : phrase));
  }, lang);

  useEffect(() => {
    const sync = () => void flushQueue().then(() => setQueued(queuedCount()));
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function switchLang() {
    const next = lang === "en-GB" ? "ar-EG" : "en-GB";
    setLang(next);
    try {
      localStorage.setItem("brain-dump:lang", next);
    } catch {
      // Not remembered; fine.
    }
    if (speech.listening) speech.stop();
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const shrunk = await Promise.all([...files].slice(0, 6).map(shrinkImage));
    setImages((prev) => [...prev, ...shrunk].slice(0, 6));
  }

  async function submit() {
    const body = text.trim();
    if (!body && !images.length) return;
    if (speech.listening) speech.stop();
    const photos = images;
    setText("");
    setImages([]);
    setUsedVoice(false);
    const result = await saveDump(body, usedVoice ? "voice" : "text", photos);
    setQueued(queuedCount());
    setToast(result === "saved" ? "Got it. I'll put it all in its place." : "Saved on this device. I'll sync it when you're back online.");
    box.current?.focus();
  }

  return (
    <section className="capture" aria-label="Brain dump">
      <textarea
        ref={box}
        dir="auto"
        value={text + (speech.interim ? ` ${speech.interim}` : "")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder="What's on your mind? Dump it all here, messy is fine. اكتب أو اتكلم"
        rows={3}
      />
      {images.length > 0 && (
        <div className="thumbs">
          {images.map((src, i) => (
            <button key={i} className="thumb" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove photo">
              <img src={src} alt="" />
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}
      <div className="capture-bar">
        <div className="capture-tools">
          {speech.supported && (
            <button
              className={`mic ${speech.listening ? "is-on" : ""}`}
              onClick={speech.listening ? speech.stop : speech.start}
              aria-label={speech.listening ? "Stop listening" : "Speak"}
            >
              {speech.listening ? "■ Stop" : "🎙 Speak"}
            </button>
          )}
          <button className="mic lang" onClick={switchLang} aria-label="Switch voice language">
            {LANGS.find((l) => l.code === lang)?.label}
          </button>
          <button className="mic" onClick={() => picker.current?.click()} aria-label="Add a photo or screenshot">
            📷
          </button>
          <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
        </div>
        <button className="primary" onClick={() => void submit()} disabled={!text.trim() && !images.length}>
          Dump it
        </button>
      </div>
      {!speech.supported && <p className="hint">Tip: tap the 🎙 on your keyboard to talk instead of type.</p>}
      {speech.error && <p className="hint">Couldn't hear you ({speech.error}). The keyboard 🎙 works too.</p>}
      {queued > 0 && <p className="hint">{queued} waiting to sync.</p>}
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </section>
  );
}
