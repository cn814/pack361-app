"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface EventTab {
  id: string;
  label: string;
  /** A few words on what's inside, under the tile's name. */
  hint?: string;
  /** A small icon on the tile. */
  icon?: ReactNode;
  content?: ReactNode;
  /** A tile that goes straight to another page instead of opening a section (Pack → Photos). */
  href?: string;
}

/**
 * A page split into sections, picked from big tiles (two or three to a row) instead of a strip of
 * small tabs. Event and campout pages, the Leaders tab and the Pack tab use it.
 *  - `lead`: what shows above the tiles (an event's essentials, the Leaders tab's Today), and
 *    `rest` what shows under them (an event's RSVP and to-dos).
 *  - Tapping a tile opens that section with a back button; the phone's back gesture works too.
 * All sections are on the page already, so opening one is instant and works offline (campout
 * pages are saved on the phone). A section with nothing in it hides its tile. Links to a section
 * (#schedule) or to something inside one (#carpool) open it; printing prints everything.
 */
export default function EventTabs({
  tabs,
  lead,
  rest,
  label = "Sections",
  backLabel,
}: {
  tabs: EventTab[];
  lead?: ReactNode;
  /** What shows under the tiles (an event's RSVP and to-dos). */
  rest?: ReactNode;
  label?: string;
  backLabel?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [empty, setEmpty] = useState<Set<string>>(new Set());
  const top = useRef<HTMLDivElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  /** Open the section named in the address (#schedule) or the one holding that element (#rsvp). */
  const fromHash = useCallback(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) {
      setActive(null);
      return;
    }
    if (tabs.some((t) => t.id === id && !t.href)) {
      setActive(id);
      return;
    }
    const el = document.getElementById(id);
    const panel = el?.closest<HTMLElement>("[data-tab-panel]");
    if (el && panel?.dataset.tabPanel) {
      setActive(panel.dataset.tabPanel);
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, [tabs]);

  useEffect(() => {
    // Right after the page shows (the address isn't known while it's built on the server).
    const t = window.setTimeout(fromHash, 0);
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("popstate", fromHash);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("popstate", fromHash);
    };
  }, [fromHash]);

  // Hide the tiles of sections with nothing in them (some parts load a moment later, so keep checking).
  useEffect(() => {
    const root = panels.current;
    if (!root) return;
    const check = () => {
      const next = new Set<string>();
      root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((p) => {
        const has = (p.textContent ?? "").trim().length > 0 || p.querySelector("img, input, button, video");
        if (!has) next.add(p.dataset.tabPanel ?? "");
      });
      setEmpty((old) => (old.size === next.size && [...next].every((x) => old.has(x)) ? old : next));
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(root, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  // A section that turned out empty while open: back to the tiles.
  const shown = active && !empty.has(active) ? active : null;
  const visible = tabs.filter((t) => !empty.has(t.id));

  function scrollUp() {
    const y = top.current?.getBoundingClientRect().top ?? 0;
    if (y < 0) top.current?.scrollIntoView({ block: "start" });
  }

  function open(id: string) {
    setActive(id);
    // A history entry, so the phone's back gesture comes back to the tiles.
    history.pushState(history.state, "", `#${id}`);
    pushed.current = true;
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  function close() {
    if (pushed.current) {
      pushed.current = false;
      history.back(); // popstate brings the tiles back
    } else {
      setActive(null);
      history.replaceState(history.state, "", location.pathname + location.search);
    }
    requestAnimationFrame(scrollUp);
  }

  const current = tabs.find((t) => t.id === shown);

  return (
    <div ref={top} className="scroll-mt-20 space-y-4">
      {lead && <div className={`space-y-4 ${current ? "hidden print:block" : ""}`}>{lead}</div>}
      {current ? (
        <div className="flex items-center gap-2 print:hidden">
          <button type="button" onClick={close} className="btn-ghost shrink-0 px-3 py-2">
            <ChevronLeft className="h-4 w-4" aria-hidden /> {backLabel ?? "Back"}
          </button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold text-pine-950">{current.label}</h2>
        </div>
      ) : (
        <>
          {visible.length > 0 && (
            <nav aria-label={label} className="grid grid-cols-2 gap-2 print:hidden sm:grid-cols-3">
              {visible.map((t) => {
                const tile = "card flex min-h-[4.5rem] flex-col items-start gap-1 p-3 text-left transition active:scale-[0.98] active:bg-surface-low";
                const inside = (
                  <>
                    <span className="flex w-full items-center gap-2">
                      {t.icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint text-pine [&_svg]:h-4 [&_svg]:w-4">{t.icon}</span>}
                      <span className="min-w-0 flex-1 text-[15px] font-extrabold leading-tight text-pine-950">{t.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </span>
                    {t.hint && <span className="text-xs leading-snug text-muted">{t.hint}</span>}
                  </>
                );
                return t.href ? (
                  <Link key={t.id} href={t.href} className={tile}>
                    {inside}
                  </Link>
                ) : (
                  <button key={t.id} type="button" onClick={() => open(t.id)} aria-controls={`tab-${t.id}`} className={tile}>
                    {inside}
                  </button>
                );
              })}
            </nav>
          )}
        </>
      )}
      {rest && <div className={`space-y-4 ${current ? "hidden print:block" : ""}`}>{rest}</div>}
      <div ref={panels}>
        {tabs.filter((t) => !t.href).map((t) => (
          <section
            key={t.id}
            id={`tab-${t.id}`}
            data-tab-panel={t.id}
            aria-label={t.label}
            className={`space-y-4 ${shown === t.id ? "" : "hidden print:block"}`}
          >
            {t.content}
          </section>
        ))}
      </div>
    </div>
  );
}
