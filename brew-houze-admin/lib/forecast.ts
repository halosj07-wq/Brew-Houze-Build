import pool from "@/lib/db";

// Stock forecasting without an AI service (the panel asked for a cheaper way than paid AI): plain statistics on
// the café's own records, worked out here, free to run.
//
//   pace     each stocked item's daily use over the last 8 weeks (sales and write-offs, less what voids and
//            refunds put back), smoothed so recent days count more (exponential smoothing, α 0.3), and a
//            weekday pattern (how much more or less is used on a Saturday than on an average day, pulled
//            toward "no difference" while there are few weeks of data)
//   dates    the days ahead, one by one, at that pace: the day stock reaches its low-stock alert ("restock
//            by") and the day it runs out
//   events   holidays (Philippine holidays and the days cafés get busy) and the café's own events from
//            Promotions & Events in the next 45 days: how much busier such a day has been here (the café's
//            past holidays against the same weekday's usual sales, or else its busiest days against an
//            average one), what each item needs until then at that rush, and what to buy beforehand

const TZ = "Asia/Manila";
const DAY = 86_400_000;
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const n = (value: unknown) => Number(value ?? 0);

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
export const manilaToday = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

// Philippine holidays and the days cafés get busy, Nov 2025 to Dec 2027 (movable ones as proclaimed or
// expected: check the year's proclamation). The past ones measure how much busier such a day is here.
export const HOLIDAYS: { day: string; name: string }[] = [
  ["2025-11-01", "All Saints' Day"], ["2025-11-02", "All Souls' Day"], ["2025-11-30", "Bonifacio Day"], ["2025-12-08", "Immaculate Conception"],
  ["2025-12-24", "Christmas Eve"], ["2025-12-25", "Christmas Day"], ["2025-12-30", "Rizal Day"], ["2025-12-31", "New Year's Eve"],
  ["2026-01-01", "New Year's Day"], ["2026-02-14", "Valentine's Day"], ["2026-02-17", "Chinese New Year"], ["2026-02-25", "EDSA Revolution Anniversary"],
  ["2026-04-02", "Maundy Thursday"], ["2026-04-03", "Good Friday"], ["2026-04-04", "Black Saturday"], ["2026-04-09", "Araw ng Kagitingan"],
  ["2026-05-01", "Labor Day"], ["2026-06-12", "Independence Day"], ["2026-08-21", "Ninoy Aquino Day"], ["2026-08-31", "National Heroes Day"],
  ["2026-11-01", "All Saints' Day"], ["2026-11-02", "All Souls' Day"], ["2026-11-30", "Bonifacio Day"], ["2026-12-08", "Immaculate Conception"],
  ["2026-12-24", "Christmas Eve"], ["2026-12-25", "Christmas Day"], ["2026-12-30", "Rizal Day"], ["2026-12-31", "New Year's Eve"],
  ["2027-01-01", "New Year's Day"], ["2027-02-06", "Chinese New Year"], ["2027-02-14", "Valentine's Day"], ["2027-02-25", "EDSA Revolution Anniversary"],
  ["2027-03-25", "Maundy Thursday"], ["2027-03-26", "Good Friday"], ["2027-03-27", "Black Saturday"], ["2027-04-09", "Araw ng Kagitingan"],
  ["2027-05-01", "Labor Day"], ["2027-06-12", "Independence Day"], ["2027-08-21", "Ninoy Aquino Day"], ["2027-08-30", "National Heroes Day"],
  ["2027-11-01", "All Saints' Day"], ["2027-11-02", "All Souls' Day"], ["2027-11-30", "Bonifacio Day"], ["2027-12-08", "Immaculate Conception"],
  ["2027-12-24", "Christmas Eve"], ["2027-12-25", "Christmas Day"], ["2027-12-30", "Rizal Day"], ["2027-12-31", "New Year's Eve"],
].map(([day, name]) => ({ day, name }));

export type ItemForecast = {
  inventoryId: number; item: string; category: string; unit: string; onHand: number; lowAt: number;
  perDay: number; daysOfData: number; confidence: "low" | "medium" | "high";
  restockBy: string | null; runsOut: string | null; daysLeft: number | null;
  packName: string | null; packSize: number | null;
  daily: (day: string) => number;
};

