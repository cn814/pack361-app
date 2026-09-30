import { ExternalLink, Info, TriangleAlert } from "lucide-react";
import type { EventLink, EventSection } from "@/lib/types";

export function EventLinks({ links }: { links: EventLink[] }) {
  if (!links.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="section-title">Links</h2>
      <ul className="card divide-y divide-line p-0">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3 active:bg-surface-low">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-pine">{l.label}</span>
                {l.note && <span className="block text-xs text-muted">{l.note}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventSections({ sections }: { sections: EventSection[] }) {
  if (!sections.length) return null;
  return (
    <>
      {sections.map((s) => {
        const tone =
          s.tone === "warn"
            ? "border-l-4 border-l-danger"
            : s.tone === "info"
              ? "border-l-4 border-l-gold"
              : "";
        const Icon = s.tone === "warn" ? TriangleAlert : s.tone === "info" ? Info : null;
        return (
          <section key={s.title} className={`card space-y-2 ${tone}`}>
            <h2 className={`flex items-center gap-1.5 font-extrabold ${s.tone === "warn" ? "text-danger" : "text-pine-950"}`}>
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              {s.title}
            </h2>
            {s.body && <p className="text-sm text-navy">{s.body}</p>}
            {s.items && s.items.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink marker:text-sage">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
