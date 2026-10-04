// Demo mode (VITE_DEMO=1): a pretend backend that lives in the browser, so the app can be
// tried with sample data and no accounts. It answers the Supabase calls the app makes,
// keeps changes in memory, and "files" new dumps with simple keyword rules in place of Claude.

type Row = Record<string, unknown> & { id: string };

const now = Date.now();
const iso = (h: number) => new Date(now + h * 3600e3).toISOString();
const day = (n: number) => new Date(now + n * 86400e3).toISOString().slice(0, 10);
const USER = "demo-user";
let seq = 100;
const newId = () => `d${seq++}`;

const item = (id: string, o: Record<string, unknown>): Row => ({
  id, user_id: USER, kind: "task", area: "personal", origin: "dump", title: "", details: null, remind_at: null, priority: 2,
  tags: [], status: "open", snoozed_until: null, nudge_count: 0, last_nudged_at: null, folder_id: null, output_id: null,
  created_at: iso(-30), updated_at: iso(-30), completed_at: null, ...o,
});

const slides = `# Intro to ERP systems
Tutorial 3 · Information Systems
---
# What is an ERP?
- One system for finance, sales, HR and supply chain
- One shared database, so no copy-pasting between departments
- Examples: SAP S/4HANA, Oracle, Odoo
Notes:
Ask: who has seen SAP at an internship?
---
# Why companies use one
- Real-time numbers for managers
- Fewer errors, fewer spreadsheets
- Standard processes across countries
---
# How a rollout runs (SAP Activate)
- Prepare, Explore, Realize, Deploy, Run
- Fit-to-standard workshops instead of long requirement documents
---
# Activity (10 min)
- Groups of 3: map a café's order-to-cash process
- Which ERP modules would it touch?`;

