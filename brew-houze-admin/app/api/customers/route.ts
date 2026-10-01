import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/password-reset";
import { runningCampaign } from "@/lib/loyalty";
import { getSession } from "@/lib/sessions";
import { forgetTrustedDevices, twoFactorEnabled } from "@/lib/two-factor";

// The customer directory (see customer-accounts-migration.sql): customers who made an account on
// the mobile menu, and profiles the admin made for regulars without one. Purchases fill in from
// sales_orders.customer_id; notes are the admin's own ("hot drinks with a straw").
// Deleted accounts keep their row (sales records point to it) with every personal detail erased.

const TZ = "Asia/Manila";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Db = PoolClient | typeof pool;

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters for the password.`;
  return null;
}

function usernameProblem(username: string): string | null {
  if (username.length < 3 || username.length > 30) return "Usernames have 3 to 30 characters.";
  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(username)) return "Use only letters, numbers, dots and underscores, starting with a letter or number.";
  return null;
}

function birthdayProblem(birthday: string): string | null {
  if (!birthday) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? new Date(`${birthday}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthday || date.getTime() > Date.now() || date.getUTCFullYear() < 1900) return "Enter a valid birthday, or leave it empty.";
  return null;
}

function cleanName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function uniqueMessage(error: { constraint?: string }): string {
  return String(error.constraint ?? "").includes("email") ? "Another customer already uses this email." : "That username is taken.";
}

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can manage customers." }, { status: 403 }) };
  return { session };
}

async function endCustomerSessions(customerId: number, reason: "password_reset" | "signed_out_by_admin" | "deactivated" | "account_deleted", db: Db = pool): Promise<number> {
  const result = await db.query("UPDATE customer_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2 WHERE customer_id = $1 AND ended_at IS NULL", [customerId, reason]);
  return result.rowCount ?? 0;
}

// A Philippine mobile number as 09XXXXXXXXX (the same rule as the mobile menu), or null.
function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("63") ? `0${digits.slice(2)}` : digits.startsWith("9") ? `0${digits}` : digits;
  return /^09\d{9}$/.test(local) ? local : null;
}

