import Link from "next/link";
import { HandCoins } from "lucide-react";
import { fmtMoney, type ChargeStatus } from "@/lib/money";

export interface EventCharge {
  status: ChargeStatus;
  amount_cents: number;
  paid_amount_cents: number | null;
}

/** On an event: "You owe $X · Pay now", "Paid", or "waiting for a leader". */
export default function ChargeLine({ charge }: { charge: EventCharge | null }) {
  if (!charge) return null;
  if (charge.status === "open" && charge.amount_cents > 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl bg-gold-50 p-3 text-sm text-gold-800">
        <b>You owe {fmtMoney(charge.amount_cents)}</b>
        <Link href="/pay" className="btn-gold py-2">
          <HandCoins className="h-4 w-4" aria-hidden /> Pay now
        </Link>
      </div>
    );
  }
  if (charge.status === "reported") return <p className="text-xs text-muted">You paid another way; a leader will confirm it.</p>;
  if (charge.status === "paid") {
    return <p className="text-xs font-semibold text-pine">Paid {fmtMoney(charge.paid_amount_cents ?? charge.amount_cents)}. Thank you!</p>;
  }
  if (charge.status === "waived") return <p className="text-xs text-muted">No charge for your family.</p>;
  return null;
}
