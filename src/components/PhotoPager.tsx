"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MAX = 4;
const TAP_MS = 300;

type Pt = { x: number; y: number };

/**
 * Wraps a photo so you can page through its album and zoom in:
 *  - next / previous: swipe (when not zoomed), the arrow buttons, or the ← → keys
 *  - zoom: pinch, or double-tap / double-click; drag to look around while zoomed
 * Paging replaces the history entry, so Back still returns to the album.
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
  const box = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState({ scale: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  // The latest view for the gesture handlers (state updates arrive a frame later).
  const live = useRef(view);
  const setView = (v: { scale: number; x: number; y: number }) => {
    live.current = v;
    setViewState(v);
  };
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ start: Pt; pinch?: { dist: number; scale: number; mid: Pt; x: number; y: number }; pan?: { x: number; y: number } } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);

  const go = (id: string | null) => id && router.replace(`/photos/${id}`, { scroll: false });

  /** Keep the photo covering its frame: no panning past the edges. */
  const clamp = (scale: number, x: number, y: number) => {
    const el = box.current;
    if (!el || scale <= 1) return { scale: 1, x: 0, y: 0 };
    const mx = ((scale - 1) * el.clientWidth) / 2;
    const my = ((scale - 1) * el.clientHeight) / 2;
    return { scale, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  /** Zoom to `scale` keeping the point under `p` (page coordinates) in place. */
  const zoomAt = (scale: number, p: Pt, from = live.current) => {
    const el = box.current;
    if (!el) return from;
    const r = el.getBoundingClientRect();
    const cx = p.x - (r.left + r.width / 2);
    const cy = p.y - (r.top + r.height / 2);
    const k = scale / from.scale;
    return clamp(scale, cx - (cx - from.x) * k, cy - (cy - from.y) * k);
  };

  useEffect(() => {
    if (prev) router.prefetch(`/photos/${prev}`);
    if (next) router.prefetch(`/photos/${next}`);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && prev) router.replace(`/photos/${prev}`, { scroll: false });
      if (e.key === "ArrowRight" && next) router.replace(`/photos/${next}`, { scroll: false });
      if (e.key === "Escape") {
        live.current = { scale: 1, x: 0, y: 0 };
        setViewState(live.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const zoomed = view.scale > 1.01;
  const arrow =
    "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60";

  return (
    <div className="space-y-1">
      <div
        ref={box}
        className={`relative overflow-hidden rounded-2xl select-none ${zoomed ? "cursor-grab touch-none" : "touch-pan-y"}`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          e.currentTarget.setPointerCapture(e.pointerId);
          const ps = [...pointers.current.values()];
          if (ps.length === 2) {
            const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
            gesture.current = { start: mid, pinch: { dist: dist(ps[0], ps[1]), scale: live.current.scale, mid, x: live.current.x, y: live.current.y } };
          } else if (ps.length === 1) {
            gesture.current = { start: ps[0], pan: { x: live.current.x, y: live.current.y } };
          }
          setMoving(true);
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const g = gesture.current;
          const ps = [...pointers.current.values()];
          if (!g) return;
          if (g.pinch && ps.length >= 2) {
            const d = dist(ps[0], ps[1]);
            const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
            const scale = Math.max(1, Math.min(MAX, (g.pinch.scale * d) / g.pinch.dist));
            const base = zoomAt(scale, g.pinch.mid, { scale: g.pinch.scale, x: g.pinch.x, y: g.pinch.y });
            setView(clamp(scale, base.x + (mid.x - g.pinch.mid.x), base.y + (mid.y - g.pinch.mid.y)));
          } else if (g.pan && live.current.scale > 1) {
            setView(clamp(live.current.scale, g.pan.x + (e.clientX - g.start.x), g.pan.y + (e.clientY - g.start.y)));
          }
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          const p = { x: e.clientX, y: e.clientY };
          pointers.current.delete(e.pointerId);
          if (pointers.current.size > 0) {
            // One finger still down after a pinch: carry on as a pan from here.
            const rest = [...pointers.current.values()][0];
            gesture.current = { start: rest, pan: { x: live.current.x, y: live.current.y } };
            return;
          }
          gesture.current = null;
          setMoving(false);
          if (!g || g.pinch) return;
          const dx = p.x - g.start.x;
          const dy = p.y - g.start.y;
          // Swipe to the next or previous photo (only when not zoomed in).
          if (live.current.scale <= 1.01 && Math.abs(dx) >= 50 && Math.abs(dx) >= Math.abs(dy) * 1.5) {
            go(dx < 0 ? next : prev);
            return;
          }
          // Double-tap (or double-click): zoom in there, or back out.
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            const now = Date.now();
            const t = lastTap.current;
            if (t && now - t.t < TAP_MS && dist(t.p, p) < 30) {
              lastTap.current = null;
              setView(live.current.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : zoomAt(2.5, p));
            } else lastTap.current = { t: now, p };
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (!pointers.current.size) {
            gesture.current = null;
            setMoving(false);
          }
        }}
      >
        <div
          className={moving ? "" : "transition-transform duration-200"}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "center" }}
        >
          {children}
        </div>
        {prev && !zoomed && (
          <button type="button" onClick={() => go(prev)} aria-label="Previous photo" className={`${arrow} left-2`}>
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
        )}
        {next && !zoomed && (
          <button type="button" onClick={() => go(next)} aria-label="Next photo" className={`${arrow} right-2`}>
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        )}
      </div>
      <p className="text-center text-xs text-muted" aria-live="polite">
        {total > 1 && `${index} of ${total} · `}
        <span className="lg:hidden">{zoomed ? "Double-tap to zoom back out" : "Pinch or double-tap to zoom"}</span>
        <span className="hidden lg:inline">{zoomed ? "Double-click to zoom back out" : "Double-click to zoom"}</span>
        {total > 1 && <span className="hidden lg:inline"> · ← → for the next photo</span>}
      </p>
    </div>
  );
}
