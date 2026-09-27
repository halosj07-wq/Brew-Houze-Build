"use client";

import { useCallback, useEffect, useState } from "react";
import "./account.css";

// Customer accounts on the mobile menu. Kept apart from the menu page on purpose:
//   useCustomerAccount()  all the data and API calls (keep this when the layout is redesigned)
//   AccountButton          the header button
//   AccountSheet           sign in, sign up, forgot/reset password, the account page
// The screens use their own .acct-* classes (account.css) plus the menu's shared modal/button
// classes, so a new layout can restyle or replace them without touching the logic.

export type CustomerOrder = { id: number; queueNumber: number | null; status: string; total: number; source: "mobile" | "counter"; createdAt: string; items: string };
export type CustomerAccount = { username: string; fullName: string; email: string | null; birthday: string | null; orderCount: number; orders: CustomerOrder[] };
type Result = { ok: true } | { ok: false; error: string; field?: string };

async function send(url: string, method: string, body?: unknown): Promise<Result & { data?: unknown }> {
  try {
    const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: string; field?: string };
    if (!response.ok) return { ok: false, error: payload.error || "Something went wrong. Please try again.", field: payload.field };
    return { ok: true, data: payload.data };
  } catch {
    return { ok: false, error: "No connection. Check your internet and try again." };
  }
}

export function useCustomerAccount() {
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [canResetByEmail, setCanResetByEmail] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const payload = await response.json() as { data?: CustomerAccount | null; canResetByEmail?: boolean };
      if (response.ok) {
        setAccount(payload.data ?? null);
        setCanResetByEmail(Boolean(payload.canResetByEmail));
      }
    } catch {
      // Offline: keep what is shown. The menu works the same for guests.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const afterSignIn = async (result: Result) => { if (result.ok) await refresh(); return result; };
  return {
    account,
    loading,
    canResetByEmail,
    refresh,
    signIn: async (login: string, password: string) => afterSignIn(await send("/api/account/login", "POST", { login, password })),
    register: async (form: { fullName: string; username: string; password: string; email: string; birthday: string; consent: boolean }) => afterSignIn(await send("/api/account/register", "POST", form)),
    signOut: async () => { const result = await send("/api/account/logout", "POST"); if (result.ok) setAccount(null); return result; },
    updateProfile: async (form: { fullName: string; email: string; birthday: string }) => afterSignIn(await send("/api/account", "PATCH", { action: "update_profile", ...form })),
    changePassword: async (currentPassword: string, newPassword: string) => send("/api/account", "PATCH", { action: "change_password", currentPassword, newPassword }),
    deleteAccount: async (password: string) => { const result = await send("/api/account", "DELETE", { password }); if (result.ok) setAccount(null); return result; },
    forgotPassword: async (login: string) => send("/api/account/forgot-password", "POST", { login }),
    checkResetLink: async (token: string) => {
      const result = await send(`/api/account/reset-password?token=${encodeURIComponent(token)}`, "GET");
      return result.ok ? (result.data as { valid: boolean; username?: string }) : { valid: false };
    },
    resetPassword: async (token: string, password: string) => send("/api/account/reset-password", "POST", { token, password }),
  };
}
export type CustomerAccountState = ReturnType<typeof useCustomerAccount>;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function IconUser() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
}

export function AccountButton({ state, onOpen }: { state: CustomerAccountState; onOpen: () => void }) {
  const { account } = state;
  return <button type="button" className={`header-action acct-header-button${account ? " is-signed-in" : ""}`} onClick={onOpen} aria-label={account ? `Your account, ${account.fullName}` : "Sign in or make an account"}>
    {account ? <span className="acct-avatar is-small" aria-hidden="true">{initials(account.fullName)}</span> : <IconUser />}
    <span className="acct-header-label">{account ? account.fullName.split(" ")[0] : "Sign in"}</span>
  </button>;
}

// A one-line note for the cart: whose account the order is saved to, or an invitation to sign in.
export function CartAccountNote({ state, onOpen }: { state: CustomerAccountState; onOpen: () => void }) {
  if (state.loading) return null;
  return state.account
    ? <p className="acct-cart-note">Ordering as <strong>{state.account.fullName}</strong>. This order is saved to your account.</p>
    : <p className="acct-cart-note">Have an account? <button type="button" onClick={onOpen}>Sign in</button> to save this order to it. You can also order as a guest.</p>;
}

