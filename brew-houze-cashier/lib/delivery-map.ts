import pool from "@/lib/db";

// The delivery map (see revision-migration.sql), on OpenStreetMap: the café, each delivery in progress where its
// address is, and each rider where their phone last said they were. The same file is in the admin and staff apps.
//
//   addresses  found on the map from the address and the delivery zone with OpenStreetMap's own address search
//              (Nominatim, free; at most two looked up per load and one a second, as its rules ask), nearest the
//              café first. Each is looked up once (again after a day if it was not found) and kept.
//   riders     the rider's phone sends where it is while they have deliveries on the way (POST location, the
//              staff app), every 15 seconds or so. A position older than 15 minutes is not shown.
//   café       a store setting (cafe_lat, cafe_lng), set on the admin's Delivery page.

export type MapStop = {
  id: number; orderId: number; queueNumber: number | null; status: string; recipient: string; address: string; zone: string;
  lat: number | null; lng: number | null; riderId: number | null; riderName: string | null;
  riderLat: number | null; riderLng: number | null; riderSeenAt: string | null; hasProof: boolean;
};
export type DeliveryMapData = { ready: boolean; cafe: { lat: number; lng: number } | null; stops: MapStop[] };

const iso = (column: string) => `TO_CHAR(${column} AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+08:00"')`;
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const missingColumn = (error: unknown) => Boolean(error && typeof error === "object" && ["42703", "42P01"].includes(String((error as { code?: string }).code)));

export async function cafeLocation(): Promise<{ lat: number; lng: number } | null> {
  const result = await pool.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN ('cafe_lat', 'cafe_lng')");
  const value = Object.fromEntries(result.rows.map((row) => [String(row.setting_key), Number(row.setting_value)]));
  return Number.isFinite(value.cafe_lat) && Number.isFinite(value.cafe_lng) ? { lat: value.cafe_lat, lng: value.cafe_lng } : null;
}

// One address on the map, near the café when its place is known: { lat, lng } or null.
async function geocode(query: string, near: { lat: number; lng: number } | null): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ph");
  if (near) url.searchParams.set("viewbox", `${near.lng - 0.35},${near.lat + 0.35},${near.lng + 0.35},${near.lat - 0.35}`);
  const response = await fetch(url, { headers: { "User-Agent": "BrewHouze-POS/1.0 (cafe delivery map)", "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) return null;
  const found = await response.json() as { lat?: string; lon?: string }[];
  const first = found[0];
  return first?.lat && first?.lon ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
}

async function locateMissing(rows: Record<string, unknown>[], cafe: { lat: number; lng: number } | null) {
  const due = rows.filter((row) => row.dest_lat === null && (row.located_hours === null || Number(row.located_hours) >= 24)).slice(0, 2);
  for (const [index, row] of due.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
    const street = String(row.street ?? "").trim(), zone = String(row.zone_name ?? "").trim();
    let spot: { lat: number; lng: number } | null = null;
    try {
      spot = (street ? await geocode(`${street}, ${zone}`, cafe) : null) ?? (zone ? await geocode(zone, cafe) : null);
    } catch { /* offline or too slow: tried again later */ }
    await pool.query("UPDATE deliveries SET dest_lat = $2, dest_lng = $3, dest_located_at = CURRENT_TIMESTAMP WHERE delivery_id = $1", [row.delivery_id, spot?.lat ?? null, spot?.lng ?? null]);
    row.dest_lat = spot?.lat ?? null;
    row.dest_lng = spot?.lng ?? null;
  }
}

// The deliveries packed or on the way (riderId: only that rider's, plus the packed ones nobody took yet).
export async function deliveryMap(riderId: number | null = null): Promise<DeliveryMapData> {
  try {
    const cafe = await cafeLocation();
    const result = await pool.query(`
      SELECT d.delivery_id, d.order_id, so.queue_number, d.status, d.recipient_name, d.street, d.landmark, d.zone_name,
        d.dest_lat, d.dest_lng, EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - d.dest_located_at) / 3600 AS located_hours,
        d.rider_admin_id, rider.full_name AS rider_name,
        CASE WHEN d.rider_seen_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN d.rider_lat END AS rider_lat,
        CASE WHEN d.rider_seen_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN d.rider_lng END AS rider_lng,
        ${iso("d.rider_seen_at")} AS rider_seen_at, d.proof_photo IS NOT NULL AS has_proof
      FROM deliveries d
      JOIN sales_orders so ON so.order_id = d.order_id
      LEFT JOIN admin_users rider ON rider.admin_id = d.rider_admin_id
      WHERE so.status = 'completed' AND d.status IN ('ready', 'out')
        AND ($1::int IS NULL OR d.rider_admin_id = $1 OR d.status = 'ready')
      ORDER BY d.created_at
      LIMIT 40
    `, [riderId]);
    await locateMissing(result.rows, cafe);
    return {
      ready: true,
      cafe,
      stops: result.rows.map((row) => ({
        id: Number(row.delivery_id), orderId: Number(row.order_id), queueNumber: num(row.queue_number), status: String(row.status),
        recipient: String(row.recipient_name), address: `${row.street}${row.landmark ? ` (near ${row.landmark})` : ""}`, zone: String(row.zone_name),
        lat: num(row.dest_lat), lng: num(row.dest_lng), riderId: num(row.rider_admin_id), riderName: (row.rider_name as string | null) ?? null,
        riderLat: num(row.rider_lat), riderLng: num(row.rider_lng), riderSeenAt: (row.rider_seen_at as string | null) ?? null, hasProof: Boolean(row.has_proof),
      })),
    };
  } catch (error) {
    if (missingColumn(error)) return { ready: false, cafe: null, stops: [] };
    throw error;
  }
}
