import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, FileText } from "lucide-react";
import GuideBody from "./GuideBody";

/** The terms of use and data policy pages: readable before signing in, like the safety page. */
export default function PolicyPage({
  title,
  badge,
  body,
  back,
  children,
}: {
  title: string;
  badge: string;
  body: string;
  back: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-8 lg:max-w-2xl">
      <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
      </Link>
      <header className="space-y-2">
        <span className="badge bg-mint text-pine">
          <FileText className="h-3 w-3" aria-hidden /> {badge}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">{title}</h1>
      </header>
      <section className="card">
        <GuideBody body={body} />
      </section>
      {children}
      <p className="px-1 text-[11px] text-muted">
        Run by Pack 361 volunteers; not an official Scouting America site. See also{" "}
        <Link className="font-semibold text-pine underline" href="/safety">
          how we protect your family
        </Link>
        .
      </p>
    </main>
  );
}
