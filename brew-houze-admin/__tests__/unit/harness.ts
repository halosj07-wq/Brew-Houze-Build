import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Level 1 (unit) tests as data, grouped by the Specific Objective they verify. Each case names the
// function, the input and the expected output in words (for the test table in Chapter 3), and runs
// the function in isolation: the database, Supabase Realtime, PayMongo and Claude are replaced by
// fakes (see fake-db.ts and the vi.mock calls in each file). The run records the actual output next
// to the expected one in __tests__/results/, from which the tables are made.
export type UnitCase = {
  id: string; // UT-<OBJECTIVE>-<NN>
  fn: string; // the function (or route) under test
  title: string; // the rule it checks
  kind: "Positive" | "Boundary" | "Negative";
  input: string; // the input, in words
  expected: unknown; // what the function must give (compared with toEqual)
  expectedText?: string; // the expected output in words, when the value alone is unclear
  // Calls the function with the input. A throw (or rejection) is caught: the actual output is then
  // { error: "<message>" }.
  run: () => unknown | Promise<unknown>;
};

type Result = { id: string; objective: string; fn: string; title: string; kind: string; input: string; expected: string; actual: string; status: "Passed" | "Failed" };

const show = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number") return Number.isNaN(value) ? "NaN" : String(value);
  return JSON.stringify(value);
};

const call = async (run: () => unknown): Promise<unknown> => {
  try { return await run(); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
};

// Runs every case of one objective (a describe block) and records each result.
export function unitCases(app: string, objective: string, cases: UnitCase[], file = objective) {
  const results: Result[] = [];
  describe(objective, () => {
    for (const unit of cases) {
      it(`${unit.id} ${unit.fn}: ${unit.title}`, async () => {
        const actual = await call(unit.run);
        let status: Result["status"] = "Failed";
        try { expect(actual).toEqual(unit.expected); status = "Passed"; } finally {
          results.push({ id: unit.id, objective, fn: unit.fn, title: unit.title, kind: unit.kind, input: unit.input, expected: unit.expectedText ?? show(unit.expected), actual: show(actual), status });
        }
      });
    }
    afterAll(() => {
      const dir = path.join(process.cwd(), "__tests__", "results");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${app}-${file.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`), JSON.stringify(results, null, 2));
    });
  });
}
