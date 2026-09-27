import { Pool } from "pg";

// PostgreSQL on Supabase (Singapore), reached through its connection pooler. The pooler hands
// out real database connections per query, so each app server keeps only a few of its own.
// DB_CA is the Supabase certificate (Database settings > SSL Configuration); the connection is
// always encrypted and the server certificate is always checked.
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true, ...(process.env.DB_CA ? { ca: process.env.DB_CA } : {}) },
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

// An idle connection can drop when the network blips (Wi-Fi, DNS, the database restarting).
// Without a listener, that error would crash the server; the pool replaces the connection instead.
pool.on("error", (error) => {
  console.error("Database connection dropped (the next query reconnects):", error.message);
});

export default pool;