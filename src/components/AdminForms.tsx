"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { syncGivebutterNow, type ActionState } from "@/app/(app)/store/actions";

function Result({ s }: { s: ActionState }) {
  return (
    <>
      {s.error && <p className="text-sm text-danger">{s.error}</p>}
      {s.message && <p className="text-sm text-pine">{s.message}</p>}
    </>
  );
}

export function SyncGivebutterButton() {
  const [s, action, pending] = useActionState<ActionState, FormData>(syncGivebutterNow, {});
  return (
    <form action={action} className="space-y-2">
      <button className="btn-ghost w-full" disabled={pending}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden /> {pending ? "Syncing…" : "Sync Givebutter now"}
      </button>
      <Result s={s} />
    </form>
  );
}
