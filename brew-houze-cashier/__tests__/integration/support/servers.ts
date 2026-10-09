import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { APPS, loadTestEnv, ROOT_DIR, urlOf, type AppName } from "./env";
import { rebuildDatabase } from "./db";

// Vitest global setup for the integration tests: rebuilds the test database, then starts the four
// apps (their production builds: run `npm run build` in each app first) against it, and stops them
// at the end. Server output goes to __tests__/results/integration-servers.log.
const children: ChildProcess[] = [];

async function waitFor(url: string, seconds = 60) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not start`);
}

export default async function setup() {
  const env = loadTestEnv();
  await rebuildDatabase(env);
  const { createWriteStream, mkdirSync } = await import("node:fs");
  const logDir = path.join(ROOT_DIR, "brew-houze-cashier", "__tests__", "results");
  mkdirSync(logDir, { recursive: true });
  const log = createWriteStream(path.join(logDir, "integration-servers.log"));
  for (const app of Object.keys(APPS) as AppName[]) {
    const dir = path.join(ROOT_DIR, APPS[app].dir);
    const child = spawn(process.execPath, [path.join(dir, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APPS[app].port)], {
      cwd: dir, env: { ...env, NODE_ENV: "production", PORT: String(APPS[app].port) }, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => log.write(`[${app}] ${chunk}`));
    child.stderr?.on("data", (chunk) => log.write(`[${app}] ${chunk}`));
    children.push(child);
  }
  await Promise.all((Object.keys(APPS) as AppName[]).map((app) => waitFor(urlOf(app))));
  return async () => {
    for (const child of children) child.kill();
    log.end();
  };
}
