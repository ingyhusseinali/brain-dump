import { supabase, timeZone } from "./supabase";

// Thoughts are never lost: if saving fails (offline, flaky signal), the dump
// waits in local storage and is sent the next time the app is online.
const QUEUE_KEY = "brain-dump:queue";

interface QueuedDump {
  body: string;
  source: "text" | "voice";
  queuedAt: string;
}

function readQueue(): QueuedDump[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedDump[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage unavailable; nothing more we can do locally.
  }
}

export function queuedCount(): number {
  return readQueue().length;
}

async function insertAndSort(body: string, source: "text" | "voice"): Promise<void> {
  const { data, error } = await supabase.from("dumps").insert({ body, source }).select("id").single();
  if (error) throw error;
  // Sorting runs in the background; the raw dump is already safe.
  void sortDump(data.id);
}

export async function sortDump(dumpId: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke("process-dump", { body: { dump_id: dumpId, timezone: timeZone } });
  return !error;
}

/** Returns "saved" when it reached the server, "queued" when it is waiting to sync. */
export async function saveDump(body: string, source: "text" | "voice"): Promise<"saved" | "queued"> {
  try {
    if (!navigator.onLine) throw new Error("offline");
    await insertAndSort(body, source);
    return "saved";
  } catch {
    writeQueue([...readQueue(), { body, source, queuedAt: new Date().toISOString() }]);
    return "queued";
  }
}

let flushing = false;
export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    let queue = readQueue();
    while (queue.length) {
      const [next, ...rest] = queue;
      await insertAndSort(next.body, next.source);
      queue = rest;
      writeQueue(queue);
      sent++;
    }
  } catch {
    // Still offline or signed out; try again later.
  } finally {
    flushing = false;
  }
  return sent;
}
