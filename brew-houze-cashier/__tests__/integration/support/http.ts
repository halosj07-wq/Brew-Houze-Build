import { urlOf, type AppName } from "./env";
import { DEVICE, PASSWORD } from "./db";

// A user of one app: keeps its cookies (session, trusted device) between requests, like a browser.
export class AppUser {
  private cookies = new Map<string, string>();
  constructor(readonly app: AppName, device?: string) {
    if (device) this.cookies.set("bh_device", device);
  }

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const started = Date.now();
    const response = await fetch(urlOf(this.app) + path, {
      method,
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130 BrewHouze-IntegrationTest", cookie: this.cookieHeader(), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(pair.slice(0, at)); else this.cookies.set(pair.slice(0, at), value);
    }
    const text = await response.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON read back from the apps
    return { status: response.status, json: json as Record<string, any>, text, ms: Date.now() - started };
  }

  get = (path: string) => this.request("GET", path);
  post = (path: string, body?: unknown) => this.request("POST", path, body);
  patch = (path: string, body?: unknown) => this.request("PATCH", path, body);

  private cookieHeader() {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join("; ");
  }
}

// Signs a staff member in to the Staff Portal or the Admin Portal from their trusted device.
export async function staff(app: "cashier" | "admin", who: "admin" | "cashier" | "barista" | "rider") {
  const user = new AppUser(app, DEVICE[who]);
  const signed = await user.post("/api/auth/login", { email: `${who}@test.brewhouze.local`, password: PASSWORD });
  if (signed.status !== 200) throw new Error(`${who} could not sign in to ${app}: ${signed.status} ${signed.text}`);
  return user;
}

export async function customer() {
  const user = new AppUser("mobile", DEVICE.customer);
  const signed = await user.post("/api/account/login", { login: "ana_test", password: PASSWORD });
  if (signed.status !== 200) throw new Error(`The customer could not sign in: ${signed.status} ${signed.text}`);
  return user;
}
