import { vi } from "vitest";

// A stand-in for PostgreSQL (the pg pool and its clients). Each rule pairs a pattern of the SQL
// with the rows it answers; the first rule that matches answers, and anything else gets no rows.
// Every query is recorded, so a test can check what would have been written to the database.
//
//   vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
//   const db = setDb([[/FROM shifts/, [{ shift_id: 7 }]]]);

type Row = Record<string, unknown>;
export type Reply = Row[] | { rows?: Row[]; rowCount?: number };
export type Rule = [RegExp, Reply | ((params: unknown[], sql: string) => Reply | Promise<Reply>)];
export type Call = { sql: string; params: unknown[] };

const tidy = (sql: string) => sql.replace(/\s+/g, " ").trim();

export function fakeDb(rules: Rule[]) {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = tidy(sql);
    calls.push({ sql: text, params });
    for (const [pattern, reply] of rules) {
      if (!pattern.test(text)) continue;
      const value = typeof reply === "function" ? await reply(params, text) : reply;
      const rows = Array.isArray(value) ? value : value.rows ?? [];
      return { rows, rowCount: Array.isArray(value) ? rows.length : value.rowCount ?? rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return {
    client: client as never,
    query,
    calls,
    connect: vi.fn(async () => client),
    // The recorded queries whose SQL matches.
    ran: (pattern: RegExp) => calls.filter((entry) => pattern.test(entry.sql)),
  };
}

export type FakeDb = ReturnType<typeof fakeDb>;

let current: FakeDb = fakeDb([]);
// Replaces the database every module sees (through the mocked "@/lib/db").
export function setDb(rules: Rule[]): FakeDb {
  current = fakeDb(rules);
  return current;
}

const pool = {
  query: (sql: string, params?: unknown[]) => current.query(sql, params),
  connect: () => current.connect(),
};
export const poolModule = { default: pool };
