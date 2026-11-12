import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

/** A row on Pack admin and its sections: icon, name, one line about it, and an arrow. */
export default function Tile({
  href,
  icon: Icon,
  label,
  sub,
  alert,
  big,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  sub: string;
  /** Something waiting (shown in gold). */
  alert?: string | null;
  /** The larger buttons on the Pack admin page itself. */
  big?: boolean;
}) {
  return (
    <Link href={href} className={`card flex items-center gap-3 ${big ? "py-4" : "py-3"}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-xl bg-mint text-pine ${big ? "h-11 w-11" : "h-9 w-9"}`}>
        <Icon className={big ? "h-6 w-6" : "h-5 w-5"} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-bold text-pine-950 ${big ? "text-base" : ""}`}>{label}</span>
        <span className="block text-xs text-muted">{sub}</span>
        {alert && <span className="mt-1 inline-block rounded-full bg-gold-50 px-2 py-0.5 text-[11px] font-bold text-gold-800">{alert}</span>}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
