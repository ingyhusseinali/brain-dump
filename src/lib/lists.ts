import type { Area, Item } from "../../supabase/functions/_shared/schedule";
import { AREA_ICON, AREA_LABEL } from "./labels";

/** What a list shows: a smart list, one life area, or a search. */
export type ListSpec = { smart: SmartList } | { area: Area } | { query: string };

export type SmartList = "today" | "week" | "overdue" | "important" | "goals" | "ideas" | "notes" | "all" | "done";

const endOfDay = (now: Date, days = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
// Smart lists match on what an item is, not whether it's done: ticked items stay on the list
// (at the bottom, ticked) so a tick can be undone.
const any = () => true;
const due = (i: Item) => (i.remind_at ? Date.parse(i.remind_at) : null);

export const SMART: { id: SmartList; icon: string; label: string; test: (i: Item, now: Date) => boolean }[] = [
  { id: "today", icon: "☀️", label: "Today", test: (i, now) => (due(i) ?? Infinity) <= endOfDay(now) },
  { id: "week", icon: "📅", label: "This week", test: (i, now) => (due(i) ?? Infinity) <= endOfDay(now, 6) },
  { id: "overdue", icon: "⚠️", label: "Overdue", test: (i, now) => (due(i) ?? Infinity) < now.getTime() },
  { id: "important", icon: "⭐", label: "High priority", test: (i) => i.priority === 1 },
  { id: "goals", icon: "🎯", label: "My goals", test: (i) => i.kind === "goal" },
  { id: "ideas", icon: "💡", label: "Ideas", test: (i) => i.kind === "idea" },
  { id: "notes", icon: "📝", label: "Notes", test: (i) => i.kind === "note" },
  { id: "all", icon: "🗂", label: "All items", test: any },
  { id: "done", icon: "✅", label: "Done this week", test: (i) => i.status === "done" },
];

export function listTitle(spec: ListSpec): { icon: string; label: string } {
  if ("smart" in spec) {
    const s = SMART.find((x) => x.id === spec.smart)!;
    return { icon: s.icon, label: s.label };
  }
  if ("area" in spec) return { icon: AREA_ICON[spec.area], label: AREA_LABEL[spec.area] };
  return { icon: "🔍", label: `“${spec.query}”` };
}

/** Items on a list, not done first; done items stay (ticked) so they can be unticked. */
export function itemsFor(spec: ListSpec, items: Item[], now = new Date()): Item[] {
  let pick: (i: Item) => boolean;
  if ("smart" in spec) {
    const s = SMART.find((x) => x.id === spec.smart)!;
    pick = (i) => i.status !== "archived" && s.test(i, now);
  } else if ("area" in spec) {
    pick = (i) => i.area === spec.area && i.status !== "archived";
  } else {
    const q = spec.query.trim().toLowerCase();
    pick = (i) => i.status !== "archived" && (i.title.toLowerCase().includes(q) || !!i.details?.toLowerCase().includes(q));
  }
  return items.filter(pick).sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
}

export const countOpen = (spec: ListSpec, items: Item[], now = new Date()) =>
  itemsFor(spec, items, now).filter((i) => ("smart" in spec && spec.smart === "done") || i.status !== "done").length;
