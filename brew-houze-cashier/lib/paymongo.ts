import { createHmac, timingSafeEqual } from "crypto";

// PayMongo (GCash) through the Payment Intent workflow. Server-side only: every call uses the
// secret key, so nothing here may be imported by client components. brew-houze-cashier and
// brew-houze-mobile keep identical copies of this file.
//
// Test keys (sk_test_) move no real money: PayMongo shows a test page to authorize or fail.

const API = "https://api.paymongo.com/v1";
export const PAYMONGO_MIN_AMOUNT = 20; // PayMongo's minimum charge, in pesos

export function paymongoConfigured(): boolean {
  return /^sk_(test|live)_/.test(process.env.PAYMONGO_SECRET_KEY ?? "");
}

export function paymongoTestMode(): boolean {
  return (process.env.PAYMONGO_SECRET_KEY ?? "").startsWith("sk_test_");
}

type PaymongoResource = { id: string; attributes: Record<string, unknown> };

async function call(method: "GET" | "POST", path: string, attributes?: Record<string, unknown>): Promise<PaymongoResource> {
  const key = process.env.PAYMONGO_SECRET_KEY ?? "";
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      Accept: "application/json",
      ...(attributes ? { "Content-Type": "application/json" } : {}),
    },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as { data?: PaymongoResource; errors?: { detail?: string; code?: string }[] };
  if (!response.ok || !payload.data) {
    const detail = payload.errors?.map((error) => error.detail).filter(Boolean).join(" ") || `HTTP ${response.status}`;
    throw new Error(`PayMongo: ${detail}`);
  }
  return payload.data;
}

// Creates a GCash payment for `amount` pesos and returns where to send the customer.
// Payment intent -> GCash payment method -> attach, which yields the GCash redirect.
export async function createGcashPayment(input: { amount: number; description: string; returnUrl: string; reference: string }) {
  const intent = await call("POST", "/payment_intents", {
    amount: Math.round(input.amount * 100),
    currency: "PHP",
    payment_method_allowed: ["gcash"],
    capture_type: "automatic",
    description: input.description,
    statement_descriptor: "Brew Houze",
    metadata: { reference: input.reference },
  });
  const method = await call("POST", "/payment_methods", { type: "gcash" });
  const attached = await call("POST", `/payment_intents/${intent.id}/attach`, {
    payment_method: method.id,
    client_key: intent.attributes.client_key,
    return_url: input.returnUrl,
  });
  const nextAction = attached.attributes.next_action as { redirect?: { url?: string } } | null;
  const redirectUrl = nextAction?.redirect?.url;
  if (!redirectUrl) throw new Error("PayMongo did not return a GCash page to open.");
  return { intentId: intent.id, redirectUrl };
}

// redirectUrl: the GCash page to send the customer to, while the payment still waits for them.
// fee: what PayMongo kept on a paid payment, in pesos (null when PayMongo did not say).
export type IntentState = { status: "succeeded" | "pending" | "failed"; paymentId: string | null; failure: string | null; redirectUrl: string | null; fee: number | null };

// PayMongo amounts are in centavos.
export function feeInPesos(value: unknown): number | null {
  const centavos = Number(value);
  return value === null || value === undefined || !Number.isFinite(centavos) ? null : Math.round(centavos) / 100;
}

// Where the payment stands, straight from PayMongo (never from the customer's browser).
export async function getIntentState(intentId: string): Promise<IntentState> {
  const intent = await call("GET", `/payment_intents/${intentId}`);
  const status = String(intent.attributes.status);
  const payments = (intent.attributes.payments as PaymongoResource[] | undefined) ?? [];
  const paid = payments.find((payment) => payment.attributes.status === "paid");
  if (status === "succeeded" || paid) return { status: "succeeded", paymentId: paid?.id ?? payments[0]?.id ?? null, failure: null, redirectUrl: null, fee: feeInPesos((paid ?? payments[0])?.attributes.fee) };
  const lastError = intent.attributes.last_payment_error as { failed_message?: string; failed_code?: string } | null;
  // A failed or cancelled GCash authorization sends the intent back to waiting for a method.
  if (status === "awaiting_payment_method" && lastError) return { status: "failed", paymentId: null, failure: lastError.failed_message || lastError.failed_code || "The GCash payment did not go through.", redirectUrl: null, fee: null };
  const nextAction = intent.attributes.next_action as { redirect?: { url?: string } } | null;
  return { status: "pending", paymentId: null, failure: null, redirectUrl: nextAction?.redirect?.url ?? null, fee: null };
}

// The fee PayMongo kept on a payment, in pesos (for orders whose fee was not read when paid).
export async function getPaymentFee(paymentId: string): Promise<number | null> {
  const payment = await call("GET", `/payments/${paymentId}`);
  return payment.attributes.status === "paid" ? feeInPesos(payment.attributes.fee) : null;
}

export async function refundPayment(paymentId: string, amount: number, notes: string) {
  const refund = await call("POST", "/refunds", { amount: Math.round(amount * 100), payment_id: paymentId, reason: "others", notes: notes.slice(0, 240) });
  return refund.id;
}

// Paymongo-Signature: t=<unix time>,te=<test signature>,li=<live signature>, each an HMAC-SHA256
// of "<t>.<raw body>" with the webhook's secret key. Old timestamps are refused (replays).
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => { const [key, ...rest] = part.trim().split("="); return [key, rest.join("=")]; }));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 60 * 10) return false;
  const signature = paymongoTestMode() ? parts.te : parts.li;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
