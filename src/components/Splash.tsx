"use client";

import { useEffect, useRef, useState } from "react";
import { SPLASH_KEY } from "@/lib/splash";

const LONGEST_MS = 12000; // never hold anyone up longer than this

/** The opening animation. Its <head> script (src/lib/splash.ts) decides whether it shows. */
export default function Splash() {
  const video = useRef<HTMLVideoElement>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute("data-splash") !== "show") return;
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // Private browsing: it may show again next time, that's all.
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setLeaving(true);
      window.setTimeout(() => root.removeAttribute("data-splash"), 350);
    };
    // Opened in a background tab: nobody's watching, so go straight to the app.
    if (document.visibilityState === "hidden") {
      root.removeAttribute("data-splash");
      return;
    }
    const v = video.current;
    const timer = window.setTimeout(finish, LONGEST_MS);
    if (v) {
      v.src = "/splash.mp4";
      v.addEventListener("ended", finish);
      v.addEventListener("error", finish);
      // Autoplay can be refused (Low Power Mode, data saver): then just carry on to the app.
      v.play().catch(finish);
    } else finish();
    const skip = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", skip);
    (window as unknown as { __splashDone?: () => void }).__splashDone = finish;
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  return (
    <div
      id="splash"
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex-col items-center justify-center bg-[linear-gradient(#3673a0,#3673a0_45%,#2a2822)] transition-opacity duration-300 print:hidden ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      <video
        ref={video}
        poster="/splash-poster.jpg"
        muted
        playsInline
        preload="none"
        className="aspect-square w-full max-w-[min(100vw,100dvh)] object-cover"
      />
      <button
        type="button"
        onClick={() => (window as unknown as { __splashDone?: () => void }).__splashDone?.()}
        className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-5 rounded-full bg-black/40 px-4 py-2 text-sm font-bold text-white backdrop-blur"
      >
        Skip
      </button>
    </div>
  );
}