// A saved discount ID is forgotten after 30 days without use (the same rule as savedIdDiscount in
// the mobile menu's lib/id-verifications.ts): from when it was checked or last gave a discount.
async function forgetStaleSavedIds() {
  await pool.query(`
    UPDATE customers c SET id_discount_type_id = NULL, id_discount_name = NULL, id_discount_number = NULL, id_verified_at = NULL, id_verified_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE c.id_verified_at IS NOT NULL AND GREATEST(c.id_verified_at, (
      SELECT MAX(od.created_at) FROM order_discounts od JOIN sales_orders so ON so.order_id = od.order_id
      WHERE so.customer_id = c.customer_id AND so.status = 'completed' AND od.discount_type_id = c.id_discount_type_id
    )) < CURRENT_TIMESTAMP - INTERVAL '30 days'
  `);
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  try {
    await forgetStaleSavedIds().catch((error) => console.error("GET /api/customers: could not forget old saved IDs:", error));
    const result = await pool.query(`
      SELECT c.customer_id, c.username, c.full_name, c.email, TO_CHAR(c.birthday, 'YYYY-MM-DD') AS birthday, c.notes, c.is_active,
        (c.username IS NOT NULL AND c.password_hash IS NOT NULL) AS has_login,
        c.consented_at IS NOT NULL AS consented,
        TO_CHAR(c.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at,
        creator.full_name AS created_by,
        COALESCE(o.visits, 0) AS visits, COALESCE(o.spent, 0) AS spent, COALESCE(o.visits_30d, 0) AS visits_30d,
        TO_CHAR(o.last_visit AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS last_visit,
        fav.product_name AS favourite,
        (SELECT COUNT(*)::int FROM customer_sessions s WHERE s.customer_id = c.customer_id AND s.ended_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP) AS devices,
        c.phone, c.cod_blocked, c.cod_block_reason,
        COALESCE((SELECT json_agg(json_build_object('id', a.address_id, 'label', a.label, 'recipientName', a.recipient_name, 'phone', a.phone, 'street', a.street, 'landmark', a.landmark, 'riderNotes', a.rider_notes, 'zoneName', z.name, 'isDefault', a.is_default) ORDER BY a.is_default DESC, a.updated_at DESC)
          FROM customer_addresses a LEFT JOIN delivery_zones z ON z.zone_id = a.zone_id WHERE a.customer_id = c.customer_id), '[]'::json) AS addresses,
        saved_type.name AS saved_id_type, c.id_discount_name, c.id_discount_number, verifier.full_name AS id_verified_by,
        TO_CHAR(c.id_verified_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS id_verified_at
      FROM customers c
      LEFT JOIN admin_users creator ON creator.admin_id = c.created_by_admin_id
      LEFT JOIN discount_types saved_type ON saved_type.discount_type_id = c.id_discount_type_id
      LEFT JOIN admin_users verifier ON verifier.admin_id = c.id_verified_by
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS visits, SUM(so.total_amount) AS spent, MAX(so.created_at) AS last_visit,
          COUNT(*) FILTER (WHERE so.created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '30 days')::int AS visits_30d
        FROM sales_orders so WHERE so.customer_id = c.customer_id AND so.status = 'completed'
      ) o ON TRUE
      LEFT JOIN LATERAL (
        SELECT p.product_name FROM sales_orders so
        JOIN sales_order_items soi ON soi.order_id = so.order_id
        JOIN products p ON p.product_id = soi.product_id
        WHERE so.customer_id = c.customer_id AND so.status = 'completed'
        GROUP BY p.product_name ORDER BY SUM(soi.quantity) DESC, p.product_name LIMIT 1
      ) fav ON TRUE
      WHERE c.deleted_at IS NULL
      ORDER BY LOWER(c.full_name), c.customer_id
    `);
    // Stars in the running loyalty campaign (null when none is running or loyalty is not set up).
    const campaign = await runningCampaign().catch(() => null);
    const balances = new Map<number, number>();
    if (campaign) {
      const stars = await pool.query("SELECT customer_id, SUM(stars)::int AS balance FROM loyalty_star_entries WHERE campaign_id = $1 GROUP BY customer_id", [campaign.id]);
      stars.rows.forEach((row) => balances.set(Number(row.customer_id), Number(row.balance)));
    }
    return NextResponse.json({
      campaign,
      data: result.rows.map((row) => ({
        stars: campaign ? balances.get(Number(row.customer_id)) ?? 0 : null,
        id: Number(row.customer_id),
        username: (row.username as string | null) ?? null,
        fullName: String(row.full_name),
        email: (row.email as string | null) ?? null,
        birthday: (row.birthday as string | null) ?? null,
        notes: String(row.notes ?? ""),
        isActive: Boolean(row.is_active),
        hasLogin: Boolean(row.has_login),
        consented: Boolean(row.consented),
        createdAt: String(row.created_at),
        createdBy: (row.created_by as string | null) ?? null,
        visits: Number(row.visits),
        visits30d: Number(row.visits_30d),
        spent: Number(row.spent),
        lastVisit: (row.last_visit as string | null) ?? null,
        favourite: (row.favourite as string | null) ?? null,
        devices: Number(row.devices),
        // Delivery: mobile number, saved addresses, and whether cash on delivery is blocked.
        phone: (row.phone as string | null) ?? null,
        codBlocked: Boolean(row.cod_blocked),
        codBlockReason: (row.cod_block_reason as string | null) ?? null,
        addresses: Array.isArray(row.addresses) ? row.addresses : [],
        // A senior, PWD or other ID the café checked and remembered (from the mobile menu).
        savedId: row.id_verified_at && row.id_discount_name ? { typeName: String(row.saved_id_type ?? "Discount"), holderName: String(row.id_discount_name), idNumber: (row.id_discount_number as string | null) ?? null, verifiedAt: String(row.id_verified_at), verifiedBy: (row.id_verified_by as string | null) ?? null } : null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/customers failed:", error);
    return NextResponse.json({ error: "Could not load the customers." }, { status: 500 });
  }
}

// Adds a customer profile. A login (username and temporary password) is optional: many regulars
// only need their notes and purchases kept.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: { fullName?: unknown; email?: unknown; birthday?: unknown; notes?: unknown; username?: unknown; password?: unknown; phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Fill in the customer's details." }, { status: 400 });
  }
  const fullName = cleanName(body.fullName);
  const email = String(body.email ?? "").trim().toLowerCase();
  const birthday = String(body.birthday ?? "").trim();
  const notes = String(body.notes ?? "").trim().slice(0, 1000);
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const withLogin = username !== "" || password !== "";
  const phoneText = String(body.phone ?? "").trim();
  const phone = phoneText ? normalizePhone(phoneText) : null;
  const problem = !fullName ? "Enter the customer's name."
    : email && !EMAIL_RE.test(email) ? "Enter a valid email address, or leave it empty."
    : phoneText && !phone ? "Enter a mobile number like 0917 123 4567, or leave it empty."
    : birthdayProblem(birthday) ?? (withLogin ? usernameProblem(username) ?? passwordProblem(password) : null);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    const result = await pool.query(`
      INSERT INTO customers (full_name, email, birthday, notes, username, password_hash, created_by_admin_id, phone)
      VALUES ($1, NULLIF($2, ''), NULLIF($3, '')::date, NULLIF($4, ''), NULLIF($5, ''), CASE WHEN $6 = '' THEN NULL ELSE crypt($6, gen_salt('bf')) END, $7, $8)
      RETURNING customer_id
    `, [fullName, email, birthday, notes, withLogin ? username : "", withLogin ? password : "", auth.session.adminId, phone]);
    return NextResponse.json({ data: { id: Number(result.rows[0].customer_id) } }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: uniqueMessage(error) }, { status: 409 });
    console.error("POST /api/customers failed:", error);
    return NextResponse.json({ error: "Could not add the customer." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: { id?: unknown; action?: unknown; fullName?: unknown; email?: unknown; birthday?: unknown; notes?: unknown; username?: unknown; password?: unknown; isActive?: unknown; stars?: unknown; reason?: unknown; phone?: unknown; codBlocked?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid customer is required." }, { status: 400 });
  try {
    const existing = await pool.query("SELECT username FROM customers WHERE customer_id = $1 AND deleted_at IS NULL", [id]);
    if (existing.rowCount === 0) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const currentUsername = (existing.rows[0].username as string | null) ?? null;

    if (body.action === "update_profile") {
      const fullName = cleanName(body.fullName);
      const email = String(body.email ?? "").trim().toLowerCase();
      const birthday = String(body.birthday ?? "").trim();
      const phoneText = String(body.phone ?? "").trim();
      const phone = phoneText ? normalizePhone(phoneText) : null;
      const problem = !fullName ? "Enter the customer's name." : email && !EMAIL_RE.test(email) ? "Enter a valid email address, or leave it empty." : phoneText && !phone ? "Enter a mobile number like 0917 123 4567, or leave it empty." : birthdayProblem(birthday);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      await pool.query("UPDATE customers SET full_name = $2, email = NULLIF($3, ''), birthday = NULLIF($4, '')::date, phone = $5, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [id, fullName, email, birthday, phone]);
      return NextResponse.json({ data: { fullName, email: email || null, birthday: birthday || null, phone } });
    }

    // Cash on delivery for this customer: blocked (with a reason) or allowed again.
    if (body.action === "set_cod") {
      const blocked = body.codBlocked === true;
      const reason = blocked ? String(body.reason ?? "").trim().slice(0, 200) || "Blocked by the admin." : null;
      await pool.query("UPDATE customers SET cod_blocked = $2, cod_block_reason = $3, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [id, blocked, reason]);
      return NextResponse.json({ data: { codBlocked: blocked, codBlockReason: reason } });
    }

    if (body.action === "set_notes") {
      const notes = String(body.notes ?? "").trim().slice(0, 1000);
      await pool.query("UPDATE customers SET notes = NULLIF($2, ''), updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [id, notes]);
      return NextResponse.json({ data: { notes } });
    }

    // Gives a profile a login, or sets a temporary password for a customer who forgot theirs.
    // The username is only chosen once. Every signed-in phone is signed out.
    if (body.action === "set_login") {
      const username = currentUsername ?? String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      const problem = usernameProblem(username) ?? passwordProblem(password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      // Signing in emails a code (two-step sign-in), so a login needs an email first.
      if (twoFactorEnabled()) {
        const contact = await pool.query("SELECT email FROM customers WHERE customer_id = $1", [id]);
        if (!contact.rows[0]?.email) return NextResponse.json({ error: "Add their email in Details first: signing in sends a code to it." }, { status: 400 });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE customers SET username = $2, password_hash = crypt($3, gen_salt('bf')), updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [id, username, password]);
        await client.query("DELETE FROM customer_login_failures WHERE username_key = LOWER($1)", [username]);
        const ended = await endCustomerSessions(id, "password_reset", client);
        await forgetTrustedDevices("customer", id, client);
        await client.query("COMMIT");
        return NextResponse.json({ data: { username, signedOutDevices: ended } });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    // Stars added or removed by the admin in the running campaign, always with a reason (for
    // example stars from the old paper cards). Only the admin can do this.
    if (body.action === "adjust_stars") {
      const stars = Number(body.stars);
      const reason = String(body.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
      if (!Number.isInteger(stars) || stars === 0 || Math.abs(stars) > 1000) return NextResponse.json({ error: "Enter a whole number of stars to add or remove (up to 1000)." }, { status: 400 });
      if (!reason) return NextResponse.json({ error: "Write the reason, for example: stars from the paper card." }, { status: 400 });
      const campaign = await runningCampaign();
      if (!campaign) return NextResponse.json({ error: "No loyalty campaign is running. Start one in Loyalty first." }, { status: 409 });
      await pool.query("INSERT INTO loyalty_star_entries (customer_id, campaign_id, kind, stars, reason, admin_id) VALUES ($1, $2, 'adjusted', $3, $4, $5)", [id, campaign.id, stars, reason, auth.session.adminId]);
      const balance = await pool.query("SELECT COALESCE(SUM(stars), 0)::int AS balance FROM loyalty_star_entries WHERE customer_id = $1 AND campaign_id = $2", [id, campaign.id]);
      return NextResponse.json({ data: { stars: Number(balance.rows[0].balance) } });
    }

    // Removes the ID remembered for discounts (the customer can do this themselves too).
    if (body.action === "forget_id") {
      await pool.query("UPDATE customers SET id_discount_type_id = NULL, id_discount_name = NULL, id_discount_number = NULL, id_verified_at = NULL, id_verified_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [id]);
      return NextResponse.json({ data: { savedId: null } });
    }

    if (body.action === "sign_out_everywhere") {
      return NextResponse.json({ data: { signedOutDevices: await endCustomerSessions(id, "signed_out_by_admin") } });
    }

    // A deactivated customer cannot sign in; their profile, notes and purchases stay.
    if (body.action === "set_active") {
      const isActive = body.isActive === true;
      await pool.query("UPDATE customers SET is_active = $2, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1", [id, isActive]);
      const ended = isActive ? 0 : await endCustomerSessions(id, "deactivated");
      return NextResponse.json({ data: { isActive, signedOutDevices: ended } });
    }

    // A customer asked for their data to be erased (Data Privacy Act): the same as deleting the
    // account from the mobile menu. Their past orders stay in the sales records without a name.
    if (body.action === "erase") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`
          UPDATE customers
          SET username = NULL, full_name = 'Deleted customer', email = NULL, password_hash = NULL, birthday = NULL, notes = NULL,
            id_discount_type_id = NULL, id_discount_name = NULL, id_discount_number = NULL, id_verified_at = NULL, id_verified_by = NULL,
            phone = NULL, cod_blocked = FALSE, cod_block_reason = NULL,
            is_active = FALSE, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE customer_id = $1
        `, [id]);
        await client.query("DELETE FROM customer_password_resets WHERE customer_id = $1", [id]);
        await client.query("DELETE FROM customer_addresses WHERE customer_id = $1", [id]);
        await endCustomerSessions(id, "account_deleted", client);
        await client.query("COMMIT");
        return NextResponse.json({ data: { erased: true } });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: uniqueMessage(error) }, { status: 409 });
    console.error("PATCH /api/customers failed:", error);
    return NextResponse.json({ error: "Could not update the customer." }, { status: 500 });
  }
}

// Customers are never deleted outright: their orders are sales records. Use "erase" instead.
export async function DELETE() {
  return NextResponse.json({ error: "Customers are kept with their sales records. Erase their personal details instead." }, { status: 403 });
}
