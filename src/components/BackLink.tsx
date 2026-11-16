"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { canGoBack } from "@/lib/nav-history";

/**
 * Back: one page back, like the browser's back button. When there's no app page to go back to
 * (opened from an email, a phone alert or a bookmark), it goes to `href`, the page's usual parent.
 */
export default function BackLink({ href, label, className = "" }: { href: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (canGoBack()) {
          e.preventDefault();
          router.back();
        }
      }}
      title={label ? `Back (or ${label})` : "Back"}
      className={`inline-flex items-center gap-1 text-sm font-semibold text-pine ${className}`}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden /> Back
    </Link>
  );
}
