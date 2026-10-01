"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { requireMember } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeFor, fmtMoney, KIND_LABEL, type ChargeKind } from "@/lib/money";
import { chargesStillOpen, isMine, onlinePaymentsReady, settleOrder } from "@/lib/payments";
import { captureOrder, createOrder, getOrder, ORDER_ID, PayPalError, type PayPalOrder } from "@/lib/paypal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CheckoutResult = { orderId?: string; error?: string };
export type FinishResult = { ok?: boolean; message?: string; error?: string; restart?: boolean };

function refresh() {
  revalidatePath("/pay");
  revalidatePath("/family");
  revalidatePath("/inbox");
  revalidatePath("/");
}

/** Log a PayPal problem without anything secret (status, PayPal's issue code and debug id only). */
function logPayPal(where: string, e: unknown) {
  if (e instanceof PayPalError) console.error(`[pay] ${where}: ${e.message}${e.debugId ? ` debug_id=${e.debugId}` : ""}`);
  else console.error(`[pay] ${where}: ${e instanceof Error ? e.message : "unknown error"}`);
}

/**
 * PayPal button pressed: check the charges, create the PayPal order, remember it.
 * The amount comes from the database, never from the browser.
 */
export async function startCheckout(chargeIds: string[]): Promise<CheckoutResult> {
  const me = await requireMember();
  if (!onlinePaymentsReady()) return { error: "Online payments aren't set up yet. Use one of the other ways to pay below." };
  const ids = [...new Set((Array.isArray(chargeIds) ? chargeIds : []).map(String))].filter((id) => UUID.test(id));
  if (!ids.length) return { error: "Tick what you'd like to pay for." };
  if (ids.length > 50) return { error: "That's a lot at once. Pay for up to 50 items at a time." };

  // Read with the family's own sign-in, so Row Level Security proves these are theirs.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charges")
    .select("id, kind, title, season, amount_cents, status, family_id, adult_id, scout_id, scout:scouts(first_name), adult:adults!charges_adult_id_fkey(first_name, preferred_name)")
    .in("id", ids);
  if (error) return { error: "Couldn't load what you owe. Try again." };
  const rows = ((data ?? []) as unknown as {
    id: string;
    kind: ChargeKind;
    title: string;
    season: string | null;
    amount_cents: number;
    status: string;
    family_id: string | null;
    adult_id: string | null;
    scout_id: string | null;
    scout: { first_name: string } | null;
    adult: { first_name: string; preferred_name: string | null } | null;
  }[]).filter((c) => isMine(c, me));
  if (rows.length !== ids.length) return { error: "Some of these items aren't on your family's list anymore. Refresh the page and try again." };
  if (rows.some((c) => c.status !== "open")) return { error: "Something changed since you opened this page. Refresh it and try again." };
  const charges = ids.map((id) => rows.find((r) => r.id === id)!);
  if (charges.some((c) => c.amount_cents <= 0)) return { error: "One of these items has no amount yet. Untick it and try again." };
  const total = charges.reduce((s, c) => s + c.amount_cents, 0);

  const paymentId = crypto.randomUUID();
  let order: PayPalOrder;
  try {
    order = await createOrder(
      paymentId,
      charges.map((c) => {
        const who = chargeFor({ ...c, family_id: c.family_id });
        return { name: who ? `${c.title} (${who})` : c.title, cents: c.amount_cents, sku: c.id };
      }),
      charges.length === 1 ? `Pack 361: ${charges[0].title}` : `Pack 361: ${charges.length} items (${[...new Set(charges.map((c) => KIND_LABEL[c.kind]))].join(", ")})`,
    );
  } catch (e) {
    logPayPal("create order", e);
    return { error: "PayPal isn't answering right now. Nothing was charged. Try again in a few minutes." };
  }
  const db = createAdminClient();
  const { error: insertError } = await db.from("payments").insert({
    id: paymentId,
    family_id: me.family_id,
    adult_id: me.id,
    charge_ids: charges.map((c) => c.id),
    charge_cents: charges.map((c) => c.amount_cents),
    amount_cents: total,
    provider: "paypal",
    provider_order_id: order.id,
    status: "created",
  });
  if (insertError) {
    console.error(`[pay] couldn't save checkout ${paymentId}: ${insertError.message}`);
    return { error: "Couldn't start the payment. Nothing was charged. Try again." };
  }
  return { orderId: order.id };
}

