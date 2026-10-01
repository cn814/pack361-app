import "server-only";

// PayPal Orders v2, created and captured on the server (https://developer.paypal.com/docs/api/orders/v2/).
// Env: NEXT_PUBLIC_PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET (server only), PAYPAL_ENV = sandbox | live.
// Sandbox unless PAYPAL_ENV is exactly "live". Never log the secret or the access token.

const TIMEOUT_MS = 15000;

export type PayPalEnv = "sandbox" | "live";

export function paypalEnv(): PayPalEnv {
  return process.env.PAYPAL_ENV?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());
}

function apiBase(): string {
  return paypalEnv() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issue: string | null = null,
    readonly debugId: string | null = null,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

export interface PayPalMoney {
  currency_code: string;
  value: string;
}
export interface PayPalCapture {
  id: string;
  status: string; // COMPLETED, PENDING, DECLINED, FAILED, ...
  amount?: PayPalMoney;
  custom_id?: string;
}
export interface PayPalOrder {
  id: string;
  status: string; // CREATED, SAVED, APPROVED, VOIDED, COMPLETED, PAYER_ACTION_REQUIRED
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    amount?: PayPalMoney;
    payments?: { captures?: PayPalCapture[] };
  }[];
}

// Access token, kept in memory until shortly before it expires.
let cached: { token: string; expiresAt: number; key: string } | null = null;

async function accessToken(): Promise<string> {
  const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new PayPalError("PayPal is not set up", 0, "NOT_CONFIGURED");
  const key = `${paypalEnv()}:${id}`;
  if (cached && cached.key === key && cached.expiresAt > Date.now() + 60000) return cached.token;
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new PayPalError(`PayPal sign-in returned ${res.status}`, res.status);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new PayPalError("PayPal sign-in returned no token", res.status);
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000, key };
  return body.access_token;
}

async function call<T>(method: "GET" | "POST", path: string, what: string, body?: unknown, requestId?: string): Promise<T> {
  const token = await accessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    Prefer: "return=representation",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401) cached = null;
    const details = Array.isArray(json.details) ? (json.details as { issue?: string }[]) : [];
    const issue = details[0]?.issue ?? (typeof json.name === "string" ? json.name : null);
    const debugId = typeof json.debug_id === "string" ? json.debug_id : null;
    throw new PayPalError(`PayPal ${what} returned ${res.status}${issue ? ` (${issue})` : ""}`, res.status, issue, debugId);
  }
  return json as T;
}

export const centsToValue = (c: number) => (c / 100).toFixed(2);

/** "12.50" -> 1250; NaN if it isn't a plain amount. */
export function valueToCents(v: string | undefined): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v ?? "");
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : NaN;
}

export interface OrderItem {
  name: string;
  cents: number;
  sku?: string;
}

/** Create an order for these items. `paymentId` is our payments row id (PayPal's custom_id). */
export async function createOrder(paymentId: string, items: OrderItem[], description: string): Promise<PayPalOrder> {
  const total = items.reduce((s, i) => s + i.cents, 0);
  const usd = (c: number) => ({ currency_code: "USD", value: centsToValue(c) });
  return call<PayPalOrder>(
    "POST",
    "/v2/checkout/orders",
    "create order",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "pack361",
          custom_id: paymentId,
          description: description.slice(0, 127),
          amount: { ...usd(total), breakdown: { item_total: usd(total) } },
          items: items.map((i) => ({
            name: i.name.slice(0, 127),
            quantity: "1",
            unit_amount: usd(i.cents),
            ...(i.sku ? { sku: i.sku.slice(0, 127) } : {}),
          })),
        },
      ],
      // application_context covers every way to pay (PayPal, Venmo, cards). Nothing ships.
      application_context: {
        brand_name: "Cub Scout Pack 361",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    },
    `create-${paymentId}`,
  );
}

/** Capture an approved order. */
export function captureOrder(orderId: string): Promise<PayPalOrder> {
  return call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, "capture", {});
}

export function getOrder(orderId: string): Promise<PayPalOrder> {
  return call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`, "order lookup");
}

/** The order's first capture (we only ever create one purchase unit). */
export function firstCapture(order: PayPalOrder): PayPalCapture | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}

export const ORDER_ID = /^[A-Z0-9-]{5,40}$/i;
