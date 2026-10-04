import { useCallback, useEffect, useState } from "react";
import { supabase, timeZone } from "./supabase";
import { localDate } from "../../supabase/functions/_shared/schedule";

export interface Plan {
  plan_date: string;
  headline: string;
  entries: { item_id: string; why: string }[];
  generated_at: string;
}

/** Today's to-do list. Written by Claude the first time it's needed each day, then shared by every device. */
export function usePlan(userId: string) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [writing, setWriting] = useState(false);
  const [failed, setFailed] = useState(false);

  const generate = useCallback(async (force: boolean) => {
    setWriting(true);
    setFailed(false);
    const { data, error } = await supabase.functions.invoke("plan-today", { body: { timezone: timeZone, force } });
    setWriting(false);
    if (error || !data?.plan) setFailed(true);
    else setPlan(data.plan as Plan);
  }, []);

  const load = useCallback(async () => {
    const today = localDate(new Date(), timeZone);
    const { data } = await supabase
      .from("plans")
      .select("plan_date, headline, entries, generated_at")
      .eq("plan_date", today)
      .maybeSingle();
    if (data) setPlan(data as Plan);
    else void generate(false);
  }, [generate]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`plan-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "plans", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    // A new day may have started while the app sat in the background.
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return { plan, writing, failed, rewrite: () => generate(true) };
}
