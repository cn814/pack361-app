"use client";

import { useSyncExternalStore } from "react";
import { Download, Smartphone } from "lucide-react";

// Android Chrome, Edge and desktop Chrome offer their own install box. They announce it once, with
// "beforeinstallprompt", soon after the page loads; keep it so the Install button can show it.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    listeners.forEach((l) => l());
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** One tap to install, where the browser allows it (not iPhone: Apple only allows Add to Home Screen). */
function InstallButton() {
  const ready = useSyncExternalStore(subscribe, () => installEvent !== null, () => false);
  if (!ready) return null;
  return (
    <button
      type="button"
      className="btn-primary w-full"
      onClick={async () => {
        const e = installEvent;
        if (!e) return;
        await e.prompt();
        await e.userChoice.catch(() => null);
        installEvent = null;
        listeners.forEach((l) => l());
      }}
    >
      <Download className="h-4 w-4" aria-hidden /> Install the Pack 361 app
    </button>
  );
}

type Device = "iphone-safari" | "iphone-chrome" | "iphone-other" | "android" | "desktop" | "installed";

function detect(): Device {
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS/.test(ua) ? "iphone-chrome" : /FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? "iphone-other" : "iphone-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const noop = () => () => {};

/**
 * How to put the app on the home screen, for the phone and browser being used right now, with
 * the other phones' steps folded underneath. Hidden once it's already opened from the home screen.
 */
export default function InstallHelp({ compact = false }: { compact?: boolean }) {
  const device = useSyncExternalStore<Device | null>(noop, detect, () => null);
  if (device === null || device === "installed") return null;

  const steps: Record<Exclude<Device, "installed">, { title: string; list: React.ReactNode[] }> = {
    "iphone-safari": {
      title: "iPhone (Safari)",
      list: [
        <>Tap the <b>Share</b> button (the square with an arrow) at the bottom of the screen.</>,
        <>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
      ],
    },
    "iphone-chrome": {
      title: "iPhone (Chrome)",
      list: [
        <>Tap the <b>Share</b> button (the square with an arrow) at the right end of the address bar at the top. It isn&apos;t in the ⋯ menu.</>,
        <>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
      ],
    },
    "iphone-other": {
      title: "iPhone",
      list: [
        <>Open <b>app.pack361.org</b> in Safari or Chrome (this browser may not offer it).</>,
        <>Tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</>,
      ],
    },
    android: {
      title: "Android (Chrome)",
      list: [
        <>Tap the <b>⋮</b> menu at the top right.</>,
        <>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.</>,
      ],
    },
    desktop: {
      title: "On a computer",
      list: [<>It works in any browser; just bookmark <b>app.pack361.org</b>. To get alerts on your phone, open it there and add it to the home screen.</>],
    },
  };
  const mine = steps[device];
  const others = (["iphone-safari", "iphone-chrome", "android"] as const).filter((d) => d !== device);

  return (
    <section className={`card space-y-2 text-left ${compact ? "" : "border-l-4 border-l-gold"}`}>
      <h2 className="flex items-center gap-1.5 font-extrabold text-pine-950">
        <Smartphone className="h-4 w-4 text-pine" aria-hidden /> Add the app to your home screen
      </h2>
      <p className="text-xs text-muted">
        It then opens like an app, stays signed in, and can send alerts. On iPhone, alerts only work from the home-screen app.
      </p>
      {(device === "android" || device === "desktop") && <InstallButton />}
      <div>
        <p className="text-xs font-bold text-navy">{mine.title}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
          {mine.list.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      {device !== "desktop" && (
        <p className="text-xs text-muted">Then open Pack 361 from the new icon and sign in there (use the code from the email).</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-bold text-pine">Different phone or browser?</summary>
        <div className="space-y-2 pt-2">
          {others.map((d) => (
            <div key={d}>
              <p className="text-xs font-bold text-navy">{steps[d].title}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
                {steps[d].list.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
