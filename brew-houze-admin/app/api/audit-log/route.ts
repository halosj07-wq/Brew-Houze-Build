import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/sessions";

const TZ = "Asia/Manila";

// The audit log (lib/audit.ts): every change made in the Admin Portal, by which admin, newest first (up to 500).
// ?days= the last 1 to 365 days, ?area= one area, ?admin= one admin's changes.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || String(session.role).toLowerCase() !== "admin") return NextResponse.json({ error: "Only an admin can see the audit log." }, { status: 403 });
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const area = url.searchParams.get("area") || null;
  const admin = Number(url.searchParams.get("admin")) || null;
  try {
    const [rows, admins] = await Promise.all([
      pool.query(`
        SELECT audit_id, admin_id, admin_name, area, action, target, details,
          TO_CHAR(created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"') AS created_at
        FROM admin_audit_log
        WHERE created_at > CURRENT_TIMESTAMP - make_interval(days => $1)
          AND ($2::text IS NULL OR area = $2) AND ($3::int IS NULL OR admin_id = $3)
        ORDER BY created_at DESC, audit_id DESC
        LIMIT 500
      `, [days, area, admin]),
      pool.query(`
        SELECT DISTINCT ON (l.admin_id) l.admin_id, COALESCE(u.full_name, l.admin_name) AS name
        FROM admin_audit_log l LEFT JOIN admin_users u ON u.admin_id = l.admin_id
        WHERE l.admin_id IS NOT NULL ORDER BY l.admin_id
      `),
    ]);
    return NextResponse.json({
      data: {
        ready: true,
        entries: rows.rows.map((row) => ({ id: Number(row.audit_id), adminId: row.admin_id === null ? null : Number(row.admin_id), adminName: row.admin_name, area: String(row.area), action: String(row.action), target: row.target, details: row.details, createdAt: String(row.created_at) })),
        admins: admins.rows.map((row) => ({ id: Number(row.admin_id), name: String(row.name ?? "Admin") })),
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "42P01") return NextResponse.json({ data: { ready: false, entries: [], admins: [] } });
    console.error("GET /api/audit-log failed:", error);
    return NextResponse.json({ error: "Could not load the audit log." }, { status: 500 });
  }
}
