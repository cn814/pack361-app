"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Download, WifiOff } from "lucide-react";

type State = "unsupported" | "idle" | "saving" | "saved" | "failed";

function fmt(ts: number) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Saves this campout page (and the files it needs) on the phone for use with no signal. */
export default function SaveOffline() {
  const [state, setState] = useState<State>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save(silent: boolean) {
    if (!("serviceWorker" in navigator) || !("caches" in window)) {
      setState("unsupported");
      return;
    }
    if (!silent) setState("saving");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller ?? reg.active;
      if (!worker) throw new Error("no worker");
      const assets = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin) && /\/_next\/static\//.test(u));
      const done = new Promise<{ ok: boolean; at: number }>((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data?.type === "saved") {
            navigator.serviceWorker.removeEventListener("message", onMsg);
            resolve(e.data);
          }
        };
        navigator.serviceWorker.addEventListener("message", onMsg);
        setTimeout(() => resolve({ ok: false, at: Date.now() }), 20000);
      });
      worker.postMessage({ type: "save", urls: [location.pathname, ...assets] });
      const r = await done;
      if (r.ok) {
        setSavedAt(r.at);
        setState("saved");
        try {
          localStorage.setItem(`pack361:offline:${location.pathname}`, String(r.at));
        } catch {}
      } else if (!silent) setState("failed");
    } catch {
      if (!silent) setState("failed");
    }
  }

  useEffect(() => {
    let at: number | null = null;
    try {
      at = Number(localStorage.getItem(`pack361:offline:${location.pathname}`)) || null;
    } catch {}
    // Refresh the saved copy quietly whenever the page is opened with signal.
    queueMicrotask(() => {
      if (at) {
        setSavedAt(at);
        setState("saved");
      }
      if (navigator.onLine) void save(true);
    });
  }, []);

  if (state === "unsupported") return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-mint-200 bg-mint p-3">
      {state === "saved" ? (
        <CircleCheck className="h-5 w-5 shrink-0 text-pine" aria-hidden />
      ) : (
        <WifiOff className="h-5 w-5 shrink-0 text-pine" aria-hidden />
      )}
      <p className="min-w-0 flex-1 text-xs text-pine">
        {state === "saved" && savedAt ? (
          <>
            <b>Saved on this phone</b> for camp with no signal · updated {fmt(savedAt)}
          </>
        ) : state === "failed" ? (
          "Couldn't save for offline. Try again with a better connection."
        ) : (
          <>
            <b>No signal at camp?</b> Save this page on your phone first.
          </>
        )}
      </p>
      {state !== "saved" && (
        <button
          type="button"
          onClick={() => save(false)}
          disabled={state === "saving"}
          className={`btn-primary shrink-0 px-3 py-2 text-xs ${state === "saving" ? "is-busy" : ""}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> {state === "saving" ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
