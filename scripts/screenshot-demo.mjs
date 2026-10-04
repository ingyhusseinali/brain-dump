// Renders the app against mocked Supabase responses, for visual checks.
import { chromium } from "playwright-core";

const now = Date.now();
const iso = (h) => new Date(now + h * 3600e3).toISOString();
const mk = (id, o) => ({ id, kind: "task", area: "personal", origin: "dump", title: "", details: null, remind_at: null, priority: 2, tags: [], status: "open", snoozed_until: null, nudge_count: 0, last_nudged_at: null, created_at: iso(-30), updated_at: iso(-30), completed_at: null, ...o });
const items = [
  mk("1", { kind: "reminder", area: "health", title: "Call the dentist to book a check-up", remind_at: iso(-1), priority: 1 }),
  mk("2", { area: "money", title: "Pay the electricity bill", priority: 1, remind_at: iso(5) }),
  mk("3", { area: "religion", title: "Read one page of Quran after Fajr", origin: "plan" }),
  mk("4", { area: "career", title: "Update CV for 20 minutes", origin: "plan", status: "done", completed_at: iso(-1) }),
  mk("5", { area: "friends", title: "Text Sara back about Saturday" }),
  mk("6", { kind: "goal", area: "health", title: "Get fitter this year" }),
  mk("7", { kind: "idea", area: "personal", title: "Start a pottery class" }),
];
const folders = [
  { id: "f1", name: "Thursday Biology class", kind: "class", area: "education", archived: false, updated_at: iso(-1) },
  { id: "f2", name: "Clinic booking app", kind: "project", area: "career", archived: false, updated_at: iso(-3) },
];
const slides = "# Photosynthesis\nThursday Biology · Year 9\n---\n# Why plants need light\n- Light is energy for making food\n- Chlorophyll captures it\n- Happens in the leaves\nNotes:\nAsk: what happens to a plant left in a dark cupboard?\n---\n# The equation\n- Carbon dioxide + water → glucose + oxygen\n- Needs light and chlorophyll\n---\n# Quick activity\n- Pairs: label the leaf diagram\n- 5 minutes, then share";
const outputs = [
  { id: "o1", folder_id: "f1", type: "slides", title: "Photosynthesis intro slides", content: slides, email_to: null, email_subject: null, status: "draft", created_at: iso(-2), updated_at: iso(-2) },
  { id: "o2", folder_id: "f2", type: "email", title: "Fix for the double-booking bug", content: "Hi Omar,\n\nWhile driving home I worked out the double-booking issue: we check availability before taking the lock. If we lock the slot first and then check, the race goes away.\n\nCan we pair on it tomorrow morning?\n\nThanks,\nIngy", email_to: "Omar", email_subject: "Idea for the double-booking bug", status: "draft", created_at: iso(-14), updated_at: iso(-14) },
];
const plan = { plan_date: new Date().toISOString().slice(0, 10), headline: "A calm, doable Sunday", generated_at: iso(-2), entries: [
  { item_id: "1", why: "Overdue since this morning, two minutes on the phone" },
  { item_id: "2", why: "Due today at 5pm" },
  { item_id: "3", why: "Keeps your daily reading going" },
  { item_id: "4", why: "Moves your career goal forward, nothing done there in 12 days" },
  { item_id: "5", why: "Friends area has been quiet this week" },
]};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, w, h, dark] of [["phone", 390, 844, false], ["phone-dark", 390, 844, true], ["laptop", 1280, 860, false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(() => {
    localStorage.setItem("sb-demo-auth-token", JSON.stringify({ access_token: "x", refresh_token: "y", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u1", email: "ingy@example.com", aud: "authenticated" } }));
  });
  await ctx.route("https://demo.supabase.co/**", (route) => {
    const u = route.request().url();
    let body = [];
    if (u.includes("/rest/v1/items") && u.includes("status=in")) body = items.filter((i) => i.status !== "done");
    else if (u.includes("/rest/v1/items")) body = items.filter((i) => i.status === "done");
    else if (u.includes("/rest/v1/plans")) body = plan;
    else if (u.includes("/rest/v1/dumps")) body = [];
    else if (u.includes("/rest/v1/folders")) body = folders;
    else if (u.includes("/rest/v1/outputs")) body = outputs;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4173/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/claude-0/shot-${name}.png`, fullPage: true });
  if (name === "phone") {
    await page.getByRole("button", { name: /Folders/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/claude-0/shot-folders.png`, fullPage: true });
    await page.getByRole("button", { name: /Today/ }).click();
    await page.getByRole("button", { name: /Photosynthesis/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/claude-0/shot-slides.png` });
    await page.getByRole("button", { name: /Present/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "›" }).click();
    await page.screenshot({ path: `/tmp/claude-0/shot-present.png` });
  }
  await ctx.close();
}
await b.close();
