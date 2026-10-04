import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const svg = readFileSync("public/icon.svg", "utf8");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(async () => chromium.launch());
for (const [name, size] of [["icon-192.png",192],["icon-512.png",512],["apple-touch-icon.png",180]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const s = name === "apple-touch-icon.png" ? svg.replace('rx="112"', 'rx="0"') : svg;
  await p.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${s}`);
  await p.screenshot({ path: `public/${name}`, omitBackground: true });
}
await b.close();
