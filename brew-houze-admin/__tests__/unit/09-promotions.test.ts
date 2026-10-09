import { vi } from "vitest";
import { unitCases } from "./harness";
import { setDb } from "./fake-db";
import { parsePromotion, promotionStatus, sortForCustomers, type PromotionTiming } from "@/lib/promotions";
import { POST as postPromotion } from "@/app/api/promotions/route";

const signalChange = vi.fn();
let role = "admin";
vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("next/server", async (original) => ({ ...(await original<object>()), after: (task: () => unknown) => void task() }));
vi.mock("@/lib/realtime", () => ({ signalChange: (...scopes: string[]) => signalChange(...scopes) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => ({ adminId: 1, role }) }));

// Objective 9 (Admin Portal part): promotions and events for customers. When a post shows on the
// Mobile Menu (switched on, inside its show window, an event not yet over), how the menu orders
// them, how the admin's form is checked, and that saving needs an admin and signals open menus.
const NOW = new Date("2026-10-10T10:00:00+08:00");
const at = (text: string) => new Date(`${text}+08:00`).toISOString();
const post = (over: Partial<PromotionTiming>): PromotionTiming => ({ kind: "promo", isActive: true, archivedAt: null, showFrom: at("2026-10-09T09:00:00"), showUntil: null, eventStartsAt: null, eventEndsAt: null, ...over });
const problem = (body: Record<string, unknown>) => { const result = parsePromotion(body, NOW); return "error" in result ? result.error : "accepted"; };
const valid = { kind: "promo", title: "Buy 1 Take 1", message: "Every Tuesday." };

async function save(body: Record<string, unknown>, productRows: Record<string, unknown>[] = [{ "?column?": 1 }]) {
  signalChange.mockClear();
  setDb([
    [/FROM products WHERE product_id/, productRows],
    [/INSERT INTO promotions/, [{ promotion_id: 9 }]],
    [/FROM promotions p/, [{ promotion_id: 9, kind: body.kind, title: body.title, message: body.message, has_image: false, version: "1", product_id: body.productId ?? null, product_name: null,
      event_starts_at: null, event_ends_at: null, show_from: NOW, show_until: null, is_active: true, archived_at: null, created_by_name: "Admin", updated_at: NOW, email_customers: false, emailed_at: null, emailed_count: null }]],
  ]);
  const response = await postPromotion(new Request("http://admin.test/api/promotions", { method: "POST", body: JSON.stringify(body) }));
  return { status: response.status, error: (await response.json()).error ?? null, signalled: signalChange.mock.calls.flat() };
}

