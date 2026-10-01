"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Pencil, Pin, Presentation, Search } from "lucide-react";

export interface DocItem {
  id: string;
  title: string;
  description: string | null;
  folder: string;
  mime: string;
  typeLabel: string;
  size: string;
  added: string;
  addedBy: string;
  tags: string[];
  pinned: boolean;
  canEdit: boolean;
}

function DocIcon({ mime }: { mime: string }) {
  const cls = "h-6 w-6 shrink-0";
  if (mime.startsWith("image/")) return <FileImage className={`${cls} text-navy`} aria-hidden />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet className={`${cls} text-pine`} aria-hidden />;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return <Presentation className={`${cls} text-gold-700`} aria-hidden />;
  if (mime === "application/pdf") return <FileText className={`${cls} text-danger`} aria-hidden />;
  return <FileText className={`${cls} text-navy`} aria-hidden />;
}

function Row({ d }: { d: DocItem }) {
  return (
    <li className="flex gap-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-low">
        <DocIcon mime={d.mime} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-bold leading-snug text-pine-950">
          {d.pinned && <Pin className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-gold-700" aria-label="Pinned" />}
          {d.title}
        </p>
        {d.description && <p className="line-clamp-2 text-sm text-muted">{d.description}</p>}
        <p className="text-xs text-muted">
          {d.typeLabel} · {d.size} · {d.added} · added by {d.addedBy}
        </p>
        {d.tags.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {d.tags.map((t) => (
              <span key={t} className="badge bg-mint text-pine">
                {t}
              </span>
            ))}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {/* Plain links: each tap gets a fresh, short-lived address for the file. */}
          <a href={`/documents/${d.id}`} target="_blank" rel="noopener" className="btn-ghost px-3 py-1.5 text-xs">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open
          </a>
          <a href={`/documents/${d.id}?download=1`} className="btn-ghost px-3 py-1.5 text-xs">
            <Download className="h-3.5 w-3.5" aria-hidden /> Download
          </a>
          {d.canEdit && (
            <Link href={`/documents/${d.id}/edit`} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-pine">
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** Documents grouped by folder (pinned ones first), filtered as you type. */
export default function DocumentList({ items, empty }: { items: DocItem[]; empty: string }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? items.filter((i) => {
        const hay = `${i.title} ${i.description ?? ""} ${i.folder} ${i.typeLabel} ${i.addedBy} ${i.tags.join(" ")}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : items;
  // Items arrive newest first; pinned ones get their own group at the top.
  const pinned = shown.filter((i) => i.pinned);
  const folders = [...new Set(shown.filter((i) => !i.pinned).map((i) => i.folder))].sort((a, b) => a.localeCompare(b));

  return (
    <>
      {items.length > 0 && (
        <label className="relative block">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: medical form, minutes, packing…"
            className="input pl-9"
            aria-label="Search pack documents"
          />
        </label>
      )}
      {items.length === 0 && <p className="card text-sm text-muted">{empty}</p>}
      {items.length > 0 && shown.length === 0 && (
        <p className="card text-sm text-muted">Nothing matches. Try another word, or ask a leader.</p>
      )}
      {pinned.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Pinned</h2>
          <ul className="card divide-y divide-line py-1">
            {pinned.map((d) => (
              <Row key={d.id} d={{ ...d, tags: [d.folder, ...d.tags] }} />
            ))}
          </ul>
        </section>
      )}
      {folders.map((folder) => (
        <section key={folder} className="space-y-2">
          <h2 className="section-title">{folder}</h2>
          <ul className="card divide-y divide-line py-1">
            {shown
              .filter((i) => !i.pinned && i.folder === folder)
              .map((d) => (
                <Row key={d.id} d={d} />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
