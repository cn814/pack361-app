import "server-only";
import { todayEastern } from "./money-data";
import { parseAmount } from "./finance";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read and check the fields a member fills in. */
export function readRequestFields(form: FormData): { error: string } | { row: Record<string, unknown> } {
  const description = String(form.get("description") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const vendor = String(form.get("vendor") ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || null;
  const spentOn = String(form.get("spent_on") ?? "");
  const amount = parseAmount(String(form.get("amount") ?? ""));
  const categoryId = String(form.get("category_id") ?? "");
  const eventId = String(form.get("event_id") ?? "");
  const denId = String(form.get("den_id") ?? "");
  if (!description) return { error: "Say what you bought." };
  if (!DATE.test(spentOn)) return { error: "Pick the date on the receipt." };
  if (spentOn > todayEastern()) return { error: "The date can't be in the future." };
  if (amount === null) return { error: "Write the amount in dollars, like 45.99." };
  if (categoryId && !UUID.test(categoryId)) return { error: "Pick a category from the list." };
  if (eventId && !UUID.test(eventId)) return { error: "Pick the event from the list." };
  if (denId && !UUID.test(denId)) return { error: "Pick the den from the list." };
  return {
    row: {
      description,
      vendor,
      spent_on: spentOn,
      amount_cents: amount,
      category_id: categoryId || null,
      event_id: eventId || null,
      den_id: denId || null,
    },
  };
}

