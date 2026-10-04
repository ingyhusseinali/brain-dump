import { useCallback, useEffect, useState } from "react";
import { supabase, timeZone } from "./supabase";
import { localDate } from "../../supabase/functions/_shared/schedule";

export interface MoneyEntry {
  id: string;
  kind: "expense" | "income" | "saving";
  amount: number;
  currency: string;
  category: string;
  note: string | null;
  happened_on: string;
  goal_id: string | null;
}

export interface SavingsGoal {
  id: string;
  title: string;
  target: number;
  saved: number;
  currency: string;
  deadline: string | null;
  status: "active" | "reached" | "archived";
}

export const CATEGORY_LABEL: Record<string, string> = {
  groceries: "🛒 Groceries",
  eating_out: "🍽 Eating out",
  home: "🏡 Home",
  bills: "💡 Bills",
  transport: "🚗 Transport",
  health: "🩺 Health",
  personal_care: "💅 Personal care",
  clothes: "👗 Clothes",
  family: "👨‍👩‍👧 Family",
  gifts: "🎁 Gifts",
  charity: "🤲 Charity",
  education: "📚 Education",
  subscriptions: "📱 Subscriptions",
  travel: "✈️ Travel",
  income: "💵 Income",
  savings: "🐷 Savings",
  other: "• Other",
};

export const SPENDING_CATEGORIES = Object.keys(CATEGORY_LABEL).filter((c) => c !== "income" && c !== "savings");

/** This month's and last month's money, plus savings goals, live across devices. */
export function useMoney(userId: string) {
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  const refresh = useCallback(async () => {
    const today = localDate(new Date(), timeZone);
    const [y, m] = today.split("-").map(Number);
    const lastMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01`;
    const [e, g] = await Promise.all([
      supabase.from("money_entries").select("*").gte("happened_on", lastMonth).order("happened_on", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("savings_goals").select("*").neq("status", "archived").order("created_at"),
    ]);
    if (e.data) setEntries(e.data.map((x) => ({ ...x, amount: Number(x.amount) })) as MoneyEntry[]);
    if (g.data) setGoals(g.data.map((x) => ({ ...x, target: Number(x.target), saved: Number(x.saved) })) as SavingsGoal[]);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`money-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "money_entries", filter: `user_id=eq.${userId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_goals", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const addEntry = useCallback(
    async (entry: Pick<MoneyEntry, "kind" | "amount" | "category" | "note" | "currency"> & { goal_id?: string | null }) => {
      await supabase.from("money_entries").insert({ ...entry, happened_on: localDate(new Date(), timeZone) });
      if (entry.kind === "saving" && entry.goal_id) {
        const goal = goals.find((g) => g.id === entry.goal_id);
        if (goal) {
          const saved = goal.saved + entry.amount;
          await supabase.from("savings_goals").update({ saved, status: saved >= goal.target ? "reached" : "active" }).eq("id", goal.id);
        }
      }
      await refresh();
    },
    [goals, refresh],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      setEntries((list) => list.filter((e) => e.id !== id));
      await supabase.from("money_entries").delete().eq("id", id);
    },
    [],
  );

  const addGoal = useCallback(
    async (goal: Pick<SavingsGoal, "title" | "target" | "currency" | "deadline">) => {
      await supabase.from("savings_goals").insert(goal);
      await refresh();
    },
    [refresh],
  );

  return { entries, goals, refresh, addEntry, removeEntry, addGoal };
}
