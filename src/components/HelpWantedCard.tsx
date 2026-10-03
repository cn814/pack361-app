import Link from "next/link";
import { ChevronRight, HandHeart } from "lucide-react";
import { getOpenRolesForMe } from "@/lib/help-wanted";

/**
 * Home: up to three open season jobs from the Help wanted board, linking to it. Shows nothing
 * when every job is filled.
 */
export default async function HelpWantedCard() {
  const roles = await getOpenRolesForMe();
  if (!roles.length) return null;
  const shown = roles.slice(0, 3);
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-extrabold text-pine-950">
          <HandHeart className="h-4 w-4 text-pine" aria-hidden /> Help wanted
        </h2>
        <Link href="/help-wanted" className="flex min-h-10 items-center text-sm font-bold text-pine">
          {roles.length > shown.length ? `All ${roles.length}` : "See all"}
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/help-wanted#role-${r.id}`} className="flex min-h-11 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                <span className="block truncate text-xs text-muted">{r.offered ? "You offered. Thank you!" : (r.description ?? "Tap to see what's involved")}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
