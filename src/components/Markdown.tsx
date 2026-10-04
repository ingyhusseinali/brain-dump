import DOMPurify from "dompurify";
import { marked } from "marked";

export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }));
  return <div className={`md ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
