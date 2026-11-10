"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { LOCK_MS, REFRESH_MS, SESSION_PATH } from "@/lib/idle";

const WARN_MS = 60_000;

/**
 * For leaders: the browser side of the 15-minute lock (src/lib/idle.ts; the server enforces it).
 * Taps, typing and scrolling count as use: every minute of use tells the server, so a long form
 * typed without loading a page doesn't lock. A minute before the lock it asks "Still there?";
 * at the lock it checks with the server (another tab may have been in use), then covers the
 * screen and goes to the code page. With no signal (at camp) the screen just stays covered.
 */
export default function IdleWatch() {
  const [phase, setPhase] = useState<"ok" | "warn" | "locked">("ok");
  const last = useRef(0);
  const told = useRef(0);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    last.current = Date.now();
    told.current = Date.now();
    let checking = false;

    const tell = () => {
      told.current = Date.now();
      fetch(SESSION_PATH, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
    };
    const lock = () => {
      phaseRef.current = "locked";
      setPhase("locked");
      if (navigator.onLine) {
        const next = location.pathname + location.search;
        location.replace(`/two-step?next=${encodeURIComponent(next)}`);
      }
    };
    const check = async () => {
      if (phaseRef.current === "locked" || checking) return;
      const idle = Date.now() - last.current;
      if (idle < LOCK_MS - WARN_MS) {
        if (phaseRef.current !== "ok") setPhase("ok");
        return;
      }
      if (idle < LOCK_MS) {
        setPhase("warn");
        return;
      }
      checking = true;
      try {
        const r = await fetch(SESSION_PATH, { credentials: "same-origin", cache: "no-store" });
        const j = (await r.json()) as { locked?: boolean; leftMs?: number | null };
        if (!j.locked && typeof j.leftMs === "number" && j.leftMs > 5_000) {
          // In use in another tab: carry on from there.
          last.current = Date.now() - (LOCK_MS - j.leftMs);
          setPhase(j.leftMs <= WARN_MS ? "warn" : "ok");
          return;
        }
      } catch {
        // No signal, or the answer wasn't the app's: lock to be safe.
      } finally {
        checking = false;
      }
      lock();
    };
    const used = () => {
      if (phaseRef.current === "locked") return;
      last.current = Date.now();
      if (phaseRef.current === "warn") setPhase("ok");
      if (Date.now() - told.current > REFRESH_MS) tell();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, used, { passive: true, capture: true }));
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    const t = window.setInterval(() => void check(), 10_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, used, { capture: true }));
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.clearInterval(t);
    };
  }, []);

  if (phase === "ok") return null;
  if (phase === "warn") {
    return (
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-label="Still there?"
        className="print:hidden fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-2xl bg-deep-navy p-4 text-white shadow-xl lg:bottom-6"
      >
        <p className="text-sm font-bold">Still there?</p>
        <p className="mt-1 text-xs text-white/80">
          Leader accounts lock after {LOCK_MS / 60_000} minutes without use. You&apos;ll need your authenticator code to keep going.
        </p>
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          onClick={() => {
            last.current = Date.now();
            told.current = 0;
            setPhase("ok");
            fetch(SESSION_PATH, { method: "POST", credentials: "same-origin" }).catch(() => {});
          }}
        >
          I&apos;m here
        </button>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-canvas px-6 text-center" role="alertdialog" aria-label="Locked">
      <Lock className="h-10 w-10 text-pine" aria-hidden />
      <p className="text-lg font-extrabold text-pine-950">Locked after {LOCK_MS / 60_000} minutes away</p>
      <p className="max-w-xs text-sm text-muted">Enter the code from your authenticator app to keep going.</p>
      <a className="btn-primary" href={`/two-step?next=${encodeURIComponent(typeof location === "undefined" ? "/" : location.pathname + location.search)}`}>
        Unlock
      </a>
    </div>
  );
}
