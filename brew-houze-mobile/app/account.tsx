"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import "./account.css";
import { PhoneField } from "@/lib/input-format";

// Customer accounts on the mobile menu. Kept apart from the menu page on purpose:
//   useCustomerAccount()  all the data and API calls (keep this when the layout is redesigned)
//   AccountPage            the Account tab: profile, rewards, settings (or Join for guests)
//   OrderHistory           past orders, on the Orders tab
//   AccountSheet           the forms: sign in, sign up, forgot/reset password, details, password,
//                          addresses, delete, and the Stars sign at the counter
// The screens use their own .acct-* classes (account.css) plus the menu's shared modal/button
// classes, so a new layout can restyle or replace them without touching the logic.

export type CustomerOrder = { id: number; queueNumber: number | null; status: string; total: number; discountLabel?: string | null; discountTotal?: number; source: "mobile" | "counter"; createdAt: string; items: string };
export type LoyaltyCampaign = { id: number; name: string; description: string | null; startsOn: string; endsOn: string | null; earnMode: "per_item" | "per_amount" | "per_order"; starsPerUnit: number; amountStep: number | null; minOrderAmount?: number | null; categories: string[] | null; maxPerOrder: number | null; maxPerDay: number | null };
// A reward covers one item: a specific product, or any item (from a category), up to a price.
export type LoyaltyReward = {
  id: number; name: string; starsCost: number; kind?: "seasonal" | "birthday"; rewardType?: "free_item" | "discount";
  productId: number | null; category: string | null; maxPrice: number | null;
  discountKind?: "percent" | "fixed" | null; discountValue?: number | null; maxDiscount?: number | null; minOrderAmount?: number | null;
};
// The birthday campaign: one free treat a year within the window around their birthday.
export type BirthdayLoyalty = { campaign: { id: number; name: string; description: string | null; window: "day" | "week" | "month" }; rewards: LoyaltyReward[]; hasBirthday: boolean; eligible: boolean; claimed: boolean };
export type CustomerLoyalty = { campaign: LoyaltyCampaign | null; balance: number; rewards: LoyaltyReward[]; birthday: BirthdayLoyalty | null; history: { kind: string; stars: number; createdAt: string; orderQueue: number | null }[] };

// "10% off (up to ₱50)" / "₱30.00 off Pastries".
export function discountText(reward: LoyaltyReward): string {
  if (!reward.discountKind || !reward.discountValue) return "";
  const off = reward.discountKind === "percent" ? `${reward.discountValue}% off` : `₱${Number(reward.discountValue).toFixed(2)} off`;
  return `${off}${reward.category ? ` ${reward.category}` : ""}${reward.discountKind === "percent" && reward.maxDiscount ? ` (up to ₱${Number(reward.maxDiscount).toFixed(2)})` : ""}`;
}

// The rewards a customer can pick now: star rewards, plus the birthday treat when it is theirs.
export function usableRewards(loyalty: CustomerLoyalty | null | undefined): LoyaltyReward[] {
  if (!loyalty) return [];
  const treat = loyalty.birthday && loyalty.birthday.eligible && !loyalty.birthday.claimed ? loyalty.birthday.rewards : [];
  return [...treat, ...loyalty.rewards];
}

export function birthdayWindowText(window: "day" | "week" | "month"): string {
  return window === "day" ? "on your birthday" : window === "month" ? "during your birthday month" : "within 3 days of your birthday";
}
// A claim from the printed Stars sign at the counter (see /api/claims).
export type StarsClaim = { id: number; rewardId: number | null; rewardName: string | null; starsCost: number | null; status: "pending" | "accepted" | "used" | "cancelled" | "expired"; expiresAt: string; queueNumber: number | null };

// Why a menu item cannot be taken as this reward, or null when it can (the server checks too).
export function rewardMismatch(reward: LoyaltyReward, item: { productId: number; category: string; price: number }): string | null {
  if (reward.rewardType === "discount") return "discount";
  if (reward.productId !== null && reward.productId !== item.productId) return "different product";
  if (reward.productId === null && reward.category && reward.category !== item.category) return `only ${reward.category}`;
  if (reward.maxPrice !== null && item.price > reward.maxPrice + 0.005) return `up to ₱${reward.maxPrice.toFixed(2)}`;
  return null;
}
// A delivery address (see delivery-setup-migration.sql). zoneActive false: the café stopped delivering there.
export type CustomerAddress = { id: number; label: string; recipientName: string; phone: string; zoneId: number | null; zoneName: string | null; zoneFee: number | null; zoneActive: boolean; street: string; landmark: string | null; riderNotes: string | null; isDefault: boolean };
export type AddressDraft = { id?: number; label: string; recipientName: string; phone: string; zoneId: string; street: string; landmark: string; riderNotes: string; isDefault: boolean };
type DeliveryZoneOption = { id: number; name: string; description: string | null; fee: number; minOrder: number | null };

export type CustomerAccount = { username: string; fullName: string; email: string | null; birthday: string | null; orderCount: number; orders: CustomerOrder[]; loyalty?: CustomerLoyalty | null;
  // The products this customer orders most, most first (the Favorites chip).
  favorites?: number[];
  // Mobile number and delivery addresses; codBlocked: cash on delivery switched off for this account.
  phone?: string | null; codBlocked?: boolean; completedOrders?: number; addresses?: CustomerAddress[];
  // A senior, PWD or other ID the café checked and the customer asked to remember (see ./id-discount.tsx).
  savedId?: { typeId: number; typeName: string; holderName: string; idEnding: string | null; expiresAt?: string } | null };

