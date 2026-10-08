import { createHash } from "node:crypto";
import { afterEach, beforeEach, vi } from "vitest";
import { unitCases } from "./harness";
import { setDb } from "./fake-db";
import { order, orderDb } from "./order-fixture";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { confirmPassword, isAllowedRole, isQueueOnly } from "@/lib/sessions";
import { verifyChallenge } from "@/lib/two-factor";
import { POST as shiftAction } from "@/app/api/shift/route";

const h = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("@/lib/realtime", () => ({ signalChange: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => ({ ...(await original<object>()), getSession: async () => h.session }));

// Objective 8. Security. Sign-in uses a signed session token (HMAC-SHA256, 8 hours) with a
// server-side session record, passwords are hashed with bcrypt inside PostgreSQL (pgcrypto), a new
// device needs a 6-digit code from email, and every server route checks the role.
const NOW = new Date("2026-10-08T09:00:00+08:00");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("AUTH_SECRET", "unit-test-secret-0123456789"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const user = { adminId: 2, email: "cashier@brewhouze.test", fullName: "Ana Cruz", role: "cashier", sid: "s1" };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());

// The emailed code: login_challenges keeps sha256("<token>:<code>").
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function challengeDb(row: { attempts?: number; expired?: boolean } | null) {
  return setDb([[/FROM login_challenges WHERE token_hash/, row === null ? [] : [{ challenge_id: 81, account_kind: "staff", account_id: 2, code_hash: sha256("tok-abc:482915"), attempts: row.attempts ?? 0, expired: row.expired ?? false }]]]);
}

unitCases("cashier", "Objective 8 - Security", [
  // Session token
  { id: "UT-SEC-01", fn: "createSessionToken / verifySessionToken", kind: "Positive", title: "a signed-in session reads back, valid for 8 hours", input: "Cashier #2 signs in at 9:00 AM",
    expected: { adminId: 2, role: "cashier", expiresInHours: 8 }, run: () => { const payload = verifySessionToken(createSessionToken(user)); return payload && { adminId: payload.adminId, role: payload.role, expiresInHours: (payload.exp - NOW.getTime() / 1000) / 3600 }; } },
  { id: "UT-SEC-02", fn: "verifySessionToken", kind: "Negative", title: "a token whose role was edited to admin is rejected", input: "Token payload changed from cashier to admin, old signature",
    expected: null, run: () => { const token = createSessionToken(user); return verifySessionToken(`${b64({ ...decode(token), role: "admin" })}.${token.split(".")[1]}`); } },
  { id: "UT-SEC-03", fn: "verifySessionToken", kind: "Boundary", title: "a token is refused once its 8 hours are over", input: "Same token 8 hours later",
    expected: null, run: () => { const token = createSessionToken(user); vi.setSystemTime(NOW.getTime() + 8 * 3600 * 1000); return verifySessionToken(token); } },
  { id: "UT-SEC-04", fn: "verifySessionToken", kind: "Boundary", title: "a token is still valid one second before it ends", input: "Same token 7 h 59 min 59 s later",
    expected: 2, run: () => { const token = createSessionToken(user); vi.setSystemTime(NOW.getTime() + (8 * 3600 - 1) * 1000); return verifySessionToken(token)?.adminId; } },
  { id: "UT-SEC-05", fn: "verifySessionToken", kind: "Negative", title: "a token signed with another secret is rejected", input: "Token made with a different AUTH_SECRET",
    expected: null, run: () => { vi.stubEnv("AUTH_SECRET", "someone-elses-secret"); const token = createSessionToken(user); vi.stubEnv("AUTH_SECRET", "unit-test-secret-0123456789"); return verifySessionToken(token); } },
  { id: "UT-SEC-06", fn: "verifySessionToken", kind: "Negative", title: "missing or malformed tokens are rejected", input: "undefined, \"\", \"abc\", \"a.b.c\"",
    expected: [null, null, null, null], run: () => [undefined, "", "abc", "a.b.c"].map((token) => verifySessionToken(token)) },
  { id: "UT-SEC-07", fn: "createSessionToken", kind: "Negative", title: "no tokens are made without the server secret", input: "AUTH_SECRET not set",
    expected: { error: "AUTH_SECRET is not configured." }, run: () => { vi.stubEnv("AUTH_SECRET", ""); return createSessionToken(user); } },
  // Passwords (bcrypt in PostgreSQL)
  { id: "UT-SEC-08", fn: "confirmPassword", kind: "Positive", title: "the password is compared against its bcrypt hash in the database, never in plain text", input: "Admin #1, password \"Cafe#2026\"",
    expected: { ok: true, comparedWithBcrypt: true, sentPassword: "Cafe#2026" },
    run: async () => { const db = setDb([[/password_hash = crypt\(\$2, password_hash\)/, [{ "?column?": 1 }]]]); const ok = await confirmPassword(1, "Cafe#2026"); return { ok, comparedWithBcrypt: db.calls.length === 1, sentPassword: db.calls[0].params[1] }; } },
  { id: "UT-SEC-09", fn: "confirmPassword", kind: "Negative", title: "a wrong password is refused", input: "Admin #1, wrong password",
    expected: false, run: () => { setDb([]); return confirmPassword(1, "guess"); } },
  { id: "UT-SEC-10", fn: "confirmPassword", kind: "Boundary", title: "an empty or over-long password is refused without asking the database", input: "\"\" and 201 characters",
    expected: { results: [false, false], queries: 0 }, run: async () => { const db = setDb([[/crypt/, [{}]]]); const results = [await confirmPassword(1, ""), await confirmPassword(1, "x".repeat(201))]; return { results, queries: db.calls.length }; } },
  // New-device code
  { id: "UT-SEC-11", fn: "verifyChallenge", kind: "Positive", title: "the right code signs in and trusts the device for 30 days", input: "Code 482915 (spaced as \"482 915\")",
    expected: { result: { kind: "staff", accountId: 2 }, trustedDays: 30 },
    run: async () => { const db = challengeDb({}); const result = await verifyChallenge("tok-abc", "482 915", "staff", "Mozilla/5.0 (iPad)"); return { result, trustedDays: db.ran(/^INSERT INTO trusted_devices/)[0]?.params[4] }; } },
  { id: "UT-SEC-12", fn: "verifyChallenge", kind: "Negative", title: "a wrong code counts an attempt and says how many are left", input: "Wrong code, 1 wrong already",
    expected: { error: "That code is not right. 3 tries left.", status: 401 }, run: () => { challengeDb({ attempts: 1 }); return verifyChallenge("tok-abc", "111111", "staff", null); } },
  { id: "UT-SEC-13", fn: "verifyChallenge", kind: "Boundary", title: "the fifth wrong code ends the sign-in", input: "Wrong code, 4 wrong already",
    expected: { error: "That code is not right. Sign in again to get a new one.", status: 401 }, run: () => { challengeDb({ attempts: 4 }); return verifyChallenge("tok-abc", "111111", "staff", null); } },
  { id: "UT-SEC-14", fn: "verifyChallenge", kind: "Negative", title: "after 5 wrong codes even the right code is refused", input: "Right code, 5 wrong already",
    expected: { error: "Too many wrong codes. Sign in again to get a new one.", status: 429 }, run: () => { challengeDb({ attempts: 5 }); return verifyChallenge("tok-abc", "482915", "staff", null); } },
  { id: "UT-SEC-15", fn: "verifyChallenge", kind: "Negative", title: "a code older than 10 minutes is refused", input: "Right code, expired",
    expected: { error: "This code has expired. Ask for a new one, or sign in again.", status: 410 }, run: () => { challengeDb({ expired: true }); return verifyChallenge("tok-abc", "482915", "staff", null); } },
  { id: "UT-SEC-16", fn: "verifyChallenge", kind: "Negative", title: "a code that is not 6 digits is refused before any lookup", input: "\"48291\"",
    expected: { error: "Type the 6-digit code from the email.", status: 400 }, run: () => { challengeDb({}); return verifyChallenge("tok-abc", "48291", "staff", null); } },
  // Role checks (RBAC)
  { id: "UT-SEC-17", fn: "isAllowedRole", kind: "Negative", title: "only staff roles may use the Staff Portal", input: "\"Cashier\", \"rider\", \"customer\", \"owner\"",
    expected: [true, true, false, false], run: () => ["Cashier", "rider", "customer", "owner"].map(isAllowedRole) },
  { id: "UT-SEC-18", fn: "isQueueOnly", kind: "Positive", title: "baristas, kitchen staff and riders are limited to their queue", input: "\"barista\", \"kitchen\", \"rider\", \"cashier\", \"admin\"",
    expected: [true, true, true, false, false], run: () => ["barista", "kitchen", "rider", "cashier", "admin"].map((role) => isQueueOnly({ role })) },
  { id: "UT-SEC-19", fn: "POST /api/shift", kind: "Negative", title: "the server refuses a barista closing the shift, whatever the screen shows", input: "Barista session sends \"close\"",
    expected: { status: 403, code: "queue_only" }, run: async () => { h.session = { adminId: 5, role: "barista", canCloseShift: true }; const response = await shiftAction(new Request("http://staff.test/api/shift", { method: "POST", body: JSON.stringify({ action: "close" }) })); return { status: response.status, code: (await response.json()).code }; } },
  { id: "UT-SEC-20", fn: "POST /api/shift", kind: "Negative", title: "a cashier the admin did not allow cannot open the store", input: "Cashier without \"open shift\" permission",
    expected: { status: 403, error: "Only an admin, or a cashier an admin has allowed, can open the store." }, run: async () => { h.session = { adminId: 2, role: "cashier", canOpenShift: false }; const response = await shiftAction(new Request("http://staff.test/api/shift", { method: "POST", body: JSON.stringify({ action: "open" }) })); return { status: response.status, error: (await response.json()).error }; } },
  // Audit trail
  { id: "UT-SEC-21", fn: "placeOrder", kind: "Positive", title: "every stock change of an order is logged with before, after, the order, who and from where", input: "Cashier #2 sells 1 Spanish Latte",
    expected: { changeType: "order_deduction", milk: { before: 2000, after: 1850, change: -150 }, order: 900, by: 2, from: "cashier" },
    run: async () => { const cafe = orderDb(); await order(cafe.db, {}); const log = cafe.db.ran(/^INSERT INTO inventory_log/).find((entry) => entry.params[0] === 11)!; return { changeType: /'order_deduction'/.test(log.sql) ? "order_deduction" : "?", milk: { before: log.params[4], after: log.params[5], change: log.params[6] }, order: log.params[7], by: log.params[8], from: log.params[9] }; } },
]);
