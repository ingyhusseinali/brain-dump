import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { snoozeUntil, type Item, type SnoozePreset } from "../../supabase/functions/_shared/schedule";

export interface Dump {
  id: string;
  body: string;
  created_at: string;
  processed_at: string | null;
  error: string | null;
}

/** Items and unsorted dumps, kept live across devices with Supabase Realtime. */
export function useBrain(userId: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [unsorted, setUnsorted] = useState<Dump[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [active, recentDone, dumps] = await Promise.all([
      supabase.from("items").select("*").in("status", ["open", "snoozed"]).order("created_at", { ascending: false }),
      supabase.from("items").select("*").eq("status", "done").gte("completed_at", weekAgo).order("completed_at", { ascending: false }),
      supabase.from("dumps").select("id, body, created_at, processed_at, error").is("processed_at", null).order("created_at", { ascending: false }),
    ]);
    setItems([...((active.data ?? []) as Item[]), ...((recentDone.data ?? []) as Item[])]);
    setUnsorted((dumps.data ?? []) as Dump[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`brain-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `user_id=eq.${userId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "dumps", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    // Phones suspend apps in the background; catch up when it comes back.
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const patch = useCallback(async (id: string, changes: Partial<Item> & { completed_at?: string | null }) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i))); // feel instant
    const { error } = await supabase.from("items").update(changes).eq("id", id);
    if (error) void refresh();
  }, [refresh]);

  const actions = {
    done: (id: string) => patch(id, { status: "done", completed_at: new Date().toISOString() }),
    reopen: (id: string) => patch(id, { status: "open", completed_at: null, snoozed_until: null }),
    snooze: (id: string, preset: SnoozePreset) =>
      patch(id, { status: "snoozed", snoozed_until: snoozeUntil(preset, new Date()).toISOString(), nudge_count: 0 }),
    archive: (id: string) => patch(id, { status: "archived" }),
    edit: (id: string, changes: Pick<Item, "title"> & Partial<Pick<Item, "details" | "remind_at" | "kind" | "priority">>) =>
      patch(id, changes),
  };

  return { items, unsorted, loading, refresh, actions };
}
