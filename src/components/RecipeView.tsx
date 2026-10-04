import { useEffect, useState } from "react";
import { Markdown } from "./Markdown";
import { supabase } from "../lib/supabase";
import { dishEmoji, ingredientEmoji, parseRecipe, stepMinutes } from "../lib/food";
import type { Output } from "../lib/library";

/** The photo they dumped with the recipe (a screenshot of a reel, a cookbook page), if there was one. */
function useRecipePhoto(output: Output): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const dumpId = output.source_dump_ids?.[0];
    if (!dumpId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("dumps").select("image_paths").eq("id", dumpId).maybeSingle();
      const path = data?.image_paths?.[0];
      if (!path) return;
      const { data: signed } = await supabase.storage.from("dump-images").createSignedUrl(path, 3600);
      if (!cancelled && signed?.signedUrl) setUrl(signed.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [output.source_dump_ids]);
  return url;
}

/** A recipe as pictures: a hero, ingredient tiles to tick off while shopping, step cards, and a one-step-at-a-time cook mode. */
export function RecipeView({ output }: { output: Output }) {
  const recipe = parseRecipe(output.content);
  const photo = useRecipePhoto(output);
  const [have, setHave] = useState<Set<number>>(new Set());
  const [cooking, setCooking] = useState(false);
  const dish = dishEmoji(output.title);
  const toggle = (i: number) =>
    setHave((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  if (cooking && recipe.steps.length) return <CookMode title={output.title} steps={recipe.steps} onExit={() => setCooking(false)} />;

  return (
    <div className="recipe">
      <div className="recipe-hero" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
        {!photo && (
          <>
            <span className="recipe-hero-dish" aria-hidden>
              {dish}
            </span>
            <span className="recipe-hero-float" aria-hidden>
              {recipe.ingredients.slice(0, 6).map((ing, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.4}s` }}>
                  {ingredientEmoji(ing.name)}
                </span>
              ))}
            </span>
          </>
        )}
      </div>

      {recipe.meta.length > 0 && (
        <div className="recipe-meta">
          {recipe.meta.map((m) => (
            <span key={m} className="recipe-chip">
              {m}
            </span>
          ))}
        </div>
      )}

      {recipe.ingredients.length > 0 && (
        <section>
          <div className="recipe-section-head">
            <h2>🛒 Ingredients</h2>
            <span className="muted small">
              {have.size}/{recipe.ingredients.length} ready
            </span>
          </div>
          <ul className="ingredient-grid">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <button className={`ingredient ${have.has(i) ? "is-have" : ""}`} onClick={() => toggle(i)} aria-pressed={have.has(i)}>
                  <span className="ingredient-pic" aria-hidden>
                    {have.has(i) ? "✅" : ingredientEmoji(ing.name)}
                  </span>
                  <span className="ingredient-name" dir="auto">
                    {ing.name}
                  </span>
                  {ing.amount && <span className="ingredient-amount">{ing.amount}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">Tap what you already have. The rest is your shopping list.</p>
        </section>
      )}

      {recipe.steps.length > 0 && (
        <section>
          <div className="recipe-section-head">
            <h2>👩‍🍳 Steps</h2>
            <button className="primary" onClick={() => setCooking(true)}>
              Start cooking
            </button>
          </div>
          <ol className="step-list">
            {recipe.steps.map((s, i) => (
              <li key={i} className="step-card">
                <span className="step-num">{i + 1}</span>
                <span dir="auto">{s}</span>
                {stepMinutes(s) && <span className="step-timer">⏱ {stepMinutes(s)} min</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.rest && <Markdown className="doc" text={recipe.rest} />}
      {!recipe.ingredients.length && !recipe.steps.length && <Markdown className="doc" text={output.content} />}
    </div>
  );
}

function CookMode({ title, steps, onExit }: { title: string; steps: string[]; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  const minutes = stepMinutes(steps[i]);

  useEffect(() => {
    // Keep the screen on while cooking, where the browser allows it.
    let lock: { release: () => Promise<void> } | null = null;
    void (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      void lock?.release();
    };
  }, []);

  const left = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : null;
  return (
    <div className="cook">
      <header className="cook-head">
        <button className="link" onClick={onExit}>
          ✕ Close
        </button>
        <span className="muted" dir="auto">
          {title}
        </span>
      </header>
      <div className="cook-progress" aria-hidden>
        {steps.map((_, n) => (
          <span key={n} className={n <= i ? "is-on" : ""} />
        ))}
      </div>
      <p className="eyebrow">
        Step {i + 1} of {steps.length}
      </p>
      <p className="cook-step" dir="auto">
        {steps[i]}
      </p>
      {minutes && (
        <button className="cook-timer" onClick={() => setEndsAt(Date.now() + minutes * 60_000)}>
          {left !== null && left > 0
            ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
            : left === 0
              ? "⏰ Time's up!"
              : `⏱ Start ${minutes}-minute timer`}
        </button>
      )}
      <div className="cook-nav">
        <button className="pill" disabled={i === 0} onClick={() => (setI(i - 1), setEndsAt(null))}>
          ‹ Back
        </button>
        {i < steps.length - 1 ? (
          <button className="primary big" onClick={() => (setI(i + 1), setEndsAt(null))}>
            Next step ›
          </button>
        ) : (
          <button className="primary big" onClick={onExit}>
            Done, bon appétit 🎉
          </button>
        )}
      </div>
    </div>
  );
}