type View = "signin" | "register" | "forgot" | "reset" | "home" | "edit" | "password" | "delete";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="acct-field"><span className="acct-label">{label}</span>{children}{hint && <span className="acct-hint">{hint}</span>}</label>;
}

function PasswordInput({ value, onChange, autoComplete, placeholder, autoFocus }: { value: string; onChange: (value: string) => void; autoComplete: string; placeholder?: string; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false);
  return <span className="acct-password">
    <input type={shown ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} autoFocus={autoFocus} maxLength={72} />
    <button type="button" onClick={() => setShown((current) => !current)} aria-label={shown ? "Hide password" : "Show password"}>{shown ? "Hide" : "Show"}</button>
  </span>;
}

const PRIVACY_POINTS = [
  "We keep your name, username, and, if you give them, your email and birthday.",
  "We keep a list of what you order while signed in, and notes the staff add to serve you better (like how you like your drink).",
  "We use this only for your account, your order history and café rewards. We never sell or share it.",
  "You can change your details or delete your account at any time from this page.",
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AccountSheet({ state, resetToken, onClose, onResetDone }: { state: CustomerAccountState; resetToken: string | null; onClose: () => void; onResetDone: () => void }) {
  const signedIn = Boolean(state.account);
  const [view, setView] = useState<View>(resetToken ? "reset" : signedIn ? "home" : "signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [signup, setSignup] = useState({ fullName: "", username: "", email: "", birthday: "", consent: false });
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profile, setProfile] = useState({ fullName: state.account?.fullName ?? "", email: state.account?.email ?? "", birthday: state.account?.birthday ?? "" });
  const [resetInfo, setResetInfo] = useState<{ checked: boolean; valid: boolean; username?: string }>({ checked: false, valid: false });

  const { checkResetLink } = state;
  useEffect(() => {
    if (!resetToken) return;
    let active = true;
    void checkResetLink(resetToken).then((info) => { if (active) setResetInfo({ checked: true, ...info }); });
    return () => { active = false; };
  }, [resetToken, checkResetLink]);

  function go(next: View) {
    setView(next);
    setError("");
    setNotice("");
    setPassword("");
    setPassword2("");
    if (next === "edit" && state.account) setProfile({ fullName: state.account.fullName, email: state.account.email ?? "", birthday: state.account.birthday ?? "" });
  }

  async function run(action: () => Promise<Result>, onSuccess: () => void) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await action();
    setBusy(false);
    if (result.ok) onSuccess();
    else setError(result.error);
  }

  const today = new Date().toISOString().slice(0, 10);
  const title: Record<View, [string, string]> = {
    signin: ["YOUR ACCOUNT", "Welcome back"],
    register: ["JOIN BREW HOUZE", "Make an account"],
    forgot: ["YOUR ACCOUNT", "Forgot password"],
    reset: ["YOUR ACCOUNT", "Choose a new password"],
    home: ["YOUR ACCOUNT", state.account?.fullName ?? ""],
    edit: ["YOUR ACCOUNT", "Edit details"],
    password: ["YOUR ACCOUNT", "Change password"],
    delete: ["YOUR ACCOUNT", "Delete account"],
  };

  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="cart-modal acct-sheet" aria-label="Your account">
      <div className="cart-modal-heading">
        <div><p className="eyebrow">{title[view][0]}</p><h2>{title[view][1]}</h2></div>
        <button type="button" className="modal-close inline" onClick={onClose} disabled={busy} aria-label="Close">×</button>
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="acct-notice" role="status">{notice}</p>}

      {view === "signin" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.signIn(login, password), () => { setPassword(""); onClose(); }); }}>
        <p className="acct-intro">Sign in to keep your orders in one place. Café rewards will show up here too.</p>
        <Field label="Username or email"><input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" autoCapitalize="none" autoFocus /></Field>
        <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></Field>
        <button type="button" className="acct-link" onClick={() => go("forgot")}>Forgot password?</button>
        <button type="submit" className="add-order-button" disabled={busy || !login.trim() || !password}>{busy ? "Signing in..." : "Sign in"} <span>→</span></button>
        <p className="acct-switch">New here? <button type="button" onClick={() => go("register")}>Make an account</button></p>
      </form>}

      {view === "register" && <form className="acct-form" onSubmit={(event) => {
        event.preventDefault();
        if (password !== password2) { setError("The two passwords do not match."); return; }
        void run(() => state.register({ ...signup, password }), () => { setPassword(""); setPassword2(""); setView("home"); setNotice("Welcome to Brew Houze! Your account is ready."); });
      }}>
        <Field label="Full name"><input value={signup.fullName} onChange={(event) => setSignup((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" maxLength={120} autoFocus /></Field>
        <Field label="Username" hint="3 to 30 letters, numbers, dots or underscores. You sign in with this."><input value={signup.username} onChange={(event) => setSignup((current) => ({ ...current, username: event.target.value.replace(/\s/g, "") }))} autoComplete="username" autoCapitalize="none" maxLength={30} /></Field>
        <Field label="Password" hint="At least 8 characters."><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        <Field label="Type the password again"><PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" /></Field>
        <Field label="Email (optional)" hint="Only used if you forget your password."><input type="email" value={signup.email} onChange={(event) => setSignup((current) => ({ ...current, email: event.target.value }))} autoComplete="email" autoCapitalize="none" maxLength={254} /></Field>
        <Field label="Birthday (optional)" hint="For a birthday treat when the café has one."><input type="date" value={signup.birthday} max={today} onChange={(event) => setSignup((current) => ({ ...current, birthday: event.target.value }))} autoComplete="bday" /></Field>
        <div className="acct-consent">
          <label><input type="checkbox" checked={signup.consent} onChange={(event) => setSignup((current) => ({ ...current, consent: event.target.checked }))} /><span>I agree to the <button type="button" onClick={() => setShowPrivacy((current) => !current)}>privacy notice</button>.</span></label>
          {showPrivacy && <ul className="acct-privacy">{PRIVACY_POINTS.map((point) => <li key={point}>{point}</li>)}</ul>}
        </div>
        <button type="submit" className="add-order-button" disabled={busy || !signup.fullName.trim() || !signup.username.trim() || !password || !password2 || !signup.consent}>{busy ? "Making your account..." : "Make my account"} <span>→</span></button>
        <p className="acct-switch">Already have one? <button type="button" onClick={() => go("signin")}>Sign in</button></p>
      </form>}

      {view === "forgot" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.forgotPassword(login), () => setNotice("If that account has an email, a reset link is on its way. Check your inbox and spam folder.")); }}>
        {state.canResetByEmail
          ? <>
            <p className="acct-intro">Enter the email or username of your account. If it has an email, we will send a link to choose a new password.</p>
            <Field label="Email or username"><input value={login} onChange={(event) => setLogin(event.target.value)} autoCapitalize="none" autoFocus /></Field>
            <button type="submit" className="add-order-button" disabled={busy || !login.trim()}>{busy ? "Sending..." : "Send reset link"} <span>→</span></button>
          </>
          : null}
        <p className="acct-intro">{state.canResetByEmail ? "No email on your account? " : ""}Ask at the counter. The staff can set a temporary password for you.</p>
        <p className="acct-switch"><button type="button" onClick={() => go("signin")}>Back to sign in</button></p>
      </form>}

      {view === "reset" && <form className="acct-form" onSubmit={(event) => {
        event.preventDefault();
        if (password !== password2) { setError("The two passwords do not match."); return; }
        void run(() => state.resetPassword(resetToken ?? "", password), () => { onResetDone(); setView("signin"); setNotice("Password changed. Sign in with your new password."); setPassword(""); setPassword2(""); });
      }}>
        {!resetInfo.checked ? <p className="acct-intro">Checking your link...</p>
          : !resetInfo.valid ? <>
            <p className="acct-intro">This link is invalid, already used, or expired. You can ask for a new one.</p>
            <button type="button" className="add-order-button" onClick={() => { onResetDone(); go("forgot"); }}>Ask for a new link <span>→</span></button>
          </> : <>
            <p className="acct-intro">Choose a new password for <strong>@{resetInfo.username}</strong>. You will be signed out of your other phones.</p>
            <Field label="New password" hint="At least 8 characters."><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" autoFocus /></Field>
            <Field label="Type it again"><PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" /></Field>
            <button type="submit" className="add-order-button" disabled={busy || !password || !password2}>{busy ? "Saving..." : "Save new password"} <span>→</span></button>
          </>}
      </form>}

      {view === "home" && state.account && <div className="acct-home">
        <div className="acct-card">
          <span className="acct-avatar" aria-hidden="true">{initials(state.account.fullName)}</span>
          <div><strong>{state.account.fullName}</strong><span>@{state.account.username}</span></div>
          <em>{state.account.orderCount} order{state.account.orderCount === 1 ? "" : "s"}</em>
        </div>
        <div className="acct-rewards-soon"><strong>Rewards</strong><span>When the café runs a rewards campaign, your stars and free treats will show here.</span></div>
        <h3 className="acct-section-title">Your orders</h3>
        {state.account.orders.length === 0
          ? <p className="acct-intro">No orders yet. Orders you place while signed in are saved here.</p>
          : <ul className="acct-orders">{state.account.orders.map((order) => <li key={order.id}>
            <div><strong>{order.queueNumber ? `#${order.queueNumber}` : `Order ${order.id}`}</strong><span>{formatDate(order.createdAt)} · {order.source === "mobile" ? "Mobile" : "Counter"}</span><small>{order.items}</small></div>
            <div className="acct-order-right"><strong>₱{order.total.toFixed(2)}</strong>{order.status !== "completed" && <span className="acct-order-status">{order.status === "voided" ? "Cancelled" : order.status === "refunded" ? "Refunded" : order.status}</span>}</div>
          </li>)}</ul>}
        <div className="acct-actions">
          <button type="button" onClick={() => go("edit")}>Edit details</button>
          <button type="button" onClick={() => go("password")}>Change password</button>
          <button type="button" disabled={busy} onClick={() => void run(state.signOut, onClose)}>Sign out</button>
        </div>
        <button type="button" className="acct-danger-link" onClick={() => go("delete")}>Delete my account</button>
      </div>}

      {view === "edit" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.updateProfile(profile), () => { go("home"); setNotice("Details saved."); }); }}>
        <Field label="Full name"><input value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" maxLength={120} /></Field>
        <Field label="Username" hint="Usernames cannot be changed."><input value={`@${state.account?.username ?? ""}`} disabled /></Field>
        <Field label="Email (optional)" hint="Only used if you forget your password."><input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} autoComplete="email" autoCapitalize="none" maxLength={254} /></Field>
        <Field label="Birthday (optional)"><input type="date" value={profile.birthday} max={today} onChange={(event) => setProfile((current) => ({ ...current, birthday: event.target.value }))} /></Field>
        <button type="submit" className="add-order-button" disabled={busy || !profile.fullName.trim()}>{busy ? "Saving..." : "Save"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={() => go("home")}>Cancel</button></p>
      </form>}

      {view === "password" && <form className="acct-form" onSubmit={(event) => {
        event.preventDefault();
        if (password !== password2) { setError("The two new passwords do not match."); return; }
        void run(() => state.changePassword(login, password), () => { setLogin(""); go("home"); setNotice("Password changed. Your other phones were signed out."); });
      }}>
        <Field label="Current password"><PasswordInput value={login} onChange={setLogin} autoComplete="current-password" autoFocus /></Field>
        <Field label="New password" hint="At least 8 characters."><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        <Field label="Type the new password again"><PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" /></Field>
        <button type="submit" className="add-order-button" disabled={busy || !login || !password || !password2}>{busy ? "Saving..." : "Change password"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={() => { setLogin(""); go("home"); }}>Cancel</button></p>
      </form>}

      {view === "delete" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.deleteAccount(password), onClose); }}>
        <p className="acct-intro">Your name, username, email, birthday and the café&apos;s notes about you are erased, and you are signed out everywhere. Your past orders stay in the café&apos;s sales records without your name. This cannot be undone.</p>
        <Field label="Enter your password to confirm"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" autoFocus /></Field>
        <button type="submit" className="add-order-button acct-danger" disabled={busy || !password}>{busy ? "Deleting..." : "Delete my account"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={() => go("home")}>Keep my account</button></p>
      </form>}
    </section>
  </div>;
}
