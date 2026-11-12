"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Prints its contents on one page: just before printing it lays them out at the paper's width
 * and shrinks them (CSS zoom) if they'd run longer than one page. Screen view is unchanged.
 */
export default function FitOnePage({ children, widthIn = 7.5, heightIn = 9.8 }: { children: ReactNode; widthIn?: number; heightIn?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = () => {
      el.style.zoom = "";
      el.style.width = `${widthIn}in`;
      const tall = el.scrollHeight;
      const room = heightIn * 96;
      if (tall > room) el.style.zoom = String(Math.max(0.5, room / tall));
    };
    const after = () => {
      el.style.zoom = "";
      el.style.width = "";
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [widthIn, heightIn]);
  return <div ref={ref}>{children}</div>;
}
