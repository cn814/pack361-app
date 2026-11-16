"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PackageCheck, Printer } from "lucide-react";
import type { ActionResult } from "@/components/ActionForm";

/**
 * Print for the Scout Shop shopping list. Whenever the list is printed (this button or the
 * browser's own Print), it asks "Mark these as purchased?", so the next Scoutbook import's new
 * awards are the only ones left to buy. Also a plain "Mark as purchased" button.
 */
export default function PrintShoppingList({
  toBuy,
  action,
}: {
  toBuy: number;
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, {});
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!toBuy) return;
    const ask = () => {
      setShown(true);
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    window.addEventListener("afterprint", ask);
    return () => window.removeEventListener("afterprint", ask);
  }, [toBuy]);

  useEffect(() => {
    if (state.ok) dialog.current?.close();
  }, [state]);

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {toBuy > 0 && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setShown(true);
            dialog.current?.showModal();
          }}
        >
          <PackageCheck className="h-4 w-4" aria-hidden /> Mark as purchased
        </button>
      )}
      <button type="button" onClick={() => window.print()} className="btn-primary">
        <Printer className="h-4 w-4" aria-hidden /> Print
      </button>
      {state.ok && state.message && <p className="w-full text-sm font-semibold text-pine">{state.message}</p>}

      <dialog ref={dialog} className="m-auto w-[min(92vw,26rem)] rounded-2xl bg-card p-0 text-ink shadow-xl backdrop:bg-black/40">
        {shown && (
          <form action={formAction} className="space-y-3 p-5">
            <h2 className="text-lg font-extrabold text-pine-950">Mark these as purchased?</h2>
            <p className="text-sm text-navy">
              All {toBuy} award{toBuy === 1 ? "" : "s"} on this list move to <b>Already purchased</b>. After the next Scoutbook import,
              only new awards show here to buy.
            </p>
            {state.error && <p className="rounded-lg bg-danger-50 p-2 text-sm text-danger">{state.error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
                Not now
              </button>
              <button className={`btn-primary ${pending ? "is-busy" : ""}`} disabled={pending}>
                {pending ? "Saving…" : "Yes, purchased"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
