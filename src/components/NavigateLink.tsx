"use client";

import type { ReactNode } from "react";
import { Navigation } from "lucide-react";
import { appleDirections, googleDirections } from "@/lib/navigate";

const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Navigate: opens the map app with directions to the event. iPhone and iPad: Apple Maps.
 * Everywhere else: Google Maps (its app on Android).
 */
export default function NavigateLink({ to, className, children }: { to: string; className?: string; children?: ReactNode }) {
  return (
    <a
      href={googleDirections(to)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(ev) => {
        if (!isApple()) return;
        ev.preventDefault();
        window.location.href = appleDirections(to);
      }}
    >
      {children ?? (
        <>
          <Navigation className="h-4 w-4" aria-hidden /> Navigate
        </>
      )}
    </a>
  );
}
