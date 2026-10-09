import { defineConfig } from "vitest/config";
import path from "node:path";

// Performance tests (npm run test:performance); same setup as the integration tests: the four apps running against the TEST database
// (.env.test), with the real PayMongo sandbox, Gmail SMTP, Supabase Realtime and Claude API. See
// __tests__/integration/support/servers.ts. One test at a time, in order.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["__tests__/performance/**/*.test.ts"],
    globalSetup: ["__tests__/integration/support/servers.ts"],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 240_000,
  },
});
