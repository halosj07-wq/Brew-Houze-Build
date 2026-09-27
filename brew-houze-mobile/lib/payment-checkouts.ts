import { randomUUID } from "crypto";
import pool from "@/lib/db";
import { placeOrder, quoteOrder, type OrderItemInput, type OrderSource } from "@/lib/orders";
import { createGcashPayment, getIntentState, PAYMONGO_MIN_AMOUNT, refundPayment } from "@/lib/paymongo";

// GCash checkouts: the order is only created once PayMongo reports the payment as paid, so an
// abandoned payment never touches stock or the queue. brew-houze-cashier and brew-houze-mobile
// keep identical copies of this file (either app may finalize a checkout, e.g. from a webhook).
//
//   awaiting_payment -> completed        paid, order created (queue number assigned)
//   awaiting_payment -> failed           GCash declined or the customer cancelled in GCash
//   awaiting_payment -> cancelled        the cashier cancelled before any payment
//   any -> needs_attention -> refunded   paid, but the order could not be created (stock ran
//                                         out, the shift closed, or it was cancelled), refunded

export type CheckoutStatus = "awaiting_payment" | "completed" | "failed" | "cancelled" | "refunded" | "needs_attention";
export type CheckoutView = {
  token: string;
  source: OrderSource;
  status: CheckoutStatus;
  amount: number;
  orderId: number | null;
  queueNumber: number | null;
  shiftId: number | null;
  message: string | null;
};

type CheckoutRow = {
  checkout_id: number; source_app: OrderSource; status: CheckoutStatus; amount: string; items: OrderItemInput[];
  cashier_admin_id: number | null; public_token: string; intent_id: string | null; payment_id: string | null;
  order_id: number | null; error: string | null; queue_number?: number | null; shift_id?: number | null;
};

const selectCheckout = `
  SELECT pc.*, so.queue_number, so.shift_id
  FROM payment_checkouts pc
  LEFT JOIN sales_orders so ON so.order_id = pc.order_id
`;

function toView(row: CheckoutRow): CheckoutView {
  const messages: Partial<Record<CheckoutStatus, string>> = {
    failed: row.error ?? "The GCash payment did not go through.",
    cancelled: "Cancelled before payment.",
    needs_attention: `Paid, but the order could not be placed${row.error ? ` (${row.error})` : ""}. Please show this to the cashier.`,
    refunded: `The payment was refunded${row.error ? ` because ${row.error.charAt(0).toLowerCase()}${row.error.slice(1).replace(/\.$/, "")}` : ""}.`,
  };
  return {
    token: row.public_token,
    source: row.source_app,
    status: row.status,
    amount: Number(row.amount),
    orderId: row.order_id === null ? null : Number(row.order_id),
    queueNumber: row.queue_number === null || row.queue_number === undefined ? null : Number(row.queue_number),
    shiftId: row.shift_id === null || row.shift_id === undefined ? null : Number(row.shift_id),
    message: messages[row.status] ?? null,
  };
}

async function loadByToken(token: string): Promise<CheckoutRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const result = await pool.query(`${selectCheckout} WHERE pc.public_token = $1`, [token]);
  return result.rows[0] ?? null;
}

