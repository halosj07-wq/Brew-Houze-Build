import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDb } from "./fake-db";
import { passwordChecks, passwordProblem } from "@/lib/password-policy";
import { lockedMessage, staffLockedUntil } from "@/lib/security-log";
import { POST as login } from "@/app/api/auth/login/route";

vi.mock("@/lib/db", () => import("./fake-db").then((m) => m.poolModule));
vi.mock("next/server", async (original) => ({ ...(await original<object>()), after: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

// The security updates after the final paper: the password rules, and the staff lockout (5 wrong
// passwords lock an email for 15 minutes). Plain tests, not part of the Chapter 3 result tables.
const NOW = new Date("2026-10-28T09:00:00+08:00");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("password rules", () => {
  it("accepts a password with a letter and a number", () => {
    expect(passwordProblem("kape at tinapay 7")).toBeNull();
    expect(passwordProblem("Tz8mQp4wKr")).toBeNull();
  });
  it("needs 8 characters, not only spaces, at most 72 bytes", () => {
    expect(passwordProblem("ab12cd3")).toBe("Use at least 8 characters for the password.");
    expect(passwordProblem("        ")).toBe("A password can't be only spaces.");
    expect(passwordProblem(`a1${"x".repeat(71)}`)).toBe("Use at most 72 characters for the password.");
  });
  it("needs a letter and a number", () => {
    expect(passwordProblem("onlyletters")).toBe("Use at least one letter and one number in the password.");
    expect(passwordProblem("1234567890123")).toBe("Use at least one letter and one number in the password.");
    expect(passwordChecks("abc12345")).toEqual({ length: true, letterAndNumber: true });
  });
  it("refuses common and easy passwords", () => {
    expect(passwordProblem("password123")).toBe("That password is too common and easy to guess. Choose a different one.");
    expect(passwordProblem("Password123!")).toBe("That password is too common and easy to guess. Choose a different one.");
    expect(passwordProblem("aaaa1111")).toBe("That password is too easy to guess. Choose a different one.");
  });
  it("refuses the café's name and the person's own name, email or username", () => {
    expect(passwordProblem("BrewHouze2026!")).toBe("Don't use the café's name in the password.");
    expect(passwordProblem("Andrei2026x", { name: "Andrei Gagalang" })).toBe("Don't use your own name, email or username in the password.");
    expect(passwordProblem("xx-arianagagalang-9", { email: "arianagagalang@gmail.com" })).toBe("Don't use your own name, email or username in the password.");
    expect(passwordProblem("yoshi.halos42", { username: "yoshi.halos" })).toBe("Don't use your own name, email or username in the password.");
  });
});

// Rows for "the last five wrong passwords", newest first, the given minutes ago.
const failures = (...minutesAgo: number[]) => minutesAgo.map((minutes) => ({ created_at: new Date(NOW.getTime() - minutes * 60_000) }));
const request = (email: string, password: string) => new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });

describe("staff lockout", () => {
  it("is not locked below 5 wrong passwords", async () => {
    setDb([[/event = 'login_failed'/, failures(1, 2, 3, 4)]]);
    expect(await staffLockedUntil("ana@brewhouze.test")).toBeNull();
  });
  it("locks after 5, until the oldest of them is 15 minutes old", async () => {
    setDb([[/event = 'login_failed'/, failures(1, 2, 3, 4, 6)]]);
    expect((await staffLockedUntil("ana@brewhouze.test"))?.toISOString()).toBe(new Date(NOW.getTime() + 9 * 60_000).toISOString());
  });
  it("says how long and until when", () => {
    expect(lockedMessage(new Date(NOW.getTime() + 9 * 60_000))).toBe("Too many wrong passwords. This account is locked for 9 more minutes (until 9:09 AM). Reset your password, or ask an admin to unlock it.");
  });
  it("refuses even the right password while locked, without checking it", async () => {
    const db = setDb([[/event = 'login_failed'/, failures(1, 2, 3, 4, 5)], [/crypt\(\$2, password_hash\)/, [{ admin_id: 6 }]]]);
    const response = await login(request("ana@brewhouze.test", "right-password-1"));
    expect(response.status).toBe(429);
    expect(db.ran(/crypt\(\$2, password_hash\)/)).toHaveLength(0);
  });
  it("logs a wrong password, and the fifth one locks and is logged", async () => {
    let wrong = 4;
    const db = setDb([
      [/^INSERT INTO security_events/, (params) => { if (params[0] === "login_failed") wrong += 1; return []; }],
      [/event = 'login_failed'/, () => failures(...[0, 1, 2, 3, 4].slice(0, Math.min(wrong, 5)))],
      [/^SELECT admin_id, full_name, email FROM admin_users/, [{ admin_id: 6, full_name: "Ana Cruz", email: "ana@brewhouze.test" }]],
    ]);
    const response = await login(request("ana@brewhouze.test", "wrong-guess-1"));
    expect(response.status).toBe(429);
    expect(db.ran(/^INSERT INTO security_events/).map((call) => call.params[0])).toEqual(["login_failed", "account_locked"]);
  });
  it("a wrong password before the fifth only says it is wrong", async () => {
    const db = setDb([[/event = 'login_failed'/, failures(1, 2)]]);
    const response = await login(request("ana@brewhouze.test", "wrong-guess-1"));
    expect(response.status).toBe(401);
    expect(db.ran(/^INSERT INTO security_events/).map((call) => call.params[0])).toEqual(["login_failed"]);
  });
});
