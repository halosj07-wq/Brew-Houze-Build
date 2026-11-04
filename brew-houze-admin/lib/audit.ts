import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The audit log (see admin-audit-log-migration.sql): who changed what in the Admin Portal, and when. With more
// than one admin account, each change can be traced to the admin who made it (Security page, Audit log tab).
//
// audited(area, handler) wraps a route's POST, PATCH, PUT or DELETE: once the handler answers with success, one
// row is written: the signed-in admin, the area (Menu, Inventory, Promotions & Events, …), what was done, the
// thing it was done to (its name or title when the request or the answer has one), and the request's fields.
// Passwords, codes, pictures and other long values are never kept. Logging never gets in the way: if writing
// the row fails (or the table is not there yet), the change still stands and the problem is only printed.

type Handler<Rest extends unknown[], R> = (request: Request, ...rest: Rest) => Promise<R>;

const SECRET = /password|passcode|code$|token|secret|image|photo|picture|data_url|dataurl/i;
const NAME_KEYS = ["title", "product_name", "item_name", "packaging_name", "name", "fullName", "full_name", "category", "category_name", "label", "reward_name", "email"];
const VERBS: Record<string, string> = { POST: "Added", PATCH: "Changed", PUT: "Changed", DELETE: "Removed" };

// The request's fields, minus anything secret or bulky: short values kept as they are.
function clean(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value !== "object") return value;
  if (depth > 3) return "…";
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => clean(entry, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET.test(key))
    .map(([key, entry]) => [key, clean(entry, depth + 1)]));
}

// "restock_packaging: true" → "Restock packaging"; an action field as it is.
function whatWasDone(method: string, body: Record<string, unknown>): string {
  if (typeof body.action === "string" && body.action) return body.action.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  const flag = Object.entries(body).find(([key, value]) => value === true && /_(edit|update|packaging|archive|restore|toggle)$|^(restock|archive|restore|unarchive|reactivate|deactivate)/.test(key));
  if (flag) return flag[0].replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  return VERBS[method] ?? method;
}

function nameIn(source: unknown): string | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  for (const key of NAME_KEYS) if (typeof record[key] === "string" && String(record[key]).trim()) return String(record[key]).trim().slice(0, 160);
  return null;
}

export async function recordAudit(entry: { adminId: number | null; adminName: string | null; area: string; action: string; target: string | null; details: unknown }) {
  try {
    await pool.query(`
      INSERT INTO admin_audit_log (admin_id, admin_name, area, action, target, details)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [entry.adminId, entry.adminName, entry.area, entry.action.slice(0, 120), entry.target, JSON.stringify(entry.details ?? null)]);
  } catch (error) {
    const missing = Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");
    if (!missing) console.error("Audit log: could not write:", error);
  }
}

export function audited<Rest extends unknown[], R extends Response | undefined>(area: string, handler: Handler<Rest, R>): Handler<Rest, R> {
  return async (request, ...rest) => {
    let body: Record<string, unknown> = {};
    try {
      const text = await request.clone().text();
      if (text) { const parsed = JSON.parse(text); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed; }
    } catch { /* not JSON (an upload): only the method and the area are kept */ }
    const response = await handler(request, ...rest);
    if (!response?.ok) return response;
    try {
      const session = await getSession();
      let answer: unknown = null;
      if ((response.headers.get("content-type") ?? "").includes("json")) answer = await response.clone().json().catch(() => null);
      const data = answer && typeof answer === "object" ? (answer as { data?: unknown }).data : null;
      const url = new URL(request.url);
      const id = body.id ?? body.product_id ?? body.inventory_id ?? body.packaging_id ?? body.promotion_id ?? body.discount_id ?? url.searchParams.get("id");
      await recordAudit({
        adminId: session?.adminId ?? null,
        adminName: session?.fullName ?? null,
        area,
        action: whatWasDone(request.method, body),
        target: nameIn(body) ?? nameIn(data) ?? (id !== undefined && id !== null ? `#${id}` : null),
        details: clean(Object.keys(body).length ? body : Object.fromEntries(url.searchParams)),
      });
    } catch (error) {
      console.error("Audit log: could not record:", error);
    }
    return response;
  };
}
