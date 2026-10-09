import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests (npm test): the business rules in lib/, tested function by function without the
// database. See tests/harness.ts.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node", include: ["tests/**/*.test.ts", "__tests__/unit/**/*.test.ts"] },
});
