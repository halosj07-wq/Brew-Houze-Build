import path from "node:path";
import { loadEnvConfig } from "@next/env";

// The integration tests use the TEST environment (.env.test in brew-houze-cashier): a separate
// PostgreSQL database, the PayMongo sandbox keys, the Gmail SMTP account and the Claude API key.
// Next.js reads .env.test (and not .env.local) when NODE_ENV is "test".
export const CASHIER_DIR = path.resolve(__dirname, "..", "..", "..");
export const ROOT_DIR = path.resolve(CASHIER_DIR, "..");

export function loadTestEnv(): NodeJS.ProcessEnv {
  (process.env as Record<string, string>).NODE_ENV = "test";
  loadEnvConfig(CASHIER_DIR, false, { info: () => undefined, error: console.error }, true);
  const env = process.env;
  if (!env.DB_HOST || !env.DB_NAME || !/test/i.test(env.DB_NAME)) {
    throw new Error("The integration tests need brew-houze-cashier/.env.test with a test database (DB_NAME must contain \"test\").");
  }
  return env;
}

// The four apps, started on these ports against the test database.
export const APPS = {
  mobile: { dir: "brew-houze-mobile", port: 4101 },
  cashier: { dir: "brew-houze-cashier", port: 4102 },
  admin: { dir: "brew-houze-admin", port: 4103 },
  queue: { dir: "brew-houze-queuescreen", port: 4104 },
} as const;
export type AppName = keyof typeof APPS;
export const urlOf = (app: AppName) => `http://localhost:${APPS[app].port}`;
