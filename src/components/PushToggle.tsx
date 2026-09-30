"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/(app)/push-actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "ios-install" | "off" | "on" | "blocked" | "not-configured";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      let next: State;
      if (!vapid) next = "not-configured";
      else if (!("serviceWorker" in navigator) || !("PushManager" in window)) next = ios && !standalone ? "ios-install" : "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        next = (await reg.pushManager.getSubscription()) ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [vapid]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid!),
        });
        const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
        if (res.error) throw new Error(res.error);
        setState("on");
      } catch (e) {
        setState(Notification.permission === "denied" ? "blocked" : "off");
        setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
      }
    });

  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const sendTest = () =>
    start(async () => {
      setTest(null);
      setTest(await sendTestPush());
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  return (
    <div className="space-y-2 text-sm">
      {state === "on" && (
        <button type="button" onClick={turnOff} disabled={pending} className="btn-ghost w-full">
          <BellOff className="h-4 w-4" aria-hidden /> Turn off announcement alerts
        </button>
      )}
      {state === "off" && (
        <button type="button" onClick={turnOn} disabled={pending} className="btn-primary w-full">
          <Bell className="h-4 w-4" aria-hidden /> {pending ? "Turning on…" : "Get alerts for new announcements"}
        </button>
      )}
      {state === "on" && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-pine">Alerts are on for this device.</p>
          <button type="button" onClick={sendTest} disabled={pending} className="text-xs font-bold text-pine underline">
            Send a test alert
          </button>
        </div>
      )}
      {test && <p className={`text-xs ${test.ok ? "text-pine" : "text-danger"}`}>{test.message}</p>}
      {state === "ios-install" && (
        <p className="text-muted">
          On iPhone, first add this app to your home screen: tap Share, then <b>Add to Home Screen</b>. Open it from there and
          come back here to turn on alerts.
        </p>
      )}
      {state === "blocked" && <p className="text-muted">Notifications are blocked for this site. Allow them in your browser settings.</p>}
      {state === "unsupported" && <p className="text-muted">This browser can&apos;t show notifications.</p>}
      {state === "not-configured" && <p className="text-muted">Alerts aren&apos;t set up yet.</p>}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
