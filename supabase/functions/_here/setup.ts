// One-time (and safe to re-run) setup of the free version, run by Claude in the project
// with only SUPABASE_ACCESS_TOKEN: database, functions, notification keys, login
// redirect and the 5-minute follow-up engine. Writes .env.production for the app build.
//
//   cd supabase/functions && deno run -A _here/setup.ts
import { api, findProject, projectKeys, sql } from "./project.ts";

const root = new URL("../../../", import.meta.url).pathname;
const run = async (cmd: string[], env: Record<string, string> = {}) => {
  const out = await new Deno.Command(cmd[0], { args: cmd.slice(1), cwd: root, env, stdout: "piped", stderr: "piped" }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  if (!out.success) throw new Error(`${cmd.join(" ")} failed:\n${text}`);
  return text;
};

const { ref, name } = await findProject();
console.log(`Project: ${name} (${ref})`);
const { anon } = await projectKeys(ref);

// 1. Database: apply migrations not applied yet, tracked the same way the Supabase CLI does.
await sql(ref, `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
const applied = new Set(((await sql(ref, "select version from supabase_migrations.schema_migrations")) as { version: string }[]).map((r) => r.version));
const files = [...Deno.readDirSync(`${root}supabase/migrations`)].map((f) => f.name).filter((n) => n.endsWith(".sql")).sort();
for (const file of files) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  if (applied.has(version)) continue;
  const body = await Deno.readTextFile(`${root}supabase/migrations/${file}`);
  await sql(ref, body);
  await sql(ref, `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${rest.join("_")}')`);
  console.log(`Applied ${file}`);
}

// 2. Notification keys, made once and kept in the project's secrets.
const envFile = `${root}.env.production`;
const existingEnv = await Deno.readTextFile(envFile).catch(() => "");
let vapidPublic = existingEnv.match(/^VITE_VAPID_PUBLIC_KEY=(.+)$/m)?.[1] ?? "";
const secretNames = new Set(((await api(`/projects/${ref}/secrets`)) as { name: string }[]).map((s) => s.name));
if (!secretNames.has("VAPID_PRIVATE_KEY") || !vapidPublic) {
  const keys = JSON.parse(await run(["npx", "-y", "web-push@3.6.7", "generate-vapid-keys", "--json"]));
  vapidPublic = keys.publicKey;
  await api(`/projects/${ref}/secrets`, {
    method: "POST",
    body: JSON.stringify([
      { name: "VAPID_PUBLIC_KEY", value: keys.publicKey },
      { name: "VAPID_PRIVATE_KEY", value: keys.privateKey },
      { name: "VAPID_SUBJECT", value: "mailto:brain-dump@users.noreply.github.com" },
    ]),
  });
  console.log("Made notification keys");
}

// 3. Server functions.
await run(["npx", "-y", "supabase@latest", "functions", "deploy", "--project-ref", ref, "--use-api"], {
  SUPABASE_ACCESS_TOKEN: Deno.env.get("SUPABASE_ACCESS_TOKEN")!,
});
console.log("Deployed functions");

// 4. Where the confirmation email's link goes: the app on GitHub Pages.
// APP_URL is the Netlify address when hosting there; otherwise GitHub Pages.
const remote = (await run(["git", "remote", "get-url", "origin"])).trim();
const [, owner, repo] = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)/) ?? [];
const appUrl = Deno.env.get("APP_URL")?.replace(/\/?$/, "/") ?? `https://${owner.toLowerCase()}.github.io/${repo}/`;
await api(`/projects/${ref}/config/auth`, {
  method: "PATCH",
  body: JSON.stringify({ site_url: appUrl, uri_allow_list: `${appUrl}**` }),
});
console.log(`Login links go to ${appUrl}`);

// 5. The follow-up engine, every 5 minutes.
await sql(ref, `select public.schedule_nudges('https://${ref}.supabase.co')`);
console.log("Started the follow-up engine");

// 6. Public settings for the app build (all safe in the browser).
await Deno.writeTextFile(
  envFile,
  [
    "# Written by supabase/functions/_here/setup.ts. All public by design.",
    `VITE_SUPABASE_URL=https://${ref}.supabase.co`,
    `VITE_SUPABASE_ANON_KEY=${anon}`,
    `VITE_VAPID_PUBLIC_KEY=${vapidPublic}`,
    "VITE_FREE_MODE=1",
    "",
  ].join("\n"),
);
console.log(`Wrote .env.production. Commit and push it; the app will be at ${appUrl}`);
