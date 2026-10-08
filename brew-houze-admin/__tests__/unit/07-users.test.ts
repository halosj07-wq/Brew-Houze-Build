import { vi } from "vitest";
import { unitCases } from "./harness";
import { setDb } from "./fake-db";
import { PATCH as changeAccount, POST as addAccount } from "@/app/api/cashier-accounts/route";

const h = vi.hoisted(() => ({ session: { adminId: 1, role: "admin" } as Record<string, unknown> | null, endAllSessions: null as unknown as ReturnType<typeof import("vitest").vi.fn> }));
vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("@/lib/sessions", async (original) => {
  const { vi: mocks } = await import("vitest");
  h.endAllSessions = mocks.fn(async () => 2);
  return { ...(await original<object>()), getSession: async () => h.session, endAllSessions: (...args: unknown[]) => h.endAllSessions(...args) };
});

// Objective 7 (Admin Portal part). Employee accounts: add, update, deactivate.
const send = async (handler: (request: Request) => Promise<Response>, body: Record<string, unknown>, session: Record<string, unknown> | null = { adminId: 1, role: "admin" }) => {
  h.session = session;
  const response = await handler(new Request("http://admin.test/api/cashier-accounts", { method: "POST", body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
};
const newHire = { fullName: "  Ana Cruz ", email: "Ana@BrewHouze.test", password: "TempPass#1", role: "cashier", canVoidOrders: true, canOpenShift: false };
// The saved account: name, email, password (hashed by crypt in SQL), role, and the four permissions.
const saved = (db: ReturnType<typeof setDb>) => {
  const entry = db.ran(/^INSERT INTO admin_users/)[0];
  if (!entry) return null;
  const p = entry.params;
  return { name: p[0], email: p[1], hashedInSql: /crypt\(\$3, gen_salt\('bf'\)\)/.test(entry.sql), role: p[6], void: p[3], refund: p[4], open: p[5], close: p[7] };
};
const accountDb = (role = "cashier") => setDb([
  [/^INSERT INTO admin_users/, [{ admin_id: 12 }]],
  [/^SELECT LOWER\(role\) AS role FROM admin_users/, role ? [{ role }] : []],
]);

unitCases("admin", "Objective 7 - User Management", [
  { id: "UT-USR-09", fn: "POST /api/cashier-accounts", kind: "Positive", title: "a new cashier is saved with a bcrypt-hashed password and the permissions given", input: "Ana Cruz, cashier, may void",
    expected: { status: 201, account: { name: "Ana Cruz", email: "ana@brewhouze.test", hashedInSql: true, role: "cashier", void: true, refund: false, open: false, close: false } },
    run: async () => { const db = accountDb(); const result = await send(addAccount, newHire); return { status: result.status, account: saved(db) }; } },
  { id: "UT-USR-10", fn: "POST /api/cashier-accounts", kind: "Positive", title: "a new barista gets no cashier permissions, even if sent", input: "Barista with \"may void\" sent",
    expected: { role: "barista", void: false, open: false }, run: async () => { const db = accountDb(); await send(addAccount, { ...newHire, role: "barista", canOpenShift: true }); const account = saved(db)!; return { role: account.role, void: account.void, open: account.open }; } },
  { id: "UT-USR-11", fn: "POST /api/cashier-accounts", kind: "Negative", title: "only staff roles can be given (no admin or owner through this form)", input: "Role \"owner\"",
    expected: { status: 400, body: { error: "Choose cashier, barista, kitchen staff or rider." } }, run: () => { accountDb(); return send(addAccount, { ...newHire, role: "owner" }); } },
  { id: "UT-USR-12", fn: "POST /api/cashier-accounts", kind: "Negative", title: "an invalid email is refused", input: "Email \"ana@brewhouze\"",
    expected: { status: 400, body: { error: "Enter a valid email address. It is used to sign in and to reset the password." } }, run: () => { accountDb(); return send(addAccount, { ...newHire, email: "ana@brewhouze" }); } },
  { id: "UT-USR-13", fn: "POST /api/cashier-accounts", kind: "Boundary", title: "a password of 7 characters is too short (8 is the minimum)", input: "Password \"Temp#12\" (7 characters)",
    expected: { status: 400, body: { error: "Use at least 8 characters for the password." } }, run: () => { accountDb(); return send(addAccount, { ...newHire, password: "Temp#12" }); } },
  { id: "UT-USR-14", fn: "POST /api/cashier-accounts", kind: "Negative", title: "two accounts cannot share an email", input: "Email already used (unique violation)",
    expected: { status: 409, body: { error: "Another account already uses this email." } }, run: () => { setDb([[/^INSERT INTO admin_users/, () => { throw Object.assign(new Error("duplicate key"), { code: "23505" }); }]]); return send(addAccount, newHire); } },
  { id: "UT-USR-15", fn: "PATCH /api/cashier-accounts (update_profile)", kind: "Positive", title: "the admin updates an employee's name and email", input: "Account #12 → \"Ana Reyes\", ana.reyes@brewhouze.test",
    expected: { status: 200, body: { data: { id: 12, fullName: "Ana Reyes", email: "ana.reyes@brewhouze.test" } } }, run: () => { accountDb(); return send(changeAccount, { id: 12, action: "update_profile", fullName: "Ana Reyes", email: "ana.reyes@brewhouze.test" }); } },
  { id: "UT-USR-16", fn: "PATCH /api/cashier-accounts (set_active)", kind: "Positive", title: "a deactivated account is signed out of every device at once", input: "Deactivate account #12 (signed in on 2 devices)",
    expected: { status: 200, active: false, signedOutDevices: 2, endedFor: 12 },
    run: async () => { const db = accountDb(); const result = await send(changeAccount, { id: 12, action: "set_active", isActive: false }); return { status: result.status, active: db.ran(/^UPDATE admin_users SET is_active/)[0]?.params[1], signedOutDevices: result.body.data.signedOutDevices, endedFor: h.endAllSessions.mock.calls.at(-1)?.[0] }; } },
  { id: "UT-USR-17", fn: "PATCH /api/cashier-accounts", kind: "Negative", title: "only an admin can change employee accounts", input: "Session of a cashier",
    expected: { status: 403, body: { error: "Only an admin can change employee accounts." } }, run: () => { accountDb(); return send(changeAccount, { id: 12, action: "set_active", isActive: false }, { adminId: 2, role: "cashier" }); } },
  { id: "UT-USR-18", fn: "PATCH /api/cashier-accounts", kind: "Negative", title: "permissions cannot be given to a barista", input: "Barista #13, \"may void\"",
    expected: { status: 400, body: { error: "Baristas and riders have no cashier permissions. Make them a cashier first." } }, run: () => { accountDb("barista"); return send(changeAccount, { id: 13, canVoidOrders: true }); } },
  { id: "UT-USR-19", fn: "POST /api/cashier-accounts", kind: "Negative", title: "only an admin can add employee accounts", input: "Session of a cashier",
    expected: { status: 403, body: { error: "Only an admin can add employee accounts." }, saved: null }, run: async () => { const db = accountDb(); const result = await send(addAccount, newHire, { adminId: 2, role: "cashier" }); return { ...result, saved: saved(db) }; } },
]);
