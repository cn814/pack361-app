"use client";

import { useState } from "react";
import { PlugZap } from "lucide-react";
import { testScoutbookConnection } from "../actions";
import type { ProbeResult } from "@/lib/myscouting";

/** Step 1 of the automatic Scoutbook import: can the app sign in and read advancement? */
export default function ConnectionTest({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ProbeResult | null>(null);
  const text = res ? JSON.stringify({ steps: res.steps, error: res.error, shapes: res.shapes }, null, 1) : "";

  return (
    <section className="card space-y-2 text-sm text-navy">
      <h2 className="section-title">Automatic import from Scoutbook (experimental)</h2>
      {configured ? (
        <>
          <p>
            Step 1: check that the app can sign in to Scoutbook and read advancement. This reads one scout&apos;s records
            and shows only the <b>field names</b> Scoutbook uses (no names, dates or other details) so the automatic
            import can be built to match. Nothing is saved.
          </p>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setRes(await testScoutbookConnection());
              setBusy(false);
            }}
          >
            <PlugZap className="h-4 w-4" aria-hidden /> {busy ? "Testing… (up to a minute)" : "Test the Scoutbook connection"}
          </button>
          {res && (
            <div className="space-y-1">
              <ul className="list-disc pl-5 text-xs">
                {res.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              {res.error && <p className="text-xs font-semibold text-danger">{res.error}</p>}
              <label className="block text-xs font-semibold">
                Result to send back (field names only)
                <textarea readOnly value={text} rows={8} className="input mt-1 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
              </label>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">
          Not set up yet: add <b>MYSCOUTING_USERNAME</b> and <b>MYSCOUTING_PASSWORD</b> in Vercel (Settings → Environment
          Variables), then redeploy.
        </p>
      )}
    </section>
  );
}
