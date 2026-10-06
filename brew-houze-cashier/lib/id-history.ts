import pool from "@/lib/db";

// Has this ID been used for a discount before? Shown to the cashier when they confirm an ID, at the
// counter or for a photo sent from the mobile menu. The same ID number (spaces, dashes and case
// ignored) for the same discount, on orders that were not voided or refunded.

export type IdHistory = {
  uses: number;
  usesToday: number;
  lastUsedAt: string | null;
  // The names it was given under, most recent first (up to 4).
  names: string[];
};

const EMPTY: IdHistory = { uses: 0, usesToday: 0, lastUsedAt: null, names: [] };

export async function idHistory(discountTypeId: number | null, typeCode: string, idNumber: string | null): Promise<IdHistory> {
  const key = (idNumber ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.length < 3) return EMPTY;
  const result = await pool.query(`
    WITH used AS (
      SELECT od.holder_name, od.created_at
      FROM order_discounts od JOIN sales_orders so ON so.order_id = od.order_id
      WHERE regexp_replace(LOWER(COALESCE(od.id_number, '')), '[^a-z0-9]', '', 'g') = $3
        AND (od.discount_type_id = $1 OR (od.discount_type_id IS NULL AND od.type_code = $2) OR ($1::int IS NULL AND od.type_code = $2))
        AND LOWER(so.status) NOT IN ('void', 'voided', 'refund', 'refunded') AND so.is_archived = FALSE
    )
    SELECT COUNT(*)::int AS uses,
      COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Manila')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)::int AS uses_today,
      TO_CHAR(MAX(created_at) AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS last_used_at,
      (SELECT ARRAY_AGG(name) FROM (
        SELECT MIN(holder_name) AS name FROM used GROUP BY LOWER(holder_name) ORDER BY MAX(created_at) DESC LIMIT 4
      ) recent) AS names
    FROM used
  `, [discountTypeId, typeCode, key]);
  const row = result.rows[0];
  if (!row || Number(row.uses) === 0) return EMPTY;
  return { uses: Number(row.uses), usesToday: Number(row.uses_today), lastUsedAt: (row.last_used_at as string | null) ?? null, names: (row.names as string[] | null) ?? [] };
}