const db: Record<string, Row[]> = {
  profiles: [{
    id: "p1", user_id: USER, timezone: "Africa/Cairo", quiet_start: 22, quiet_end: 7, day_start_weekday: 465, day_start_weekend: 570,
    weekend_days: [6, 0], latitude: 30.04, longitude: 31.24, prayer_reminders: true, prayer_fajr: true, quran_daily: true,
    quran_page: 112, quran_last_read: null, quran_streak: 4, learning_daily: true, learning_minute: 780, cycle_tracking: true,
    study_topics: "PMP, SAP Activate", cooking_daily: true, cooking_minute: 900, last_meal_on: null, meal_today_id: null,
    about_me: "Full-time remote SAP project manager. Part-time university teaching assistant (Information Systems tutorials). Finishing my thesis, deadline 21 Dec. Married. Studying for PMP and SAP Activate.",
  }],
  folders: [
    { id: "f1", user_id: USER, name: "ERP tutorials (Tuesdays)", kind: "class", area: "education", archived: false, updated_at: iso(-2) },
    { id: "f2", user_id: USER, name: "SAP rollout project", kind: "project", area: "career", archived: false, updated_at: iso(-14) },
    { id: "f3", user_id: USER, name: "Thesis", kind: "project", area: "education", archived: false, updated_at: iso(-5) },
    { id: "f4", user_id: USER, name: "Daily learning", kind: "general", area: "education", archived: false, updated_at: iso(-3) },
    { id: "f5", user_id: USER, name: "Recipes", kind: "general", area: "home_family", archived: false, updated_at: iso(-6) },
    { id: "f6", user_id: USER, name: "TikTok & Instagram", kind: "project", area: "personal", archived: false, updated_at: iso(-4) },
  ],
  outputs: [
    { id: "o1", user_id: USER, folder_id: "f2", type: "email", title: "Fix for the data migration delay", email_account: "work",
      email_to: "Mariam (SAP project lead)", email_subject: "Idea to unblock the data migration",
      content: "Hi Mariam,\n\nWhile driving I thought about the migration delay. If we load the customer master data in two waves (active customers first, the rest after go-live), the cutover window drops from 3 days to 1 and finance can test sooner.\n\nCould we take 15 minutes tomorrow to check this with the data team?\n\nThanks,\nIngy",
      status: "draft", created_at: iso(-14), updated_at: iso(-14) },
    { id: "o2", user_id: USER, folder_id: "f1", type: "slides", title: "Intro to ERP: tutorial slides", content: slides,
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-2), updated_at: iso(-2) },
    { id: "o3", user_id: USER, folder_id: "f3", type: "checklist", title: "Thesis plan: comments to 4 hardcover copies",
      content: `## By ${day(5)}\n- [ ] Rework chapters using the supervisor's comments\n- [ ] Send the final draft to the supervisor\n\n## By ${day(14)}\n- [ ] Supervisor approval\n- [ ] Submit to the dean\n\n## By ${day(40)}\n- [ ] Dean's comments reworked\n- [ ] Final version approved\n\n## By ${day(60)}\n- [ ] Paper submitted for publication\n- [ ] All university requirements done\n- [ ] Print 4 hardcover copies\n\n**Deadline: 21 December**`,
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-5), updated_at: iso(-5) },
    { id: "o4", user_id: USER, folder_id: "f4", type: "learning", title: "Why Al-Fatiha is called the Mother of the Book",
      content: "Al-Fatiha is recited in every rakah, which is why the Prophet ﷺ called it *Umm al-Kitab*, the Mother of the Book (Sahih al-Bukhari).\n\nIt holds the whole Quran in seven verses: praise of Allah, His mercy, the Day of Judgement, worship, asking for help, and asking for guidance.\n\n**Try today:** in your next prayer, pause briefly after each verse. A hadith qudsi (Sahih Muslim) says Allah answers each one.",
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-3), updated_at: iso(-3) },
    { id: "o5", user_id: USER, folder_id: "f4", type: "learning", title: "PMP: the 3 domains in 5 minutes",
      content: "The PMP exam has three domains:\n\n1. **People (42%)**: leading and supporting the team\n2. **Process (50%)**: the technical side of running the project\n3. **Business Environment (8%)**: linking the project to strategy\n\n**Practice question:** A team member keeps missing stand-ups. What do you do first?\n\n<details><summary>Answer</summary>Talk to them privately to understand why. People first, then process.</details>",
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-27), updated_at: iso(-27) },
    { id: "r1", user_id: USER, folder_id: "f5", type: "recipe", title: "Creamy garlic chicken pasta", last_cooked_on: null,
      content: "⏱ 30 min · 🍽 4 servings · Easy\n\n## Ingredients\n- [ ] 500 g chicken breast, sliced\n- [ ] 400 g penne\n- [ ] 4 cloves garlic, crushed\n- [ ] 250 ml cooking cream\n- [ ] 50 g parmesan, grated\n- [ ] 1 handful spinach\n- [ ] Salt, pepper, paprika\n\n## Steps\n1. Boil the pasta in salted water.\n2. Season the chicken and fry in a little oil until golden, about 6 minutes.\n3. Add garlic for 1 minute, then cream and parmesan.\n4. Stir in spinach until it wilts.\n5. Toss with the pasta and serve.\n\nSource: a reel you saved on Instagram",
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-50), updated_at: iso(-50) },
    { id: "r2", user_id: USER, folder_id: "f5", type: "recipe", title: "ملوخية بالفراخ (Molokhia with chicken)", last_cooked_on: day(-6),
      content: "⏱ 1 h 15 min · 🍽 4 servings · Medium\n\n## Ingredients\n- [ ] 1 whole chicken\n- [ ] 400 g frozen minced molokhia\n- [ ] 8 cloves garlic\n- [ ] 1 tbsp ground coriander\n- [ ] 2 tbsp ghee\n- [ ] Onion, cardamom, bay leaves for the broth\n\n## Steps\n1. Boil the chicken with onion, cardamom and bay leaves for 45 minutes. Keep the broth.\n2. Bring 1 litre of broth to a simmer and stir in the molokhia. Don't let it boil hard.\n3. Fry garlic and coriander in ghee until golden (the ta'leya) and pour it in. Gasp optional!\n4. Roast the chicken pieces in the oven until browned.\n5. Serve with rice or bread.",
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-200), updated_at: iso(-140) },
    { id: "c1", user_id: USER, folder_id: "f6", type: "content", title: "A day in my life: SAP PM, TA and thesis",
      content: "TikTok + Instagram Reel · day-in-the-life video · 45 to 60 s\n\n## Hook\n- \"I have two jobs and a thesis due in December. Here's how a Sunday actually looks.\"\n- Alt: \"POV: your brain has 47 tabs open\"\n- Alt: \"What an SAP project manager does before 9 am\"\n\n## Script\n1. 7:45 coffee + brain dump into my app (show the phone)\n2. Stand-up call with the project team (laptop shot, no client names)\n3. Lunch break: 10 minutes of thesis edits\n4. Afternoon: preparing tomorrow's tutorial slides\n5. Evening: cooking + one page of Quran\n6. End: \"Done is better than perfect. See you tomorrow.\"\n\n## Shots\n- Close-up of coffee and phone\n- Over-the-shoulder laptop (blur the screen)\n- Hands writing on thesis printout\n- Kitchen pan shot\n\n## Caption\nTwo jobs, one thesis, one ADHD brain. Here's what actually works for me 👇 #dayinmylife\n\n## Hashtags\n#dayinmylife #sap #projectmanager #phdlife #adhd #workingwoman #egypt #productivity\n\n## Best time to post\nThursday 7 pm (Cairo)",
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-4), updated_at: iso(-4) },
    { id: "c2", user_id: USER, folder_id: "f6", type: "checklist", title: "Content calendar",
      content: `## This week\n- [ ] ${day(2)}: Instagram carousel: 5 things I wish I knew before my master's\n- [ ] ${day(4)}: TikTok: a day in my life (SAP PM, TA and thesis)\n- [ ] ${day(6)}: Instagram reel: 30-second creamy chicken pasta\n\n## Filming\n- [ ] Saturday 10 am: batch film the day-in-the-life clips and the pasta reel`,
      email_to: null, email_subject: null, email_account: null, status: "draft", created_at: iso(-4), updated_at: iso(-4) },
  ],
  items: [
    item("12", { kind: "reminder", area: "personal", title: "Film 2 TikToks (batch session)", folder_id: "f6", remind_at: iso(40) }),
    item("1", { kind: "reminder", area: "career", title: "Send Mariam the migration idea", remind_at: iso(-1), priority: 1, folder_id: "f2", output_id: "o1" }),
    item("2", { area: "education", title: "Rework thesis chapter 3 from the supervisor's comments", priority: 1, folder_id: "f3", remind_at: iso(3) }),
    item("3", { area: "education", title: "Review the ERP slides before Tuesday's tutorial", folder_id: "f1", output_id: "o2" }),
    item("4", { area: "career", origin: "plan", title: "PMP: do 10 practice questions (15 min)" }),
    item("5", { area: "home_family", title: "Call Mama after Maghrib" }),
    item("6", { area: "money", title: "Pay the internet bill", remind_at: iso(30) }),
    item("7", { area: "friends", title: "Reply to Nour about Friday dinner" }),
    item("8", { kind: "goal", area: "career", title: "Get PMP and SAP Activate certified" }),
    item("9", { kind: "goal", area: "education", title: "Thesis submitted and printed by 21 Dec", folder_id: "f3", output_id: "o3" }),
    item("10", { kind: "idea", area: "home_family", title: "Weekly meal plan on Fridays so weekdays are easier" }),
    item("11", { area: "health", origin: "plan", title: "10-minute walk after Dhuhr", status: "done", completed_at: iso(-20) }),
  ],
  dumps: [],
  cycles: [
    { id: "c2", user_id: USER, started_on: day(-12), ended_on: day(-7) },
    { id: "c1", user_id: USER, started_on: day(-41), ended_on: day(-36) },
  ],
  plans: [],
  push_subscriptions: [],
};