// Rewards can be claimed in the cart (mobile orders) and with the Stars sign (counter orders).
const REWARDS_CLAIMABLE = true;
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

  // Signed in only when no emailed code is still needed (see lib/two-factor.ts on the server).
  const afterSignIn = async (result: Result & { data?: unknown }) => { if (result.ok && !(result.data as { twoFactor?: unknown } | undefined)?.twoFactor) await refresh(); return result; };
  return {
    account,
    loading,
    canResetByEmail,
    refresh,
    signIn: async (login: string, password: string) => afterSignIn(await send("/api/account/login", "POST", { login, password })),
    register: async (form: { fullName: string; username: string; password: string; email: string; birthday: string; consent: boolean; phone: string }) => afterSignIn(await send("/api/account/register", "POST", form)),
    // Two-step sign-in: the code emailed after the password (or a new account) on a new phone.
    verifyCode: async (challenge: string, code: string) => afterSignIn(await send("/api/account/verify-code", "POST", { challenge, code })),
    resendCode: async (challenge: string) => send("/api/account/verify-code", "POST", { challenge, action: "resend" }),
    signOut: async () => { const result = await send("/api/account/logout", "POST"); if (result.ok) setAccount(null); return result; },
    updateProfile: async (form: { fullName: string; email: string; birthday: string; phone: string }) => afterSignIn(await send("/api/account", "PATCH", { action: "update_profile", ...form })),
    // Delivery addresses.
    saveAddress: async (draft: AddressDraft) => afterSignIn(await send("/api/account/addresses", draft.id ? "PATCH" : "POST", { ...draft, zoneId: Number(draft.zoneId) })),
    makeDefaultAddress: async (id: number) => afterSignIn(await send("/api/account/addresses", "PATCH", { id, action: "default" })),
    removeAddress: async (id: number) => afterSignIn(await send(`/api/account/addresses?id=${id}`, "DELETE")),
    // Removes the senior, PWD or other ID the café remembered for discounts.
    forgetSavedId: async () => afterSignIn(await send("/api/account", "PATCH", { action: "forget_id" })),
    changePassword: async (currentPassword: string, newPassword: string) => send("/api/account", "PATCH", { action: "change_password", currentPassword, newPassword }),
    deleteAccount: async (password: string) => { const result = await send("/api/account", "DELETE", { password }); if (result.ok) setAccount(null); return result; },
    forgotPassword: async (login: string) => send("/api/account/forgot-password", "POST", { login }),
    checkResetLink: async (token: string) => {
      const result = await send(`/api/account/reset-password?token=${encodeURIComponent(token)}`, "GET");
      return result.ok ? (result.data as { valid: boolean; username?: string }) : { valid: false };
    },
    resetPassword: async (token: string, password: string) => send("/api/account/reset-password", "POST", { token, password }),
    // The Stars sign at the counter.
    claim: async (rewardId: number | null) => send("/api/claims", "POST", { rewardId }),
    claimStatus: async (): Promise<StarsClaim | null> => {
      const result = await send("/api/claims", "GET");
      return result.ok ? (result.data as StarsClaim | null) : null;
    },
    cancelClaim: async () => send("/api/claims", "DELETE"),
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

type View = "signin" | "register" | "code" | "forgot" | "reset" | "edit" | "password" | "delete" | "claim" | "addresses";
// The forms the Account tab opens.
export type AccountForm = "signin" | "register" | "edit" | "password" | "addresses" | "delete";

function pluralStars(count: number): string {
  return `${count} star${Math.abs(count) === 1 ? "" : "s"}`;
}

// "Earn 1 star for every drink from Coffee or Tea. Up to 3 stars per order."
export function earnRuleText(campaign: LoyaltyCampaign): string {
  const from = campaign.categories?.length ? ` from ${campaign.categories.join(" or ")}` : "";
  const rule = campaign.earnMode === "per_order"
    ? `Earn ${pluralStars(campaign.starsPerUnit)} for every order${from ? ` with items${from}` : ""}${campaign.minOrderAmount ? ` of ₱${campaign.minOrderAmount.toLocaleString("en-PH")} or more` : ""}.`
    : campaign.earnMode === "per_amount"
      ? `Earn ${pluralStars(campaign.starsPerUnit)} for every ₱${(campaign.amountStep ?? 0).toLocaleString("en-PH")} you spend${from ? ` on items${from}` : ""}.`
      : `Earn ${pluralStars(campaign.starsPerUnit)} for every item${from} you order.`;
  const limits = [campaign.maxPerOrder ? `${pluralStars(campaign.maxPerOrder)} per order` : "", campaign.maxPerDay ? `${pluralStars(campaign.maxPerDay)} per day` : ""].filter(Boolean);
  return limits.length ? `${rule} Up to ${limits.join(" and ")}.` : rule;
}

const STAR_ENTRY_LABELS: Record<string, string> = { earned: "Earned", reversed: "Order cancelled", adjusted: "Added by the café", carried_in: "Carried over", carried_out: "Moved to the next campaign", redeemed: "Reward claimed", restored: "Reward returned" };

function BirthdayCard({ birthday, onAddBirthday }: { birthday: BirthdayLoyalty; onAddBirthday: () => void }) {
  const treats = birthday.rewards.map((reward) => reward.rewardType === "discount" ? `${reward.name} (${discountText(reward)})` : reward.name).join(" or ");
  return <section className={`acct-birthday${birthday.eligible && !birthday.claimed ? " is-ready" : ""}`}>
    <strong>🎂 {birthday.campaign.name}</strong>
    <span>{!birthday.hasBirthday ? <>Add your birthday to get a free treat {birthdayWindowText(birthday.campaign.window)}. <button type="button" onClick={onAddBirthday}>Add my birthday</button></>
      : birthday.claimed ? "You already enjoyed your birthday treat this year. See you next year!"
        : birthday.eligible ? `Happy birthday! Your treat is ready: ${treats}. Pick it in your cart, or scan the Stars sign at the counter.`
          : `A free treat ${birthdayWindowText(birthday.campaign.window)}: ${treats}.`}</span>
  </section>;
}

function RewardsCard({ loyalty }: { loyalty: CustomerLoyalty & { campaign: LoyaltyCampaign } }) {
  const { campaign, balance, rewards } = loyalty;
  const next = rewards.find((reward) => reward.starsCost > balance) ?? null;
  const affordable = rewards.filter((reward) => reward.starsCost <= balance);
  const target = next?.starsCost ?? rewards[rewards.length - 1]?.starsCost ?? 0;
  const endLabel = campaign.endsOn ? `Until ${new Date(`${campaign.endsOn}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric" })}` : "Ongoing";
  return <section className="acct-rewards">
    <div className="acct-rewards-head">
      <div><p>REWARDS · {endLabel.toUpperCase()}</p><h3>{campaign.name}</h3></div>
      <strong aria-label={pluralStars(balance)}>★ {balance}</strong>
    </div>
    {campaign.description && <p className="acct-rewards-copy">{campaign.description}</p>}
    {rewards.length > 0 && <div className="acct-rewards-progress" aria-hidden="true"><span style={{ width: `${target ? Math.min(100, (Math.max(0, balance) / target) * 100) : 0}%` }} /></div>}
    <p className="acct-rewards-next">{next ? `${pluralStars(next.starsCost - Math.max(0, balance))} more for ${next.name}.` : affordable.length ? "You have enough stars for every reward!" : "Stars add up with every order while you are signed in."}</p>
    {rewards.length > 0 && <ul className="acct-rewards-list">
      {rewards.map((reward) => <li key={reward.id} className={reward.starsCost <= balance ? "is-ready" : ""}><span>{reward.starsCost <= balance ? "✓ " : ""}{reward.name}{reward.rewardType === "discount" ? ` · ${discountText(reward)}` : ""}</span><strong>★ {reward.starsCost}</strong></li>)}
    </ul>}
    {affordable.length > 0 && <p className="acct-rewards-claim">{REWARDS_CLAIMABLE ? "Use them in your cart when you order here, or scan the Stars sign at the counter." : "Claiming rewards opens soon. Your stars are saved."}</p>}
    <p className="acct-rewards-rule">{earnRuleText(campaign)} Counter orders count too: scan the Stars sign at the counter with your phone.</p>
    {loyalty.history.length > 0 && <details className="acct-rewards-history">
      <summary>Star history</summary>
      <ul>{loyalty.history.map((entry, index) => <li key={index}><span>{STAR_ENTRY_LABELS[entry.kind] ?? entry.kind}{entry.orderQueue ? ` · order #${entry.orderQueue}` : ""}<small>{formatDate(entry.createdAt)}</small></span><strong className={entry.stars < 0 ? "is-minus" : ""}>{entry.stars > 0 ? "+" : ""}{entry.stars}</strong></li>)}</ul>
    </details>}
  </section>;
}

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

const CLAIM_STATUS_TEXT: Record<StarsClaim["status"], { title: string; text: string }> = {
  pending: { title: "Waiting for the cashier", text: "Tell the cashier your name. They will see you on their screen and add you to your order." },
  accepted: { title: "The cashier added you ✓", text: "You are on this order. Your stars update once it is placed." },
  used: { title: "All done ✓", text: "Your order is in. Enjoy!" },
  cancelled: { title: "This claim was closed", text: "The cashier declined it or it was replaced. Scan the Stars sign again if you still need it." },
  expired: { title: "This claim expired", text: "Claims last 10 minutes. Scan the Stars sign again when you are at the counter." },
};

// After scanning the Stars sign: pick a reward (or just be added to the order), then wait for
// the cashier. The status updates by itself.
function ClaimScreen({ state, fullName }: { state: CustomerAccountState; fullName: string }) {
  const loyalty = state.account?.loyalty ?? null;
  const [claim, setClaim] = useState<StarsClaim | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { claimStatus, refresh } = state;
  const open = claim !== null && (claim.status === "pending" || claim.status === "accepted");

  useEffect(() => {
    if (!open) return;
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const latest = await claimStatus();
      if (!active || !latest) return;
      setClaim(latest);
      if (latest.status === "used") void refresh();
    };
    const timer = window.setInterval(() => void check(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, claimStatus, refresh]);

  async function start(rewardId: number | null) {
    setBusy(true);
    setError("");
    const result = await state.claim(rewardId);
    setBusy(false);
    if (result.ok) setClaim(result.data as StarsClaim);
    else setError(result.error);
  }

  if (claim) {
    const info = CLAIM_STATUS_TEXT[claim.status];
    return <div className="acct-claim">
      <div className={`acct-claim-card is-${claim.status}`}>
        <span className="acct-claim-name">{fullName}</span>
        <strong>{claim.rewardName ? `🎁 ${claim.rewardName}` : "Add me to this order"}</strong>
        {claim.starsCost ? <em>★ {claim.starsCost}</em> : null}
      </div>
      <h3>{info.title}</h3>
      <p className="acct-intro">{info.text}{claim.status === "used" && claim.queueNumber ? ` Your queue number is #${claim.queueNumber}.` : ""}</p>
      {open && <div className="payment-check-spinner" aria-hidden="true" style={{ alignSelf: "center" }} />}
      {open
        ? <button type="button" className="add-order-button secondary" disabled={busy} onClick={() => void state.cancelClaim().then(() => setClaim(null))}>Cancel <span>×</span></button>
        : <button type="button" className="add-order-button" onClick={() => setClaim(null)}>Start again <span>→</span></button>}
    </div>;
  }

  return <div className="acct-claim">
    <p className="acct-intro">You are at the Brew Houze counter. Choose what to do, then tell the cashier your name.</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    <button type="button" className="add-order-button" disabled={busy} onClick={() => void start(null)}>Add me to my order <span>earn stars →</span></button>
    {usableRewards(loyalty).length > 0 && loyalty && <>
      <h3 className="acct-section-title">Use a reward{loyalty.campaign ? ` · ★ ${loyalty.balance}` : ""}</h3>
      <ul className="acct-claim-rewards">
        {usableRewards(loyalty).map((reward) => {
          const birthdayTreat = reward.kind === "birthday";
          const affordable = birthdayTreat || reward.starsCost <= loyalty.balance;
          return <li key={reward.id}><button type="button" disabled={busy || !affordable} onClick={() => void start(reward.id)}>
            <span><strong>{birthdayTreat ? "🎂 " : ""}{reward.name}</strong><em>{reward.rewardType === "discount" ? `${discountText(reward)} · ` : ""}{affordable ? "Tap to use" : `${reward.starsCost - loyalty.balance} more stars needed`}</em></span>
            <b>{birthdayTreat ? "Free" : `★ ${reward.starsCost}`}</b>
          </button></li>;
        })}
      </ul>
    </>}
    {!loyalty && <p className="acct-intro">No rewards campaign is running right now, but the cashier can still add you to your order.</p>}
  </div>;
}

function IconChevron() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

// One row of the settings list.
function SettingsRow({ icon, title, detail, onClick, tone }: { icon: string; title: string; detail?: string; onClick: () => void; tone?: "danger" }) {
  return <li><button type="button" className={`ac-row${tone ? ` is-${tone}` : ""}`} onClick={onClick}>
    <span className="ac-row-icon" aria-hidden="true">{icon}</span>
    <span className="ac-row-text"><strong>{title}</strong>{detail && <em>{detail}</em>}</span>
    {!tone && <IconChevron />}
  </button></li>;
}

// The Account tab. Signed in: who they are, their rewards, and a
// settings list (each opens its form in AccountSheet). Guests: why to join, and the way in.
export function AccountPage({ state, onOpen }: { state: CustomerAccountState; onOpen: (form: AccountForm) => void }) {
  const [busy, setBusy] = useState(false);
  const account = state.account;
  if (state.loading) return <div className="ac-page"><p className="ac-loading">Loading your account…</p></div>;
  if (!account) return <div className="ac-page">
    <section className="ac-join">
      <Image src="/brand/badge.png" alt="" width={64} height={64} unoptimized />
      <p className="bh-eyebrow">Brew Houze Rewards</p>
      <h1>Every cup counts.</h1>
      <p>Make a free account and your orders start adding up.</p>
      <ul>
        <li><span aria-hidden="true">★</span><div><strong>Earn stars</strong>On every order, here or at the counter.</div></li>
        <li><span aria-hidden="true">🎁</span><div><strong>Free drinks and treats</strong>Trade stars for rewards, plus a birthday treat.</div></li>
        <li><span aria-hidden="true">📍</span><div><strong>Faster delivery</strong>Saved addresses, and cash on delivery.</div></li>
        <li><span aria-hidden="true">🧾</span><div><strong>Your order history</strong>Everything you ordered, and your favorites on the menu.</div></li>
      </ul>
      <button type="button" className="bh-primary is-center" onClick={() => onOpen("register")}>Make my free account</button>
      <button type="button" className="ac-secondary" onClick={() => onOpen("signin")}>I already have an account</button>
    </section>
    <p className="ac-guest-note">No account? You can still order as a guest. Orders from this phone show under Orders.</p>
  </div>;

  const loyalty = account.loyalty ?? null;
  const defaultAddress = account.addresses?.find((address) => address.isDefault) ?? null;
  const addressCount = account.addresses?.length ?? 0;
  const details = [account.email, account.phone, account.birthday ? `Birthday ${new Date(`${account.birthday}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}` : ""].filter(Boolean).join(" · ");
  async function signOut() {
    setBusy(true);
    await state.signOut();
    setBusy(false);
  }
  return <div className="ac-page">
    <section className="ac-profile">
      <span className="ac-avatar" aria-hidden="true">{initials(account.fullName)}</span>
      <div className="ac-profile-text">
        <h1>{account.fullName}</h1>
        <span>@{account.username}</span>
      </div>
      <div className="ac-stats">
        <div><strong>{account.orderCount}</strong><span>order{account.orderCount === 1 ? "" : "s"}</span></div>
        {loyalty?.campaign && <div><strong>★ {loyalty.balance}</strong><span>stars</span></div>}
      </div>
    </section>

    {/* Only when the treat is theirs to take (the cashier can explain the promo the rest of the year). */}
    {loyalty?.birthday && loyalty.birthday.eligible && !loyalty.birthday.claimed && <BirthdayCard birthday={loyalty.birthday} onAddBirthday={() => onOpen("edit")} />}
    {loyalty?.campaign
      ? <RewardsCard loyalty={{ ...loyalty, campaign: loyalty.campaign }} />
      : loyalty?.birthday ? null : <div className="acct-rewards-soon"><strong>Rewards</strong><span>When the café runs a rewards campaign, your stars and free treats show here.</span></div>}
    {account.savedId && <div className="acct-saved-id">
      <div><strong>🪪 {account.savedId.typeName} discount saved</strong><span>{account.savedId.holderName}{account.savedId.idEnding ? ` · ID ending ${account.savedId.idEnding}` : ""}. Checked by the café, no photo kept. Show your ID at pickup.{account.savedId.expiresAt ? ` Forgotten on ${new Date(account.savedId.expiresAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })} unless you use it (30 days without use).` : ""}</span></div>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void state.forgetSavedId().finally(() => setBusy(false)); }}>Forget</button>
    </div>}

    <section className="ac-group">
      <h2>Account</h2>
      <ul className="ac-list">
        <SettingsRow icon="📍" title="Delivery addresses" detail={addressCount === 0 ? "Add where the café delivers" : `${addressCount} saved${defaultAddress ? ` · ${defaultAddress.label} is the default` : ""}`} onClick={() => onOpen("addresses")} />
        <SettingsRow icon="👤" title="Personal details" detail={details || "Add your email, mobile number and birthday"} onClick={() => onOpen("edit")} />
        <SettingsRow icon="🔒" title="Change password" onClick={() => onOpen("password")} />
      </ul>
    </section>
    <section className="ac-group">
      <ul className="ac-list">
        <li><button type="button" className="ac-row is-plain" disabled={busy} onClick={() => void signOut()}><span className="ac-row-icon" aria-hidden="true">↩</span><span className="ac-row-text"><strong>{busy ? "Signing out…" : "Sign out"}</strong></span></button></li>
        <SettingsRow icon="🗑" title="Delete my account" onClick={() => onOpen("delete")} tone="danger" />
      </ul>
    </section>
    <p className="ac-foot">Brew Houze keeps your details only for your account, orders and rewards. We never sell or share them.</p>

  </div>;
}

// Past orders on the Orders tab (signed in), or why to sign in.
export function OrderHistory({ state, onSignIn, onReceipt }: { state: CustomerAccountState; onSignIn: () => void; onReceipt?: (orderId: number) => void }) {
  if (state.loading) return null;
  if (!state.account) return <div className="oh-guest">
    <strong>Keep a history of your orders</strong>
    <span>Sign in and every order you place is saved here, with the stars you earned.</span>
    <button type="button" className="ac-secondary" onClick={onSignIn}>Sign in or make an account</button>
  </div>;
  if (state.account.orders.length === 0) return <p className="oh-empty">No past orders yet. Orders you place while signed in are saved here.</p>;
  return <ul className="oh-list">{state.account.orders.map((order) => <li key={order.id}>
    <div className="oh-top">
      <strong>{order.queueNumber ? `#${order.queueNumber}` : `Order ${order.id}`}</strong>
      <span>{formatDate(order.createdAt)}</span>
      <b>₱{order.total.toFixed(2)}</b>
    </div>
    <p>{order.items}</p>
    <div className="oh-tags">
      <span>{order.source === "mobile" ? "Ordered here" : "At the counter"}</span>
      {order.discountLabel && (order.discountTotal ?? 0) > 0 && <span className="is-discount">−₱{(order.discountTotal ?? 0).toFixed(2)} · {order.discountLabel.replace(/\s*\(.*\)\s*$/, "")}</span>}
      {order.status !== "completed" && <span className="is-status">{order.status === "voided" ? "Cancelled" : order.status === "refunded" ? "Refunded" : order.status}</span>}
      {onReceipt && <button type="button" className="oh-receipt" onClick={() => onReceipt(order.id)}>View receipt</button>}
    </div>
  </li>)}</ul>;
}

