import { useCallback, useEffect, useState } from "react";
import { supabase, timeZone } from "./supabase";
import { localDate, type Cycle } from "../../supabase/functions/_shared/schedule";

export interface Profile {
  timezone: string;
  quiet_start: number;
  quiet_end: number;
  day_start_weekday: number;
  day_start_weekend: number;
  weekend_days: number[];
  latitude: number | null;
  longitude: number | null;
  prayer_reminders: boolean;
  prayer_fajr: boolean;
  quran_daily: boolean;
  quran_page: number;
  quran_last_read: string | null;
  quran_streak: number;
  learning_daily: boolean;
  learning_minute: number;
  cycle_tracking: boolean;
  about_me: string;
  study_topics: string;
  cooking_daily: boolean;
  cooking_minute: number;
  last_meal_on: string | null;
  meal_today_id: string | null;
}

/** The person's settings and cycle history, shared by Today and Settings. */
export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cycles, setCycles] = useState<(Cycle & { id: string })[]>([]);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("cycles").select("id, started_on, ended_on").order("started_on", { ascending: false }).limit(12),
    ]);
    if (p.data) setProfile(p.data as Profile);
    if (c.data) setCycles(c.data as (Cycle & { id: string })[]);
  }, [userId]);

  useEffect(() => {
    void load();
    // Keep reminders in this device's time zone.
    void supabase.from("profiles").update({ timezone: timeZone }).eq("user_id", userId);
    const channel = supabase
      .channel(`profile-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${userId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cycles", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [userId, load]);

  const save = useCallback(
    async (changes: Partial<Profile>) => {
      setProfile((p) => (p ? { ...p, ...changes } : p));
      await supabase.from("profiles").update(changes).eq("user_id", userId);
    },
    [userId],
  );

  /** One tap after reading: next page, and the streak grows if yesterday was read too. */
  const markQuranRead = useCallback(async () => {
    if (!profile) return;
    const today = localDate(new Date(), timeZone);
    if (profile.quran_last_read === today) return;
    const yesterday = localDate(new Date(Date.now() - 86_400_000), timeZone);
    await save({
      quran_last_read: today,
      quran_page: profile.quran_page >= 604 ? 1 : profile.quran_page + 1,
      quran_streak: profile.quran_last_read === yesterday ? profile.quran_streak + 1 : 1,
    });
  }, [profile, save]);

  const logPeriod = useCallback(
    async (event: "start" | "end") => {
      const today = localDate(new Date(), timeZone);
      if (event === "start") {
        await supabase.from("cycles").upsert({ started_on: today }, { onConflict: "user_id,started_on" });
      } else {
        const open = cycles.find((c) => !c.ended_on && c.started_on <= today);
        if (open) await supabase.from("cycles").update({ ended_on: today }).eq("id", open.id);
      }
      await load();
    },
    [cycles, load],
  );

  /** Asks Claude what to cook today (again, if they want something else). */
  const suggestMeal = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("suggest-meal", { body: { timezone: timeZone } });
    if (error || !data?.meal) return null;
    const today = localDate(new Date(), timeZone);
    setProfile((p) => (p ? { ...p, last_meal_on: today, meal_today_id: data.meal.outputId } : p));
    return data.meal.outputId as string;
  }, []);

  return { profile, cycles, save, markQuranRead, logPeriod, suggestMeal };
}