const PLAN = {
  headline: "A focused Sunday: one work email, one thesis push",
  entries: [
    { item_id: "1", why: "The draft is ready. Sending it takes 2 minutes and unblocks your team" },
    { item_id: "2", why: "The thesis is on a deadline. One hour today keeps the 2-week approval on track" },
    { item_id: "3", why: "Tutorial is on Tuesday. A quick look now means no rush later" },
    { item_id: "4", why: "Your PMP goal hasn't moved in 9 days" },
    { item_id: "5", why: "Family time. You mentioned wanting to call more often" },
  ],
};

// ---- PostgREST-style filtering ----

function parseValue(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const cell = row[key];
    const s = cell === null || cell === undefined ? null : String(cell);
    switch (op) {
      case "eq": if (s !== String(parseValue(val))) return false; break;
      case "neq": if (s === val) return false; break;
      case "is": if ((val === "null" ? cell != null : cell !== parseValue(val))) return false; break;
      case "in": if (!val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(s ?? "")) return false; break;
      case "gte": if (s === null || s < val) return false; break;
      case "gt": if (s === null || s <= val) return false; break;
      case "lte": if (s === null || s > val) return false; break;
      case "lt": if (s === null || s >= val) return false; break;
      case "ilike": if (!new RegExp(`^${val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(s ?? "")) return false; break;
    }
  }
  return true;
}

function query(table: string, params: URLSearchParams): Row[] {
  let rows = (db[table] ?? []).filter((r) => matches(r, params));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    rows = [...rows].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  if (limit) rows = rows.slice(0, Number(limit));
  return rows;
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Tell the app's hooks to reload, the way Realtime would on a real backend. */
function nudgeApp() {
  setTimeout(() => document.dispatchEvent(new Event("visibilitychange")), 50);
}

async function rest(table: string, method: string, params: URLSearchParams, headers: Headers, body: unknown): Promise<Response> {
  const wantsOne = (headers.get("Accept") ?? "").includes("vnd.pgrst.object");
  const prefer = headers.get("Prefer") ?? "";
  const respond = (rows: Row[]) => {
    if (!wantsOne) return json(rows);
    if (rows.length === 1) return json(rows[0]);
    return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "", hint: null }, 406);
  };
  db[table] ??= [];

  if (method === "GET" || method === "HEAD") return respond(query(table, params));

  if (method === "POST") {
    const conflict = params.get("on_conflict")?.split(",");
    const out: Row[] = [];
    for (const r of (Array.isArray(body) ? body : [body]) as Record<string, unknown>[]) {
      const row = { id: newId(), user_id: USER, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r } as Row;
      const existing = conflict && prefer.includes("merge-duplicates") ? db[table].find((x) => conflict.every((c) => x[c] === row[c])) : undefined;
      if (existing) Object.assign(existing, r);
      else {
        if (table === "items") Object.assign(row, { ...item(row.id, {}), ...row });
        if (table === "dumps") Object.assign(row, { processed_at: null, error: null });
        db[table].push(row);
      }
      out.push(existing ?? row);
    }
    if (table === "dumps") out.forEach((d) => setTimeout(() => fileDump(d), 1800));
    nudgeApp();
    return prefer.includes("return=representation") ? respond(out) : json(undefined, 201);
  }

  if (method === "PATCH") {
    const rows = query(table, params);
    rows.forEach((r) => Object.assign(r, body as object, { updated_at: new Date().toISOString() }));
    nudgeApp();
    return prefer.includes("return=representation") ? respond(rows) : json(undefined, 204);
  }

  if (method === "DELETE") {
    const gone = new Set(query(table, params));
    db[table] = db[table].filter((r) => !gone.has(r));
    return json(undefined, 204);
  }
  return json([]);
}

// ---- Pretend filing, standing in for Claude ----

const RULES: [RegExp, string, string | null][] = [
  [/class|tutorial|lecture|student|slides|محاضر|سكشن/i, "education", "f1"],
  [/recipe|cook|dinner|lunch|طبخ|اكل|وصفة/i, "home_family", "f5"],
  [/tiktok|instagram|reel|post|content|video|تيك|انستا/i, "personal", "f6"],
  [/thesis|chapter|supervisor|dean|رسال/i, "education", "f3"],
  [/sap|client|meeting|email|mariam|project|work|شغل/i, "career", "f2"],
  [/pmp|activate|exam|certif/i, "career", null],
  [/pray|quran|salah|dua|قرآن|صلا/i, "religion", null],
  [/pay|bill|bank|salary|money|فلوس/i, "money", null],
  [/mama|mom|dad|husband|home|clean|grocer|cook|بيت|ماما/i, "home_family", null],
  [/doctor|gym|walk|sleep|water|health|دكتور/i, "health", null],
  [/friend|nour|dinner|birthday|صحاب/i, "friends", null],
];

function fileDump(dump: Row) {
  const text = String(dump.body ?? "").trim();
  const pieces = text.split(/\n+|(?<=[.!?])\s+|\band also\b/i).map((p) => p.trim()).filter((p) => p.length > 2);
  for (const piece of pieces.length ? pieces : ["Look at the photo you added"]) {
    const rule = RULES.find(([re]) => re.test(piece));
    const remind = /tomorrow|بكرة/i.test(piece) ? new Date(now + 86400e3).setHours(9, 0, 0, 0) : null;
    db.items.unshift(item(newId(), {
      title: piece.charAt(0).toUpperCase() + piece.slice(1).replace(/[.!]$/, ""),
      area: rule?.[1] ?? "personal",
      folder_id: rule?.[2] ?? null,
      kind: remind ? "reminder" : /idea|maybe|what if|فكرة/i.test(piece) ? "idea" : "task",
      remind_at: remind ? new Date(remind).toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  }
  dump.processed_at = new Date().toISOString();
  nudgeApp();
}

// ---- Install ----

export const DEMO_URL = "https://demo.supabase.co";

/** Some embedded viewers block browser storage; fall back to memory so the app still runs. */
function ensureStorage() {
  try {
    localStorage.setItem("brain-dump:probe", "1");
    localStorage.removeItem("brain-dump:probe");
  } catch {
    const data = new Map<string, string>();
    const memory = {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    };
    Object.defineProperty(window, "localStorage", { value: memory, configurable: true });
  }
}

export function installDemo() {
  ensureStorage();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (!req.url.startsWith(DEMO_URL)) return realFetch(input, init);
    const url = new URL(req.url);
    const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    await new Promise((r) => setTimeout(r, 120)); // feel like a network

    const path = url.pathname;
    if (path.startsWith("/rest/v1/")) return rest(path.slice(9), req.method, url.searchParams, req.headers, body);
    if (path === "/functions/v1/plan-today") {
      await new Promise((r) => setTimeout(r, 900));
      const plan = { user_id: USER, id: "plan", plan_date: new Date().toLocaleDateString("en-CA"), generated_at: new Date().toISOString(), ...PLAN };
      db.plans = [plan];
      return json({ plan });
    }
    if (path === "/functions/v1/process-dump") return json({ ok: true }, 202);
    if (path === "/functions/v1/suggest-meal") {
      await new Promise((r) => setTimeout(r, 700));
      // Alternate between the saved "want to try" recipe and an old favourite.
      const profile = db.profiles[0];
      const outputId = profile.meal_today_id === "r1" ? "r2" : "r1";
      Object.assign(profile, { last_meal_on: new Date().toLocaleDateString("en-CA"), meal_today_id: outputId });
      return json({ meal: { outputId, title: db.outputs.find((o) => o.id === outputId)?.title, teaser: "", why: "" } });
    }
    if (path.startsWith("/storage/v1/")) return json({ Key: "demo" });
    if (path === "/auth/v1/user") return json(session.user);
    if (path.startsWith("/auth/v1/")) return json(session);
    return json({});
  };

  const session = {
    access_token: "demo", refresh_token: "demo", token_type: "bearer", expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(now / 1000) + 3600 * 24 * 365,
    user: { id: USER, email: "ingy@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: iso(-24 * 30) },
  };
  try {
    localStorage.setItem("sb-demo-auth-token", JSON.stringify(session));
    localStorage.removeItem("brain-dump:library");
  } catch {
    // Private mode: the app still works, it just signs in each load.
  }

  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.textContent = "Prototype with sample data. Try a brain dump! Nothing is saved, and the real app uses Claude to sort it properly.";
  document.body.prepend(banner);
}
