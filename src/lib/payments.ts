import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { adminConfigured } from "./supabase/admin";
import { CHARGE_COLUMNS, type ChargeRow } from "./money";
import { firstCapture, paypalConfigured, valueToCents, type PayPalOrder } from "./paypal";
import type { Adult } from "./types";

/** Can families pay online right now? (PayPal keys plus the server key that records payments.) */
export function onlinePaymentsReady(): boolean {
  return paypalConfigured() && adminConfigured();
}

/** Is this charge the signed-in person's to pay? (Committee members can read everyone's.) */
export function isMine(c: { family_id: string | null; adult_id: string | null }, me: Pick<Adult, "id" | "family_id">): boolean {
  return me.family_id ? c.family_id === me.family_id : c.family_id === null && c.adult_id === me.id;
}

/** The family's (or, with no family, the adult's) charges, soonest due first. Canceled ones left out. */
export function getMyCharges(me: Pick<Adult, "id" | "family_id">): Promise<ChargeRow[]> {
  return chargesFor(me.id, me.family_id);
}

// Read once per request (My family, the bell and Home all use it).
const chargesFor = cache(async (adultId: string, familyId: string | null): Promise<ChargeRow[]> => {
  const supabase = await createClient();
  let q = supabase.from("charges").select(CHARGE_COLUMNS).neq("status", "canceled");
  q = familyId ? q.eq("family_id", familyId) : q.is("family_id", null).eq("adult_id", adultId);
  const { data } = await q.order("due_on", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  return (data ?? []) as unknown as ChargeRow[];
});

/** Sum of what's due (open charges with an amount). */
export function totalDue(charges: ChargeRow[]): number {
  return charges.filter((c) => c.status === "open").reduce((s, c) => s + c.amount_cents, 0);
}

export interface PaymentRef {
  id: string;
  amount_cents: number;
  provider_order_id: string;
}

export type SettleResult = "recorded" | "already" | "mismatch" | "partial" | "pending" | "failed" | "not_captured" | "wrong_order";

/**
 * Record a captured PayPal order against our payments row (secret-key client). Checks the order
 * is this payment's, the capture is COMPLETED, in USD, for the checkout's amount. The database
 * function changes the payment from "created" to "captured" once, so running this twice (the
 * family's own capture racing the daily check) can't mark anything paid twice.
 */
export async function settleOrder(db: SupabaseClient, payment: PaymentRef, order: PayPalOrder): Promise<SettleResult> {
  const unit = order.purchase_units?.[0];
  const cap = firstCapture(order);
  const customId = unit?.custom_id ?? cap?.custom_id ?? null;
  if (order.id !== payment.provider_order_id || (customId && customId !== payment.id)) return "wrong_order";
  if (!cap) return "not_captured";
  if (cap.status === "PENDING") return "pending";
  if (cap.status !== "COMPLETED") {
    await db
      .from("payments")
      .update({ status: "failed", error: `PayPal capture ${cap.status.toLowerCase()}` })
      .eq("id", payment.id)
      .eq("status", "created");
    return "failed";
  }
  const usd = cap.amount?.currency_code === "USD";
  const cents = usd ? valueToCents(cap.amount?.value) : NaN;
  const { data, error } = await db.rpc("record_paypal_capture", {
    p_payment_id: payment.id,
    p_capture_id: cap.id,
    p_captured_cents: Number.isFinite(cents) ? cents : null,
  });
  if (error) throw new Error(`Couldn't record payment ${payment.id}: ${error.message}`);
  return data as SettleResult;
}

/** Are all these charges still open? (A leader may have marked one paid since checkout began.) */
export async function chargesStillOpen(db: SupabaseClient, ids: string[]): Promise<boolean> {
  const { data, error } = await db.from("charges").select("id, status").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).length === ids.length && (data ?? []).every((c) => c.status === "open");
}
