import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, vi } from "vitest";
import { unitCases } from "./harness";
import { setDb, type Rule } from "./fake-db";
import { insightFacts } from "@/lib/insights";
import { POST as insights } from "@/app/api/insights/route";

const h = vi.hoisted(() => ({ create: (() => undefined) as (...args: unknown[]) => unknown }));
vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => ({ adminId: 1, role: "admin" }) }));
// Claude is replaced: the real SDK (and its error classes) with a fake messages.create.
vi.mock("@anthropic-ai/sdk", async (original) => {
  const actual = await original<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic extends actual.default {
    constructor() {
      super({ apiKey: "test-key" });
      (this as unknown as { beta: unknown }).beta = { messages: { create: (...args: unknown[]) => h.create(...args) } };
    }
  }
  return { ...actual, default: FakeAnthropic };
});

beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());

// Objective 5. AI-assisted monitoring (Claude). The app works the numbers out from its own records
// (lib/insights.ts) and Claude only ranks and words them; Claude is asked only when an admin
// presses the button. A week of records: 40 orders, ₱6,000.00 net sales.
const FACTS: Rule[] = [
  [/AS cost_of_goods/, [{ orders: 40, net_sales: "6000.00", cost_of_goods: "2100.00", uncosted_lines: 0, paymongo_fees: "45.00", expenses: "800.00", written_off: "55.00" }]],
  [/WITH used AS/, [
    { item_name: "Fresh Milk", unit_of_measure: "ml", quantity: "1400", low_stock_threshold: "2000", used_14_days: "2800", days_since_restock: 6 },
    { item_name: "Espresso Beans", unit_of_measure: "g", quantity: "5000", low_stock_threshold: "1000", used_14_days: "0", days_since_restock: 2 },
  ]],
  [/ORDER BY sold DESC LIMIT 5/, [{ product_name: "Spanish Latte", sold: 30, sales: "3600.00" }, { product_name: "Iced Americano", sold: 6, sales: "540.00" }]],
  [/COALESCE\(s.sold, 0\) <= GREATEST/, [{ product_name: "Matcha Latte", sold: 1 }]],
  [/GROUP BY reason/, [{ reason: "expired", entries: 2, cost: "55.00" }]],
  [/AS gcash,/, [{ cash: "4000.00", gcash: "2000.00", fees: "45.00" }]],
  [/AS short_shifts/, [{ short_shifts: 1, short_total: "30.00", over_shifts: 0, over_total: 0, closed_shifts: 7 }]],
  [/AS voids/, [{ voids: 1, refunds: 0, amount: "120.00", already_made: 1 }]],
  [/AS hour,/, [{ hour: 14, orders: 12 }, { hour: 9, orders: 8 }, { hour: 0, orders: 1 }]],
];
const week = () => { setDb(FACTS); return insightFacts("2026-10-01", "2026-10-07", "2026-10-08"); };

// Every key in the facts, to check what is sent to Claude.
const keys = (value: unknown): string[] => value && typeof value === "object" ? Object.entries(value).flatMap(([key, inner]) => [Array.isArray(value) ? "" : key, ...keys(inner)]).filter(Boolean) : [];

// The button: the switch is on, no request in the last 5 minutes, and Claude answers `reply`.
const card = (title: string, message: unknown = `${title}.`) => ({ tone: "tip", title, message, page: "finance" });
function generate(reply: (() => unknown) | null, options: { enabled?: boolean; secondsSinceLast?: number | null; start?: string; end?: string } = {}) {
  const db = setDb([
    [/ai_insights_enabled/, [{ setting_value: options.enabled === false ? "false" : "true" }]],
    [/AS since FROM ai_insights/, [{ since: options.secondsSinceLast ?? null }]],
    [/^INSERT INTO ai_insights/, [{ insight_id: 5 }]],
    [/WHERE ai.insight_id = \$1/, [{ insight_id: 5, period_start: "2026-10-01", period_end: "2026-10-07", cards: {}, model: "claude-opus-5-5", input_tokens: 1800, output_tokens: 300, full_name: "Owner", created_at: "2026-10-08T10:00:00.000+08:00" }]],
    ...FACTS,
  ]);
  h.create = vi.fn(async () => { if (!reply) throw new Error("Claude should not be called"); return reply(); });
  const request = new Request("http://admin.test/api/insights", { method: "POST", body: JSON.stringify({ action: "generate", start: options.start ?? "2026-10-01", end: options.end ?? "2026-10-07" }) });
  return { db, response: insights(request).then(async (response) => ({ status: response.status, body: await response.json() })) };
}
const answer = (cards: unknown[]) => () => ({ stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 1800, output_tokens: 300 }, content: [{ type: "text", text: JSON.stringify({ headline: "A good week", cards }) }] });
const fails = (error: () => Error) => () => { throw error(); };

