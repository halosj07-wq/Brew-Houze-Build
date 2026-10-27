import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { LOCK_MINUTES, logSecurityEvent, MAX_FAILED_LOGINS, staffLockedUntil } from "@/lib/security-log";
import { getSession } from "@/lib/sessions";

// The Security page (see security-log-migration.sql):
//   GET  ?days=7&group=all&q=text   the log, newest first, with a summary and who is locked now
//   POST { action: "unlock", kind: "staff" | "customer", loginKey }   ends a lockout early
// Admins only.

const TZ = "Asia/Manila";
const iso = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;
const NO_STORE = { "Cache-Control": "no-store" };

// The filter chips on the page.
const GROUPS: Record<string, string[] | null> = {
  all: null,
  signins: ["login_success", "login_failed", "login_refused", "account_locked", "account_unlocked", "new_device_code_sent", "new_device_verified"],
  failed: ["login_failed", "login_refused", "account_locked"],
  passwords: ["password_changed", "password_reset_requested", "password_reset", "password_set_by_admin"],
  accounts: ["account_created", "account_updated", "role_changed", "permissions_changed", "account_deactivated", "account_reactivated", "signed_out_everywhere", "signed_out_other_devices", "account_unlocked"],
};

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can see the security log." }, { status: 403 }) };
  return { session };
}