// Prices the cart (stock, prices and the open shift all checked), opens a PayMongo GCash
// payment for exactly that amount, and returns where to send the customer.
export async function startCheckout(input: { source: OrderSource; items: OrderItemInput[]; cashierAdminId: number | null; returnUrl: (token: string) => string }) {
  const client = await pool.connect();
  let amount: number;
  try {
    amount = await quoteOrder(client, { items: input.items, source: input.source, cashierAdminId: input.cashierAdminId });
  } finally {
    client.release();
  }
  if (amount < PAYMONGO_MIN_AMOUNT) throw new Error(`GCash payments start at ₱${PAYMONGO_MIN_AMOUNT.toFixed(2)}. This order is ₱${amount.toFixed(2)}.`);

  const token = randomUUID();
  const inserted = await pool.query(`
    INSERT INTO payment_checkouts (source_app, status, amount, items, cashier_admin_id, public_token)
    VALUES ($1, 'awaiting_payment', $2, $3::jsonb, $4, $5)
    RETURNING checkout_id
  `, [input.source, amount, JSON.stringify(input.items), input.cashierAdminId, token]);
  const checkoutId = Number(inserted.rows[0].checkout_id);
  try {
    const payment = await createGcashPayment({
      amount,
      description: `Brew Houze ${input.source === "mobile" ? "mobile" : "counter"} order`,
      returnUrl: input.returnUrl(token),
      reference: token,
    });
    await pool.query("UPDATE payment_checkouts SET intent_id = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, payment.intentId]);
    return { token, amount, redirectUrl: payment.redirectUrl };
  } catch (error) {
    await pool.query("UPDATE payment_checkouts SET status = 'failed', error = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, error instanceof Error ? error.message : "Could not start the payment."]);
    throw error;
  }
}

async function tryRefund(checkoutId: number) {
  const result = await pool.query("SELECT payment_id, amount, error FROM payment_checkouts WHERE checkout_id = $1 AND status = 'needs_attention'", [checkoutId]);
  const row = result.rows[0];
  if (!row?.payment_id) return;
  try {
    await refundPayment(row.payment_id, Number(row.amount), `Brew Houze could not place the order: ${row.error ?? "unknown reason"}`);
    await pool.query("UPDATE payment_checkouts SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId]);
  } catch (refundError) {
    console.error(`Refund failed for payment checkout ${checkoutId}:`, refundError);
    await pool.query("UPDATE payment_checkouts SET error = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, `${row.error ?? "Order not placed"}. The automatic refund also failed, so refund it from the PayMongo dashboard`]);
  }
}

// Creates the order for a paid checkout, exactly once, however many times it is called
// (status checks and the webhook can arrive together). Refunds if the order cannot be made.
async function finalizePaid(checkoutId: number, paymentId: string | null): Promise<void> {
  const client = await pool.connect();
  let refundNeeded = false;
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT * FROM payment_checkouts WHERE checkout_id = $1 FOR UPDATE", [checkoutId]);
    const row = locked.rows[0] as CheckoutRow | undefined;
    if (!row || row.status === "completed" || row.status === "refunded" || row.status === "needs_attention") {
      await client.query("COMMIT");
      return;
    }
    if (row.status === "cancelled") {
      // Paid after the cashier had cancelled: nobody is waiting for this order, so refund it.
      await client.query("UPDATE payment_checkouts SET status = 'needs_attention', payment_id = $2, paid_at = CURRENT_TIMESTAMP, error = 'The order was cancelled before the payment came through', updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, paymentId]);
      await client.query("COMMIT");
      refundNeeded = true;
      return;
    }
    await client.query("SAVEPOINT place_order");
    try {
      const placed = await placeOrder(client, {
        items: row.items,
        source: row.source_app,
        cashierAdminId: row.cashier_admin_id === null ? null : Number(row.cashier_admin_id),
        paymentMethod: "online",
        customerToken: row.source_app === "mobile" ? row.public_token : null,
        paymentReference: paymentId,
        paymentProvider: "paymongo_gcash",
      });
      if (Math.abs(placed.total - Number(row.amount)) > 0.005) throw new Error(`The order total changed to ₱${placed.total.toFixed(2)} while paying ₱${Number(row.amount).toFixed(2)}`);
      await client.query("UPDATE payment_checkouts SET status = 'completed', order_id = $2, payment_id = $3, paid_at = CURRENT_TIMESTAMP, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, placed.orderId, paymentId]);
    } catch (orderError) {
      await client.query("ROLLBACK TO SAVEPOINT place_order");
      await client.query("UPDATE payment_checkouts SET status = 'needs_attention', payment_id = $2, paid_at = CURRENT_TIMESTAMP, error = $3, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, paymentId, orderError instanceof Error ? orderError.message : "The order could not be placed"]);
      refundNeeded = true;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (refundNeeded) await tryRefund(checkoutId);
}

// The current state of a checkout. While it waits, PayMongo is asked directly; a paid
// payment creates the order right here.
export async function refreshCheckout(token: string): Promise<CheckoutView | null> {
  const row = await loadByToken(token);
  if (!row) return null;
  if ((row.status === "awaiting_payment" || row.status === "cancelled") && row.intent_id) {
    const state = await getIntentState(row.intent_id);
    if (state.status === "succeeded") {
      await finalizePaid(Number(row.checkout_id), state.paymentId);
      return toView((await loadByToken(token))!);
    }
    if (state.status === "failed" && row.status === "awaiting_payment") {
      await pool.query("UPDATE payment_checkouts SET status = 'failed', error = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'awaiting_payment'", [row.checkout_id, state.failure]);
      return toView((await loadByToken(token))!);
    }
  }
  return toView(row);
}

// The cashier gives up on a payment. If it was already paid, the order is created instead.
export async function cancelCheckout(token: string): Promise<CheckoutView | null> {
  const current = await refreshCheckout(token);
  if (!current || current.status !== "awaiting_payment") return current;
  await pool.query("UPDATE payment_checkouts SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE public_token = $1 AND status = 'awaiting_payment'", [token]);
  return toView((await loadByToken(token))!);
}

// Safety net for payments nobody is watching (a customer paid, then closed their phone before
// the page confirmed). Checks unfinished payments with PayMongo, at most every 30 seconds per
// server. Anything still unpaid after 3 hours is given up on.
let lastReconcile = 0;
export async function reconcilePendingCheckouts() {
  if (Date.now() - lastReconcile < 30_000) return;
  lastReconcile = Date.now();
  const pending = await pool.query(`
    SELECT public_token FROM payment_checkouts
    WHERE status = 'awaiting_payment' AND intent_id IS NOT NULL AND created_at < CURRENT_TIMESTAMP - INTERVAL '20 seconds'
    ORDER BY created_at ASC
    LIMIT 10
  `);
  for (const row of pending.rows) {
    try {
      await refreshCheckout(String(row.public_token));
    } catch (error) {
      console.error("Payment reconcile failed:", error);
    }
  }
  await pool.query(`
    UPDATE payment_checkouts SET status = 'failed', error = 'The payment was not completed in time.', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'awaiting_payment' AND created_at < CURRENT_TIMESTAMP - INTERVAL '3 hours'
  `);
}

// Called by the PayMongo webhook (payment.paid / payment.failed).
export async function handlePaymentEvent(intentId: string, paid: boolean, paymentId: string | null, failure: string | null) {
  const result = await pool.query("SELECT checkout_id, status FROM payment_checkouts WHERE intent_id = $1", [intentId]);
  const row = result.rows[0];
  if (!row) return false;
  if (paid) await finalizePaid(Number(row.checkout_id), paymentId);
  else await pool.query("UPDATE payment_checkouts SET status = 'failed', error = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'awaiting_payment'", [row.checkout_id, failure ?? "The GCash payment did not go through."]);
  return true;
}
