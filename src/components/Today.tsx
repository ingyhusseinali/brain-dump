import { useMemo } from "react";
import { Capture } from "./Capture";
import { ItemRow } from "./ItemRow";
import type { useBrain } from "../lib/items";
import type { usePlan } from "../lib/plan";
import { pickNow, type Item } from "../../supabase/functions/_shared/schedule";

interface Props {
  brain: ReturnType<typeof useBrain>;
  today: ReturnType<typeof usePlan>;
  highlightId: string | null;
}

export function Today({ brain, today, highlightId }: Props) {
  const { items, actions } = brain;
  const { plan, writing, failed, rewrite } = today;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Plan entries in order, skipping anything deleted or let go since it was written.
  const planned = (plan?.entries ?? [])
    .map((e) => ({ item: byId.get(e.item_id), why: e.why }))
    .filter((e): e is { item: Item; why: string } => !!e.item && e.item.status !== "archived");
  const doneCount = planned.filter((e) => e.item.status === "done").length;
  const allDone = planned.length > 0 && doneCount === planned.length;

  // Urgent things that arrived after the list was written.
  const plannedIds = new Set(planned.map((e) => e.item.id));
  const since = plan ? Date.parse(plan.generated_at) : 0;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const fresh = items.filter(
    (i) =>
      !plannedIds.has(i.id) &&
      i.status === "open" &&
      Date.parse(i.created_at) > since &&
      (i.priority === 1 || (i.remind_at && Date.parse(i.remind_at) <= endOfToday.getTime())),
  );

  const fallback = !plan ? pickNow(items, new Date()) : [];
  const row = (item: Item, why?: string) => (
    <ItemRow
      key={item.id}
      item={item}
      why={why}
      highlight={item.id === highlightId}
      onDone={() => void actions.done(item.id)}
      onReopen={() => void actions.reopen(item.id)}
      onSnooze={(p) => void actions.snooze(item.id, p)}
      onArchive={() => void actions.archive(item.id)}
    />
  );

  return (
    <div className="page">
      <Capture />

      <section className="today" aria-labelledby="today-title">
        <header className="today-head">
          <div>
            <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 id="today-title">{plan?.headline ?? "Today"}</h1>
          </div>
          {planned.length > 0 && (
            <span className="progress" aria-label={`${doneCount} of ${planned.length} done`}>
              {doneCount}/{planned.length}
            </span>
          )}
        </header>

        {writing && <p className="muted">Writing today's list from everything you've told me…</p>}
        {failed && !writing && <p className="muted">I couldn't write today's list just now. Here's what looks most pressing.</p>}

        {planned.length > 0 && <ol className="list">{planned.map((e) => row(e.item, e.why))}</ol>}
        {allDone && <p className="celebrate">All done for today. That's genuinely great. 🎉</p>}

        {!plan && !writing && fallback.length > 0 && <ol className="list">{fallback.map((i) => row(i))}</ol>}
        {!plan && !writing && !fallback.length && (
          <p className="muted">Nothing here yet. Dump whatever is on your mind above and I'll turn it into a list.</p>
        )}

        {fresh.length > 0 && (
          <>
            <h2 className="section-title">New since this list was written</h2>
            <ol className="list">{fresh.map((i) => row(i))}</ol>
          </>
        )}

        {plan && (
          <button className="link" onClick={() => void rewrite()} disabled={writing}>
            ↻ Rewrite today's list
          </button>
        )}
      </section>
    </div>
  );
}
