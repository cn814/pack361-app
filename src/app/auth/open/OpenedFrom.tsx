"use client";

import { useSyncExternalStore } from "react";

/** Why this opened in the browser: iPhone email links never open home-screen apps. */
export default function OpenedFrom() {
  const ios = useSyncExternalStore(
    () => () => {},
    () => /iPhone|iPad|iPod/.test(navigator.userAgent),
    () => false,
  );
  if (!ios) return null;
  return (
    <p className="text-xs text-muted">
      On iPhone, links in emails always open in Safari or Chrome, never in the home-screen app, so signing in here wouldn&apos;t
      sign in the app.
    </p>
  );
}
