"use client";

import { useActionState } from "react";
import { CircleCheck, FileUp } from "lucide-react";
import { importScoutbook, type ImportState } from "../actions";
import { changesText } from "@/lib/import-changes";

export default function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importScoutbook, {});
  return (
    <form action={action} className="card space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-navy">Scoutbook advancement export (.csv)</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="input py-2 text-sm" />
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <div className="space-y-1 rounded-xl bg-mint p-3 text-sm text-pine">
          <p className="flex items-center gap-1.5 font-bold">
            <CircleCheck className="h-4 w-4" aria-hidden /> Imported {state.rows?.toLocaleString()} records for {state.scouts} scouts.
          </p>
          {changesText(state.changes) && <p className="font-semibold">{changesText(state.changes)}</p>}
          {!!state.recorded && <p>{state.recorded} approved report(s) were found in Scoutbook and marked entered.</p>}
          {!!state.unmatched?.length && (
            <div className="text-navy">
              <p className="font-semibold">Not on the app roster (no matching BSA member ID):</p>
              <ul className="list-disc pl-5 text-xs">
                {state.unmatched.map((u) => (
                  <li key={u.member_id}>
                    {u.name} ({u.member_id})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <button className="btn-primary w-full" disabled={pending}>
        <FileUp className="h-4 w-4" aria-hidden /> {pending ? "Importing…" : "Import"}
      </button>
    </form>
  );
}
