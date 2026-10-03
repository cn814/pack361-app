"use client"; // Error boundaries must be Client Components

import { useEffect, useSyncExternalStore } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Shown in place of the page (the header and tabs stay) when loading it or a save on it fails,
 * usually because the phone lost signal. Try again asks the server for the page again.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  // Whether the phone says it's offline (assumed online in the server render).
  const offline = !useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  // A digest means the server answered with an error; without one the request never got there.
  const serverSide = !!error.digest && !offline;
  return (
    <section className="card space-y-3 text-center" role="alert">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-50 text-gold-800">
        <WifiOff className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="text-lg font-extrabold text-pine-950">
        {serverSide ? "Something went wrong on our end." : "Couldn't reach the pack app."}
      </h1>
      <p className="text-sm text-muted">
        {serverSide ? "It's not your signal. Try again in a minute." : "Check your signal and try again."}
      </p>
      <button type="button" className="btn-primary w-full" onClick={() => retry()}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Try again
      </button>
    </section>
  );
}
