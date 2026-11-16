"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordVisit } from "@/lib/nav-history";

/** Notes each app page as it opens, so Back can go back one page (src/components/BackLink.tsx). */
export default function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordVisit(pathname + window.location.search);
  }, [pathname]);
  return null;
}
