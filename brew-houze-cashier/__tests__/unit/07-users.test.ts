import { vi } from "vitest";
import { unitCases } from "./harness";
import { setDb } from "./fake-db";
import { staffPermissions } from "@/lib/sessions";
import { finishStaffLogin } from "@/lib/login";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

// Objective 7 (Staff Portal part). The role matrix: what each role may do in the Staff Portal.
// Admins may do everything; a cashier only what an admin turned on; baristas, kitchen staff and
// riders never have cashier permissions.
const none = {};
const all = { can_void_orders: true, can_refund_orders: true, can_open_shift: true, can_close_shift: true };
const NOTHING = { canVoidOrders: false, canRefundOrders: false, canOpenShift: false, canCloseShift: false };
const EVERYTHING = { canVoidOrders: true, canRefundOrders: true, canOpenShift: true, canCloseShift: true };

function loginDb(account: Record<string, unknown> | null) {
  return setDb([
    [/FROM admin_users WHERE admin_id = \$1 AND is_active = TRUE/, account ? [{ admin_id: 2, full_name: "Ana Cruz", email: "ana@brewhouze.test", ...account }] : []],
    [/^INSERT INTO user_sessions/, []],
  ]);
}
const signIn = async () => {
  process.env.AUTH_SECRET = "unit-test-secret-0123456789";
  const response = await finishStaffLogin(2, new Request("http://staff.test/api/auth/login", { headers: { "user-agent": "Mozilla/5.0 (iPad)" } }));
  return { status: response.status, body: await response.json() };
};

unitCases("cashier", "Objective 7 - User Management", [
  { id: "UT-USR-01", fn: "staffPermissions", kind: "Positive", title: "an admin may do everything, even with no flags set", input: "Role admin, no permission flags",
    expected: EVERYTHING, run: () => staffPermissions("admin", none) },
  { id: "UT-USR-02", fn: "staffPermissions", kind: "Positive", title: "a cashier has only what the admin turned on", input: "Role cashier, void and open shift on",
    expected: { canVoidOrders: true, canRefundOrders: false, canOpenShift: true, canCloseShift: false }, run: () => staffPermissions("Cashier", { can_void_orders: true, can_open_shift: true }) },
  { id: "UT-USR-03", fn: "staffPermissions", kind: "Boundary", title: "a cashier with no permissions can still sell but not void, refund, open or close", input: "Role cashier, no flags",
    expected: NOTHING, run: () => staffPermissions("cashier", none) },
  { id: "UT-USR-04", fn: "staffPermissions", kind: "Negative", title: "a barista, kitchen staff or rider never has cashier permissions, even with flags left on", input: "Roles barista, kitchen, rider with every flag on",
    expected: [NOTHING, NOTHING, NOTHING], run: () => ["barista", "kitchen", "rider"].map((role) => staffPermissions(role, all)) },
  { id: "UT-USR-05", fn: "staffPermissions", kind: "Negative", title: "an unknown role gets nothing it was not given", input: "Role \"owner\", no flags",
    expected: NOTHING, run: () => staffPermissions("owner", none) },
  { id: "UT-USR-06", fn: "finishStaffLogin", kind: "Positive", title: "signing in gives the session the role's permissions", input: "Cashier allowed to close the shift",
    expected: { status: 200, role: "cashier", canCloseShift: true, canVoidOrders: false },
    run: async () => { loginDb({ role: "cashier", can_close_shift: true }); const result = await signIn(); return { status: result.status, role: result.body.data.role, canCloseShift: result.body.data.canCloseShift, canVoidOrders: result.body.data.canVoidOrders }; } },
  { id: "UT-USR-07", fn: "finishStaffLogin", kind: "Negative", title: "a deactivated (or deleted) account cannot sign in", input: "Account no longer active",
    expected: { status: 401, body: { error: "This account can no longer sign in." } }, run: () => { loginDb(null); return signIn(); } },
  { id: "UT-USR-08", fn: "finishStaffLogin", kind: "Positive", title: "signing in clocks the employee in (attendance)", input: "Barista signs in",
    expected: 2, run: async () => { const db = loginDb({ role: "barista" }); await signIn(); return db.ran(/^INSERT INTO employee_time_logs/)[0]?.params[0]; } },
]);