// Every stocked item's pace and dates. today: Manila date.
export async function itemForecasts(today: string): Promise<ItemForecast[]> {
  const start = addDays(today, -56);
  const [items, usage] = await Promise.all([
    pool.query(`
      SELECT i.inventory_id, i.item_name, i.ingredient_category, i.unit_of_measure, i.quantity, i.low_stock_threshold,
        (i.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')::date::text AS created_day,
        (SELECT pk.packaging_name FROM inventory_packaging pk WHERE pk.inventory_id = i.inventory_id AND pk.is_archived = FALSE ORDER BY pk.last_restocked_at DESC NULLS LAST, pk.packaging_id DESC LIMIT 1) AS pack_name,
        (SELECT pk.content_quantity FROM inventory_packaging pk WHERE pk.inventory_id = i.inventory_id AND pk.is_archived = FALSE ORDER BY pk.last_restocked_at DESC NULLS LAST, pk.packaging_id DESC LIMIT 1) AS pack_size
      FROM inventory i
      WHERE i.is_archived = FALSE AND i.derived_from_inventory_id IS NULL
    `),
    pool.query(`
      SELECT inventory_id, (created_at AT TIME ZONE '${TZ}')::date::text AS day, -SUM(quantity_delta) AS used
      FROM inventory_log
      WHERE change_type IN ('order_deduction', 'written_off', 'void_restore', 'refund_restore')
        AND (created_at AT TIME ZONE '${TZ}')::date >= $1::date AND (created_at AT TIME ZONE '${TZ}')::date < $2::date
      GROUP BY inventory_id, 2
    `, [start, today]),
  ]);
  const used = new Map<number, Map<string, number>>();
  for (const row of usage.rows) {
    const id = n(row.inventory_id);
    if (!used.has(id)) used.set(id, new Map());
    used.get(id)!.set(String(row.day), Math.max(0, n(row.used)));
  }
  return items.rows.map((row) => {
    const id = n(row.inventory_id);
    const byDay = used.get(id) ?? new Map<string, number>();
    // (from the day the item was added, when that was inside the 8 weeks)
    const from = row.created_day && String(row.created_day) > start ? String(row.created_day) : start;
    const series: { day: string; used: number }[] = [];
    for (let day = from; day < today; day = addDays(day, 1)) series.push({ day, used: byDay.get(day) ?? 0 });
    const active = series.filter((entry) => entry.used > 0).length;
    // level: exponentially smoothed daily use, recent days counting more
    let level = series.slice(0, 7).reduce((sum, entry) => sum + entry.used, 0) / Math.max(1, Math.min(7, series.length));
    for (const entry of series.slice(7)) level = 0.3 * entry.used + 0.7 * level;
    const mean = series.reduce((sum, entry) => sum + entry.used, 0) / Math.max(1, series.length);
    const factors = Array.from({ length: 7 }, (_, wd) => {
      const same = series.filter((entry) => weekday(entry.day) === wd);
      if (!same.length || mean <= 0) return 1;
      const ratio = same.reduce((sum, entry) => sum + entry.used, 0) / same.length / mean;
      return (same.length * ratio + 2) / (same.length + 2);
    });
    const daily = (day: string) => level * factors[weekday(day)];
    const onHand = Math.max(0, n(row.quantity));
    const lowAt = n(row.low_stock_threshold);
    let left = onHand, restockBy: string | null = onHand <= lowAt ? today : null, runsOut: string | null = null, daysLeft: number | null = null;
    if (level > 0) {
      for (let k = 0; k < 120 && runsOut === null; k++) {
        const day = addDays(today, k), use = daily(day);
        if (left - use <= lowAt && restockBy === null) restockBy = day;
        if (left - use <= 0) { runsOut = day; daysLeft = round(k + left / Math.max(use, 1e-9), 1); }
        left -= use;
      }
    }
    return {
      inventoryId: id, item: String(row.item_name), category: String(row.ingredient_category ?? ""), unit: String(row.unit_of_measure ?? ""),
      onHand: round(onHand, 3), lowAt: round(lowAt, 3), perDay: round(level, 3), daysOfData: series.length,
      confidence: series.length < 14 || active < 5 ? "low" : series.length < 35 ? "medium" : "high",
      restockBy, runsOut, daysLeft,
      packName: row.pack_name ? String(row.pack_name) : null, packSize: row.pack_size === null ? null : n(row.pack_size),
      daily,
    };
  });
}

