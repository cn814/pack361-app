"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin bar across the top of the screen that starts the instant an in-app link is tapped
 * and disappears when the new page arrives, so a tap never feels ignored.
 */
export default function NavProgress() {
  // Path plus query: links like /events?view=mine change only the query.
  const search = useSearchParams().toString();
  const path = usePathname() + (search ? `?${search}` : "");
  // The page we were on when the tap happened; the bar shows until it changes.
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    // iOS Safari only applies :active styles when a touch listener exists.
    const onTouch = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setFrom(location.pathname + location.search);
      clearTimeout(timer);
      timer = setTimeout(() => setFrom(null), 15000);
    };

    document.addEventListener("touchstart", onTouch, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("touchstart", onTouch);
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    };
  }, []);

  if (from !== null && from !== path) setFrom(null); // the new page arrived
  if (from === null || from !== path) return null;
  return (
    <div className="nav-progress print:hidden" role="progressbar" aria-label="Loading page">
      <span />
    </div>
  );
}
