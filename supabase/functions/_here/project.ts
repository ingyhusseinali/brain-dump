// Finds the Supabase project and its keys with a Supabase access token
// (SUPABASE_ACCESS_TOKEN), so the free setup needs no other secret.

const API = "https://api.supabase.com/v1";

export async function api(path: string, init: RequestInit = {}): Promise<any> {
  const token = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** The project to use: SUPABASE_PROJECT_REF if set, else the only one, else the one named like "brain". */
export async function findProject(): Promise<{ ref: string; name: string }> {
  const wanted = Deno.env.get("SUPABASE_PROJECT_REF");
  const projects: { id?: string; ref?: string; name: string }[] = await api("/projects");
  const list = projects.map((p) => ({ ref: (p.ref ?? p.id)!, name: p.name }));
  const pick = wanted
    ? list.find((p) => p.ref === wanted)
    : list.length === 1
    ? list[0]
    : list.find((p) => /brain/i.test(p.name));
  if (!pick) throw new Error(`Can't tell which project to use. Projects: ${list.map((p) => `${p.name} (${p.ref})`).join(", ")}`);
  return pick;
}

/** The public (anon) key and the server (service role) key. */
export async function projectKeys(ref: string): Promise<{ anon: string; service: string }> {
  const keys: { name: string; type?: string; api_key: string }[] = await api(`/projects/${ref}/api-keys?reveal=true`);
  const anon = keys.find((k) => k.name === "anon") ?? keys.find((k) => k.type === "publishable");
  const service = keys.find((k) => k.name === "service_role") ?? keys.find((k) => k.type === "secret");
  if (!anon || !service) throw new Error("Couldn't find the project's API keys");
  return { anon: anon.api_key, service: service.api_key };
}

/** Runs SQL as the database owner. */
export function sql(ref: string, query: string) {
  return api(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
}

/** Points the round at the project when only the access token is set. */
export async function connectFromToken() {
  if (Deno.env.get("SUPABASE_URL") && Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return;
  const { ref } = await findProject();
  const { service } = await projectKeys(ref);
  Deno.env.set("SUPABASE_URL", `https://${ref}.supabase.co`);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", service);
}
