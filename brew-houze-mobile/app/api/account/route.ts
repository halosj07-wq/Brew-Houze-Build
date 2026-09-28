import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  birthdayProblem, checkCustomerPassword, cleanName, CUSTOMER_COOKIE, emailConfigured, emailProblem, endCustomerSessions,
  getCustomerSession, isUniqueViolation, passwordProblem,
} from "@/lib/customers";
import { cookies } from "next/headers";
import { customerLoyalty } from "@/lib/loyalty";

const NO_STORE = { "Cache-Control": "no-store" };

// The signed-in customer and their recent orders. { data: null } when signed out (not an error:
// the menu works the same for guests).
export async function GET() {
  try {
    const session = await getCustomerSession();
    if (!session) return NextResponse.json({ data: null, canResetByEmail: emailConfigured() }, { headers: NO_STORE });
    const orders = await pool.query(`
      SELECT so.order_id, so.queue_number, so.status, so.total_amount, so.order_source,
        TO_CHAR(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        COALESCE(STRING_AGG(soi.quantity || 'x ' || p.product_name || COALESCE(' (' || pv.size_label || ')', ''), ', ' ORDER BY soi.order_item_id), '') AS items
      FROM sales_orders so
      LEFT JOIN sales_order_items soi ON soi.order_id = so.order_id
      LEFT JOIN products p ON p.product_id = soi.product_id
      LEFT JOIN product_variants pv ON pv.product_variant_id = soi.product_variant_id
      WHERE so.customer_id = $1
      GROUP BY so.order_id
      ORDER BY so.created_at DESC
      LIMIT 20
    `, [session.customerId]);
    const totals = await pool.query("SELECT COUNT(*)::int AS orders, TO_CHAR(MIN(created_at), 'YYYY-MM-DD') AS first_order FROM sales_orders WHERE customer_id = $1 AND status = 'completed'", [session.customerId]);
    // The running loyalty campaign, their stars and the rewards (null when none is running).
    let loyalty: (Awaited<ReturnType<typeof customerLoyalty>> & { history: { kind: string; stars: number; createdAt: string; orderQueue: number | null }[] }) | null = null;
    try {
      const summary = await customerLoyalty(session.customerId);
      if (summary) {
        const history = await pool.query(`
          SELECT e.kind, e.stars, so.queue_number, TO_CHAR(e.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
          FROM loyalty_star_entries e LEFT JOIN sales_orders so ON so.order_id = e.order_id
          WHERE e.customer_id = $1 AND e.campaign_id = $2
          ORDER BY e.created_at DESC, e.entry_id DESC LIMIT 10
        `, [session.customerId, summary.campaign.id]);
        loyalty = { ...summary, history: history.rows.map((row) => ({ kind: String(row.kind), stars: Number(row.stars), createdAt: String(row.created_at), orderQueue: row.queue_number === null ? null : Number(row.queue_number) })) };
      }
    } catch (loyaltyError) {
      console.error("GET /api/account: could not read loyalty stars:", loyaltyError);
    }
    return NextResponse.json({
      data: {
        username: session.username,
        fullName: session.fullName,
        email: session.email,
        birthday: session.birthday,
        orderCount: Number(totals.rows[0]?.orders ?? 0),
        loyalty,
        orders: orders.rows.map((row) => ({
          id: Number(row.order_id),
          queueNumber: row.queue_number === null ? null : Number(row.queue_number),
          status: String(row.status),
          total: Number(row.total_amount),
          source: String(row.order_source) === "online" ? "mobile" : "counter",
          createdAt: String(row.created_at),
          items: String(row.items),
        })),
      },
      canResetByEmail: emailConfigured(),
    }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/account failed:", error);
    return NextResponse.json({ error: "Could not load your account." }, { status: 500 });
  }
}

// Edit details or change the password.
export async function PATCH(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  let body: { action?: unknown; fullName?: unknown; email?: unknown; birthday?: unknown; currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  try {
    if (body.action === "update_profile") {
      const fullName = cleanName(body.fullName);
      const email = String(body.email ?? "").trim().toLowerCase();
      const birthday = String(body.birthday ?? "").trim();
      const problem = !fullName ? "Enter your name." : emailProblem(email) ?? birthdayProblem(birthday);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      await pool.query("UPDATE customers SET full_name = $2, email = NULLIF($3, ''), birthday = NULLIF($4, '')::date, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [session.customerId, fullName, email, birthday]);
      return NextResponse.json({ data: { fullName, email: email || null, birthday: birthday || null } });
    }
    if (body.action === "change_password") {
      const newPassword = String(body.newPassword ?? "");
      const problem = passwordProblem(newPassword);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      if (!(await checkCustomerPassword(session.customerId, body.currentPassword))) return NextResponse.json({ error: "Your current password is incorrect.", field: "currentPassword" }, { status: 403 });
      await pool.query("UPDATE customers SET password_hash = crypt($2, gen_salt('bf')), updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [session.customerId, newPassword]);
      // Other phones signed in with the old password are signed out; this one stays.
      await endCustomerSessions(session.customerId, "password_changed", pool, true);
      return NextResponse.json({ data: { ok: true } });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "Another account already uses this email." }, { status: 409 });
    console.error("PATCH /api/account failed:", error);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }
}

// Deletes the account: personal details are erased and every phone is signed out. Orders stay
// in the café's sales records, no longer linked to a name.
export async function DELETE(request: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!(await checkCustomerPassword(session.customerId, body.password))) return NextResponse.json({ error: "That password is incorrect." }, { status: 403 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE customers
      SET username = NULL, full_name = 'Deleted customer', email = NULL, password_hash = NULL, birthday = NULL, notes = NULL,
        is_active = FALSE, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE customer_id = $1
    `, [session.customerId]);
    await client.query("DELETE FROM customer_password_resets WHERE customer_id = $1", [session.customerId]);
    await endCustomerSessions(session.customerId, "account_deleted", client);
    await client.query("COMMIT");
    (await cookies()).delete(CUSTOMER_COOKIE);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("DELETE /api/account failed:", error);
    return NextResponse.json({ error: "Could not delete your account. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
