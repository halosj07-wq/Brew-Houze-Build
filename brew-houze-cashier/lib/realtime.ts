import { after } from "next/server";

// "Something changed" signals for the live screens (see lib/live.ts), sent through Supabase
// Realtime. Only the kind of change goes out, never order or customer data: the screens then
// reload through their own signed-in API. The signal is sent after the response, so the change is
// already saved when screens reload, and a request never waits for it. brew-houze-admin,
// brew-houze-cashier and brew-houze-mobile keep identical copies of this file.
//
//   queue  orders placed, made, picked up, voided or refunded, and deliveries
//   line   the counter line: carts sent to the counter, ID photos, Stars claims
//   stock  what can be sold: stock, recipes, products and add-ons
//   promos promotions and events for customers (see lib/promotions.ts)

export type ChangeScope = "queue" | "line" | "stock" | "promos";
export const LIVE_TOPIC = "brew-houze-live";

async function send(scopes: ChangeScope[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: scopes.map((scope) => ({ topic: LIVE_TOPIC, event: "changed", payload: { scope } })) }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // A missed signal only means screens catch up on their next regular refresh.
  }
}

export function signalChange(...scopes: ChangeScope[]): void {
  if (scopes.length === 0) return;
  try {
    after(() => send(scopes));
  } catch {
    // Outside a request (a script): send straight away.
    void send(scopes);
  }
}
