import { randomUUID } from "crypto";
import pool from "@/lib/db";
import { placeOrder, quoteOrder, type OrderItemInput, type OrderSource } from "@/lib/orders";
import type { IdDiscountInput } from "@/lib/discounts";
import { claimCounterCart, completeCounterCart } from "@/lib/counter-carts";
import { markVerificationUsed } from "@/lib/id-verifications";
import type { DeliveryPlan } from "@/lib/delivery";
import { createGcashPayment, getIntentState, getPaymentFee, PAYMONGO_MIN_AMOUNT, refundPayment } from "@/lib/paymongo";
import { recordLateFee } from "@/lib/treasury";

// GCash checkouts: the order is only created once PayMongo reports the payment as paid, so an
// abandoned payment never touches stock or the queue. brew-houze-cashier and brew-houze-mobile
// keep identical copies of this file (either app may finalize a checkout, e.g. from a webhook).
//
//   awaiting_payment -> completed        paid, order created (queue number assigned)
//   awaiting_payment -> failed           GCash declined or the customer cancelled in GCash
//   awaiting_payment -> cancelled        the cashier cancelled before any payment
//   any -> needs_attention -> refunded   paid, but the order could not be created (stock ran
//                                         out, the shift closed, or it was cancelled), refunded
//
// Split payments (counter only): the cashier collects cash_amount in cash first, and the
// checkout charges the rest (amount) through GCash. The order records both parts.
//
// The order also keeps the fee PayMongo kept on the payment (sales_orders.payment_fee, see
// treasury-paymongo-migration.sql), for Finance and the PayMongo page of the treasury.

export type CheckoutStatus = "awaiting_payment" | "completed" | "failed" | "cancelled" | "refunded" | "needs_attention";
export type CheckoutView = {
  token: string;
  source: OrderSource;
  status: CheckoutStatus;
  amount: number;
  cashAmount: number;
  orderId: number | null;
  queueNumber: number | null;
  shiftId: number | null;
  message: string | null;
  // The order could not be made because something sold out.
  soldOut: boolean;
};

type CheckoutRow = {
  checkout_id: number; source_app: OrderSource; status: CheckoutStatus; amount: string; items: OrderItemInput[];
  cashier_admin_id: number | null; public_token: string; intent_id: string | null; payment_id: string | null;
  cash_amount?: string | null; received_amount?: string | null; customer_id?: number | null; discount_reward_id?: number | null; service_type?: string | null; id_discounts?: IdDiscountInput[] | null; counter_cart_id?: number | null; id_verification_id?: number | null; delivery?: DeliveryPlan | null;
  order_id: number | null; error: string | null; queue_number?: number | null; shift_id?: number | null;
};

const selectCheckout = `
  SELECT pc.*, so.queue_number, so.shift_id
  FROM payment_checkouts pc
  LEFT JOIN sales_orders so ON so.order_id = pc.order_id
`;

// The saved reasons that mean something sold out (see SoldOutError in lib/orders.ts).
const SOLD_OUT_REASON = /^(Insufficient stock|One or more selected products are no longer available)/;

function toView(row: CheckoutRow): CheckoutView {
  const cashAmount = Number(row.cash_amount ?? 0);
  // Staff see which stock ran short; a customer on the mobile menu only that something sold out.
  const soldOut = Boolean(row.error && SOLD_OUT_REASON.test(row.error));
  if (soldOut && row.source_app === "mobile") row = { ...row, error: "Some items sold out while you were paying" };
  // Split payment that did not go through: the cash part was already handed over.
  const cashBack = cashAmount > 0 ? ` Give the customer back the ₱${cashAmount.toFixed(2)} cash they paid.` : "";
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
    cashAmount,
    message: messages[row.status] ? `${messages[row.status]}${cashBack}` : null,
    soldOut,
  };
}

async function loadByToken(token: string): Promise<CheckoutRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const result = await pool.query(`${selectCheckout} WHERE pc.public_token = $1`, [token]);
  return result.rows[0] ?? null;
}

