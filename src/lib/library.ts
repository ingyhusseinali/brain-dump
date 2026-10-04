import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Area } from "../../supabase/functions/_shared/schedule";

export interface Folder {
  id: string;
  name: string;
  kind: "class" | "project" | "general";
  area: Area;
  archived: boolean;
  updated_at: string;
}

export type OutputType = "slides" | "notes" | "email" | "document" | "checklist" | "learning";

export interface Output {
  id: string;
  folder_id: string | null;
  type: OutputType;
  title: string;
  content: string;
  email_to: string | null;
  email_subject: string | null;
  email_account: "work" | "personal" | null;
  status: "draft" | "done" | "archived";
  created_at: string;
  updated_at: string;
}

// Kept on the device so slides and notes still open in a classroom with no signal.
const CACHE_KEY = "brain-dump:library";

function readCache(): { folders: Folder[]; outputs: Output[] } {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "") as { folders: Folder[]; outputs: Output[] };
  } catch {
    return { folders: [], outputs: [] };
  }
}

/** Folders and everything Claude has drafted into them, live across devices. */
export function useLibrary(userId: string) {
  const [lib, setLib] = useState(readCache);

  const refresh = useCallback(async () => {
    const [folders, outputs] = await Promise.all([
      supabase.from("folders").select("id, name, kind, area, archived, updated_at").eq("archived", false).order("updated_at", { ascending: false }),
      supabase.from("outputs").select("*").neq("status", "archived").order("updated_at", { ascending: false }).limit(300),
    ]);
    if (folders.error || outputs.error) return; // offline: keep the cached copy
    const next = { folders: folders.data as Folder[], outputs: outputs.data as Output[] };
    setLib(next);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or unavailable; the app still works online.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`library-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "folders", filter: `user_id=eq.${userId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "outputs", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const setOutputStatus = useCallback(
    async (id: string, status: Output["status"]) => {
      setLib((l) => ({ ...l, outputs: l.outputs.map((o) => (o.id === id ? { ...o, status } : o)) }));
      await supabase.from("outputs").update({ status }).eq("id", id);
    },
    [],
  );

  return { ...lib, refresh, setOutputStatus };
}

export const OUTPUT_ICON: Record<OutputType, string> = {
  slides: "🖥️",
  notes: "🗒️",
  email: "✉️",
  document: "📄",
  checklist: "☑️",
  learning: "🌱",
};

export const OUTPUT_LABEL: Record<OutputType, string> = {
  slides: "Slides",
  notes: "Notes",
  email: "Email draft",
  document: "Document",
  checklist: "Checklist",
  learning: "Today's learning",
};

/** Slides are stored as Markdown separated by a line containing only ---. */
export function splitSlides(content: string): { body: string; notes: string }[] {
  return content
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [body, ...notes] = s.split(/^Notes:\s*$/im);
      return { body: body.trim(), notes: notes.join("\n").trim() };
    });
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/**
 * Links that open the draft in the right app, ready to send. Ingy sends work email from
 * Outlook and personal email from Gmail; on iPhone the apps open directly.
 */
export function composeLinks(o: Output): { label: string; href: string; primary: boolean }[] {
  const to = o.email_to?.includes("@") ? o.email_to : "";
  const subject = o.email_subject ?? o.title;
  const e = encodeURIComponent;
  const outlook = isIos()
    ? `ms-outlook://compose?to=${e(to)}&subject=${e(subject)}&body=${e(o.content)}`
    : `https://outlook.office.com/mail/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(o.content)}`;
  const gmail = isIos()
    ? `googlegmail:///co?to=${e(to)}&subject=${e(subject)}&body=${e(o.content)}`
    : `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}&su=${e(subject)}&body=${e(o.content)}`;
  const work = o.email_account !== "personal";
  return [
    { label: "Open in Outlook", href: outlook, primary: work },
    { label: "Open in Gmail", href: gmail, primary: !work },
  ].sort((a, b) => Number(b.primary) - Number(a.primary));
}
