import { Pool } from "pg";

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true, ca: process.env.DB_CA },
});

// An idle connection can drop when the network blips (Wi-Fi, DNS, the database restarting).
// Without a listener, that error would crash the server; the pool replaces the connection instead.
pool.on("error", (error) => {
  console.error("Database connection dropped (the next query reconnects):", error.message);
});

export default pool;
