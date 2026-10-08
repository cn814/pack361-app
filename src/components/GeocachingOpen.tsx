"use client";

import { useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";

// The official Geocaching app's store pages: on a phone with the app installed, the store shows
// "Open"; without it, "Get". On a computer, the Geocaching map in the browser.
const IOS = "https://apps.apple.com/app/geocaching/id329541503";
const ANDROID = "https://play.google.com/store/apps/details?id=com.groundspeak.geocaching.intro";
const WEB = "https://www.geocaching.com/play/map";

type Platform = "ios" | "android" | "other";

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

const noop = () => () => {};

/** "Open the Geocaching app" for this phone, plus the other ways in. */
export default function GeocachingOpen() {
  const p = useSyncExternalStore<Platform>(noop, platform, () => "other");
  const main = p === "ios" ? IOS : p === "android" ? ANDROID : WEB;
  return (
    <div className="space-y-2">
      <a href={main} target="_blank" rel="noopener noreferrer" className="btn-primary w-full py-3">
        <ExternalLink className="h-4 w-4" aria-hidden /> {p === "other" ? "Open the Geocaching map" : "Open the Geocaching app"}
      </a>
      <p className="text-center text-xs text-muted">
        {p !== "ios" && (
          <a className="font-semibold text-pine underline" href={IOS} target="_blank" rel="noopener noreferrer">
            iPhone app
          </a>
        )}
        {p !== "ios" && p !== "android" && " · "}
        {p !== "android" && (
          <a className="font-semibold text-pine underline" href={ANDROID} target="_blank" rel="noopener noreferrer">
            Android app
          </a>
        )}
        {p !== "other" && (
          <>
            {" · "}
            <a className="font-semibold text-pine underline" href={WEB} target="_blank" rel="noopener noreferrer">
              Map in the browser
            </a>
          </>
        )}
      </p>
    </div>
  );
}