unitCases("admin", "Objective 5 - AI Insights", [
  // Aggregation (the facts)
  { id: "UT-AIA-01", fn: "insightFacts", kind: "Positive", title: "net profit is net sales less cost of goods, PayMongo fees, expenses and waste", input: "₱6,000 sales, ₱2,100 cost, ₱45 fees, ₱800 expenses, ₱55 waste, 40 orders",
    expected: { net_profit: 3000, gross_profit: 3900, average_order: 150 }, expectedText: "Net profit ₱3,000.00, gross ₱3,900.00, average order ₱150.00",
    run: async () => { const money = (await week()).money.this_period; return { net_profit: money.net_profit, gross_profit: money.gross_profit, average_order: money.average_order }; } },
  { id: "UT-AIA-02", fn: "insightFacts", kind: "Positive", title: "top sellers are listed with how many sold and their sales", input: "Spanish Latte 30 sold (₱3,600), Iced Americano 6",
    expected: [{ product: "Spanish Latte", sold: 30, sales: 3600 }, { product: "Iced Americano", sold: 6, sales: 540 }], run: async () => (await week()).menu.best_sellers },
  { id: "UT-AIA-03", fn: "insightFacts", kind: "Boundary", title: "peak hours are written as clock hours (noon and midnight included)", input: "Busiest hours 14:00, 9:00, 0:00",
    expected: ["2 PM", "9 AM", "12 AM"], run: async () => (await week()).busiest_hours.map((hour) => hour.hour) },
  { id: "UT-AIA-04", fn: "insightFacts", kind: "Positive", title: "stock running out is predicted from the last 14 days of use", input: "Fresh Milk 1,400 ml, 2,800 ml used in 14 days; beans unused",
    expected: { running_out: [{ item: "Fresh Milk", days_left: 7 }], below_alert: ["Fresh Milk"] },
    run: async () => { const stock = (await week()).stock; return { running_out: stock.running_out_within_10_days.map((item) => ({ item: item.item, days_left: item.days_left })), below_alert: stock.at_or_below_low_stock_alert.map((item) => item.item) }; } },
  { id: "UT-AIA-05", fn: "insightFacts", kind: "Positive", title: "the period before is the same length, just before", input: "Period Oct 1–7, 2026 (7 days)",
    expected: { days: 7, period_before: { from: "2026-09-24", to: "2026-09-30" } }, run: async () => { const facts = await week(); return { days: facts.period.days, period_before: facts.period_before }; } },
  { id: "UT-AIA-06", fn: "insightFacts", kind: "Positive", title: "only numbers and item names go to Claude: no names, emails or phone numbers of customers or staff", input: "The facts of a week",
    expected: [], expectedText: "No personal fields", run: async () => keys(await week()).filter((key) => /email|phone|full_name|customer|username|address|staff|cashier|rider/i.test(key)) },
  // The request to Claude
  { id: "UT-AIA-07", fn: "POST /api/insights", kind: "Positive", title: "Claude's cards are saved, keeping at most 5 and dropping any without a message", input: "Claude answers 7 cards, one with no message",
    expected: { status: 201, saved: ["A", "C", "D", "E", "F"] },
    run: async () => { const run = generate(answer([card("A"), card("B", null), card("C"), card("D"), card("E"), card("F"), card("G")])); const result = await run.response; return { status: result.status, saved: JSON.parse(String(run.db.ran(/^INSERT INTO ai_insights/)[0].params[3])).cards.map((saved: { title: string }) => saved.title) }; } },
  { id: "UT-AIA-08", fn: "POST /api/insights", kind: "Negative", title: "rate limited or out of credits: a clear message, nothing saved", input: "Claude answers 429 (rate limit)",
    expected: { status: 503, error: "Claude is busy or the account is out of credits. Try again later.", saved: 0 },
    run: async () => { const run = generate(fails(() => new Anthropic.RateLimitError(429, { error: { message: "rate limited" } }, "rate limited", new Headers()))); const result = await run.response; return { status: result.status, error: result.body.error, saved: run.db.ran(/^INSERT INTO ai_insights/).length }; } },
  { id: "UT-AIA-09", fn: "POST /api/insights", kind: "Negative", title: "Claude timing out gives a clear message", input: "Request to Claude times out",
    expected: { status: 503, body: { error: "Could not reach Claude. Check the internet connection and try again." } }, run: () => generate(fails(() => new Anthropic.APIConnectionTimeoutError())).response },
  { id: "UT-AIA-10", fn: "POST /api/insights", kind: "Negative", title: "an answer that is not valid JSON is not saved", input: "Claude answers \"Sure! Here are...\"",
    expected: { status: 502, body: { error: "Claude's answer could not be read. Try again." } },
    run: () => generate(() => ({ stop_reason: "end_turn", model: "m", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: "Sure! Here are your insights" }] })).response },
  { id: "UT-AIA-11", fn: "POST /api/insights", kind: "Negative", title: "a refusal is reported, not saved", input: "Claude stops with \"refusal\"",
    expected: { status: 502, body: { error: "Claude could not write insights for this period. Try another period." } }, run: () => generate(() => ({ stop_reason: "refusal", content: [] })).response },
  { id: "UT-AIA-12", fn: "POST /api/insights", kind: "Negative", title: "nothing is sent to Claude while AI insights are switched off", input: "Switch off",
    expected: { status: 409, body: { error: "AI insights are turned off. An admin can turn them on at the top of this page." } }, run: () => generate(null, { enabled: false }).response },
  { id: "UT-AIA-13", fn: "POST /api/insights", kind: "Boundary", title: "a second request within 5 minutes waits (no credits spent)", input: "Last request 2 minutes ago",
    expected: { status: 429, error: "Please wait 3 more minutes before asking again." }, run: async () => { const result = await generate(null, { secondsSinceLast: 120 }).response; return { status: result.status, error: result.body.error }; } },
  { id: "UT-AIA-14", fn: "POST /api/insights", kind: "Negative", title: "a period that ends before it starts is refused", input: "Oct 7 to Oct 1",
    expected: { status: 400, body: { error: "Choose a valid period." } }, run: () => generate(null, { start: "2026-10-07", end: "2026-10-01" }).response },
  { id: "UT-AIA-15", fn: "POST /api/insights", kind: "Negative", title: "without the API key on the server nothing is sent", input: "ANTHROPIC_API_KEY not set",
    expected: { status: 503, body: { error: "AI insights are not set up yet: the ANTHROPIC_API_KEY setting is missing on the server." } }, run: () => { vi.stubEnv("ANTHROPIC_API_KEY", ""); return generate(null).response; } },
]);