// startAddresses: opened from the cart to add or pick a delivery address, so the sheet goes
// straight to the addresses (straight to a new one when there are none) and returns to the cart.
// start: the form to open (from the Account tab). onNotice: a short message for the page once a
// form is done ("Details saved."), since the sheet closes.
export function AccountSheet({ state, resetToken, startClaim = false, startAddresses = false, start, onClose, onResetDone, onNotice }: { state: CustomerAccountState; resetToken: string | null; startClaim?: boolean; startAddresses?: boolean; start?: AccountForm; onClose: () => void; onResetDone: () => void; onNotice?: (message: string) => void }) {
  const signedIn = Boolean(state.account);
  const [view, setView] = useState<View>(resetToken ? "reset" : startClaim ? (signedIn ? "claim" : "signin") : startAddresses && signedIn ? "addresses" : start && (signedIn || start === "signin" || start === "register") ? start : "signin");
  // A form is done: back to the page, with what happened.
  const finish = (message?: string) => { if (message) onNotice?.(message); onClose(); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [signup, setSignup] = useState({ fullName: "", username: "", email: "", birthday: "", consent: false, phone: "" });
  const [showPrivacy, setShowPrivacy] = useState(false);
  // Two-step sign-in: the challenge from the server, where the code went, and what comes after.
  const [twoFactor, setTwoFactor] = useState<{ challenge: string; email: string; welcome: string } | null>(null);
  const [code, setCode] = useState("");
  const [resendWait, setResendWait] = useState(0);
  useEffect(() => {
    if (resendWait <= 0) return;
    const timer = window.setTimeout(() => setResendWait((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendWait]);
  // After the password or sign-up: either signed in, or the code step first.
  const afterCredentials = (result: Result & { data?: unknown }, welcome: string) => {
    const pending = (result.data as { twoFactor?: { challenge: string; email: string } } | undefined)?.twoFactor;
    if (pending) {
      setTwoFactor({ ...pending, welcome });
      setCode("");
      setResendWait(30);
      setError("");
      setNotice("");
      setView("code");
      return;
    }
    signedInDone(welcome);
  };
  const signedInDone = (welcome: string) => {
    setTwoFactor(null);
    if (startClaim) { setView("claim"); setNotice(welcome); } else finish(welcome);
  };
  const [profile, setProfile] = useState({ fullName: state.account?.fullName ?? "", email: state.account?.email ?? "", birthday: state.account?.birthday ?? "", phone: state.account?.phone ?? "" });
  // Delivery addresses: the one being edited, and the café's delivery zones for the area list.
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(() => (startAddresses || start === "addresses") && state.account && (state.account.addresses ?? []).length === 0
    ? { label: "Home", recipientName: state.account.fullName, phone: state.account.phone ?? "", zoneId: "", street: "", landmark: "", riderNotes: "", isDefault: true }
    : null);
  const [zones, setZones] = useState<DeliveryZoneOption[] | null>(null);
  const [resetInfo, setResetInfo] = useState<{ checked: boolean; valid: boolean; username?: string }>({ checked: false, valid: false });

  const { checkResetLink } = state;
  // The café's delivery zones, loaded when the addresses are shown.
  useEffect(() => {
    if (view !== "addresses" || zones !== null) return;
    let active = true;
    fetch("/api/delivery", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: { zones: DeliveryZoneOption[] } } | null) => { if (active) setZones(payload?.data?.zones ?? []); })
      .catch(() => { if (active) setZones([]); });
    return () => { active = false; };
  }, [view, zones]);
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
    if (next === "edit" && state.account) setProfile({ fullName: state.account.fullName, email: state.account.email ?? "", birthday: state.account.birthday ?? "", phone: state.account.phone ?? "" });

  }

  async function run(action: () => Promise<Result & { data?: unknown }>, onSuccess: (result: Result & { data?: unknown }) => void) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await action();
    setBusy(false);
    if (result.ok) onSuccess(result);
    else setError(result.error);
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const title: Record<View, [string, string]> = {
    signin: ["YOUR ACCOUNT", "Welcome back"],
    register: ["JOIN BREW HOUZE", "Make an account"],
    code: ["TWO-STEP SIGN-IN", "Check your email"],
    forgot: ["YOUR ACCOUNT", "Forgot password"],
    reset: ["YOUR ACCOUNT", "Choose a new password"],
    edit: ["YOUR ACCOUNT", "Edit details"],
    password: ["YOUR ACCOUNT", "Change password"],
    delete: ["YOUR ACCOUNT", "Delete account"],
    addresses: ["DELIVERY", addressDraft ? (addressDraft.id ? "Edit address" : "New address") : "Your addresses"],
    claim: ["STARS AT THE COUNTER", "Use your stars"],
  };

  return <div className="bh-backdrop acct-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="bh-sheet acct-sheet" role="dialog" aria-modal="true" aria-label={title[view][1] || "Your account"}>
      <div className="bh-sheet-head">
        <div><p className="bh-eyebrow">{title[view][0]}</p><h2>{title[view][1]}</h2></div>
        <button type="button" className="bh-sheet-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
      </div>
      <div className="bh-sheet-scroll acct-sheet-body">
      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="acct-notice" role="status">{notice}</p>}

      {view === "signin" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.signIn(login, password), (result) => { setPassword(""); afterCredentials(result, "You're signed in. Welcome back!"); }); }}>
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
        void run(() => state.register({ ...signup, password }), (result) => { setPassword(""); setPassword2(""); afterCredentials(result, "Welcome to Brew Houze! Your account is ready."); });
      }}>
        <Field label="Full name"><input value={signup.fullName} onChange={(event) => setSignup((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" maxLength={120} autoFocus /></Field>
        <Field label="Username" hint="3 to 30 letters, numbers, dots or underscores. You sign in with this."><input value={signup.username} onChange={(event) => setSignup((current) => ({ ...current, username: event.target.value.replace(/\s/g, "") }))} autoComplete="username" autoCapitalize="none" maxLength={30} /></Field>
        <Field label="Password" hint="At least 8 characters."><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        <Field label="Type the password again"><PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" /></Field>
        <Field label="Mobile number (optional)" hint="For delivery updates from the café, e.g. 0917 123 4567."><PhoneField value={signup.phone} onChange={(phone) => setSignup((current) => ({ ...current, phone }))} autoComplete="tel" maxLength={16} /></Field>
        <Field label="Email" hint="We send a sign-in code to it on a new phone, and a link if you forget your password."><input type="email" required value={signup.email} onChange={(event) => setSignup((current) => ({ ...current, email: event.target.value }))} autoComplete="email" autoCapitalize="none" maxLength={254} /></Field>
        <Field label="Birthday (optional)" hint="For a birthday treat when the café has one."><input type="date" value={signup.birthday} max={today} onChange={(event) => setSignup((current) => ({ ...current, birthday: event.target.value }))} autoComplete="bday" /></Field>
        <div className="acct-consent">
          <label><input type="checkbox" checked={signup.consent} onChange={(event) => setSignup((current) => ({ ...current, consent: event.target.checked }))} /><span>I agree to the <button type="button" onClick={() => setShowPrivacy((current) => !current)}>privacy notice</button>.</span></label>
          {showPrivacy && <ul className="acct-privacy">{PRIVACY_POINTS.map((point) => <li key={point}>{point}</li>)}</ul>}
        </div>
        <button type="submit" className="add-order-button" disabled={busy || !signup.fullName.trim() || !signup.username.trim() || !signup.email.trim() || !password || !password2 || !signup.consent}>{busy ? "Making your account..." : "Make my account"} <span>→</span></button>
        <p className="acct-switch">Already have one? <button type="button" onClick={() => go("signin")}>Sign in</button></p>
      </form>}

      {view === "code" && twoFactor && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.verifyCode(twoFactor.challenge, code), () => signedInDone(twoFactor.welcome)); }}>
        <p className="acct-intro">We sent a 6-digit code to <strong>{twoFactor.email}</strong>. Type it below. This phone is then remembered for 30 days.</p>
        <Field label="Sign-in code"><input className="acct-code-input" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" maxLength={6} /></Field>
        <button type="submit" className="add-order-button" disabled={busy || code.length !== 6}>{busy ? "Checking..." : "Verify and continue"} <span>→</span></button>
        <p className="acct-switch">
          <button type="button" disabled={busy || resendWait > 0} onClick={() => void run(() => state.resendCode(twoFactor.challenge), (result) => { setResendWait(30); setCode(""); setNotice(`A new code is on its way to ${(result.data as { email?: string } | undefined)?.email ?? twoFactor.email}. The old one no longer works.`); })}>{resendWait > 0 ? `Send a new code in ${resendWait}s` : "Send a new code"}</button>
          {" · "}
          <button type="button" onClick={() => { setTwoFactor(null); go("signin"); }}>Back to sign in</button>
        </p>
        <p className="acct-intro" style={{ fontSize: 12 }}>Not in your inbox? Check spam. The code works for 10 minutes.</p>
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

      {view === "claim" && state.account && <ClaimScreen state={state} fullName={state.account.fullName} />}
      {view === "signin" && startClaim && <p className="acct-intro" style={{ marginTop: 12 }}>Sign in (or make an account) to use your stars at the counter.</p>}

      {view === "edit" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.updateProfile(profile), () => finish("Details saved.")); }}>
        <Field label="Full name"><input value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" maxLength={120} /></Field>
        <Field label="Username" hint="Usernames cannot be changed."><input value={`@${state.account?.username ?? ""}`} disabled /></Field>
        <Field label="Email (optional)" hint="Only used if you forget your password."><input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} autoComplete="email" autoCapitalize="none" maxLength={254} /></Field>
        <Field label="Mobile number (optional)" hint="Needed for delivery, e.g. 0917 123 4567."><PhoneField value={profile.phone} onChange={(phone) => setProfile((current) => ({ ...current, phone }))} autoComplete="tel" maxLength={16} /></Field>
        <Field label="Birthday (optional)"><input type="date" value={profile.birthday} max={today} onChange={(event) => setProfile((current) => ({ ...current, birthday: event.target.value }))} /></Field>
        <button type="submit" className="add-order-button" disabled={busy || !profile.fullName.trim()}>{busy ? "Saving..." : "Save"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={onClose}>Cancel</button></p>
      </form>}

      {view === "password" && <form className="acct-form" onSubmit={(event) => {
        event.preventDefault();
        if (password !== password2) { setError("The two new passwords do not match."); return; }
        void run(() => state.changePassword(login, password), () => { setLogin(""); finish("Password changed. Your other phones were signed out."); });
      }}>
        <Field label="Current password"><PasswordInput value={login} onChange={setLogin} autoComplete="current-password" autoFocus /></Field>
        <Field label="New password" hint="At least 8 characters."><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></Field>
        <Field label="Type the new password again"><PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" /></Field>
        <button type="submit" className="add-order-button" disabled={busy || !login || !password || !password2}>{busy ? "Saving..." : "Change password"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={onClose}>Cancel</button></p>
      </form>}

      {view === "addresses" && state.account && !addressDraft && <div className="acct-home">
        <p className="acct-intro">Where the café delivers your orders. Each address needs its area, so the delivery fee is known.</p>
        {(state.account.addresses ?? []).length === 0 && <p className="acct-intro">No addresses yet.</p>}
        <ul className="acct-addresses">{(state.account.addresses ?? []).map((address) => <li key={address.id} className={address.isDefault ? "is-default" : ""}>
          <div>
            <strong>{address.label}{address.isDefault ? <span className="acct-default-tag">Default</span> : null}</strong>
            <span>{address.street}{address.landmark ? ` · near ${address.landmark}` : ""}</span>
            <small>{address.zoneName ?? "No area"}{address.zoneFee !== null && address.zoneActive ? ` · ₱${address.zoneFee.toFixed(2)} delivery` : ""}{!address.zoneActive ? " · the café no longer delivers here" : ""} · {address.recipientName}, {address.phone}</small>
          </div>
          <div className="acct-address-actions">
            <button type="button" disabled={busy} onClick={() => setAddressDraft({ id: address.id, label: address.label, recipientName: address.recipientName, phone: address.phone, zoneId: address.zoneId ? String(address.zoneId) : "", street: address.street, landmark: address.landmark ?? "", riderNotes: address.riderNotes ?? "", isDefault: address.isDefault })}>Edit</button>
            {!address.isDefault && <button type="button" disabled={busy} onClick={() => void run(() => state.makeDefaultAddress(address.id), () => setNotice(`${address.label} is now your default address.`))}>Make default</button>}
            <button type="button" disabled={busy} onClick={() => void run(() => state.removeAddress(address.id), () => setNotice("Address removed."))}>Remove</button>
          </div>
        </li>)}</ul>
        {(state.account.addresses?.length ?? 0) < 10 && <button type="button" className="add-order-button" disabled={zones === null || zones.length === 0} onClick={() => setAddressDraft({ label: "Home", recipientName: state.account?.fullName ?? "", phone: state.account?.phone ?? "", zoneId: "", street: "", landmark: "", riderNotes: "", isDefault: (state.account?.addresses?.length ?? 0) === 0 })}>{zones !== null && zones.length === 0 ? "The café has no delivery areas yet" : "Add an address"} <span>+</span></button>}
        <p className="acct-switch"><button type="button" onClick={onClose}>{startAddresses ? "Back to your order" : "Done"}</button></p>
      </div>}

      {view === "addresses" && addressDraft && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.saveAddress(addressDraft), () => { setAddressDraft(null); if (startAddresses) onClose(); else setNotice("Address saved."); }); }}>
        <div className="acct-label-choice" role="radiogroup" aria-label="Label">
          {["Home", "Work", "Other"].map((label) => <button key={label} type="button" role="radio" aria-checked={addressDraft.label === label} onClick={() => setAddressDraft((current) => current && { ...current, label })}>{label}</button>)}
        </div>
        <Field label="Area" hint={(() => { const zone = zones?.find((option) => String(option.id) === addressDraft.zoneId); return zone ? `${zone.description ? `${zone.description} · ` : ""}₱${zone.fee.toFixed(2)} delivery${zone.minOrder ? ` · orders from ₱${zone.minOrder.toFixed(2)}` : ""}` : "The areas the café delivers to."; })()}>
          <select value={addressDraft.zoneId} onChange={(event) => setAddressDraft((current) => current && { ...current, zoneId: event.target.value })}>
            <option value="">Choose your area</option>
            {(zones ?? []).map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
        </Field>
        <Field label="House number and street"><input value={addressDraft.street} onChange={(event) => setAddressDraft((current) => current && { ...current, street: event.target.value })} autoComplete="street-address" maxLength={200} /></Field>
        <Field label="Landmark (optional)" hint="Something the rider can look for."><input value={addressDraft.landmark} onChange={(event) => setAddressDraft((current) => current && { ...current, landmark: event.target.value })} maxLength={120} /></Field>
        <Field label="Who receives it"><input value={addressDraft.recipientName} onChange={(event) => setAddressDraft((current) => current && { ...current, recipientName: event.target.value })} autoComplete="name" maxLength={80} /></Field>
        <Field label="Their mobile number" hint="The rider calls this number."><PhoneField value={addressDraft.phone} onChange={(phone) => setAddressDraft((current) => current && { ...current, phone })} autoComplete="tel" maxLength={16} /></Field>
        <Field label="Notes for the rider (optional)"><input value={addressDraft.riderNotes} onChange={(event) => setAddressDraft((current) => current && { ...current, riderNotes: event.target.value })} placeholder="Gate code, floor, where to leave it" maxLength={200} /></Field>
        <label className="acct-check"><input type="checkbox" checked={addressDraft.isDefault} onChange={(event) => setAddressDraft((current) => current && { ...current, isDefault: event.target.checked })} />Use this address by default</label>
        <button type="submit" className="add-order-button" disabled={busy || !addressDraft.zoneId || addressDraft.street.trim().length < 3 || addressDraft.recipientName.trim().length < 2 || !addressDraft.phone.trim()}>{busy ? "Saving..." : "Save address"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={() => { if ((state.account?.addresses ?? []).length === 0) onClose(); else setAddressDraft(null); }}>Cancel</button></p>
      </form>}

      {view === "delete" && <form className="acct-form" onSubmit={(event) => { event.preventDefault(); void run(() => state.deleteAccount(password), onClose); }}>
        <p className="acct-intro">Your name, username, email, birthday, mobile number, addresses and the café&apos;s notes about you are erased, and you are signed out everywhere. Your past orders stay in the café&apos;s sales records without your name. This cannot be undone.</p>
        <Field label="Enter your password to confirm"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" autoFocus /></Field>
        <button type="submit" className="add-order-button acct-danger" disabled={busy || !password}>{busy ? "Deleting..." : "Delete my account"} <span>→</span></button>
        <p className="acct-switch"><button type="button" onClick={onClose}>Keep my account</button></p>
      </form>}
      </div>
    </section>
  </div>;
}
