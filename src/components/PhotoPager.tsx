"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Wraps a photo so you can page through its album: swipe on a phone, the arrow keys on a
 * computer, or the arrow buttons. Paging replaces the history entry, so Back still returns to
 * the album instead of stepping through every photo.
 */
export default function PhotoPager({
  prev,
  next,
  index,
  total,
  children,
}: {
  prev: string | null;
  next: string | null;
  index: number;
  total: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (id: string | null) => id && router.replace(`/photos/${id}`, { scroll: false });

  useEffect(() => {
    if (prev) router.prefetch(`/photos/${prev}`);
    if (next) router.prefetch(`/photos/${next}`);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && prev) router.replace(`/photos/${prev}`, { scroll: false });
      if (e.key === "ArrowRight" && next) router.replace(`/photos/${next}`, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  const arrow = "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60";

  return (
    <div className="space-y-1">
      <div
        className="relative touch-pan-y select-none"
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          // A clear sideways swipe, not a scroll or a tap.
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          go(dx < 0 ? next : prev);
        }}
      >
        {children}
        {prev && (
          <button type="button" onClick={() => go(prev)} aria-label="Previous photo" className={`${arrow} left-2`}>
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
        )}
        {next && (
          <button type="button" onClick={() => go(next)} aria-label="Next photo" className={`${arrow} right-2`}>
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        )}
      </div>
      {total > 1 && (
        <p className="text-center text-xs text-muted" aria-live="polite">
          {index} of {total}
          <span className="hidden lg:inline"> · use the ← → keys</span>
        </p>
      )}
    </div>
  );
}
