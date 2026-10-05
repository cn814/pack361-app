"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface EventTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * An event page split into tabs: the first (Overview) holds the essentials, the rest (Schedule,
 * Packing list, Weather…) one tap away. All tabs are on the page already, so switching is instant
 * and works offline (campout pages are saved on the phone). A tab with nothing in it hides its
 * button. Links to a section (#rsvp, #carpool, #packing…) open the tab it's in; printing prints
 * every tab.
 */
export default function EventTabs({ tabs }: { tabs: EventTab[] }) {
  const first = tabs[0]?.id ?? "";
  const [active, setActive] = useState(first);
  const [empty, setEmpty] = useState<Set<string>>(new Set());
  const nav = useRef<HTMLElement>(null);
  const panels = useRef<HTMLDivElement>(null);

  /** Open the tab named in the address (#schedule) or the tab holding that section (#rsvp). */
  const fromHash = useCallback(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    if (tabs.some((t) => t.id === id)) {
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
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [fromHash]);

  // Hide the buttons of tabs with nothing in them (some parts load a moment later, so keep checking).
  useEffect(() => {
    const root = panels.current;
    if (!root) return;
    const check = () => {
      const next = new Set<string>();
      root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((p) => {
        const has = (p.textContent ?? "").trim().length > 0 || p.querySelector("img, input, button, video");
        if (!has && p.dataset.tabPanel !== first) next.add(p.dataset.tabPanel ?? "");
      });
      setEmpty((old) => (old.size === next.size && [...next].every((x) => old.has(x)) ? old : next));
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(root, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [first]);

  // A tab that turned out empty while open: back to the first.
  const shown = empty.has(active) ? first : active;

  function choose(id: string) {
    setActive(id);
    history.replaceState(history.state, "", id === first ? location.pathname + location.search : `#${id}`);
    const top = nav.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) nav.current?.scrollIntoView({ block: "start" });
  }

  const visible = tabs.filter((t) => !empty.has(t.id));

  return (
    <>
      {visible.length > 1 && (
        <nav ref={nav} aria-label="Event sections" className="-mx-4 flex scroll-mt-16 gap-2 overflow-x-auto px-4 pb-1 print:hidden lg:mx-0 lg:flex-wrap lg:px-0" role="tablist">
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={shown === t.id}
              aria-controls={`tab-${t.id}`}
              onClick={() => choose(t.id)}
              className={`flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-bold transition ${
                shown === t.id ? "border-pine bg-pine text-white" : "border-line bg-card text-pine"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <div ref={panels} className="contents">
        {tabs.map((t) => (
          <div
            key={t.id}
            id={`tab-${t.id}`}
            role="tabpanel"
            data-tab-panel={t.id}
            className={`space-y-4 ${shown === t.id ? "" : "hidden print:block"}`}
          >
            {t.content}
          </div>
        ))}
      </div>
    </>
  );
}
