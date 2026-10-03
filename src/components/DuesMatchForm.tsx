"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import { matchDuesOrder } from "@/app/(app)/leaders/money/actions";

export interface MatchFamily {
  id: string;
  name: string;
  scouts: { id: string; first_name: string }[];
}

/** "Match to…": pick the family, tick the scouts this Givebutter payment was for. */
export default function DuesMatchForm({ orderId, families, familyId }: { orderId: number; families: MatchFamily[]; familyId: string | null }) {
  const [fam, setFam] = useState(familyId && families.some((f) => f.id === familyId) ? familyId : "");
  const picked = families.find((f) => f.id === fam);
  return (
    <ActionForm action={matchDuesOrder} submit="Match and mark paid" busy="Saving…" className="mt-2 space-y-2" buttonClass="btn-primary w-full py-2 text-sm">
      <input type="hidden" name="order_id" value={orderId} />
      <select name="family_id" className="input py-2" value={fam} onChange={(e) => setFam(e.target.value)} aria-label="Family">
        <option value="">Pick the family…</option>
        {families.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {picked &&
        (picked.scouts.length ? (
          <div className="flex flex-wrap gap-2" key={picked.id}>
            {picked.scouts.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-2 py-1.5 text-sm font-semibold text-navy">
                <input type="checkbox" name="scout_id" value={s.id} defaultChecked={picked.scouts.length === 1} className="h-4 w-4 accent-pine" />
                {s.first_name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">This family has no active scouts.</p>
        ))}
    </ActionForm>
  );
}
