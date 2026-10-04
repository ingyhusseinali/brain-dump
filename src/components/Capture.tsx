import { useEffect, useRef, useState } from "react";
import { flushQueue, queuedCount, saveDump } from "../lib/dumps";
import { useSpeech } from "../lib/speech";

/** The one thing that must always be effortless: getting a thought out of your head. */
export function Capture() {
  const [text, setText] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [queued, setQueued] = useState(queuedCount());
  const box = useRef<HTMLTextAreaElement>(null);

  const speech = useSpeech((phrase) => {
    setUsedVoice(true);
    setText((t) => (t ? `${t.trimEnd()} ${phrase}` : phrase));
  });

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

  async function submit() {
    const body = text.trim();
    if (!body) return;
    if (speech.listening) speech.stop();
    setText("");
    setUsedVoice(false);
    const result = await saveDump(body, usedVoice ? "voice" : "text");
    setQueued(queuedCount());
    setToast(result === "saved" ? "Got it. I'll sort it for you." : "Saved on this device. I'll sync it when you're back online.");
    box.current?.focus();
  }

  return (
    <section className="capture" aria-label="Brain dump">
      <textarea
        ref={box}
        value={text + (speech.interim ? ` ${speech.interim}` : "")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder="What's on your mind? Dump it all here, messy is fine."
        rows={3}
      />
      <div className="capture-bar">
        {speech.supported ? (
          <button
            className={`mic ${speech.listening ? "is-on" : ""}`}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? "Stop listening" : "Speak"}
          >
            {speech.listening ? "■ Stop" : "🎙 Speak"}
          </button>
        ) : (
          <span className="hint">Tip: tap the 🎙 on your keyboard to talk instead of type.</span>
        )}
        <button className="primary" onClick={() => void submit()} disabled={!text.trim()}>
          Dump it
        </button>
      </div>
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
