import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests (npm run test:integration): the four apps running against the TEST database
// (.env.test), with the real PayMongo sandbox, Gmail SMTP, Supabase Realtime and Claude API. See
// __tests__/integration/support/servers.ts. One test at a time, in order.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    globalSetup: ["__tests__/integration/support/servers.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 240_000,
  },
});
