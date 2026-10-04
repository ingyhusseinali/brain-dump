import type { Area, ItemKind } from "../../supabase/functions/_shared/schedule";

export const AREA_LABEL: Record<Area, string> = {
  career: "Career",
  education: "Education",
  money: "Money",
  health: "Health",
  home_family: "Home & family",
  friends: "Friends",
  personal: "Personal",
  spiritual: "Spiritual",
  religion: "Religion",
};

export const AREA_ICON: Record<Area, string> = {
  career: "💼",
  education: "📚",
  money: "💰",
  health: "🌿",
  home_family: "🏡",
  friends: "🫶",
  personal: "✨",
  spiritual: "🕊️",
  religion: "🤲",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  task: "To do",
  reminder: "Reminder",
  idea: "Idea",
  note: "Note",
  goal: "Goal",
};

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return d < now ? `Overdue, ${time}` : `Today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + ` ${time}`;
}
