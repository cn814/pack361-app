"use client";

import { useActionState } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import {
  importTrailsEnd,
  savePopcornSettings,
  setPopcornSale,
  syncGivebutterNow,
  type ActionState,
} from "@/app/(app)/fundraisers/actions";

function Result({ s }: { s: ActionState }) {
  return (
    <>
      {s.error && <p className="text-sm text-danger">{s.error}</p>}
      {s.message && <p className="text-sm text-pine">{s.message}</p>}
      {!!s.unmatched?.length && (
        <div className="text-xs text-navy">
          <p className="font-semibold">Not matched to a roster scout:</p>
          <p>{s.unmatched.join(", ")}</p>
        </div>
      )}
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

export function PopcornSettingsForm({ v }: { v: Record<string, string> }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(savePopcornSettings, {});
  return (
    <form action={action} className="space-y-2">
      <label className="block text-xs font-semibold text-navy">
        Pack goal ($)
        <input name="popcorn_goal" inputMode="numeric" defaultValue={v.popcorn_goal} className="input mt-1 py-2" />
      </label>
      <label className="block text-xs font-semibold text-navy">
        Sale ends (e.g. Nov 15)
        <input name="popcorn_ends" defaultValue={v.popcorn_ends} className="input mt-1 py-2" />
      </label>
      <label className="block text-xs font-semibold text-navy">
        Pack online store link (Trail&apos;s End)
        <input name="popcorn_store_url" type="url" defaultValue={v.popcorn_store_url} placeholder="https://" className="input mt-1 py-2" />
      </label>
      <label className="block text-xs font-semibold text-navy">
        Note for families
        <textarea name="popcorn_note" rows={2} defaultValue={v.popcorn_note} className="input mt-1 py-2" />
      </label>
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Result s={s} />
    </form>
  );
}

export function PopcornEntryForm({ scouts }: { scouts: { id: string; label: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(setPopcornSale, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <select name="scout_id" required defaultValue="" className="input min-w-0 flex-1 py-2 text-sm">
          <option value="" disabled>
            Scout
          </option>
          {scouts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <input name="amount" inputMode="decimal" placeholder="$ total" required className="input w-24 py-2 text-sm" />
      </div>
      <button className="btn-ghost w-full" disabled={pending}>
        {pending ? "Saving…" : "Set total"}
      </button>
      <Result s={s} />
    </form>
  );
}

export function TrailsEndImportForm() {
  const [s, action, pending] = useActionState<ActionState, FormData>(importTrailsEnd, {});
  return (
    <form action={action} className="space-y-2">
      <input type="file" name="file" accept=".csv,text/csv" required className="input py-2 text-sm" />
      <button className="btn-primary w-full" disabled={pending}>
        <FileUp className="h-4 w-4" aria-hidden /> {pending ? "Importing…" : "Import Trail's End sales"}
      </button>
      <Result s={s} />
    </form>
  );
}
