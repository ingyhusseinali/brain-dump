import { useState } from "react";
import { timeZone } from "../lib/supabase";
import { CATEGORY_LABEL, SPENDING_CATEGORIES, type useMoney } from "../lib/money";
import type { useProfile } from "../lib/profile";
import type { useBrain } from "../lib/items";
import { AREA_ICON, AREA_LABEL } from "../lib/labels";
import { localDate } from "../../supabase/functions/_shared/schedule";

interface Props {
  money: ReturnType<typeof useMoney>;
  profileState: ReturnType<typeof useProfile>;
  brain: ReturnType<typeof useBrain>;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en");

/** Spending against the budget, savings goals and life goals, all filled in from what they say. */
export function Money({ money, profileState, brain }: Props) {
  const { profile, save } = profileState;
  const currency = profile?.currency ?? "EGP";
  const today = localDate(new Date(), timeZone);
  const month = today.slice(0, 7);
  const thisMonth = money.entries.filter((e) => e.happened_on.startsWith(month));
  const lastMonth = money.entries.filter((e) => !e.happened_on.startsWith(month));
  const spent = sum(thisMonth.filter((e) => e.kind === "expense"));
  const spentLast = sum(lastMonth.filter((e) => e.kind === "expense"));
  const income = sum(thisMonth.filter((e) => e.kind === "income"));
  const saved = sum(thisMonth.filter((e) => e.kind === "saving"));
  const budget = profile?.monthly_budget ?? null;
  const [y, m] = month.split("-").map(Number);
  const daysLeft = new Date(y, m, 0).getDate() - Number(today.slice(8)) + 1;

  const byCategory = new Map<string, number>();
  for (const e of thisMonth) if (e.kind === "expense") byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const biggest = categories[0]?.[1] ?? 1;
  const catBudgets = profile?.budget_categories ?? {};

  const lifeGoals = brain.items.filter((i) => i.kind === "goal" && i.status !== "done" && i.status !== "archived");

  return (
    <div className="page">
      <h1>Money & goals</h1>
      <p className="muted small">Just say what you spent, earned or saved ("paid 450 for groceries", "salary came in"), or dump a receipt photo. It lands here by itself.</p>

      <section className="card money-summary">
        <p className="eyebrow">{new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { month: "long" })}</p>
        <p className="money-big">
          {fmt(spent)} <span className="muted">{budget ? `of ${fmt(budget)} ${currency}` : currency} spent</span>
        </p>
        {budget ? (
          <>
            <Bar value={spent} max={budget} />
            <p className="muted small">
              {spent <= budget
                ? `${fmt(budget - spent)} left for ${daysLeft} ${daysLeft === 1 ? "day" : "days"}, about ${fmt((budget - spent) / daysLeft)} a day.`
                : `${fmt(spent - budget)} over budget. No guilt, just a heads-up.`}
            </p>
          </>
        ) : (
          <BudgetForm currency={currency} onSave={(v) => void save({ monthly_budget: v })} />
        )}
        <div className="money-stats">
          <Stat label="Income" value={income} />
          <Stat label="Saved" value={saved} />
          <Stat label="Last month spent" value={spentLast} />
        </div>
      </section>

      <QuickAdd currency={currency} goals={money.goals} onAdd={money.addEntry} />

      {categories.length > 0 && (
        <section>
          <h2 className="section-title">Where it went</h2>
          <div className="card">
            {categories.map(([cat, amount]) => {
              const limit = catBudgets[cat];
              return (
                <div key={cat} className={`cat-row cat-${cat}`}>
                  <div className="cat-head">
                    <span>{CATEGORY_LABEL[cat] ?? cat}</span>
                    <span className="num">
                      {fmt(amount)}
                      {limit ? <span className="muted"> / {fmt(limit)}</span> : null}
                    </span>
                  </div>
                  <Bar value={amount} max={limit ?? biggest} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Savings goals</h2>
        <div className="stack">
          {money.goals.map((g) => (
            <div key={g.id} className={`card ${g.status === "reached" ? "is-done" : ""}`}>
              <div className="cat-head">
                <strong dir="auto">{g.status === "reached" ? "🎉 " : "🐷 "}{g.title}</strong>
                <span className="num">{Math.min(100, Math.round((g.saved / g.target) * 100))}%</span>
              </div>
              <Bar value={g.saved} max={g.target} good />
              <p className="muted small">
                {fmt(g.saved)} of {fmt(g.target)} {g.currency}
                {g.deadline && g.status !== "reached" ? ` · ${perMonth(g.target - g.saved, g.deadline, today)}` : ""}
              </p>
            </div>
          ))}
          <GoalForm currency={currency} onAdd={money.addGoal} />
        </div>
      </section>

      <section>
        <h2 className="section-title">Life goals</h2>
        {lifeGoals.length ? (
          <div className="card">
            {lifeGoals.map((g) => (
              <div key={g.id} className="goal-row">
                <span aria-hidden>{AREA_ICON[g.area]}</span>
                <span>
                  <span dir="auto">{g.title}</span>
                  <span className="muted small block">{AREA_LABEL[g.area]}</span>
                </span>
              </div>
            ))}
            <p className="muted small">Each morning your list includes a small next step for goals that haven't moved.</p>
          </div>
        ) : (
          <p className="muted small">Tell me a goal ("I want to get PMP certified by March") and it shows up here, with small steps in your daily list.</p>
        )}
      </section>

      {thisMonth.length > 0 && (
        <section>
          <h2 className="section-title">Recent</h2>
          <div className="card">
            {thisMonth.slice(0, 15).map((e) => (
              <div key={e.id} className="entry-row">
                <span>
                  <span dir="auto">{e.note || CATEGORY_LABEL[e.category] || e.category}</span>
                  <span className="muted small block">
                    {CATEGORY_LABEL[e.category] ?? e.category} ·{" "}
                    {new Date(`${e.happened_on}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                </span>
                <span className={`num ${e.kind === "expense" ? "" : "good"}`}>
                  {e.kind === "expense" ? "−" : "+"}
                  {fmt(e.amount)}
                </span>
                <button className="link small" aria-label="Remove" onClick={() => void money.removeEntry(e.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function sum(list: { amount: number }[]) {
  return list.reduce((s, e) => s + e.amount, 0);
}

function perMonth(left: number, deadline: string, today: string): string {
  const months = Math.max(1, (Date.parse(deadline) - Date.parse(today)) / (30.4 * 86_400_000));
  return left <= 0 ? "done" : `about ${fmt(left / months)} a month to reach it by ${new Date(`${deadline}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
}

function Bar({ value, max, good }: { value: number; max: number; good?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = !good && value > max;
  return (
    <div className="bar" role="presentation">
      <span className={over ? "over" : good ? "good" : pct > 80 ? "warn" : ""} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="num">{fmt(value)}</p>
      <p className="muted small">{label}</p>
    </div>
  );
}

function BudgetForm({ currency, onSave }: { currency: string; onSave: (v: number) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(v) > 0) onSave(Number(v));
      }}
    >
      <input id="budget" inputMode="decimal" placeholder={`Monthly budget (${currency})`} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="pill">Set budget</button>
    </form>
  );
}

function QuickAdd({ currency, goals, onAdd }: { currency: string; goals: ReturnType<typeof useMoney>["goals"]; onAdd: ReturnType<typeof useMoney>["addEntry"] }) {
  const [kind, setKind] = useState<"expense" | "income" | "saving">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("groceries");
  const [goalId, setGoalId] = useState("");
  const [note, setNote] = useState("");
  const active = goals.filter((g) => g.status === "active");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(amount);
        if (!(n > 0)) return;
        void onAdd({
          kind,
          amount: n,
          currency,
          category: kind === "income" ? "income" : kind === "saving" ? "savings" : category,
          note: note.trim() || null,
          goal_id: kind === "saving" ? goalId || null : null,
        });
        setAmount("");
        setNote("");
      }}
    >
      <div className="chips">
        {(["expense", "income", "saving"] as const).map((k) => (
          <button type="button" key={k} className={`pill ${kind === k ? "is-on" : ""}`} onClick={() => setKind(k)}>
            {k === "expense" ? "Spent" : k === "income" ? "Earned" : "Saved"}
          </button>
        ))}
      </div>
      <div className="row-fields">
        <input id="money-amount" inputMode="decimal" placeholder={`Amount (${currency})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        {kind === "expense" && (
          <select id="money-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {SPENDING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        )}
        {kind === "saving" && (
          <select id="money-goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">General savings</option>
            {active.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        )}
        {kind === "income" && <input id="money-note-income" placeholder="From (salary, course…)" value={note} onChange={(e) => setNote(e.target.value)} />}
      </div>
      {kind !== "income" && <input id="money-note" placeholder="What for? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
      <button className="primary">Add</button>
    </form>
  );
}

function GoalForm({ currency, onAdd }: { currency: string; onAdd: ReturnType<typeof useMoney>["addGoal"] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  if (!open)
    return (
      <button className="pill" onClick={() => setOpen(true)}>
        + New savings goal
      </button>
    );
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !(Number(target) > 0)) return;
        void onAdd({ title: title.trim(), target: Number(target), currency, deadline: deadline || null });
        setOpen(false);
        setTitle("");
        setTarget("");
        setDeadline("");
      }}
    >
      <input id="goal-title" dir="auto" placeholder="What for? (a car, Umrah, emergency fund)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="row-fields">
        <input id="goal-target" inputMode="decimal" placeholder={`Target (${currency})`} value={target} onChange={(e) => setTarget(e.target.value)} />
        <input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <button className="primary">Save goal</button>
    </form>
  );
}
