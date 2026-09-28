import type { PoolClient } from "pg";
import pool from "@/lib/db";

// The seasonal loyalty campaign earning stars right now: switched on, and today (Philippine
// date) within its dates. (The birthday campaign gives treats, not stars.) The staff and mobile apps use the same rule (their lib/loyalty.ts).
export async function runningCampaign(db: PoolClient | typeof pool = pool): Promise<{ id: number; name: string } | null> {
  const result = await db.query(`
    SELECT campaign_id, name FROM loyalty_campaigns
    WHERE kind = 'seasonal' AND is_active AND starts_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
      AND (ends_on IS NULL OR ends_on >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)
    LIMIT 1
  `);
  return result.rows[0] ? { id: Number(result.rows[0].campaign_id), name: String(result.rows[0].name) } : null;
}
