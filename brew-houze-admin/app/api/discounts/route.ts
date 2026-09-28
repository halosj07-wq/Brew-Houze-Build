import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// Discounts the counter can give with an ID (see id-discounts-migration.sql), and the shop's VAT
// setting. Senior Citizen and PWD are set by law (20% off, no VAT when the shop is VAT-registered,
// ID required): the admin can only switch them on or off. Student and Employee meal are built in
// and editable. Custom discounts can be added, edited, and deleted while unused.

type DiscountInput = { id?: unknown; action?: unknown; name?: unknown; discountKind?: unknown; discountValue?: unknown; maxDiscount?: unknown; requiresId?: unknown; idLabel?: unknown; isActive?: unknown; registered?: unknown; rate?: unknown };

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  if (String(session.role).toLowerCase() !== "admin") return { error: NextResponse.json({ error: "Only an admin can manage discounts." }, { status: 403 }) };
  return { session };
}

const isStatutory = (code: string) => code === "senior" || code === "pwd";
const REVERSED = "LOWER(so.status) IN ('void', 'voided', 'refund', 'refunded')";

// Checks the editable fields of a discount. Returns the clean values or an error message.
function cleanFields(body: DiscountInput): { name: string; discountKind: "percent" | "fixed"; discountValue: number; maxDiscount: number | null; requiresId: boolean; idLabel: string | null } | string {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 1 || name.length > 60) return "Enter a name (up to 60 characters).";
  const discountKind = body.discountKind === "fixed" ? "fixed" : body.discountKind === "percent" ? "percent" : null;
  if (!discountKind) return "Choose a percentage or a fixed amount.";
  const discountValue = Math.round(Number(body.discountValue) * 100) / 100;
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountKind === "percent" ? discountValue > 100 : discountValue > 100000)) return discountKind === "percent" ? "The percentage must be more than 0 and at most 100." : "Enter an amount more than ₱0.";
  let maxDiscount: number | null = null;
  if (body.maxDiscount !== null && body.maxDiscount !== undefined && body.maxDiscount !== "") {
    maxDiscount = Math.round(Number(body.maxDiscount) * 100) / 100;
    if (!Number.isFinite(maxDiscount) || maxDiscount <= 0 || maxDiscount > 100000) return "The most it can take off must be more than ₱0, or left empty.";
  }
  const requiresId = body.requiresId === true;
  const idLabel = typeof body.idLabel === "string" && body.idLabel.trim() ? body.idLabel.trim().slice(0, 60) : null;
  return { name, discountKind, discountValue, maxDiscount: discountKind === "percent" ? maxDiscount : null, requiresId, idLabel };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const [types, settings] = await Promise.all([
      pool.query(`
        SELECT dt.discount_type_id, dt.code, dt.name, dt.discount_kind, dt.discount_value, dt.max_discount, dt.vat_exempt, dt.requires_id, dt.id_label, dt.is_active,
          COALESCE(u.uses, 0)::int AS uses, COALESCE(u.discount, 0) AS discount, COALESCE(u.vat_exempt, 0) AS vat_exempt, COALESCE(u.uses_month, 0)::int AS uses_month,
          COALESCE(u.all_uses, 0)::int AS all_uses
        FROM discount_types dt
        LEFT JOIN (
          SELECT od.discount_type_id,
            COUNT(*) FILTER (WHERE NOT ${REVERSED}) AS uses,
            SUM(od.discount_amount) FILTER (WHERE NOT ${REVERSED}) AS discount,
            SUM(od.vat_exempt_amount) FILTER (WHERE NOT ${REVERSED}) AS vat_exempt,
            COUNT(*) FILTER (WHERE NOT ${REVERSED} AND date_trunc('month', od.created_at AT TIME ZONE 'Asia/Manila') = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')) AS uses_month,
            COUNT(*) AS all_uses
          FROM order_discounts od JOIN sales_orders so ON so.order_id = od.order_id
          GROUP BY od.discount_type_id
        ) u ON u.discount_type_id = dt.discount_type_id
        ORDER BY dt.sort_order, dt.name, dt.discount_type_id
      `),
      pool.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN ('vat_registered', 'vat_rate')"),
    ]);
    const values = new Map(settings.rows.map((row) => [String(row.setting_key), String(row.setting_value)]));
    const rate = Number(values.get("vat_rate") ?? 12);
    return NextResponse.json({
      data: {
        vat: { registered: values.get("vat_registered") !== "false", rate: Number.isFinite(rate) ? rate : 12 },
        types: types.rows.map((row) => ({
          id: Number(row.discount_type_id),
          code: String(row.code),
          name: String(row.name),
          discountKind: row.discount_kind === "fixed" ? "fixed" : "percent",
          discountValue: Number(row.discount_value),
          maxDiscount: row.max_discount === null ? null : Number(row.max_discount),
          vatExempt: Boolean(row.vat_exempt),
          requiresId: Boolean(row.requires_id),
          idLabel: (row.id_label as string | null) ?? null,
          isActive: Boolean(row.is_active),
          statutory: isStatutory(String(row.code)),
          stats: { uses: Number(row.uses), usesThisMonth: Number(row.uses_month), discount: Number(row.discount), vatExempt: Number(row.vat_exempt), everUsed: Number(row.all_uses) > 0 },
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/discounts failed:", error);
    return NextResponse.json({ error: "Could not load the discounts." }, { status: 500 });
  }
}

// A new custom discount.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json() as DiscountInput;
    const fields = cleanFields(body);
    if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
    const result = await pool.query(`
      INSERT INTO discount_types (code, name, discount_kind, discount_value, max_discount, vat_exempt, requires_id, id_label, is_active, sort_order)
      VALUES ('custom', $1, $2, $3, $4, FALSE, $5, $6, $7, 50)
      RETURNING discount_type_id
    `, [fields.name, fields.discountKind, fields.discountValue, fields.maxDiscount, fields.requiresId, fields.idLabel, body.isActive !== false]);
    return NextResponse.json({ data: { id: Number(result.rows[0].discount_type_id) } }, { status: 201 });
  } catch (error) {
    console.error("POST /api/discounts failed:", error);
    return NextResponse.json({ error: "Could not add the discount." }, { status: 500 });
  }
}

// { action: "vat", registered, rate }: the VAT setting.
// { id, isActive } alone: switch a discount on or off. Otherwise: edit it (not senior or PWD).
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json() as DiscountInput;
    if (body.action === "vat") {
      if (typeof body.registered !== "boolean") return NextResponse.json({ error: "Say whether the shop is VAT-registered." }, { status: 400 });
      const rate = Number(body.rate ?? 12);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 50) return NextResponse.json({ error: "Enter a VAT rate from 1 to 50%." }, { status: 400 });
      for (const [key, value] of [["vat_registered", String(body.registered)], ["vat_rate", String(Math.round(rate * 100) / 100)]]) {
        await pool.query(`
          INSERT INTO store_settings (setting_key, setting_value, updated_by, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
        `, [key, value, auth.session.adminId]);
      }
      return NextResponse.json({ data: { registered: body.registered, rate } });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid discount is required." }, { status: 400 });
    const current = await pool.query("SELECT code FROM discount_types WHERE discount_type_id = $1", [id]);
    if (current.rowCount === 0) return NextResponse.json({ error: "That discount no longer exists." }, { status: 404 });
    const code = String(current.rows[0].code);

    const toggleOnly = body.name === undefined && typeof body.isActive === "boolean";
    if (toggleOnly) {
      await pool.query("UPDATE discount_types SET is_active = $2, updated_at = CURRENT_TIMESTAMP WHERE discount_type_id = $1", [id, body.isActive]);
      return NextResponse.json({ data: { id, isActive: body.isActive } });
    }
    if (isStatutory(code)) return NextResponse.json({ error: "Senior Citizen and PWD discounts are set by law. You can only switch them on or off." }, { status: 400 });
    const fields = cleanFields(body);
    if (typeof fields === "string") return NextResponse.json({ error: fields }, { status: 400 });
    await pool.query(`
      UPDATE discount_types
      SET name = $2, discount_kind = $3, discount_value = $4, max_discount = $5, requires_id = $6, id_label = $7,
        is_active = COALESCE($8, is_active), updated_at = CURRENT_TIMESTAMP
      WHERE discount_type_id = $1
    `, [id, fields.name, fields.discountKind, fields.discountValue, fields.maxDiscount, fields.requiresId, fields.idLabel, typeof body.isActive === "boolean" ? body.isActive : null]);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("PATCH /api/discounts failed:", error);
    return NextResponse.json({ error: "Could not save the discount." }, { status: 500 });
  }
}

// Deletes a custom discount that was never used. Used ones stay for the records: switch them off.
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid discount is required." }, { status: 400 });
  try {
    const current = await pool.query("SELECT code FROM discount_types WHERE discount_type_id = $1", [id]);
    if (current.rowCount === 0) return NextResponse.json({ error: "That discount no longer exists." }, { status: 404 });
    if (String(current.rows[0].code) !== "custom") return NextResponse.json({ error: "Built-in discounts cannot be deleted. Switch it off instead." }, { status: 400 });
    const used = await pool.query("SELECT 1 FROM order_discounts WHERE discount_type_id = $1 LIMIT 1", [id]);
    if ((used.rowCount ?? 0) > 0) return NextResponse.json({ error: "This discount is on past orders, so it stays for the records. Switch it off instead." }, { status: 409 });
    await pool.query("DELETE FROM discount_types WHERE discount_type_id = $1", [id]);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("DELETE /api/discounts failed:", error);
    return NextResponse.json({ error: "Could not delete the discount." }, { status: 500 });
  }
}
