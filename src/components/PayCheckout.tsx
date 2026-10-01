"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2 } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { cancelCheckout, finishCheckout, reportPaidAnotherWay, startCheckout } from "@/app/(app)/pay/actions";
import { fmtMoney } from "@/lib/money";
import { fmtShortDate } from "@/lib/advancement";

export interface PayItem {
  id: string;
  title: string;
  detail: string | null;
  amount_cents: number;
  due_on: string | null;
}

// The bits of the PayPal JS SDK we use (https://developer.paypal.com/sdk/js/reference/).
interface PayPalActions {
  enable: () => void;
  disable: () => void;
  reject?: () => void;
  restart?: () => Promise<void>;
}
interface PayPalButtonsInstance {
  render: (el: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
  isEligible: () => boolean;
}
interface PayPalSdk {
  Buttons: (opts: Record<string, unknown>) => PayPalButtonsInstance;
}
declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

const SDK_ID = "paypal-sdk";

function loadSdk(clientId: string, sandbox: boolean): Promise<PayPalSdk> {
  if (window.paypal) return Promise.resolve(window.paypal);
  return new Promise((resolve, reject) => {
    let s = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (!s) {
      const q = new URLSearchParams({
        "client-id": clientId,
        currency: "USD",
        intent: "capture",
        components: "buttons",
        // Venmo shows on US phones; no Pay Later or PayPal Credit for pack fees.
        "enable-funding": "venmo",
        "disable-funding": "paylater,credit",
      });
      if (sandbox) q.set("buyer-country", "US"); // lets Venmo show while testing in the sandbox
      s = document.createElement("script");
      s.id = SDK_ID;
      s.src = `https://www.paypal.com/sdk/js?${q.toString()}`;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load"))));
    s.addEventListener("error", () => reject(new Error("PayPal didn't load")));
  });
}

/** Pick what to pay, then PayPal / Venmo / card, or tell the leaders you paid another way. */
export default function PayCheckout({
  items,
  clientId,
  sandbox,
  otherHow,
}: {
  items: PayItem[];
  clientId: string | null;
  sandbox: boolean;
  otherHow: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(items.map((i) => i.id));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sdkState, setSdkState] = useState<"loading" | "ready" | "failed">(clientId ? "loading" : "failed");
  const [working, setWorking] = useState(false);
  const selectedRef = useRef(selected);
  const actionsRef = useRef<PayPalActions | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const total = items.filter((i) => selected.includes(i.id)).reduce((s, i) => s + i.amount_cents, 0);

  useEffect(() => {
    selectedRef.current = selected;
    if (selected.length) actionsRef.current?.enable();
    else actionsRef.current?.disable();
  }, [selected]);

  useEffect(() => {
    if (!clientId || !box.current) return;
    let buttons: PayPalButtonsInstance | null = null;
    let gone = false;
    loadSdk(clientId, sandbox)
      .then((paypal) => {
        if (gone || !box.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay", height: 45 },
          onInit: (_data: unknown, actions: PayPalActions) => {
            actionsRef.current = actions;
            if (!selectedRef.current.length) actions.disable();
          },
          onClick: () => {
            setError(null);
            setMessage(null);
          },
          createOrder: async () => {
            const r = await startCheckout(selectedRef.current);
            if (!r.orderId) {
              setError(r.error ?? "Couldn't start the payment. Nothing was charged.");
              throw new Error("checkout not started");
            }
            return r.orderId;
          },
          onApprove: async (data: { orderID: string }, actions: PayPalActions) => {
            setWorking(true);
            try {
              const r = await finishCheckout(data.orderID);
              if (r.restart && actions.restart) return actions.restart();
              if (r.ok) {
                setMessage(r.message ?? "Thanks! Your payment is complete.");
                router.refresh();
              } else setError(r.error ?? "PayPal didn't finish the payment.");
            } finally {
              setWorking(false);
            }
          },
          onCancel: (data: { orderID?: string }) => {
            setError("Payment canceled. Nothing was charged.");
            if (data?.orderID) void cancelCheckout(data.orderID);
          },
          onError: () => {
            setError((e) => e ?? "PayPal ran into a problem, and nothing was charged. Try again, or use one of the other ways to pay below.");
          },
        });
        return buttons.render(box.current).then(() => !gone && setSdkState("ready"));
      })
      .catch(() => !gone && setSdkState("failed"));
    return () => {
      gone = true;
      actionsRef.current = null;
      buttons?.close().catch(() => {});
    };
  }, [clientId, sandbox, router]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  if (message) {
    return (
      <section className="card flex items-start gap-2 border-l-4 border-l-pine text-sm text-pine">
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p className="font-semibold">{message}</p>
      </section>
    );
  }

  return (
    <>
      <section className="card space-y-2">
        <h2 className="section-title">What you owe</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.includes(i.id)}
                  onChange={() => toggle(i.id)}
                  className="h-5 w-5 shrink-0 accent-pine"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{i.title}</span>
                  {(i.detail || i.due_on) && (
                    <span className="block text-[11px] text-muted">
                      {[i.detail, i.due_on ? `due ${fmtShortDate(i.due_on)}` : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-bold text-ink">{fmtMoney(i.amount_cents)}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="flex items-center justify-between border-t border-line pt-2 text-base font-extrabold text-pine-950">
          <span>Total</span>
          <span>{fmtMoney(total)}</span>
        </p>
      </section>

      {clientId && (
        <section className="card space-y-2">
          <h2 className="section-title">Pay online</h2>
          <p className="text-xs text-muted">
            Pay with PayPal, Venmo (on phones) or a debit or credit card. You don&apos;t need a PayPal account to use a card. The
            pack never sees your card or bank details.
          </p>
          {sdkState === "loading" && (
            <p className="flex items-center gap-2 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading PayPal…
            </p>
          )}
          {sdkState === "failed" && (
            <p className="rounded-xl bg-gold-50 p-2 text-xs text-gold-800">
              PayPal didn&apos;t load. Check your connection and reload the page, or use one of the other ways to pay below.
            </p>
          )}
          {!selected.length && sdkState === "ready" && <p className="text-xs font-semibold text-gold-800">Tick at least one item to pay.</p>}
          <div ref={box} className={working ? "pointer-events-none opacity-50" : ""} />
          {working && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finishing your payment…
            </p>
          )}
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="section-title">{clientId ? "Other ways to pay" : "How to pay"}</h2>
        {otherHow ? (
          <p className="whitespace-pre-line text-sm text-ink">{otherHow}</p>
        ) : (
          <p className="text-sm text-muted">Ask a pack leader how to pay by check or cash.</p>
        )}
        <details className="pt-1">
          <summary className="cursor-pointer text-sm font-bold text-pine">I paid another way</summary>
          <ActionForm action={reportPaidAnotherWay} submit="Let the leaders know" busy="Saving…" className="mt-2 space-y-2" buttonClass="btn-ghost w-full py-2">
            {selected.map((id) => (
              <input key={id} type="hidden" name="id" value={id} />
            ))}
            <p className="text-xs text-muted">
              For the {selected.length} ticked item{selected.length === 1 ? "" : "s"} above ({fmtMoney(total)}). A leader marks it paid when
              they get it.
            </p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {(["check", "cash", "other"] as const).map((h) => (
                <label key={h} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white p-2 font-semibold text-navy">
                  <input type="radio" name="how" value={h} defaultChecked={h === "check"} className="accent-pine" />
                  {h === "check" ? "Check" : h === "cash" ? "Cash" : "Other"}
                </label>
              ))}
            </div>
            <input className="input" name="note" maxLength={300} placeholder="Note for the leaders (optional): check number, who you gave it to…" />
          </ActionForm>
        </details>
      </section>
    </>
  );
}
