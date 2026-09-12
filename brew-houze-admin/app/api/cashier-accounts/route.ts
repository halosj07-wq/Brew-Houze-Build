import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT admin_id, full_name, email, role, is_active
      FROM admin_users
      WHERE LOWER(role) = 'cashier'
      ORDER BY is_active DESC, full_name ASC
    `);

    return NextResponse.json({
      data: result.rows.map((account) => ({
        id: Number(account.admin_id),
        fullName: account.full_name,
        email: account.email,
        role: account.role,
        isActive: Boolean(account.is_active),
      })),
    });
  } catch (error) {
    console.error("GET /api/cashier-accounts failed:", error);
    return NextResponse.json({ error: "Could not retrieve cashier accounts." }, { status: 500 });
  }
}