/** The family approved the payment in PayPal: capture it and mark their charges paid. */
export async function finishCheckout(orderId: string): Promise<FinishResult> {
  const me = await requireMember();
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) return { error: "That payment wasn't found." };
  if (!onlinePaymentsReady()) return { error: "Online payments aren't set up yet." };
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, family_id, adult_id, amount_cents, provider_order_id, status, charge_ids")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (!payment || !isMine(payment, me)) return { error: "That payment wasn't found." };
  if (payment.status === "captured") return { ok: true, message: "Thanks! Your payment is complete." };
  if (payment.status !== "created") return { error: "This checkout was closed, so nothing was charged. Refresh the page and try again." };

  const db = createAdminClient();
  // A leader may have marked something paid since the checkout started: don't take money twice.
  if (!(await chargesStillOpen(db, payment.charge_ids as string[]))) {
    await db
      .from("payments")
      .update({ status: "canceled", error: "Items changed before the payment was taken; nothing was charged." })
      .eq("id", payment.id)
      .eq("status", "created");
    refresh();
    return { error: "Some of these items were already paid or changed, so we didn't charge you. Refresh the page to see what's still due." };
  }

  let order: PayPalOrder;
  try {
    order = await captureOrder(orderId);
  } catch (e) {
    if (e instanceof PayPalError && e.issue === "INSTRUMENT_DECLINED") return { restart: true };
    if (e instanceof PayPalError && e.issue === "ORDER_ALREADY_CAPTURED") {
      try {
        order = await getOrder(orderId);
      } catch (e2) {
        logPayPal("order lookup after capture", e2);
        return { ok: true, message: "PayPal took your payment. It may take a minute to show as paid here." };
      }
    } else {
      logPayPal("capture", e);
      // PayPal said no (4xx): nothing moved. A timeout or PayPal outage: we can't be sure, and the
      // daily check finishes it if the money did move.
      if (e instanceof PayPalError && e.status >= 400 && e.status < 500) {
        // Close it so the daily check never captures a payment we told the family didn't happen.
        await db
          .from("payments")
          .update({ status: "failed", error: `Capture refused by PayPal${e.issue ? ` (${e.issue})` : ""}.` })
          .eq("id", payment.id)
          .eq("status", "created");
        return { error: "PayPal couldn't finish the payment, and nothing was charged. Try again, or use one of the other ways to pay." };
      }
      return {
        error: "We couldn't hear back from PayPal. If PayPal took the payment, it shows as paid here within a day, so please don't pay again before then.",
      };
    }
  }

  let result;
  try {
    result = await settleOrder(db, payment as { id: string; amount_cents: number; provider_order_id: string }, order);
  } catch (e) {
    logPayPal("record capture", e);
    return { ok: true, message: "PayPal took your payment. It may take a little while to show as paid here; there's no need to pay again." };
  }
  refresh();
  switch (result) {
    case "recorded":
    case "already":
      return { ok: true, message: `Thanks! We received ${fmtMoney(payment.amount_cents)}. PayPal is emailing you a receipt.` };
    case "pending":
      return { ok: true, message: "PayPal is still processing this payment. It shows as paid here once it clears; there's no need to pay again." };
    case "mismatch":
    case "partial":
      return { ok: true, message: "PayPal took your payment. A leader will double-check it and be in touch if anything needs fixing." };
    case "failed":
      return { error: "PayPal declined the payment, and nothing was charged. Try another card or account, or another way to pay." };
    default:
      return { error: "PayPal didn't finish the payment, and nothing was charged. Try again." };
  }
}

/** The family closed the PayPal window without paying. */
export async function cancelCheckout(orderId: string): Promise<void> {
  const me = await requireMember();
  if (typeof orderId !== "string" || !ORDER_ID.test(orderId) || !onlinePaymentsReady()) return;
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, family_id, adult_id")
    .eq("provider_order_id", orderId)
    .eq("status", "created")
    .maybeSingle();
  if (!payment || !isMine(payment, me)) return;
  await createAdminClient().from("payments").update({ status: "canceled" }).eq("id", payment.id).eq("status", "created");
}

/** "We paid another way" (check, cash): a leader confirms it later. */
export async function reportPaidAnotherWay(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireMember();
  const ids = form.getAll("id").map(String).filter((id) => UUID.test(id));
  const how = String(form.get("how") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (!ids.length) return { error: "Tick what you paid for." };
  if (!["check", "cash", "other"].includes(how)) return { error: "Pick how you paid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_paid", { p_ids: ids, p_how: how, p_note: note });
  if (error) return { error: "Couldn't save that. Try again." };
  if (!data) return { error: "Those were already paid or reported. Refresh the page." };
  refresh();
  return { ok: true, message: "Thanks! A leader will mark it paid when they get it." };
}
