"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SPLASH_COOKIE, SPLASH_SKIP_PATHS } from "@/lib/splash";

const LONGEST_MS = 12000; // never hold anyone up longer than this
const SKIP = new RegExp(SPLASH_SKIP_PATHS);

/** Just signed in (the marker cookie is there), on a page the animation may play on? */
function wanted(): boolean {
  if (!new RegExp(`(?:^|; )${SPLASH_COOKIE}=1`).test(document.cookie)) return false;
  if (SKIP.test(location.pathname)) return false;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.cookie = `${SPLASH_COOKIE}=; Max-Age=0; path=/`;
    return false;
  }
  return true;
}

/**
 * The opening animation after signing in. On a full page load its <head> script
 * (src/lib/splash.ts) decides whether it shows; after an in-app page change (signing in, or
 * entering the authenticator code, moves to the home page without a reload) this checks again.
 */
export default function Splash() {
  const video = useRef<HTMLVideoElement>(null);
  const playing = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (playing.current) return;
    if (root.getAttribute("data-splash") !== "show") {
      if (!wanted()) return;
      root.setAttribute("data-splash", "show");
    }
    // Shown once per sign-in: clear the marker the sign-in left.
    document.cookie = `${SPLASH_COOKIE}=; Max-Age=0; path=/`;
    // Put the keyboard away (the code box it came from may still have focus), so the
    // animation fills the screen.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    // Opened in a background tab: nobody's watching, so go straight to the app.
    if (document.visibilityState === "hidden") {
      root.removeAttribute("data-splash");
      return;
    }
    // Once started it runs to the end on its own: a page change underneath doesn't stop it.
    playing.current = true;
    const v = video.current;
    let done = false;
    let timer = 0;
    const skip = (e: KeyboardEvent) => e.key === "Escape" && finish();
    function finish() {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", skip);
      v?.removeEventListener("ended", finish);
      v?.removeEventListener("error", finish);
      root.setAttribute("data-splash", "leaving"); // fades out (globals.css)
      window.setTimeout(() => {
        root.removeAttribute("data-splash");
        playing.current = false;
      }, 350);
    }
    timer = window.setTimeout(finish, LONGEST_MS);
    window.addEventListener("keydown", skip);
    (window as unknown as { __splashDone?: () => void }).__splashDone = finish;
    if (v) {
      if (!v.getAttribute("src")) v.src = "/splash.mp4";
      v.currentTime = 0;
      v.addEventListener("ended", finish);
      v.addEventListener("error", finish);
      // Autoplay can be refused (Low Power Mode, data saver): then just carry on to the app.
      v.play().catch(finish);
    } else finish();
  }, [pathname]);

  return (
    <div
      id="splash"
      className="fixed inset-0 z-[100] flex-col items-center justify-center bg-[linear-gradient(#3673a0,#3673a0_45%,#2a2822)] transition-opacity duration-300 print:hidden"
    >
      <video
        ref={video}
        aria-hidden="true"
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
