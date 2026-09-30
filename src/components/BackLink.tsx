import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
      <ChevronLeft className="h-4 w-4" aria-hidden /> {label}
    </Link>
  );
}
