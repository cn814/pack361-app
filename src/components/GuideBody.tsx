import Link from "next/link";
import type { ReactNode } from "react";

// Renders the guide's small Markdown subset as React elements (never raw HTML):
// ## / ### headings, "- " bullets, "1. " steps, "> " notes, **bold**, [text](link), and
// "[Leaders: ...]" placeholders, which are highlighted so drafts are easy to finish.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|mailto:|\/)[^)\s]*\)|\[Leaders?:[^\]]*\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-bold text-ink">{t.slice(2, -2)}</strong>);
    else if (/^\[Leaders?:/.test(t)) out.push(<mark key={k} className="rounded bg-gold-50 px-1 text-gold-800">{t}</mark>);
    else {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(
        href.startsWith("/") ? (
          <Link key={k} href={href} className="font-semibold text-pine underline">
            {label}
          </Link>
        ) : (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-pine underline">
            {label}
          </a>
        ),
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h2" | "h3" | "p" | "note"; text: string }
  | { kind: "ul" | "ol"; items: string[] };

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) {
      flush();
    } else if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3) });
    } else if (/^[-*] /.test(line)) {
      flush();
      if (last?.kind === "ul" && !para.length) last.items.push(line.slice(2));
      else blocks.push({ kind: "ul", items: [line.slice(2)] });
    } else if (/^\d+[.)] /.test(line)) {
      flush();
      const text = line.replace(/^\d+[.)] /, "");
      if (last?.kind === "ol") last.items.push(text);
      else blocks.push({ kind: "ol", items: [text] });
    } else if (line.startsWith(">")) {
      flush();
      const text = line.replace(/^>\s?/, "");
      if (last?.kind === "note") last.text += ` ${text}`;
      else blocks.push({ kind: "note", text });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export default function GuideBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      {parse(body).map((b, i) => {
        const k = String(i);
        switch (b.kind) {
          case "h2":
            return <h2 key={k} className="pt-2 text-base font-extrabold text-pine-950">{inline(b.text, k)}</h2>;
          case "h3":
            return <h3 key={k} className="pt-1 font-bold text-pine-950">{inline(b.text, k)}</h3>;
          case "note":
            return <p key={k} className="rounded-xl border border-gold-100 bg-gold-50 p-3 text-gold-800">{inline(b.text, k)}</p>;
          case "ul":
            return (
              <ul key={k} className="list-disc space-y-1.5 pl-5 marker:text-sage">
                {b.items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={k} className="list-decimal space-y-1.5 pl-5 marker:font-bold marker:text-pine">
                {b.items.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}
              </ol>
            );
          default:
            return <p key={k}>{inline(b.text, k)}</p>;
        }
      })}
    </div>
  );
}

