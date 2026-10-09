import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Level 2 (integration) cases as data, like the unit cases: the modules handing data to each other,
// the scenario and the expected result in words, then the run against the running apps, the test
// database and the real outside services. The actual result is recorded next to the expected one in
// __tests__/results/integration.json. Cases run in order (later ones build on earlier ones).
export type IntegrationCase = {
  id: string; // IT-NN
  modules: string; // "Module A → Module B"
  scenario: string;
  expected: unknown;
  expectedText: string;
  run: () => Promise<unknown>;
};

type Result = { id: string; modules: string; scenario: string; expected: string; actual: string; status: "Passed" | "Failed"; ms: number };

const show = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

export function integrationCases(cases: IntegrationCase[]) {
  const results: Result[] = [];
  describe("Level 2 - Integration", () => {
    for (const test of cases) {
      it(`${test.id} ${test.modules}: ${test.scenario}`, async () => {
        const started = Date.now();
        let actual: unknown;
        try { actual = await test.run(); } catch (error) { actual = { error: error instanceof Error ? error.message : String(error) }; }
        let status: Result["status"] = "Failed";
        try { expect(actual).toEqual(test.expected); status = "Passed"; } finally {
          results.push({ id: test.id, modules: test.modules, scenario: test.scenario, expected: test.expectedText, actual: show(actual), status, ms: Date.now() - started });
        }
      });
    }
    afterAll(() => {
      const dir = path.join(process.cwd(), "__tests__", "results");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "integration.json"), JSON.stringify(results, null, 2));
    });
  });
}