const isMissingTable = (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const group = url.searchParams.get("group") ?? "all";
  const events = GROUPS[group] === undefined ? null : GROUPS[group];
  const query = String(url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  try {
    const rows = await pool.query(`
      SELECT e.event_id, e.event, e.portal, e.account_kind, e.account_id, e.login_key, e.detail, e.ip, e.device, ${iso("e.created_at")} AS created_at,
        CASE WHEN e.account_kind = 'staff' THEN u.full_name WHEN e.account_kind = 'customer' THEN c.full_name END AS account_name,
        CASE WHEN e.account_kind = 'staff' THEN u.role END AS account_role,
        a.full_name AS actor_name
      FROM security_events e
      LEFT JOIN admin_users u ON e.account_kind = 'staff' AND u.admin_id = e.account_id
      LEFT JOIN customers c ON e.account_kind = 'customer' AND c.customer_id = e.account_id
      LEFT JOIN admin_users a ON a.admin_id = e.actor_admin_id
      WHERE e.created_at > CURRENT_TIMESTAMP - make_interval(days => $1)
        AND ($2::text[] IS NULL OR e.event = ANY($2::text[]))
        AND ($3 = '' OR LOWER(COALESCE(e.login_key, '')) LIKE '%' || $3 || '%' OR LOWER(COALESCE(u.full_name, c.full_name, '')) LIKE '%' || $3 || '%' OR COALESCE(e.ip, '') LIKE '%' || $3 || '%')
      ORDER BY e.created_at DESC, e.event_id DESC
      LIMIT 300
    `, [days, events, query]);

    const summary = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE event = 'login_failed' AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours')::int AS failed_24h,
        COUNT(*) FILTER (WHERE event = 'login_success' AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours')::int AS signins_24h,
        COUNT(*) FILTER (WHERE event = 'account_locked' AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS locks_7d,
        COUNT(*) FILTER (WHERE event = 'new_device_verified' AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days')::int AS new_devices_7d,
        COUNT(*) FILTER (WHERE event IN ('password_changed', 'password_reset', 'password_set_by_admin') AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS passwords_30d
      FROM security_events
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
    `);

    // Locked right now: staff emails (this log) and customer usernames (customer_login_failures).
    const staffKeys = await pool.query(`
      SELECT DISTINCT e.login_key, u.full_name
      FROM security_events e LEFT JOIN admin_users u ON LOWER(u.email) = e.login_key
      WHERE e.event = 'login_failed' AND e.portal IN ('admin', 'staff') AND e.login_key IS NOT NULL
        AND e.created_at > CURRENT_TIMESTAMP - make_interval(mins => $1)
    `, [LOCK_MINUTES]);
    const locked: { kind: "staff" | "customer"; loginKey: string; name: string | null; until: string }[] = [];
    for (const row of staffKeys.rows) {
      const until = await staffLockedUntil(String(row.login_key));
      if (until) locked.push({ kind: "staff", loginKey: String(row.login_key), name: (row.full_name as string | null) ?? null, until: until.toISOString() });
    }
    const customerLocks = await pool.query(`
      SELECT f.username_key, MAX(c.full_name) AS full_name, (MIN(f.created_at) + make_interval(mins => $1)) AS until
      FROM customer_login_failures f LEFT JOIN customers c ON LOWER(c.username) = f.username_key OR LOWER(c.email) = f.username_key
      WHERE f.created_at > CURRENT_TIMESTAMP - make_interval(mins => $1)
      GROUP BY f.username_key
      HAVING COUNT(*) >= $2
    `, [LOCK_MINUTES, MAX_FAILED_LOGINS]);
    for (const row of customerLocks.rows) locked.push({ kind: "customer", loginKey: String(row.username_key), name: (row.full_name as string | null) ?? null, until: new Date(row.until).toISOString() });

    const s = summary.rows[0];
    return NextResponse.json({
      data: {
        ready: true,
        summary: { failed24h: s.failed_24h, signins24h: s.signins_24h, locks7d: s.locks_7d, newDevices7d: s.new_devices_7d, passwords30d: s.passwords_30d },
        locked,
        events: rows.rows.map((row) => ({
          id: Number(row.event_id), event: String(row.event), portal: row.portal as string | null, accountKind: row.account_kind as string | null,
          accountId: row.account_id === null ? null : Number(row.account_id), accountName: (row.account_name as string | null) ?? null, accountRole: (row.account_role as string | null) ?? null,
          loginKey: (row.login_key as string | null) ?? null, actorName: (row.actor_name as string | null) ?? null, detail: (row.detail as string | null) ?? null,
          ip: (row.ip as string | null) ?? null, device: (row.device as string | null) ?? null, createdAt: String(row.created_at),
        })),
      },
    }, { headers: NO_STORE });
  } catch (error) {
    // Before security-log-migration.sql is run, the page says so instead of failing.
    if (isMissingTable(error)) return NextResponse.json({ data: { ready: false, summary: null, locked: [], events: [] } }, { headers: NO_STORE });
    console.error("GET /api/security-events failed:", error);
    return NextResponse.json({ error: "Could not load the security log." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json() as { action?: unknown; kind?: unknown; loginKey?: unknown };
    const loginKey = String(body.loginKey ?? "").trim().toLowerCase().slice(0, 254);
    if (body.action !== "unlock" || !loginKey) return NextResponse.json({ error: "Choose an account to unlock." }, { status: 400 });
    if (body.kind === "customer") {
      await pool.query("DELETE FROM customer_login_failures WHERE username_key = $1", [loginKey]);
      const account = await pool.query("SELECT customer_id FROM customers WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1", [loginKey]);
      await logSecurityEvent({ event: "account_unlocked", portal: "admin", accountKind: account.rowCount ? "customer" : null, accountId: account.rows[0]?.customer_id ?? null, loginKey, actorAdminId: auth.session.adminId, detail: "Unlocked by an admin", request });
    } else {
      // The unlock event itself starts the wrong-password count again.
      const account = await pool.query("SELECT admin_id FROM admin_users WHERE LOWER(email) = $1 LIMIT 1", [loginKey]);
      await logSecurityEvent({ event: "account_unlocked", portal: "admin", accountKind: account.rowCount ? "staff" : null, accountId: account.rows[0]?.admin_id ?? null, loginKey, actorAdminId: auth.session.adminId, detail: "Unlocked by an admin", request });
    }
    return NextResponse.json({ data: { unlocked: loginKey } });
  } catch (error) {
    console.error("POST /api/security-events failed:", error);
    return NextResponse.json({ error: "Could not unlock the account." }, { status: 500 });
  }
}
