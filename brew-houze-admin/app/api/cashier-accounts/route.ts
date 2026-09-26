import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/password-reset";
import { endAllSessions, getSession } from "@/lib/sessions";

// Cashier accounts for Accounts & Employees: who they are, what they may do, whether they are
// on duty, how much they worked and sold, and their recent activity. Only admins reach this app.

const TZ = "Asia/Manila";
const iso = (column: string) => `TO_CHAR(${column} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters for the password.`;
  return null;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await pool.query(`
      SELECT u.admin_id, u.full_name, u.email, u.role, u.is_active, u.can_void_orders, u.can_refund_orders, u.can_open_shift,
        ${iso("u.created_at AT TIME ZONE 'UTC'")} AS created_at,
        (SELECT ${iso("t.time_in")} FROM employee_time_logs t WHERE t.admin_id = u.admin_id AND t.time_out IS NULL AND t.is_archived = FALSE ORDER BY t.time_in DESC LIMIT 1) AS on_duty_since,
        (SELECT ${iso("MAX(s.last_seen_at)")} FROM user_sessions s WHERE s.admin_id = u.admin_id) AS last_seen_at,
        COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(t.time_out, CURRENT_TIMESTAMP) - t.time_in))) / 3600 FROM employee_time_logs t
          WHERE t.admin_id = u.admin_id AND t.is_archived = FALSE AND t.time_in >= (DATE_TRUNC('week', CURRENT_TIMESTAMP AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')), 0) AS hours_this_week,
        COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(t.time_out, CURRENT_TIMESTAMP) - t.time_in))) / 3600 FROM employee_time_logs t
          WHERE t.admin_id = u.admin_id AND t.is_archived = FALSE AND t.time_in >= CURRENT_TIMESTAMP - INTERVAL '30 days'), 0) AS hours_30d,
        (SELECT COUNT(DISTINCT t.shift_id) FROM employee_time_logs t WHERE t.admin_id = u.admin_id AND t.is_archived = FALSE AND t.shift_id IS NOT NULL AND t.time_in >= CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS shifts_30d,
        (SELECT COUNT(*) FROM sales_orders so WHERE so.cashier_admin_id = u.admin_id AND so.is_archived = FALSE AND so.status = 'completed' AND so.created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days') AT TIME ZONE 'UTC')::int AS orders_30d,
        COALESCE((SELECT SUM(so.total_amount) FROM sales_orders so WHERE so.cashier_admin_id = u.admin_id AND so.is_archived = FALSE AND so.status = 'completed' AND so.created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days') AT TIME ZONE 'UTC'), 0) AS sales_30d,
        (SELECT COUNT(*) FROM sales_orders so WHERE so.reversed_by_admin_id = u.admin_id AND so.is_archived = FALSE AND so.reversed_at >= CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS reversals_30d
      FROM admin_users u
      WHERE LOWER(u.role) = 'cashier'
      ORDER BY u.is_active DESC, u.full_name ASC
    `);
    const ids = result.rows.map((account) => Number(account.admin_id));

    const [logs, transactions, reversals, sessions] = await Promise.all([
      pool.query(`
        SELECT * FROM (
          SELECT t.time_log_id, t.admin_id, t.shift_id, ${iso("t.time_in")} AS time_in, ${iso("t.time_out")} AS time_out,
            ROW_NUMBER() OVER (PARTITION BY t.admin_id ORDER BY t.time_in DESC) AS rank
          FROM employee_time_logs t
          WHERE t.admin_id = ANY($1::int[]) AND t.is_archived = FALSE
        ) ranked WHERE rank <= 100 ORDER BY time_in DESC
      `, [ids]),
      pool.query(`
        SELECT * FROM (
          SELECT order_id, cashier_admin_id, total_amount, status, reversal_type, queue_number, shift_id,
            TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
            ${iso("reversed_at")} AS reversed_at,
            ROW_NUMBER() OVER (PARTITION BY cashier_admin_id ORDER BY created_at DESC, order_id DESC) AS rank
          FROM sales_orders
          WHERE cashier_admin_id = ANY($1::int[]) AND is_archived = FALSE
        ) ranked WHERE rank <= 50 ORDER BY created_at DESC
      `, [ids]),
      pool.query(`
        SELECT * FROM (
          SELECT order_id, reversed_by_admin_id, total_amount, status, ${iso("reversed_at")} AS reversed_at,
            ROW_NUMBER() OVER (PARTITION BY reversed_by_admin_id ORDER BY reversed_at DESC, order_id DESC) AS rank
          FROM sales_orders
          WHERE reversed_by_admin_id = ANY($1::int[]) AND is_archived = FALSE
        ) ranked WHERE rank <= 50 ORDER BY reversed_at DESC
      `, [ids]),
      // Devices each person is signed in on right now (both apps).
      pool.query(`
        SELECT session_id, admin_id, app, device_label, ${iso("created_at")} AS signed_in_at, ${iso("last_seen_at")} AS last_seen_at
        FROM user_sessions
        WHERE admin_id = ANY($1::int[]) AND ended_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        ORDER BY last_seen_at DESC
      `, [ids]),
    ]);

    const group = <T,>(rows: Record<string, unknown>[], key: string, map: (row: Record<string, unknown>) => T) => {
      const grouped = new Map<number, T[]>();
      for (const row of rows) grouped.set(Number(row[key]), [...(grouped.get(Number(row[key])) ?? []), map(row)]);
      return grouped;
    };
    const logsBy = group(logs.rows, "admin_id", (row) => ({ id: Number(row.time_log_id), timeIn: row.time_in as string, timeOut: (row.time_out as string | null) ?? null, shiftId: row.shift_id === null ? null : Number(row.shift_id) }));
    const transactionsBy = group(transactions.rows, "cashier_admin_id", (row) => ({ id: Number(row.order_id), amount: Number(row.total_amount), status: row.status as string, createdAt: row.created_at as string, reversalType: (row.reversal_type as string | null) ?? null, reversedAt: (row.reversed_at as string | null) ?? null, queueNumber: row.queue_number === null ? null : Number(row.queue_number), shiftId: row.shift_id === null ? null : Number(row.shift_id) }));
    const reversalsBy = group(reversals.rows, "reversed_by_admin_id", (row) => ({ id: Number(row.order_id), amount: Number(row.total_amount), status: row.status as string, reversedAt: (row.reversed_at as string | null) ?? null }));
    const sessionsBy = group(sessions.rows, "admin_id", (row) => ({ id: Number(row.session_id), app: row.app as string, device: (row.device_label as string | null) ?? "Unknown device", signedInAt: row.signed_in_at as string, lastSeenAt: row.last_seen_at as string }));

    return NextResponse.json({
      data: result.rows.map((account) => {
        const id = Number(account.admin_id);
        return {
          id,
          fullName: account.full_name,
          email: account.email,
          role: account.role,
          isActive: Boolean(account.is_active),
          canVoidOrders: Boolean(account.can_void_orders),
          canRefundOrders: Boolean(account.can_refund_orders),
          canOpenShift: Boolean(account.can_open_shift),
          createdAt: account.created_at,
          onDutySince: account.on_duty_since ?? null,
          lastSeenAt: account.last_seen_at ?? null,
          stats: {
            hoursThisWeek: Number(account.hours_this_week),
            hours30d: Number(account.hours_30d),
            shifts30d: Number(account.shifts_30d),
            orders30d: Number(account.orders_30d),
            sales30d: Number(account.sales_30d),
            reversals30d: Number(account.reversals_30d),
          },
          timeLogs: logsBy.get(id) ?? [],
          transactions: transactionsBy.get(id) ?? [],
          reversals: reversalsBy.get(id) ?? [],
          sessions: sessionsBy.get(id) ?? [],
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not retrieve cashier accounts." }, { status: 500 });
  }
}

// Adds a cashier account. The admin gives them a temporary password to change from the cashier
// app (My Account) after signing in.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const body = await request.json() as { fullName?: unknown; email?: unknown; password?: unknown; canOpenShift?: unknown; canVoidOrders?: unknown; canRefundOrders?: unknown };
    const fullName = String(body.fullName ?? "").trim().slice(0, 120);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!fullName) return NextResponse.json({ error: "Enter the employee's full name." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address. It is used to sign in and to reset the password." }, { status: 400 });
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const result = await pool.query(`
      INSERT INTO admin_users (full_name, email, password_hash, role, is_active, can_void_orders, can_refund_orders, can_open_shift)
      VALUES ($1, $2, crypt($3, gen_salt('bf')), 'cashier', TRUE, $4, $5, $6)
      RETURNING admin_id
    `, [fullName, email, password, body.canVoidOrders === true, body.canRefundOrders === true, body.canOpenShift === true]);
    return NextResponse.json({ data: { id: Number(result.rows[0].admin_id) } }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Another account already uses this email." }, { status: 409 });
    console.error("POST /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not add the employee." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || String(session.role).toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Only an admin can change cashier accounts." }, { status: 403 });
  }

  try {
    const body = await request.json() as { id?: unknown; action?: unknown; canVoidOrders?: unknown; canRefundOrders?: unknown; canOpenShift?: unknown; fullName?: unknown; email?: unknown; password?: unknown; isActive?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid cashier account is required." }, { status: 400 });
    const exists = await pool.query("SELECT 1 FROM admin_users WHERE admin_id = $1 AND LOWER(role) = 'cashier'", [id]);
    if (exists.rowCount === 0) return NextResponse.json({ error: "Cashier account not found." }, { status: 404 });

    // Ends every signed-in device of the account (e.g. a lost phone or an employee leaving).
    // Their attendance ends too, since they are no longer signed in anywhere.
    if (body.action === "sign_out_everywhere") {
      const ended = await endAllSessions(id, "signed_out_by_admin");
      return NextResponse.json({ data: { signedOutDevices: ended } });
    }

    if (body.action === "update_profile") {
      const fullName = String(body.fullName ?? "").trim().slice(0, 120);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!fullName) return NextResponse.json({ error: "Enter the employee's full name." }, { status: 400 });
      if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      await pool.query("UPDATE admin_users SET full_name = $2, email = $3, updated_at = CURRENT_TIMESTAMP WHERE admin_id = $1", [id, fullName, email]);
      return NextResponse.json({ data: { id, fullName, email } });
    }

    // A temporary password from the admin. Every device is signed out so the old one stops working.
    if (body.action === "set_password") {
      const password = String(body.password ?? "");
      const problem = passwordProblem(password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      await pool.query("UPDATE admin_users SET password_hash = crypt($2, gen_salt('bf')), updated_at = CURRENT_TIMESTAMP WHERE admin_id = $1", [id, password]);
      const ended = await endAllSessions(id, "password_reset");
      return NextResponse.json({ data: { signedOutDevices: ended } });
    }

    // Deactivated accounts cannot sign in, and are signed out of every device right away.
    if (body.action === "set_active") {
      const isActive = body.isActive === true;
      await pool.query("UPDATE admin_users SET is_active = $2, updated_at = CURRENT_TIMESTAMP WHERE admin_id = $1", [id, isActive]);
      const ended = isActive ? 0 : await endAllSessions(id, "signed_out_by_admin");
      return NextResponse.json({ data: { isActive, signedOutDevices: ended } });
    }

    // Permissions: only the ones sent are changed.
    const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
    const result = await pool.query(`
      UPDATE admin_users
      SET can_void_orders = COALESCE($2, can_void_orders),
        can_refund_orders = COALESCE($3, can_refund_orders),
        can_open_shift = COALESCE($4, can_open_shift),
        updated_at = CURRENT_TIMESTAMP
      WHERE admin_id = $1
      RETURNING can_void_orders, can_refund_orders, can_open_shift
    `, [id, flag(body.canVoidOrders), flag(body.canRefundOrders), flag(body.canOpenShift)]);
    const row = result.rows[0];
    return NextResponse.json({ data: { canVoidOrders: Boolean(row.can_void_orders), canRefundOrders: Boolean(row.can_refund_orders), canOpenShift: Boolean(row.can_open_shift) } });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Another account already uses this email." }, { status: 409 });
    console.error("PATCH /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not update the account." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || String(session.role).toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Only an admin can clear employee logs." }, { status: 403 });
  }
  try {
    const body = await request.json() as { id?: unknown; confirmation?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0 || body.confirmation !== "CLEAR_EMPLOYEE_LOGS") {
      return NextResponse.json({ error: "Explicit employee log confirmation is required." }, { status: 400 });
    }
    const result = await pool.query(
      "UPDATE employee_time_logs SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP, archived_by = $2 WHERE admin_id = $1 AND is_archived = FALSE RETURNING time_log_id",
      [id, session.adminId ?? null]
    );
    return NextResponse.json({ data: { deletedCount: result.rowCount ?? 0 } });
  } catch (error) {
    console.error("DELETE /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not clear employee log history." }, { status: 500 });
  }
}
