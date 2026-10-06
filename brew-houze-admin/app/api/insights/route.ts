import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { insightFacts } from "@/lib/insights";
import { getSession } from "@/lib/sessions";

// AI insights (see ai-insights-migration.sql): short predictive warnings and advice written by
// Claude from the cafe's numbers. Claude is asked only when an admin presses the button, never in
// the background, and only while the switch is on. Results are saved, so reading them is free.
//
//   GET  /api/insights                              -> the switch, whether the API key is set, the
//                                                     cooldown, and the saved results (newest first)
//   POST { action: "generate", start, end }         -> works the facts out and asks Claude
//   POST { action: "set_enabled", enabled }         -> turns AI insights on or off
//
// The key is read from ANTHROPIC_API_KEY in the server environment and never sent to the browser.

const TZ = "Asia/Manila";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODEL = "claude-opus-5-5";
// The shortest time between two requests, so repeated clicks do not spend credits.
const COOLDOWN_SECONDS = 5 * 60;
const PAGES = ["inventory", "finance", "treasury", "products", "shift"] as const;

// The shape every answer comes back in (structured output), so the page always renders it.
const CARD_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One short line summing up the period, under 90 characters." },
    cards: {
      type: "array",
      description: "3 to 5 cards, most urgent first.",
      items: {
        type: "object",
        properties: {
          tone: { type: "string", enum: ["alert", "warning", "good", "tip"], description: "alert: money being lost now; warning: needs action soon; good: good news; tip: advice." },
          title: { type: "string", description: "2 to 5 words, like 'Heads up' or 'Beans run out Thursday'." },
          message: { type: "string", description: "One or two plain sentences with the specific numbers, dates and names from the facts." },
          page: { type: "string", enum: [...PAGES], description: "The admin page where the owner can act on it." },
        },
        required: ["tone", "title", "message", "page"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "cards"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You write short insight cards for the owner of Brew Houze, a small cafe in the Philippines. The owner reads them on the Insights page of their admin app, like a usage warning: specific, forward-looking, and quick to act on.

You receive facts the app already worked out from its own records, as JSON. Every number you use must come from those facts: never estimate, round differently, or invent numbers, dates, products or causes. If the facts do not support a point, leave it out.

Write 3 to 5 cards, most urgent first, each with one tone:
1. alert: money being lost now. A net loss for the period, cash drawer shortages, or stock written off that costs more than a tenth of net sales. Use alert only for these.
2. warning: needs action soon. Stock that runs out before it would usually be restocked or is already at its low-stock alert, net profit falling against the period before, waste rising, many voids or refunds.
3. good: good news worth knowing, such as a best seller, profit up, or a clean cash drawer.
4. tip: one practical tip, such as a slow seller to promote or stop making, or the busiest hours to staff.

Small numbers are not patterns. When a point rests on only a few orders (under 10, as with the busiest hours early on), say how many it is based on and present it as an early sign, not a trend.

Write amounts with the peso sign and two decimals, for example ₱1,240.00. Say when something runs out the way the facts give it, for example "Thursday afternoon". Keep each message to one or two short sentences in plain words, no jargon and no exclamation marks. If the period has no sales yet, say so in one card and give one tip for getting started. Never mention staff by name and never blame anyone; describe what happened.`;

type Card = { tone: "alert" | "warning" | "good" | "tip"; title: string; message: string; page: (typeof PAGES)[number] };

function mapInsight(row: Record<string, unknown>) {
  return {
    id: Number(row.insight_id),
    start: String(row.period_start),
    end: String(row.period_end),
    headline: String((row.cards as { headline?: unknown })?.headline ?? ""),
    cards: ((row.cards as { cards?: Card[] })?.cards ?? []) as Card[],
    model: String(row.model),
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    requestedBy: (row.full_name as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

const insightSelect = `
  SELECT ai.insight_id, TO_CHAR(ai.period_start, 'YYYY-MM-DD') AS period_start, TO_CHAR(ai.period_end, 'YYYY-MM-DD') AS period_end, ai.cards, ai.model,
    ai.input_tokens, ai.output_tokens, au.full_name, TO_CHAR(ai.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
  FROM ai_insights ai LEFT JOIN admin_users au ON au.admin_id = ai.requested_by
`;

async function isEnabled(): Promise<boolean> {
  const result = await pool.query("SELECT setting_value FROM store_settings WHERE setting_key = 'ai_insights_enabled'");
  return result.rows[0]?.setting_value === "true";
}

async function secondsUntilNext(): Promise<number> {
  const result = await pool.query("SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(created_at))) AS since FROM ai_insights");
  const since = result.rows[0]?.since;
  return since === null || since === undefined ? 0 : Math.max(0, Math.ceil(COOLDOWN_SECONDS - Number(since)));
}

const configured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const [enabled, wait, history] = await Promise.all([isEnabled(), secondsUntilNext(), pool.query(`${insightSelect} ORDER BY ai.created_at DESC LIMIT 50`)]);
    return NextResponse.json({ data: { enabled, configured: configured(), cooldownSeconds: wait, model: MODEL, insights: history.rows.map(mapInsight) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/insights failed:", error);
    return NextResponse.json({ error: "Could not load the insights." }, { status: 500 });
  }
}

// One request at a time on this server, so a double click cannot spend twice.
let generating = false;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let body: { action?: unknown; start?: unknown; end?: unknown; enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request is required." }, { status: 400 });
  }

  if (body.action === "set_enabled") {
    const enabled = body.enabled === true;
    try {
      await pool.query(`
        INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ('ai_insights_enabled', $1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      `, [enabled ? "true" : "false", session.adminId]);
      return NextResponse.json({ data: { enabled } });
    } catch (error) {
      console.error("POST /api/insights (set_enabled) failed:", error);
      return NextResponse.json({ error: "Could not change the setting." }, { status: 500 });
    }
  }
  if (body.action !== "generate") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const start = String(body.start ?? "");
  const end = String(body.end ?? "");
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return NextResponse.json({ error: "Choose a valid period." }, { status: 400 });
  if (!(await isEnabled())) return NextResponse.json({ error: "AI insights are turned off. An admin can turn them on at the top of this page." }, { status: 409 });
  if (!configured()) return NextResponse.json({ error: "AI insights are not set up yet: the ANTHROPIC_API_KEY setting is missing on the server." }, { status: 503 });
  const wait = await secondsUntilNext();
  if (wait > 0) return NextResponse.json({ error: `Please wait ${Math.ceil(wait / 60)} more minute${wait > 60 ? "s" : ""} before asking again.`, cooldownSeconds: wait }, { status: 429 });
  if (generating) return NextResponse.json({ error: "Claude is already working on insights. Wait a moment." }, { status: 409 });

  generating = true;
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    const facts = await insightFacts(start, end, today);
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // If Claude declines (not expected for cafe numbers), the API retries on another model
      // instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: CARD_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Facts for ${start} to ${end}:\n${JSON.stringify(facts)}` }],
    });
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "Claude could not write insights for this period. Try another period." }, { status: 502 });
    const text = response.content.find((block) => block.type === "text");
    let parsed: { headline: string; cards: Card[] };
    try {
      parsed = JSON.parse(text && text.type === "text" ? text.text : "");
    } catch {
      return NextResponse.json({ error: "Claude's answer could not be read. Try again." }, { status: 502 });
    }
    const cards = (Array.isArray(parsed.cards) ? parsed.cards : []).filter((card) => card && typeof card.message === "string").slice(0, 5);
    const saved = await pool.query(`
      INSERT INTO ai_insights (period_start, period_end, facts, cards, model, input_tokens, output_tokens, requested_by)
      VALUES ($1::date, $2::date, $3::jsonb, $4::jsonb, $5, $6, $7, $8) RETURNING insight_id
    `, [start, end, JSON.stringify(facts), JSON.stringify({ headline: String(parsed.headline ?? ""), cards }), response.model, response.usage.input_tokens, response.usage.output_tokens, session.adminId]);
    const row = await pool.query(`${insightSelect} WHERE ai.insight_id = $1`, [saved.rows[0].insight_id]);
    return NextResponse.json({ data: mapInsight(row.rows[0]) }, { status: 201 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "The API key was refused. Check ANTHROPIC_API_KEY on the server." }, { status: 503 });
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Claude is busy or the account is out of credits. Try again later." }, { status: 503 });
    if (error instanceof Anthropic.APIConnectionError) return NextResponse.json({ error: "Could not reach Claude. Check the internet connection and try again." }, { status: 503 });
    if (error instanceof Anthropic.APIError) {
      console.error("POST /api/insights: Claude API error:", error.status, error.message);
      // Anthropic's own reason (for example a credit balance that is too low), without the key.
      const reason = (error.error as { error?: { message?: string } } | undefined)?.error?.message ?? error.message;
      return NextResponse.json({ error: `Claude returned an error (${error.status ?? "unknown"}): ${String(reason).slice(0, 300)}` }, { status: 502 });
    }
    console.error("POST /api/insights failed:", error);
    return NextResponse.json({ error: "Could not get insights." }, { status: 500 });
  } finally {
    generating = false;
  }
}
