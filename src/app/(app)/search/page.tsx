import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { requireMember } from "@/lib/data";
import { searchPack, type Hit } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const me = await requireMember();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const r = await searchPack(me, query);
  const groups: [string, Hit[]][] = [
    ["In the app", r.pages],
    ["Events", r.events],
    ["Pack guide", r.guide],
    ["Documents", r.documents],
    ["Leaders", r.people],
    ["Scouts", r.scouts],
  ];
  const total = groups.reduce((n, [, hits]) => n + hits.length, 0);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">Search the pack</h1>
      <form action="/search" role="search" className="flex items-center gap-2 rounded-2xl border-[1.5px] border-line bg-card px-3">
        <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        <input
          name="q"
          type="search"
          defaultValue={query}
          autoFocus={!query}
          placeholder="Events, dues, popcorn, medical forms, a leader…"
          aria-label="Search the pack"
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <button className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white">Search</button>
      </form>

      {query.trim().length >= 2 && total === 0 && (
        <p className="card text-sm text-muted">
          Nothing matched &ldquo;{query}&rdquo;. Try a shorter word, or look under{" "}
          <Link href="/pack" className="font-bold text-pine underline">
            Pack
          </Link>
          .
        </p>
      )}

      {groups
        .filter(([, hits]) => hits.length)
        .map(([title, hits]) => (
          <section key={title} className="space-y-2">
            <h2 className="px-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">{title}</h2>
            <ul className="card divide-y divide-line p-0">
              {hits.map((h) => (
                <li key={h.href + h.title}>
                  <Link href={h.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">{h.title}</span>
                      {h.detail && <span className="block truncate text-xs text-muted">{h.detail}</span>}
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
