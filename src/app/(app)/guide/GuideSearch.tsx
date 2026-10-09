"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";

export interface GuideItem {
  slug: string;
  section: string;
  title: string;
  summary: string | null;
  text: string;
  draft: boolean;
}

/** The guide's table of contents, filtered as you type. */
export default function GuideSearch({ items }: { items: GuideItem[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? items.filter((i) => {
        const hay = `${i.title} ${i.summary ?? ""} ${i.section} ${i.text}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : items;
  const sections = [...new Set(shown.map((i) => i.section))];

  return (
    <>
      <label className="relative block">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: dues, uniform, medical form…"
          className="input pl-9"
          aria-label="Search the pack guide"
        />
      </label>
      {shown.length === 0 && (
        <p className="card text-sm text-muted">
          Nothing matches. Ask on the <Link href="/leaders" className="font-semibold text-pine underline">Leaders</Link> tab or
          email app@pack361.org.
        </p>
      )}
      {sections.map((section) => (
        <section key={section} className="space-y-2">
          <h2 className="section-title">{section}</h2>
          <ul className="card divide-y divide-line py-1">
            {shown
              .filter((i) => i.section === section)
              .map((i) => (
                <li key={i.slug}>
                  <Link href={`/guide/${i.slug}`} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-pine-950">
                        {i.title}
                        {i.draft && <span className="badge ml-2 bg-gold-50 text-gold-800">Draft</span>}
                      </span>
                      {i.summary && <span className="block text-xs text-muted">{i.summary}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
