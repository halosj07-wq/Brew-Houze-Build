import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

// The ID discount register: every senior, PWD and other ID discount given between two business
// dates (?from=YYYY-MM-DD&to=YYYY-MM-DD), with the name and ID number, what it covered, the VAT
// removed and the discount. This is the record the café keeps for senior and PWD sales (the
// discount is claimed as a tax deduction). Voided and refunded orders are listed but marked.

const TZ = "Asia/Manila";
const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()));

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can see the discount register." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!isDate(from) || !isDate(to) || from > to) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  try {
    const result = await pool.query(`
      SELECT r.*, TO_CHAR(r.bd, 'YYYY-MM-DD') AS bd_text FROM (
        SELECT od.order_discount_id, od.type_code, od.type_name, od.holder_name, od.id_number, od.coverage, od.group_size,
          od.covered_amount, od.vat_exempt_amount, od.discount_amount,
          so.order_id, so.queue_number, so.shift_id, so.status, so.order_source,
          LOWER(so.status) IN ('void', 'voided', 'refund', 'refunded') AS reversed,
          COALESCE((sh.opened_at AT TIME ZONE '${TZ}')::date, DATE(so.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${TZ}')) AS bd,
          TO_CHAR(od.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS at,
          cashier.full_name AS cashier_name
        FROM order_discounts od
        JOIN sales_orders so ON so.order_id = od.order_id
        LEFT JOIN shifts sh ON sh.shift_id = so.shift_id
        LEFT JOIN admin_users cashier ON cashier.admin_id = COALESCE(od.recorded_by, so.cashier_admin_id)
      ) r
      WHERE r.bd BETWEEN $1::date AND $2::date
      ORDER BY r.at DESC, r.order_discount_id DESC
      LIMIT 5000
    `, [from, to]);
    const n = (value: unknown) => Number(value ?? 0);
    return NextResponse.json({
      data: result.rows.map((row) => ({
        id: Number(row.order_discount_id),
        at: String(row.at),
        businessDate: String(row.bd_text),
        orderId: Number(row.order_id),
        queueNumber: row.queue_number === null ? null : Number(row.queue_number),
        shiftId: row.shift_id === null ? null : Number(row.shift_id),
        reversed: Boolean(row.reversed),
        status: String(row.status),
        code: String(row.type_code),
        typeName: String(row.type_name),
        holderName: String(row.holder_name),
        idNumber: (row.id_number as string | null) ?? null,
        groupSize: row.group_size === null ? null : Number(row.group_size),
        coveredAmount: n(row.covered_amount),
        vatExempt: n(row.vat_exempt_amount),
        discount: n(row.discount_amount),
        cashierName: (row.cashier_name as string | null) ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/discounts/register failed:", error);
    return NextResponse.json({ error: "Could not load the discount register." }, { status: 500 });
  }
}
