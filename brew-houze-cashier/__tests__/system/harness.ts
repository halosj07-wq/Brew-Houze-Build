import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REQUIREMENTS } from "./requirements";

// Level 3 (system) cases as data: the requirement, the scenario a user would perform, and the
// expected result, all written before the run; then the run through the apps' own HTTP interface
// (the same requests their screens send). Results go to __tests__/results/system.json.
export type SystemCase = {
  id: string; // TC-<MOD>-NNN
  fr: keyof typeof REQUIREMENTS;
  kind: "Positive" | "Negative";
  scenario: string;
  expectedText: string;
  expected: unknown;
  run: () => Promise<unknown>;
};

type Result = { id: string; fr: string; objective: string; kind: string; scenario: string; expected: string; actual: string; status: "Passed" | "Failed" };

export function systemCases(cases: SystemCase[]) {
  const results: Result[] = [];
  describe("Level 3 - System", () => {
    for (const test of cases) {
      it(`${test.id} (${test.fr}) ${test.scenario}`, async () => {
        let actual: unknown;
        try { actual = await test.run(); } catch (error) { actual = { error: error instanceof Error ? error.message : String(error) }; }
        let status: Result["status"] = "Failed";
        try { expect(actual).toEqual(test.expected); status = "Passed"; } finally {
          results.push({ id: test.id, fr: test.fr, objective: REQUIREMENTS[test.fr].objective, kind: test.kind, scenario: test.scenario, expected: test.expectedText, actual: typeof actual === "string" ? actual : JSON.stringify(actual), status });
        }
      });
    }
    afterAll(() => {
      const dir = path.join(process.cwd(), "__tests__", "results");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "system.json"), JSON.stringify(results, null, 2));
    });
  });
}
