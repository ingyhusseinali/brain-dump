// Builds the demo as one self-contained HTML file (scripts and styles inlined), for sharing as a single page.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const out = process.argv[2] ?? "dist-demo/brain-dump-prototype.html";
execSync("npx vite build --outDir dist-demo --emptyOutDir", {
  stdio: "inherit",
  env: { ...process.env, VITE_DEMO: "1", VITE_SUPABASE_URL: "https://demo.supabase.co", VITE_SUPABASE_ANON_KEY: "demo", BASE_PATH: "./", DEMO_SINGLE_FILE: "1" },
});
const assets = readdirSync("dist-demo/assets");
const js = assets.filter((f) => f.endsWith(".js"));
if (js.length !== 1) throw new Error(`expected one script, got ${js.join(", ")}`);
const script = readFileSync(`dist-demo/assets/${js[0]}`, "utf8").replaceAll("</script", "<\\/script").replaceAll("�", "\\uFFFD");
const css = assets.filter((f) => f.endsWith(".css")).map((f) => readFileSync(`dist-demo/assets/${f}`, "utf8")).join("\n");
writeFileSync(out, `<meta charset="utf-8">\n<title>Brain Dump Prototype</title>\n<style>${css}</style>\n<div id="root"></div>\n<script type="module">${script}</script>\n`);
console.log(`wrote ${out}`);
