import { splitSlides, type Output } from "./library";

/** Plain text from a line of slide Markdown (drops **bold**, _italics_, `code` and links). */
function plain(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

/** Builds a clean, editable PowerPoint from slide Markdown and downloads it. */
export async function downloadPptx(output: Output) {
  const { default: PptxGenJS } = await import("pptxgenjs"); // loaded only when needed
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = output.title;

  const accent = "4B6BFB";
  const ink = "22201C";

  splitSlides(output.content).forEach((s, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    const lines = s.body.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    const titleLine = lines.find((l) => /^#{1,3}\s/.test(l));
    const title = titleLine ? plain(titleLine.replace(/^#{1,3}\s/, "")) : "";
    const rest = lines.filter((l) => l !== titleLine);

    if (index === 0) {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: accent } });
      slide.addText(title || output.title, { x: 0.9, y: 2.4, w: 11.5, h: 1.4, fontSize: 44, bold: true, color: ink, fontFace: "Calibri" });
      if (rest.length) {
        slide.addText(rest.map(plain).join("\n"), { x: 0.9, y: 3.9, w: 11.5, h: 1.2, fontSize: 22, color: "6F6A61", fontFace: "Calibri" });
      }
    } else {
      slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.55, w: 0.9, h: 0.08, fill: { color: accent } });
      slide.addText(title, { x: 0.6, y: 0.75, w: 12, h: 1, fontSize: 32, bold: true, color: ink, fontFace: "Calibri" });
      const body = rest.map((l) => {
        const bullet = /^\s*([-*+]|\d+\.)\s+/.test(l);
        const indent = /^\s{2,}/.test(l) ? 1 : 0;
        return {
          text: plain(l.replace(/^\s*([-*+]|\d+\.)\s+/, "")),
          options: { bullet: bullet ? { indent: 22 } : false, indentLevel: indent, breakLine: true },
        };
      });
      if (body.length) {
        slide.addText(body, { x: 0.6, y: 1.9, w: 12, h: 5, fontSize: 22, color: ink, fontFace: "Calibri", valign: "top", paraSpaceAfter: 10 });
      }
    }
    if (s.notes) slide.addNotes(s.notes.split("\n").map(plain).join("\n"));
  });

  const safe = output.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "slides";
  await pptx.writeFile({ fileName: `${safe}.pptx` });
}