// How much busier a holiday has been here: each past holiday's sales against the usual sales on that weekday
// (the 8 weeks before it), averaged. Without any yet: the café's busiest days (the top tenth) against an
// average day. Kept between 1× and 2.5×.
async function holidayRush(today: string): Promise<{ factor: number; basis: string }> {
  const sales = await pool.query(`
    WITH o AS (
      SELECT so.total_amount, COALESCE((sh.opened_at AT TIME ZONE '${TZ}')::date, DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')) AS bd
      FROM sales_orders so LEFT JOIN shifts sh ON sh.shift_id = so.shift_id
      WHERE so.is_archived = FALSE AND so.status NOT IN ('void', 'voided', 'refund', 'refunded')
    )
    SELECT bd::text AS day, SUM(total_amount) AS sales FROM o WHERE bd < $1::date AND bd >= $1::date - 400 GROUP BY bd HAVING SUM(total_amount) > 0
  `, [today]);
  const byDay = new Map(sales.rows.map((row) => [String(row.day), n(row.sales)]));
  const ratios: number[] = [];
  for (const holiday of HOLIDAYS) {
    const on = byDay.get(holiday.day);
    if (!on || holiday.day >= today) continue;
    const usual: number[] = [];
    for (let k = 1; k <= 8; k++) { const before = byDay.get(addDays(holiday.day, -7 * k)); if (before) usual.push(before); }
    if (usual.length >= 2) ratios.push(on / (usual.reduce((sum, value) => sum + value, 0) / usual.length));
  }
  const clamp = (value: number) => Math.min(2.5, Math.max(1, value));
  if (ratios.length) return { factor: round(clamp(ratios.reduce((sum, value) => sum + value, 0) / ratios.length), 2), basis: `your ${ratios.length} past holiday${ratios.length === 1 ? "" : "s"} against the same weekday` };
  const values = [...byDay.values()].sort((a, b) => b - a);
  if (values.length >= 10) {
    const top = values.slice(0, Math.max(1, Math.round(values.length / 10)));
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { factor: round(clamp(top.reduce((sum, value) => sum + value, 0) / top.length / average), 2), basis: "your busiest days against an average day (no holiday recorded yet)" };
  }
  return { factor: 1.3, basis: "too few days recorded yet: assumed 30% busier" };
}

export type EventPlan = {
  name: string; day: string; endDay: string; kind: "holiday" | "event"; daysAway: number; rush: number;
  stock: { item: string; unit: string; onHand: number; need: number; short: number; packs: number | null; packName: string | null; buyBy: string }[];
  products: { product: string; usual: number; expected: number }[];
};

// Holidays and the café's events in the next 45 days, and what to have in stock for each.
export async function eventPlans(today: string, forecasts: ItemForecast[]): Promise<{ rush: number; basis: string; events: EventPlan[] }> {
  const horizon = addDays(today, 45);
  const [rush, events, sold] = await Promise.all([
    holidayRush(today),
    pool.query(`
      SELECT title, (event_starts_at AT TIME ZONE '${TZ}')::date::text AS start_day, (COALESCE(event_ends_at, event_starts_at) AT TIME ZONE '${TZ}')::date::text AS end_day
      FROM promotions
      WHERE kind = 'event' AND is_active = TRUE AND archived_at IS NULL AND event_starts_at IS NOT NULL
        AND (event_starts_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
      ORDER BY event_starts_at
    `, [today, horizon]).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    // the usual daily sales of the best sellers over the last 4 weeks
    pool.query(`
      SELECT p.product_name, SUM(soi.quantity) / 28.0 AS per_day
      FROM sales_orders so JOIN sales_order_items soi ON soi.order_id = so.order_id JOIN products p ON p.product_id = soi.product_id
      WHERE so.is_archived = FALSE AND so.status NOT IN ('void', 'voided', 'refund', 'refunded')
        AND so.created_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '28 days'
      GROUP BY p.product_name ORDER BY 2 DESC LIMIT 6
    `),
  ]);
  const list = [
    ...HOLIDAYS.filter((holiday) => holiday.day >= today && holiday.day <= horizon).map((holiday) => ({ name: holiday.name, day: holiday.day, endDay: holiday.day, kind: "holiday" as const })),
    ...events.rows.map((row) => ({ name: String(row.title), day: String(row.start_day), endDay: String(row.end_day ?? row.start_day), kind: "event" as const })),
  ].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 8);
  return {
    rush: rush.factor,
    basis: rush.basis,
    events: list.map((event) => {
      const eventDays = new Set<string>();
      for (let day = event.day; day <= event.endDay && eventDays.size < 7; day = addDays(day, 1)) eventDays.add(day);
      const stock = forecasts.filter((item) => item.perDay > 0).map((item) => {
        let need = 0;
        for (let day = today; day <= event.endDay; day = addDays(day, 1)) need += item.daily(day) * (eventDays.has(day) ? rush.factor : 1);
        // (keep the low-stock alert's cushion after the event too)
        const short = need + item.lowAt - item.onHand;
        return {
          item: item.item, unit: item.unit, onHand: item.onHand, need: round(need, 2), short: round(Math.max(0, short), 2),
          packs: item.packSize && item.packSize > 0 && short > 0 ? Math.ceil(short / item.packSize) : null, packName: item.packName,
          buyBy: addDays(event.day, -2) < today ? today : addDays(event.day, -2),
        };
      }).filter((line) => line.short > 0).sort((a, b) => b.short / Math.max(b.need, 1e-9) - a.short / Math.max(a.need, 1e-9)).slice(0, 10);
      return {
        ...event, daysAway: daysBetween(today, event.day), rush: rush.factor, stock,
        products: sold.rows.map((row) => ({ product: String(row.product_name), usual: round(n(row.per_day), 1), expected: Math.ceil(n(row.per_day) * rush.factor) })),
      };
    }),
  };
}
