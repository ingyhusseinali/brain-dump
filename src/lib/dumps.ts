import { supabase, timeZone } from "./supabase";

// Thoughts are never lost: if saving fails (offline, flaky signal), the dump
// waits in local storage and is sent the next time the app is online.
const QUEUE_KEY = "brain-dump:queue";

interface QueuedDump {
  body: string;
  source: "text" | "voice";
  images: string[]; // data URLs, already shrunk
  queuedAt: string;
}

function readQueue(): QueuedDump[] {
  try {
    return (JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedDump[]).map((q) => ({ ...q, images: q.images ?? [] }));
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedDump[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable; nothing more we can do locally.
  }
}

export function queuedCount(): number {
  return readQueue().length;
}

/** Shrinks a photo to at most 1600px on its long side as JPEG, small enough to upload on mobile data. */
export async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function uploadImages(dataUrls: string[]): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("signed out");
  const paths: string[] = [];
  for (const url of dataUrls) {
    const blob = await (await fetch(url)).blob();
    const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("dump-images").upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

async function insertAndSort(body: string, source: "text" | "voice", images: string[]): Promise<void> {
  const image_paths = await uploadImages(images);
  const { data, error } = await supabase.from("dumps").insert({ body, source, image_paths }).select("id").single();
  if (error) throw error;
  // Filing runs on the server in the background; the raw dump is already safe.
  void sortDump(data.id);
}

export async function sortDump(dumpId: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke("process-dump", { body: { dump_id: dumpId, timezone: timeZone } });
  return !error;
}

/** Returns "saved" when it reached the server, "queued" when it is waiting to sync. */
export async function saveDump(body: string, source: "text" | "voice", images: string[] = []): Promise<"saved" | "queued"> {
  try {
    if (!navigator.onLine) throw new Error("offline");
    await insertAndSort(body, source, images);
    return "saved";
  } catch {
    writeQueue([...readQueue(), { body, source, images, queuedAt: new Date().toISOString() }]);
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
      await insertAndSort(next.body, next.source, next.images);
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
