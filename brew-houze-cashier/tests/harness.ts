import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Unit tests as data: each case names the function, the input and the expected output in words
// (for the unit test table in the manuscript), and runs the function. The run records the actual
// output next to the expected one in tests/results/unit-results.json, from which the table is made.
export type UnitCase = {
  id: string; // UT-<MODULE>-<NN>
  fn: string; // the function under test
  title: string; // the rule it checks
  input: string; // the input, in words
  expected: unknown; // what the function must return (compared with toEqual)
  expectedText?: string; // the expected output in words, when the value alone is unclear
  // The function, called with the input. Throws are caught: the expected value is then
  // { error: "<message>" }.
  run: () => unknown;
};

type Result = { id: string; module: string; fn: string; title: string; input: string; expected: string; actual: string; status: "Passed" | "Failed" };

const show = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number") return Number.isNaN(value) ? "NaN" : String(value);
  return JSON.stringify(value);
};

const call = (run: () => unknown): unknown => {
  try { return run(); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
};

// Runs every case of a module (a describe block) and records each result.
export function unitCases(app: string, module: string, cases: UnitCase[]) {
  const results: Result[] = [];
  describe(`${module}`, () => {
    for (const unit of cases) {
      it(`${unit.id} ${unit.fn}: ${unit.title}`, () => {
        const actual = call(unit.run);
        let status: Result["status"] = "Failed";
        try { expect(actual).toEqual(unit.expected); status = "Passed"; } finally {
          results.push({ id: unit.id, module, fn: unit.fn, title: unit.title, input: unit.input, expected: unit.expectedText ?? show(unit.expected), actual: show(actual), status });
        }
      });
    }
    afterAll(() => {
      const dir = path.join(process.cwd(), "tests", "results");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${app}-${module.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`), JSON.stringify(results, null, 2));
    });
  });
}