unitCases("admin", "Objective 9 - Notifications", [
  { id: "UT-NOT-12", fn: "promotionStatus", kind: "Positive", title: "a switched-on promo inside its window is showing", input: "Promo shown since yesterday, no end",
    expected: "showing", run: () => promotionStatus(post({}), NOW) },
  { id: "UT-NOT-13", fn: "promotionStatus", kind: "Positive", title: "a promo that starts later is scheduled", input: "Shows from Oct 12, now Oct 10",
    expected: "scheduled", run: () => promotionStatus(post({ showFrom: at("2026-10-12T09:00:00") }), NOW) },
  { id: "UT-NOT-14", fn: "promotionStatus", kind: "Boundary", title: "a promo ends exactly at its show-until time", input: "Show until Oct 10, 10:00 AM; now 10:00 AM",
    expected: "ended", run: () => promotionStatus(post({ showUntil: at("2026-10-10T10:00:00") }), NOW) },
  { id: "UT-NOT-15", fn: "promotionStatus", kind: "Boundary", title: "an event with no end time still shows at 11:59 PM of its day", input: "Event Oct 10, 7:00 PM; now 11:59 PM",
    expected: "showing", run: () => promotionStatus(post({ kind: "event", eventStartsAt: at("2026-10-10T19:00:00") }), new Date(at("2026-10-10T23:59:00"))) },
  { id: "UT-NOT-16", fn: "promotionStatus", kind: "Boundary", title: "an event with no end time is over at midnight after its day", input: "Event Oct 10, 7:00 PM; now Oct 11, 12:00 AM",
    expected: "ended", run: () => promotionStatus(post({ kind: "event", eventStartsAt: at("2026-10-10T19:00:00") }), new Date(at("2026-10-11T00:00:00"))) },
  { id: "UT-NOT-17", fn: "promotionStatus", kind: "Negative", title: "switched off and archived posts are never showing", input: "Off post; archived post",
    expected: ["off", "archived"], run: () => [promotionStatus(post({ isActive: false }), NOW), promotionStatus(post({ archivedAt: at("2026-10-09T12:00:00") }), NOW)] },
  { id: "UT-NOT-18", fn: "sortForCustomers", kind: "Positive", title: "events come first by date, then promos newest first", input: "Promo Oct 1, event Oct 15, promo Oct 9, event Oct 11",
    expected: [4, 2, 3, 1],
    run: () => sortForCustomers([
      { id: 1, ...post({ showFrom: at("2026-10-01T09:00:00") }) }, { id: 2, ...post({ kind: "event", eventStartsAt: at("2026-10-15T19:00:00") }) },
      { id: 3, ...post({ showFrom: at("2026-10-09T09:00:00") }) }, { id: 4, ...post({ kind: "event", eventStartsAt: at("2026-10-11T19:00:00") }) },
    ]).map((item) => item.id) },
  { id: "UT-NOT-19", fn: "parsePromotion", kind: "Positive", title: "a valid promo is cleaned and shows right away", input: "Title \"  Buy 1   Take 1 \", no show date",
    expected: { title: "Buy 1 Take 1", showFrom: NOW.toISOString(), isActive: true },
    run: () => { const result = parsePromotion({ ...valid, title: "  Buy 1   Take 1 " }, NOW); return "post" in result ? { title: result.post.title, showFrom: result.post.showFrom, isActive: result.post.isActive } : result; } },
  { id: "UT-NOT-20", fn: "parsePromotion", kind: "Negative", title: "a post needs Promo or Event", input: "kind \"sale\"",
    expected: "Choose Promo or Event.", run: () => problem({ ...valid, kind: "sale" }) },
  { id: "UT-NOT-21", fn: "parsePromotion", kind: "Negative", title: "a post needs a title", input: "Title of spaces only",
    expected: "Enter the title.", run: () => problem({ ...valid, title: "   " }) },
  { id: "UT-NOT-22", fn: "parsePromotion", kind: "Boundary", title: "the title is limited to 80 characters", input: "80 and 81 characters",
    expected: ["accepted", "Keep the title to 80 characters."], run: () => [problem({ ...valid, title: "x".repeat(80) }), problem({ ...valid, title: "x".repeat(81) })] },
  { id: "UT-NOT-23", fn: "parsePromotion", kind: "Boundary", title: "the message is limited to 400 characters", input: "400 and 401 characters",
    expected: ["accepted", "Keep the message to 400 characters."], run: () => [problem({ ...valid, message: "x".repeat(400) }), problem({ ...valid, message: "x".repeat(401) })] },
  { id: "UT-NOT-24", fn: "parsePromotion", kind: "Negative", title: "an event needs its start", input: "Event with no start",
    expected: "Enter when the event starts.", run: () => problem({ kind: "event", title: "Acoustic Night", message: "Live music." }) },
  { id: "UT-NOT-25", fn: "parsePromotion", kind: "Negative", title: "an event that is already over is refused", input: "Event Oct 3, now Oct 10",
    expected: "That event is already over.", run: () => problem({ kind: "event", title: "Old", message: "x", eventStartsAt: at("2026-10-03T19:00:00") }) },
  { id: "UT-NOT-26", fn: "parsePromotion", kind: "Negative", title: "an event cannot end before it starts", input: "Starts 7:00 PM, ends 6:00 PM",
    expected: "The event must end after it starts.", run: () => problem({ kind: "event", title: "Gig", message: "x", eventStartsAt: at("2026-10-11T19:00:00"), eventEndsAt: at("2026-10-11T18:00:00") }) },
  { id: "UT-NOT-27", fn: "parsePromotion", kind: "Negative", title: "the show window must end after it starts", input: "Show from Oct 12, until Oct 11",
    expected: "The post must stop showing after it starts.", run: () => problem({ ...valid, showFrom: at("2026-10-12T09:00:00"), showUntil: at("2026-10-11T09:00:00") }) },
  { id: "UT-NOT-28", fn: "POST /api/promotions", kind: "Positive", title: "an admin's post is saved and signals the open menus", input: "Valid promo by an admin",
    expected: { status: 201, error: null, signalled: ["promos"] }, run: () => { role = "admin"; return save(valid); } },
  { id: "UT-NOT-29", fn: "POST /api/promotions", kind: "Negative", title: "only an admin can post", input: "Valid promo by a cashier",
    expected: { status: 403, error: "Only an admin can manage promotions and events.", signalled: [] }, run: async () => { role = "cashier"; try { return await save(valid); } finally { role = "admin"; } } },
  { id: "UT-NOT-30", fn: "POST /api/promotions", kind: "Negative", title: "a linked menu item must still be on the menu", input: "Promo linked to an archived item",
    expected: { status: 400, error: "That menu item is not available. Choose another, or none.", signalled: [] }, run: () => save({ ...valid, productId: 77 }, []) },
], "Objective 9 - Promotions");
