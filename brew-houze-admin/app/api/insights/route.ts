import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { chartFacts, insightFacts, trendMenuFacts } from "@/lib/insights";
import { getSession } from "@/lib/sessions";

// AI insights (see ai-insights-migration.sql): short predictive warnings and advice written by
// Claude from the cafe's numbers. Claude is asked only when an admin presses the button, never in
// the background, and only while the switch is on. Results are saved, so reading them is free.
//
//   GET  /api/insights                              -> the switch, whether the API key is set, the
//                                                     cooldown, and the saved results (newest first)
//   POST { action: "generate", start, end }         -> works the facts out and asks Claude
//   POST { action: "trends", area }                 -> Claude searches the web for food and drink
//                                                     trends and compares them with the menu
//   POST { action: "set_enabled", enabled }         -> turns AI insights on or off
//
// The key is read from ANTHROPIC_API_KEY in the server environment and never sent to the browser.

// A trends check searches the web and can take about a minute: room for it on Vercel.
export const maxDuration = 180;

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
  const saved = (row.cards ?? {}) as { kind?: unknown; area?: unknown; searches?: unknown };
  return {
    id: Number(row.insight_id),
    // "numbers" (from the cafe's own records) or "trends" (from web searches, compared with the menu).
    kind: saved.kind === "trends" ? "trends" : "numbers",
    area: typeof saved.area === "string" ? saved.area : null,
    searches: Number(saved.searches ?? 0),
    start: String(row.period_start),
    end: String(row.period_end),
    headline: String((row.cards as { headline?: unknown })?.headline ?? ""),
    cards: ((row.cards as { cards?: unknown[] })?.cards ?? []) as (Card | TrendCard)[],
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

// ── Trends: what is popular in food and drinks right now, checked against the menu ──
// Claude searches the web (news, food sites, social coverage) for current food and drink trends in
// the area and across the Philippines (viral drinks, pop-culture and seasonal flavors), then
// compares them with the menu as it is now. The server keeps only source links that came back
// from Claude's own searches, and drops a card with none, so every trend shown has a real source.
const TREND_SEARCHES = 6;
const TREND_FITS = ["on_menu", "add", "watch"] as const;
const TREND_SCOPES = ["local", "philippines", "global"] as const;
const TREND_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One short line summing up what is trending and what it means for this menu, under 100 characters." },
    cards: {
      type: "array",
      description: "4 to 6 cards, the most useful for this cafe first.",
      items: {
        type: "object",
        properties: {
          fit: { type: "string", enum: [...TREND_FITS], description: "on_menu: the cafe already sells it or something very close; add: not on the menu but a good fit; watch: early, popular elsewhere, or a weak fit for now." },
          title: { type: "string", description: "The trend in 2 to 6 words, like 'Sea salt cream drinks'." },
          trend: { type: "string", description: "One or two plain sentences: what it is, where and how recently it is popular, as the sources say." },
          menu_note: { type: "string", description: "One or two plain sentences on how it compares with the menu: name the matching menu items exactly as written in the menu facts, or say what could be added using the ingredients in stock." },
          scope: { type: "string", enum: [...TREND_SCOPES], description: "local: reported for the cafe's area; philippines: across the country; global: worldwide, reaching the Philippines." },
          sources: { type: "array", items: { type: "string" }, description: "The URLs of the search results this trend comes from, copied exactly. Only URLs your searches returned." },
        },
        required: ["fit", "title", "trend", "menu_note", "scope", "sources"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "cards"],
  additionalProperties: false,
} as const;

const TRENDS_PROMPT = `You help the owner of Brew Houze, a small cafe in the Philippines, keep the menu in step with what people want right now. The owner reads your cards on the Insights page of their admin app.

Search the web for food and drink trends that are popular now: in the cafe's area first, then across the Philippines. Look at what Filipinos are talking about: viral drinks and snacks on social media, flavors tied to pop culture (K-dramas, K-pop, anime, movies, local celebrities), seasonal favorites for the current month, and new items from cafe chains. Prefer sources from the last three months. Say how recent a trend is, and leave out anything older than about six months unless the sources show it is still popular now.

You also receive the cafe's current menu and the ingredients in stock, as JSON. Compare every trend with that menu:
- on_menu: the cafe already sells it or something very close. Name the menu items exactly as written, and use their sales in the last 30 days when it helps (for example, a trending drink the cafe sells but rarely sells could be promoted).
- add: not on the menu but a good fit for a small cafe. Say which ingredients in stock it could use and what would be missing.
- watch: early, popular somewhere else, or not a good fit yet.

Only report trends your searches support, and list the exact URLs they came from in sources. Never invent menu items, sales numbers, prices or sources. If the area has little local coverage, say the trend is across the Philippines instead (scope philippines). Write plain, short sentences with no hype and no exclamation marks. Amounts in pesos use the peso sign, for example ₱120.00.`;

type TrendCard = { fit: (typeof TREND_FITS)[number]; title: string; trend: string; menuNote: string; scope: (typeof TREND_SCOPES)[number]; sources: { url: string; title: string; age: string | null }[] };

async function trendArea(): Promise<string> {
  const result = await pool.query("SELECT setting_value FROM store_settings WHERE setting_key = 'ai_trends_area'").catch(() => ({ rows: [] as { setting_value: string }[] }));
  return String(result.rows[0]?.setting_value ?? "").trim() || "the Philippines";
}

async function askTrends(adminId: number, area: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const facts = await trendMenuFacts(today);
  const client = new Anthropic();
  // Searches lean toward the Philippines (and the town, when one is set).
  const city = /philippines/i.test(area) ? undefined : area.split(",")[0].trim().slice(0, 60) || undefined;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `Area: ${area}\nToday: ${today}\nMenu facts:\n${JSON.stringify(facts)}` }];
  const found = new Map<string, { title: string; age: string | null }>();
  let inputTokens = 0, outputTokens = 0, searches = 0;
  let response: Anthropic.Beta.BetaMessage | null = null;
  // A long search can pause partway (pause_turn): send the turn back and the server carries on.
  for (let turn = 0; turn < 4; turn++) {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: TREND_SEARCHES, user_location: { type: "approximate", country: "PH", timezone: TZ, ...(city ? { city } : {}) } }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: TREND_SCHEMA } },
      system: TRENDS_PROMPT,
      messages,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    searches += response.usage.server_tool_use?.web_search_requests ?? 0;
    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const result of block.content) found.set(result.url, { title: result.title, age: result.page_age ?? null });
      }
    }
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response || response.stop_reason === "pause_turn") return { error: "Claude took too long searching. Try again.", status: 502 } as const;
  if (response.stop_reason === "refusal") return { error: "Claude could not check trends right now. Try again later.", status: 502 } as const;
  // The answer is the text after the last search.
  const lastTool = response.content.findLastIndex((block) => block.type !== "text");
  const text = response.content.slice(lastTool + 1).map((block) => (block.type === "text" ? block.text : "")).join("");
  let parsed: { headline?: unknown; cards?: { fit?: string; title?: string; trend?: string; menu_note?: string; scope?: string; sources?: unknown }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "Claude's answer could not be read. Try again.", status: 502 } as const;
  }
  // Only sources Claude's own searches returned; a card without one is left out.
  const cards: TrendCard[] = (Array.isArray(parsed.cards) ? parsed.cards : []).flatMap((card) => {
    const urls = (Array.isArray(card?.sources) ? card.sources : []).map(String);
    const sources = urls.filter((url, index) => found.has(url) && urls.indexOf(url) === index)
      .slice(0, 3).map((url) => ({ url, title: found.get(url)!.title, age: found.get(url)!.age }));
    if (!card || typeof card.trend !== "string" || sources.length === 0) return [];
    return [{
      fit: TREND_FITS.includes(card.fit as TrendCard["fit"]) ? card.fit as TrendCard["fit"] : "watch",
      title: String(card.title ?? ""), trend: card.trend, menuNote: String(card.menu_note ?? ""),
      scope: TREND_SCOPES.includes(card.scope as TrendCard["scope"]) ? card.scope as TrendCard["scope"] : "philippines",
      sources,
    }];
  }).slice(0, 6);
  if (cards.length === 0) return { error: "Claude found no trends it could back with a source. Try again later.", status: 502 } as const;
  const saved = await pool.query(`
    INSERT INTO ai_insights (period_start, period_end, facts, cards, model, input_tokens, output_tokens, requested_by)
    VALUES ($1::date, $1::date, $2::jsonb, $3::jsonb, $4, $5, $6, $7) RETURNING insight_id
  `, [today, JSON.stringify({ kind: "trends", area, ...facts }), JSON.stringify({ kind: "trends", area, searches, headline: String(parsed.headline ?? ""), cards }), response.model, inputTokens, outputTokens, adminId]);
  const row = await pool.query(`${insightSelect} WHERE ai.insight_id = $1`, [saved.rows[0].insight_id]);
  return { data: mapInsight(row.rows[0]) } as const;
}

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  // ?charts=1&start=&end=: the page's charts for a period, from the records alone (no AI, so it works
  // with AI insights off and costs nothing)
  const url = new URL(request.url);
  if (url.searchParams.get("charts")) {
    const start = url.searchParams.get("start") ?? "";
    const end = url.searchParams.get("end") ?? "";
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) return NextResponse.json({ error: "Choose a valid period." }, { status: 400 });
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
      return NextResponse.json({ data: await chartFacts(start, end, today) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("GET /api/insights?charts failed:", error);
      return NextResponse.json({ error: "Could not load the charts." }, { status: 500 });
    }
  }
  try {
    const [enabled, wait, history, area] = await Promise.all([isEnabled(), secondsUntilNext(), pool.query(`${insightSelect} ORDER BY ai.created_at DESC LIMIT 50`), trendArea()]);
    return NextResponse.json({ data: { enabled, configured: configured(), cooldownSeconds: wait, model: MODEL, trendArea: area, insights: history.rows.map(mapInsight) } }, { headers: { "Cache-Control": "no-store" } });
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
  let body: { action?: unknown; start?: unknown; end?: unknown; enabled?: unknown; area?: unknown };
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
  if (body.action !== "generate" && body.action !== "trends") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const start = String(body.start ?? "");
  const end = String(body.end ?? "");
  if (body.action === "generate" && (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end)) return NextResponse.json({ error: "Choose a valid period." }, { status: 400 });
  // Trends: the town or province to look at (kept for next time), or the whole country.
  const area = String(body.area ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "the Philippines";
  if (!(await isEnabled())) return NextResponse.json({ error: "AI insights are turned off. An admin can turn them on at the top of this page." }, { status: 409 });
  if (!configured()) return NextResponse.json({ error: "AI insights are not set up yet: the ANTHROPIC_API_KEY setting is missing on the server." }, { status: 503 });
  const wait = await secondsUntilNext();
  if (wait > 0) return NextResponse.json({ error: `Please wait ${Math.ceil(wait / 60)} more minute${wait > 60 ? "s" : ""} before asking again.`, cooldownSeconds: wait }, { status: 429 });
  if (generating) return NextResponse.json({ error: "Claude is already working on insights. Wait a moment." }, { status: 409 });

  generating = true;
  try {
    if (body.action === "trends") {
      await pool.query(`
        INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ('ai_trends_area', $1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      `, [area, session.adminId]);
      const result = await askTrends(session.adminId, area);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ data: result.data }, { status: 201 });
    }
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
