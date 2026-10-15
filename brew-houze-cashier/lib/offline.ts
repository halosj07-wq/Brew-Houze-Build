// Offline mode for the counter (browser only). When the Staff Portal cannot reach the server, the
// counter tablet keeps taking cash orders: they are saved here, on the tablet, each with an
// offline ticket (OFF-1, OFF-2... per shift), and sent to /api/offline-orders once the internet is
// back. To open and work without the internet the tablet also keeps the last of what the server
// said: who is signed in, the open shift, and the menu (public/sw.js keeps the app itself).
//
// Everything lives in localStorage on this tablet only. A failed read or write (private mode,
// storage full) means offline mode is not available, never a lost online order.

export type OfflineOrderItem = { product_variant_id: number; quantity: number; addition_ids: number[]; customizations: { inventory_id: number; level: string }[]; note: string };
// One line as printed on its receipt (the menu as the tablet knew it).
export type OfflineReceiptLine = { name: string; size: string | null; temperature: string | null; quantity: number; unitPrice: number; station?: "bar" | "kitchen"; custom?: string | null; additions: { name: string; quantity: number; unitPrice: number }[] };
export type OfflineOrder = {
  id: string; ticket: string; createdAt: string; shiftId: number | null; cashierId: number; cashierName: string;
  items: OfflineOrderItem[]; lines: OfflineReceiptLine[]; serviceType: "dine_in" | "take_out"; pickupMode: "together" | "separate" | null;
  total: number; received: number;
  // Set when the server could not save it (a product removed from the menu, say): it stays here
  // until the cashier sends it again or discards it.
  problem?: string | null;
};
// What happened to an order once it was sent (shown until the cashier dismisses it).
// total: what the customer was charged (the sale); menuTotal: what the menu asks now.
export type OfflineSynced = { id: string; ticket: string; queueNumber: number; total: number; menuTotal: number; stockShort: { item: string; unit: string; short: number }[]; syncedAt: string };

const OUTBOX_KEY = "brew-houze-offline-orders";
const SYNCED_KEY = "brew-houze-offline-synced";
const TICKET_KEY = "brew-houze-offline-ticket";
const SESSION_KEY = "brew-houze-offline-session";
const SHIFT_KEY = "brew-houze-offline-shift";
const MENU_KEY = "brew-houze-offline-menu";
// How long a remembered sign-in lets the tablet work offline.
const SESSION_DAYS = 3;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const readOutbox = () => read<OfflineOrder[]>(OUTBOX_KEY, []);
export const writeOutbox = (orders: OfflineOrder[]) => write(OUTBOX_KEY, orders);
export const readSynced = () => read<OfflineSynced[]>(SYNCED_KEY, []);
export const writeSynced = (entries: OfflineSynced[]) => write(SYNCED_KEY, entries.slice(-50));

// The next offline ticket of this shift (OFF-1, OFF-2...).
export function nextTicket(shiftId: number | null): string {
  const last = read<{ shiftId: number | null; n: number }>(TICKET_KEY, { shiftId: null, n: 0 });
  const n = last.shiftId === shiftId ? last.n + 1 : 1;
  write(TICKET_KEY, { shiftId, n });
  return `OFF-${n}`;
}

// Adds an order to the outbox; false when the tablet could not save it (then it was not taken).
export function saveOfflineOrder(order: OfflineOrder): boolean {
  return writeOutbox([...readOutbox(), order]);
}

// The last of what the server said, to open and work without it.
export function rememberSession<T>(user: T) { write(SESSION_KEY, { user, savedAt: Date.now() }); }
export function rememberedSession<T>(): T | null {
  const saved = read<{ user: T; savedAt: number } | null>(SESSION_KEY, null);
  return saved && Date.now() - saved.savedAt < SESSION_DAYS * 86_400_000 ? saved.user : null;
}
export function forgetSession() {
  try { window.localStorage.removeItem(SESSION_KEY); window.localStorage.removeItem(SHIFT_KEY); } catch { /* storage unavailable */ }
}
export const rememberShift = <T,>(shift: T | null) => write(SHIFT_KEY, shift);
export const rememberedShift = <T,>(): T | null => read<T | null>(SHIFT_KEY, null);
export const rememberMenu = <T,>(menu: T) => write(MENU_KEY, menu);
export const rememberedMenu = <T,>(): T | null => read<T | null>(MENU_KEY, null);

// A request that never reached the server (no internet, the server down), not one it refused.
export const isNetworkError = (error: unknown) => error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