// Prices the cart (stock, prices and the open shift all checked), opens a PayMongo GCash
// payment for exactly that amount, and returns where to send the customer.
export async function startCheckout(input: { source: OrderSource; items: OrderItemInput[]; cashierAdminId: number | null; customerId?: number | null; rewardsAuthorized?: boolean; discountRewardId?: number | null; idDiscounts?: IdDiscountInput[]; counterCartId?: number | null; idVerificationId?: number | null; delivery?: DeliveryPlan | null; serviceType?: "dine_in" | "take_out" | "delivery" | null; returnUrl: (token: string) => string; split?: { cashAmount: number; receivedAmount: number } | null }) {
  const client = await pool.connect();
  let total: number;
  try {
    total = await quoteOrder(client, { items: input.items, source: input.source, cashierAdminId: input.cashierAdminId, customerId: input.customerId ?? null, rewardsAuthorized: input.rewardsAuthorized, discountRewardId: input.discountRewardId ?? null, idDiscounts: input.idDiscounts ?? [], serviceType: input.serviceType ?? null, delivery: input.delivery ?? null });
  } finally {
    client.release();
  }
  let cashAmount = 0;
  let receivedAmount: number | null = null;
  if (input.split) {
    cashAmount = Math.round(Number(input.split.cashAmount) * 100) / 100;
    receivedAmount = Math.round(Number(input.split.receivedAmount) * 100) / 100;
    if (!Number.isFinite(cashAmount) || cashAmount <= 0 || cashAmount >= total) throw new Error(`The cash part must be more than ₱0 and less than the ₱${total.toFixed(2)} total.`);
    if (!Number.isFinite(receivedAmount) || receivedAmount < cashAmount) throw new Error("The cash received must cover the cash part.");
  }
  // What GCash charges: the whole order, or what is left after the cash part.
  const amount = Math.round((total - cashAmount) * 100) / 100;
  if (amount < PAYMONGO_MIN_AMOUNT) {
    throw new Error(input.split
      ? `The GCash part must be at least ₱${PAYMONGO_MIN_AMOUNT.toFixed(2)}. Lower the cash part to ₱${(total - PAYMONGO_MIN_AMOUNT).toFixed(2)} or less.`
      : `GCash payments start at ₱${PAYMONGO_MIN_AMOUNT.toFixed(2)}. This order is ₱${amount.toFixed(2)}.`);
  }

  const token = randomUUID();
  const inserted = await pool.query(`
    INSERT INTO payment_checkouts (source_app, status, amount, items, cashier_admin_id, public_token, cash_amount, received_amount, customer_id, discount_reward_id, service_type, id_discounts, counter_cart_id, id_verification_id, delivery)
    VALUES ($1, 'awaiting_payment', $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14::jsonb)
    RETURNING checkout_id
  `, [input.source, amount, JSON.stringify(input.items), input.cashierAdminId, token, cashAmount, receivedAmount, input.customerId ?? null, input.discountRewardId ?? null, input.serviceType ?? null, input.idDiscounts && input.idDiscounts.length > 0 ? JSON.stringify(input.idDiscounts) : null, input.counterCartId ?? null, input.idVerificationId ?? null, input.delivery ? JSON.stringify(input.delivery) : null]);
  const checkoutId = Number(inserted.rows[0].checkout_id);
  try {
    const payment = await createGcashPayment({
      amount,
      description: `Brew Houze ${input.source === "mobile" ? "mobile" : "counter"} order${cashAmount > 0 ? ` (GCash part, ₱${cashAmount.toFixed(2)} paid in cash)` : ""}`,
      returnUrl: input.returnUrl(token),
      reference: token,
    });
    await pool.query("UPDATE payment_checkouts SET intent_id = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1", [checkoutId, payment.intentId]);
    return { token, amount, cashAmount, total, redirectUrl: payment.redirectUrl };
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
async function finalizePaid(checkoutId: number, paymentId: string | null, fee: number | null): Promise<void> {
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
      const cashAmount = Number(row.cash_amount ?? 0);
      // A cart the customer sent from the mobile menu: the order takes its token so their phone follows it.
      const counterCartId = row.counter_cart_id === null || row.counter_cart_id === undefined ? null : Number(row.counter_cart_id);
      const counterCartToken = await claimCounterCart(client, counterCartId);
      const placed = await placeOrder(client, {
        items: row.items,
        source: row.source_app,
        cashierAdminId: row.cashier_admin_id === null ? null : Number(row.cashier_admin_id),
        paymentMethod: cashAmount > 0 ? "split" : "online",
        cashAmount,
        receivedAmount: row.received_amount === null || row.received_amount === undefined ? cashAmount : Number(row.received_amount),
        customerToken: row.source_app === "mobile" ? row.public_token : counterCartToken,
        customerId: row.customer_id === null || row.customer_id === undefined ? null : Number(row.customer_id),
        // Rewards in the cart were confirmed when the payment started.
        rewardsAuthorized: true,
        discountRewardId: row.discount_reward_id === null || row.discount_reward_id === undefined ? null : Number(row.discount_reward_id),
        // ID discounts the cashier checked when the payment started.
        idDiscounts: Array.isArray(row.id_discounts) ? row.id_discounts : [],
        serviceType: row.service_type === "dine_in" || row.service_type === "take_out" || row.service_type === "delivery" ? row.service_type : null,
        // A delivery order's address and fee rules, as checked when the payment started.
        delivery: row.delivery ?? null,
        paymentReference: paymentId,
        paymentProvider: "paymongo_gcash",
      });
      const paidTotal = Number(row.amount) + cashAmount;
      if (Math.abs(placed.total - paidTotal) > 0.005) throw new Error(`The order total changed to ₱${placed.total.toFixed(2)} while paying ₱${paidTotal.toFixed(2)}`);
      if (counterCartId !== null && counterCartToken !== null) await completeCounterCart(client, counterCartId, placed.orderId);
      // A mobile ID check is good for one order: used now, or the payment is refunded.
      if (row.id_verification_id !== null && row.id_verification_id !== undefined) await markVerificationUsed(client, Number(row.id_verification_id), placed.orderId);
      if (fee !== null) await client.query("UPDATE sales_orders SET payment_fee = $2 WHERE order_id = $1", [placed.orderId, fee]);
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
      await finalizePaid(Number(row.checkout_id), state.paymentId, state.fee);
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
  // GCash orders whose fee was not read when they were paid: ask PayMongo for it.
  const unfeed = await pool.query(`
    SELECT order_id, payment_reference FROM sales_orders
    WHERE payment_provider = 'paymongo_gcash' AND payment_fee IS NULL AND payment_reference IS NOT NULL
    ORDER BY order_id DESC
    LIMIT 5
  `);
  for (const row of unfeed.rows) {
    const client = await pool.connect();
    try {
      const fee = await getPaymentFee(String(row.payment_reference));
      if (fee === null) continue;
      await client.query("BEGIN");
      const saved = await client.query("UPDATE sales_orders SET payment_fee = $2 WHERE order_id = $1 AND payment_fee IS NULL RETURNING shift_id", [row.order_id, fee]);
      // A shift already closed has its GCash in the PayMongo account without this fee.
      if (saved.rowCount) await recordLateFee(client, { orderId: Number(row.order_id), shiftId: saved.rows[0].shift_id === null ? null : Number(saved.rows[0].shift_id), fee });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error(`Could not read the PayMongo fee of order ${row.order_id}:`, error);
    } finally {
      client.release();
    }
  }
}

// The counter payment a customer can pay right now from the printed GCash sign (/pay/counter):
// the newest cashier checkout still waiting, started in the last 15 minutes. Only one runs at a
// time because the counter has one tablet. Returns null when there is nothing to pay.
export async function currentCounterCheckout(): Promise<{ token: string; amount: number; redirectUrl: string } | null> {
  const result = await pool.query(`
    SELECT public_token, amount, intent_id FROM payment_checkouts
    WHERE source_app = 'cashier' AND status = 'awaiting_payment' AND intent_id IS NOT NULL
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  const state = await getIntentState(String(row.intent_id));
  if (state.status !== "pending" || !state.redirectUrl) {
    // Paid or failed in the meantime: record it the usual way and show nothing to pay.
    await refreshCheckout(String(row.public_token));
    return null;
  }
  return { token: String(row.public_token), amount: Number(row.amount), redirectUrl: state.redirectUrl };
}

// Called by the PayMongo webhook (payment.paid / payment.failed).
export async function handlePaymentEvent(intentId: string, paid: boolean, paymentId: string | null, failure: string | null, fee: number | null = null) {
  const result = await pool.query("SELECT checkout_id, status FROM payment_checkouts WHERE intent_id = $1", [intentId]);
  const row = result.rows[0];
  if (!row) return false;
  if (paid) await finalizePaid(Number(row.checkout_id), paymentId, fee);
  else await pool.query("UPDATE payment_checkouts SET status = 'failed', error = $2, updated_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'awaiting_payment'", [row.checkout_id, failure ?? "The GCash payment did not go through."]);
  return true;
}
