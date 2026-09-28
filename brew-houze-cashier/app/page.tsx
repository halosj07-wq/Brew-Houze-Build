"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Page = "pos" | "queue" | "reversals" | "deliveries" | "accounts";
type Session = { adminId: number; fullName: string; email: string; role: string; canVoidOrders?: boolean; canRefundOrders?: boolean; canOpenShift?: boolean; canCloseShift?: boolean };

// Baristas only see and manage the queue, riders only the deliveries (the server refuses them
// everything else too). Cashiers and admins see every page.
function limitedPages(role: string): Page[] | null {
  const value = role.toLowerCase();
  return value === "barista" ? ["queue", "accounts"] : value === "rider" ? ["deliveries", "accounts"] : null;
}
function isQueueOnlyRole(role: string): boolean {
  return limitedPages(role) !== null;
}
function roleLabel(role: string): string {
  const value = role.toLowerCase();
  return value === "admin" ? "Admin" : value === "barista" ? "Barista" : value === "rider" ? "Rider" : "Cashier";
}
type IconProps = { size?: number };
type QueueOrderDetail = { product_name: string; size_label: string | null; temperature?: "hot" | "cold" | "both" | null; quantity: number; additions: { name: string; quantity: number }[] };
type QueueOrder = { order_id: number; queue_number: number; items: string; created_at: string; order_source: string; order_details: QueueOrderDetail[]; customer_name?: string | null; customer_notes?: string | null; id_check?: string | null; service_type?: "dine_in" | "take_out" | "delivery" | null; status?: string; queue_status?: string; total_amount?: number; payment_method?: string | null; payment_provider?: string | null; cash_portion?: string | number | null; return_method?: "cash" | "gcash" | "split" | null; return_gcash_name?: string | null; return_gcash_number?: string | null; return_reference?: string | null; reversed_by?: string | null; reversal_type?: string | null; reversed_at?: string | null; discount_label?: string | null; discount_total?: string | number | null; cod_unpaid?: boolean };


function IconGrid({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
}

function IconUsers({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}

function IconList({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
}

function IconUndo({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>;
}
function IconChevron({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}

function uniqueQueueOrders(orders: QueueOrder[]) {
  return Array.from(new Map(orders.map((order) => [order.order_id, order])).values());
}

const navItems: { id: Page; label: string; Icon: React.FC<IconProps> }[] = [
  { id: "pos", label: "Point of Sale", Icon: IconGrid },
  { id: "queue", label: "Queue", Icon: IconList },
  { id: "reversals", label: "Void & Refund", Icon: IconUndo },
  { id: "deliveries", label: "Deliveries", Icon: IconTruck },
  { id: "accounts", label: "My Account", Icon: IconUsers },
];

// The last queue number this terminal punched, kept across reloads for the rest of the shift.
type LastOrder = { queueNumber: number; punchedAt: number; shiftId: number };
type QueueCounts = { waiting: number; ready: number };
// For the Deliveries badge: packed orders waiting for a rider, failed deliveries to void, cash on
// delivery not handed in (all of it, and what this rider still has).
type DeliveryCounts = { ready: number; failed: number; cash: number; mineCash: number };
const LAST_ORDER_STORAGE_KEY = "brewhouze.cashier.lastOrder";

function readStoredLastOrder(): LastOrder | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(LAST_ORDER_STORAGE_KEY) ?? "null") as LastOrder | null;
    // Queue numbers restart every shift; the sidebar only shows it while that shift is open.
    if (!stored || !Number.isFinite(stored.queueNumber) || !Number.isFinite(stored.punchedAt) || !Number.isFinite(stored.shiftId)) return null;
    return stored;
  } catch {
    return null;
  }
}

function formatTimeAgo(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

function Sidebar({ current, collapsed, lastOrder, queueCounts, deliveryBadge, now, shiftOpen, canManageReversals, allowedPages, onChange, onToggle }: { current: Page; collapsed: boolean; lastOrder: LastOrder | null; queueCounts: QueueCounts | null; deliveryBadge: number; now: number; shiftOpen: boolean; canManageReversals: boolean; allowedPages: Page[] | null; onChange: (page: Page) => void; onToggle: () => void }) {
  const visibleNavItems = navItems.filter((item) => allowedPages ? allowedPages.includes(item.id) : item.id !== "reversals" || canManageReversals);
  const waiting = queueCounts?.waiting ?? 0;
  return <aside className={`app-sidebar ${collapsed ? "is-collapsed" : "is-expanded"} flex flex-col`} style={{ background: "#3D2B1F", minHeight: "100vh", width: collapsed ? 52 : 240, flexShrink: 0 }}>
    <div className="flex items-center gap-3 px-6 py-7 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <Image src="/brand/badge.png" alt="" width={40} height={40} unoptimized style={{ flexShrink: 0, borderRadius: "50%", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }} />
      <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 14, color: "#FDF9F5", lineHeight: 1.2 }}>Brew Houze</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>CAFE</p></div>
    </div>
    <div className="sidebar-toggle-row"><button onClick={onToggle} title={collapsed ? "Expand sidebar" : "Minimize sidebar"} aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #6B4C3B", borderRadius: 6, background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", transform: collapsed ? "rotate(180deg)" : "none" }}><IconChevron size={14} /></button></div>
    <nav className="flex flex-col gap-1 px-3 pt-5 flex-1">
      {visibleNavItems.map(({ id, label, Icon }) => {
        const active = current === id;
        const badge = id === "queue" && waiting > 0 ? waiting : id === "deliveries" ? deliveryBadge : 0;
        return <button key={id} onClick={() => onChange(id)} title={collapsed ? label : undefined} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left w-full" style={{ position: "relative", background: active ? "#D97706" : "transparent", color: active ? "#FDF9F5" : "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: active ? 600 : 400, cursor: "pointer", border: "none" }}>
          <Icon size={17} /><span>{label}</span>
          {badge > 0 && <b className="nav-badge" aria-label={id === "deliveries" ? `${badge} need attention` : `${badge} waiting`} style={{ marginLeft: "auto", minWidth: 22, height: 20, padding: "0 6px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: active ? "#FDF9F5" : "#D97706", color: active ? "#B45309" : "#FFFFFF", fontSize: 11, fontWeight: 800 }}>{badge > 99 ? "99+" : badge}</b>}
        </button>;
      })}
    </nav>
    {!allowedPages && <button type="button" onClick={() => onChange("queue")} title="Open the queue" className="mx-3 mb-5 rounded-xl" style={{ background: "rgba(217,119,6,0.14)", border: "1px solid rgba(217,119,6,0.35)", padding: collapsed ? "10px 2px" : "13px 14px", textAlign: collapsed ? "center" : "left", cursor: "pointer", color: "#FDF9F5" }}>
      {collapsed ? (
        <span style={{ display: "block", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, lineHeight: 1 }}>{lastOrder ? `#${lastOrder.queueNumber}` : "—"}</span>
      ) : <>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#F59E0B", letterSpacing: "0.08em" }}>LAST ORDER PUNCHED</span>
          {lastOrder && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{formatTimeAgo(lastOrder.punchedAt, now)}</span>}
        </span>
        {lastOrder
          ? <span style={{ display: "block", marginTop: 4, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 32, lineHeight: 1 }}>#{lastOrder.queueNumber}</span>
          : <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{shiftOpen ? "No orders punched yet this shift" : "No shift open"}</span>}
        <span style={{ display: "flex", gap: 6, marginTop: 11, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ flex: 1, padding: "5px 0", borderRadius: 8, background: "rgba(255,255,255,0.07)", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.75)" }}><strong style={{ display: "block", fontSize: 16, color: "#FDF9F5" }}>{queueCounts ? queueCounts.waiting : "–"}</strong>waiting</span>
          <span style={{ flex: 1, padding: "5px 0", borderRadius: 8, background: "rgba(255,255,255,0.07)", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.75)" }}><strong style={{ display: "block", fontSize: 16, color: "#FBBF24" }}>{queueCounts ? queueCounts.ready : "–"}</strong>ready</span>
        </span>
      </>}
    </button>}
    <div className="px-6 py-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>STAFF PORTAL</p></div>
  </aside>;
}

// Phones (portrait): the sidebar is hidden and these tabs sit at the bottom of the screen.
const mobileTabLabels: Record<Page, string> = { pos: "POS", queue: "Queue", reversals: "Void & Refund", deliveries: "Deliveries", accounts: "Account" };

function MobileTabBar({ current, queueWaiting, deliveryBadge, canManageReversals, allowedPages, onChange }: { current: Page; queueWaiting: number; deliveryBadge: number; canManageReversals: boolean; allowedPages: Page[] | null; onChange: (page: Page) => void }) {
  return <nav className="mobile-tabbar" aria-label="Cashier sections">
    {navItems.filter((item) => allowedPages ? allowedPages.includes(item.id) : item.id !== "reversals" || canManageReversals).map(({ id, Icon }) => {
      const active = current === id;
      return <button key={id} type="button" onClick={() => onChange(id)} aria-current={active ? "page" : undefined} className={`mobile-tab${active ? " is-active" : ""}`}>
        <span className="mobile-tab-icon"><Icon size={21} />{id === "queue" && queueWaiting > 0 && <b aria-label={`${queueWaiting} waiting`}>{queueWaiting > 99 ? "99+" : queueWaiting}</b>}{id === "deliveries" && deliveryBadge > 0 && <b aria-label={`${deliveryBadge} need attention`}>{deliveryBadge > 99 ? "99+" : deliveryBadge}</b>}</span>
        <span>{mobileTabLabels[id]}</span>
      </button>;
    })}
  </nav>;
}

// Initials on a colour picked from the name, so each cashier is recognisable at a glance.
const avatarColors = ["#B45309", "#9A3412", "#6B4C3B", "#0F766E", "#7E22CE", "#1D4ED8", "#BE185D"];

function UserAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  const color = avatarColors[Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarColors.length];
  return <span aria-hidden="true" className="flex items-center justify-center rounded-full" style={{ width: size, height: size, flexShrink: 0, background: color, color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: size * 0.38, boxShadow: "0 0 0 2px #FDF9F5, 0 0 0 4px rgba(217,119,6,0.35)" }}>{initials}</span>;
}

function IconPrinter({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>;
}

function IconSwitchUser({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h2" /><path d="m16 14 3 3-3 3" /><path d="M22 17h-7" /></svg>;
}

function IconSignal({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.94 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>;
}

type ConnectionState = "checking" | "online" | "slow" | "database" | "offline";

// Round trips slower than this feel sluggish at the counter.
const SLOW_CONNECTION_MS = 1500;
const CONNECTION_CHECK_INTERVAL_MS = 20_000;
const CONNECTION_TIMEOUT_MS = 8000;

const connectionStyles: Record<ConnectionState, { label: string; color: string; background: string; border: string }> = {
  checking: { label: "Checking…", color: "#6B4C3B", background: "#F3EDE5", border: "#E8DDD5" },
  online: { label: "Online", color: "#15803D", background: "#F0FDF4", border: "#BBF7D0" },
  slow: { label: "Slow connection", color: "#B45309", background: "#FEF3C7", border: "#FCD34D" },
  database: { label: "Database issue", color: "#B91C1C", background: "#FEF2F2", border: "#FECACA" },
  offline: { label: "Offline", color: "#B91C1C", background: "#FEF2F2", border: "#FECACA" },
};

// Shows whether the tablet has internet, reaches the Brew Houze server, and whether the database
// answers (and how fast). Checks every 20 seconds while visible and whenever Wi-Fi drops or returns.
function ConnectionIndicator() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [internet, setInternet] = useState(true);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [roundTripMs, setRoundTripMs] = useState<number | null>(null);
  const [dbMs, setDbMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const browserOnline = navigator.onLine;
    setInternet(browserOnline);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
    const started = performance.now();
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
      const elapsed = Math.round(performance.now() - started);
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; dbMs?: number };
      setServerReachable(true);
      setRoundTripMs(elapsed);
      setInternet(true);
      if (!response.ok || !payload.ok) {
        setDbMs(null);
        setState("database");
      } else {
        setDbMs(typeof payload.dbMs === "number" ? payload.dbMs : null);
        setState(elapsed > SLOW_CONNECTION_MS ? "slow" : "online");
      }
    } catch {
      setServerReachable(false);
      setRoundTripMs(null);
      setDbMs(null);
      setState("offline");
    } finally {
      window.clearTimeout(timeout);
      setCheckedAt(new Date());
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    const whenVisible = () => { if (document.visibilityState === "visible") void check(); };
    const wentOffline = () => { setInternet(false); setServerReachable(false); setState("offline"); setCheckedAt(new Date()); };
    const first = window.setTimeout(() => void check(), 0);
    const intervalId = window.setInterval(whenVisible, CONNECTION_CHECK_INTERVAL_MS);
    window.addEventListener("online", whenVisible);
    window.addEventListener("offline", wentOffline);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(intervalId);
      window.removeEventListener("online", whenVisible);
      window.removeEventListener("offline", wentOffline);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [check]);

  const style = connectionStyles[state];
  const row = (label: string, value: string, ok: boolean | null) => <div className="flex items-center justify-between gap-4" style={{ padding: "7px 0", borderTop: "1px solid #F0E8E2", fontSize: 12.5 }}>
    <span style={{ color: "#6B4C3B" }}>{label}</span>
    <span className="flex items-center gap-1.5" style={{ color: ok === null ? "#9C8278" : ok ? "#15803D" : "#B91C1C", fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok === null ? "#C9B8AF" : ok ? "#22C55E" : "#DC2626" }} />{value}
    </span>
  </div>;

  return <div style={{ position: "relative" }}>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Connection: ${style.label}. Show details`} title="Connection status" className="connection-chip" style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 12px", borderRadius: 11, border: `1px solid ${style.border}`, background: style.background, color: style.color, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
      <span className={state === "online" ? "" : "connection-pulse"} style={{ width: 8, height: 8, borderRadius: "50%", background: style.color }} />
      <IconSignal size={16} />
      <span className="connection-label">{style.label}</span>
    </button>
    {open && <>
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div role="dialog" aria-label="Connection details" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, width: 290, padding: 14, borderRadius: 14, background: "#FFFFFF", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.18)" }}>
        <p style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, color: style.color }}>{style.label}</p>
        <p style={{ margin: "3px 0 8px", color: "#9C8278", fontSize: 11.5, lineHeight: 1.45 }}>{state === "online" ? "Orders and payments are saving normally." : state === "slow" ? "Saving works but responses are slow. Avoid tapping Checkout twice." : state === "database" ? "The server is up but the database is not answering. Orders cannot be saved right now." : state === "offline" ? (internet ? "The tablet has Wi-Fi but cannot reach the Brew Houze server." : "The tablet has no internet connection. Check the Wi-Fi.") : "Checking the connection…"}</p>
        {row("Internet", internet ? "Connected" : "Not connected", internet)}
        {row("Brew Houze server", serverReachable === null ? "Checking" : serverReachable ? `Reachable${roundTripMs !== null ? ` · ${roundTripMs} ms` : ""}` : "Not reachable", serverReachable)}
        {row("Database", state === "checking" ? "Checking" : state === "database" ? "Not responding" : dbMs !== null ? `Responding · ${dbMs} ms` : "Unknown", state === "checking" ? null : state === "database" || state === "offline" ? false : dbMs !== null)}
        <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
          <span style={{ color: "#9C8278", fontSize: 11 }}>{checkedAt ? `Checked ${checkedAt.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}</span>
          <button type="button" onClick={() => void check()} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "7px 12px", background: "#F3EDE5", color: "#3D2B1F", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Check again</button>
        </div>
      </div>
    </>}
  </div>;
}

// The campaigns running now, for every staff member: a chip in the top bar that opens the rules
// and rewards, so the counter can answer "how do I earn stars?" without asking the owner.
type CampaignPreviewData = {
  campaign: { name: string; description: string | null; endsOn: string | null; earnMode: "per_item" | "per_amount" | "per_order"; starsPerUnit: number; amountStep: number | null; minOrderAmount: number | null; categories: string[] | null; maxPerOrder: number | null; maxPerDay: number | null; rewards: LoyaltyRewardRule[] } | null;
  birthday: { name: string; description: string | null; window: string; rewards: LoyaltyRewardRule[] } | null;
};

function campaignRuleText(campaign: NonNullable<CampaignPreviewData["campaign"]>): string {
  const stars = `${campaign.starsPerUnit} star${campaign.starsPerUnit === 1 ? "" : "s"}`;
  const from = campaign.categories?.length ? ` from ${campaign.categories.join(" or ")}` : "";
  const rule = campaign.earnMode === "per_order" ? `${stars} per order${from ? ` with items${from}` : ""}${campaign.minOrderAmount ? ` of ₱${campaign.minOrderAmount.toLocaleString("en-PH")} or more` : ""}`
    : campaign.earnMode === "per_amount" ? `${stars} for every ₱${(campaign.amountStep ?? 0).toLocaleString("en-PH")} spent${from ? ` on items${from}` : ""}`
      : `${stars} for every item${from}`;
  const limits = [campaign.maxPerOrder ? `${campaign.maxPerOrder} per order` : "", campaign.maxPerDay ? `${campaign.maxPerDay} per day` : ""].filter(Boolean);
  return `${rule}${limits.length ? `, up to ${limits.join(" and ")}` : ""}.`;
}

function CampaignPreview() {
  const [data, setData] = useState<CampaignPreviewData | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/loyalty", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { data?: CampaignPreviewData };
        if (active && payload.data) setData(payload.data);
      } catch {
        // Offline for a moment: keep what is shown.
      }
    };
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120_000);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!data || (!data.campaign && !data.birthday)) return null;
  const windowText = data.birthday?.window === "day" ? "on their birthday" : data.birthday?.window === "month" ? "during their birthday month" : "within 3 days of their birthday";
  return <div className="campaign-preview" ref={wrapRef}>
    <button type="button" className="campaign-chip" onClick={() => setOpen((value) => !value)} aria-expanded={open} title="Loyalty campaigns running now">
      {data.campaign && <span>★ <b className="campaign-chip-label">{data.campaign.name}</b></span>}
      {data.birthday && <span>🎂<b className="campaign-chip-label">{data.campaign ? "" : ` ${data.birthday.name}`}</b></span>}
    </button>
    {open && <div className="campaign-popover" role="dialog" aria-label="Loyalty campaigns">
      {data.campaign && <section>
        <p className="campaign-popover-eyebrow">Running now{data.campaign.endsOn ? ` · until ${new Date(`${data.campaign.endsOn}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""}</p>
        <h3>★ {data.campaign.name}</h3>
        {data.campaign.description && <p className="campaign-popover-copy">{data.campaign.description}</p>}
        <p className="campaign-popover-rule">Customers earn {campaignRuleText(data.campaign)}</p>
        {data.campaign.rewards.length > 0 && <ul>{data.campaign.rewards.map((reward) => <li key={reward.id}><span>{reward.name}{reward.rewardType === "discount" ? ` · ${discountText(reward)}` : ""}</span><b>★ {reward.starsCost}</b></li>)}</ul>}
      </section>}
      {data.birthday && <section>
        <p className="campaign-popover-eyebrow">Always on</p>
        <h3>🎂 {data.birthday.name}</h3>
        <p className="campaign-popover-rule">One free treat a year, {windowText}. No stars needed. The customer needs their birthday on their profile.</p>
        {data.birthday.rewards.length > 0 && <ul>{data.birthday.rewards.map((reward) => <li key={reward.id}><span>{reward.name}{reward.rewardType === "discount" ? ` · ${discountText(reward)}` : ""}</span><b>Free</b></li>)}</ul>}
      </section>}
      <p className="campaign-popover-foot">Attach the customer to the order to give stars. Customers with the app scan the Stars sign to use rewards.</p>
    </div>}
  </div>;
}

function TopBar({ page, user, shift, onOpenShift, onCloseShift, onCashDrawer, onAccount, onRequestLogout }: { page: Page; user: Session; shift: CurrentShift | null | undefined; onOpenShift: () => void; onCloseShift: () => void; onCashDrawer: () => void; onAccount: () => void; onRequestLogout: () => void }) {
  const title = page === "pos" ? "Point of Sale" : page === "queue" ? "Queue" : page === "reversals" ? "Void & Refund" : page === "deliveries" ? "Deliveries" : "My Account";
  const isAdmin = user.role.toLowerCase() === "admin";
  return <header className="app-topbar flex items-center justify-between gap-4 px-6 py-3 border-b" style={{ background: "#FDF9F5", borderColor: "#E8DDD5", flexShrink: 0 }}>
    <div className="flex items-center gap-4 min-w-0">
      <span className="topbar-title" style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 17, color: "#3D2B1F", whiteSpace: "nowrap" }}>{title}</span>
      <ShiftChip shift={shift} canOpenShift={Boolean(user.canOpenShift)} canCloseShift={Boolean(user.canCloseShift)} readOnly={isQueueOnlyRole(user.role)} onOpenShift={onOpenShift} onCloseShift={onCloseShift} onCashDrawer={onCashDrawer} />
    </div>
    <div className="flex items-center gap-2.5">
      <CampaignPreview />
      <ConnectionIndicator />
      <button type="button" onClick={onAccount} aria-label={`My account: ${user.fullName}`} title="My account" className="topbar-profile" style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 12px 0 6px", borderRadius: 13, border: page === "accounts" ? "1px solid #D97706" : "1px solid #E8DDD5", background: page === "accounts" ? "#FFF7ED" : "#FFFFFF", cursor: "pointer", textAlign: "left" }}>
        <UserAvatar name={user.fullName} size={34} />
        <span className="topbar-profile-text flex flex-col" style={{ lineHeight: 1.2 }}>
          <strong style={{ fontSize: 13, color: "#3D2B1F", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.fullName}</strong>
          <span style={{ alignSelf: "flex-start", marginTop: 3, padding: "1px 7px", borderRadius: 999, background: isAdmin ? "#3D2B1F" : "#FFF7ED", color: isAdmin ? "#FDF9F5" : "#C2410C", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{roleLabel(user.role)}</span>
        </span>
      </button>
      <button type="button" onClick={onRequestLogout} title="Sign out so someone else can sign in" className="topbar-switch" style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 14px", borderRadius: 13, border: "none", background: "#3D2B1F", color: "#FDF9F5", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 14px rgba(61,43,31,0.18)" }}>
        <IconSwitchUser size={18} />
        <span className="topbar-switch-label">Switch user</span>
      </button>
    </div>
  </header>;
}

type AccountDevice = { id: number; app: string; device: string; signedInAt: string; lastSeenAt: string; isCurrent: boolean };
type AccountDetails = { createdAt: string | null; clockedInAt: string | null; shift: { shiftId: number; openedAt: string; orders: number; sales: number; reversals: number } | null; devices: AccountDevice[] };

function formatDuration(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function AccountSection({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 20, boxShadow: "0 4px 14px rgba(61,43,31,0.04)" }}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>{eyebrow}</p>
        <h2 style={{ margin: "5px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 19 }}>{title}</h2>
      </div>
      {action}
    </div>
    <div style={{ marginTop: 14 }}>{children}</div>
  </section>;
}

function AccountPage({ user, onSignOut }: { user: Session; onSignOut: () => void }) {
  const [details, setDetails] = useState<AccountDetails | null>(null);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [devicesMessage, setDevicesMessage] = useState("");
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const keypad = useContext(KeypadContext);
  const receipts = useContext(ReceiptContext);

  const loadDetails = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/account", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load your account.");
      setDetails(payload.data as AccountDetails);
      setLoadError("");
      setNow(Date.now());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your account.");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadDetails(), 0);
    const intervalId = window.setInterval(() => { if (document.visibilityState === "visible") void loadDetails(); }, 30_000);
    return () => { window.clearTimeout(first); window.clearInterval(intervalId); };
  }, [loadDetails]);

  async function signOutOtherDevices() {
    setSigningOutOthers(true);
    setDevicesMessage("");
    try {
      const response = await fetch("/api/auth/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign_out_other_devices" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not sign out the other devices.");
      const count = Number(payload.data?.signedOutDevices ?? 0);
      setDevicesMessage(count > 0 ? `Signed out ${count} other device${count === 1 ? "" : "s"}.` : "No other devices were signed in.");
      await loadDetails();
    } catch (error) {
      setDevicesMessage(error instanceof Error ? error.message : "Could not sign out the other devices.");
    } finally {
      setSigningOutOthers(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (newPassword.length < 8) { setPasswordError("Use at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("The new passwords do not match."); return; }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to change password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const count = Number(payload.data?.signedOutDevices ?? 0);
      setPasswordMessage(`Password changed.${count > 0 ? ` ${count} other device${count === 1 ? " was" : "s were"} signed out.` : ""}`);
      await loadDetails();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  const isAdmin = user.role.toLowerCase() === "admin";
  const currentDevice = details?.devices.find((device) => device.isCurrent);
  const otherDevices = (details?.devices ?? []).filter((device) => !device.isCurrent);
  const stat = (label: string, value: string, sub?: string) => <div className="rounded-xl" style={{ padding: "12px 14px", background: "#FFFFFF", border: "1px solid #F0E8E2" }}>
    <p style={{ margin: 0, color: "#9C8278", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
    <p style={{ margin: "5px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 22, color: "#3D2B1F" }}>{value}</p>
    {sub && <p style={{ margin: "2px 0 0", color: "#9C8278", fontSize: 11.5 }}>{sub}</p>}
  </div>;
  const permission = (label: string, allowed: boolean) => <div className="flex items-center gap-3" style={{ padding: "10px 12px", borderRadius: 12, background: allowed ? "#F0FDF4" : "#FFFFFF", border: `1px solid ${allowed ? "#BBF7D0" : "#F0E8E2"}` }}>
    <span className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: allowed ? "#16A34A" : "#E8DDD5", color: "#FFFFFF", fontWeight: 800, fontSize: 13 }}>{allowed ? "✓" : "–"}</span>
    <span style={{ fontSize: 13.5, color: "#3D2B1F", fontWeight: 600 }}>{label}</span>
    <span style={{ marginLeft: "auto", color: allowed ? "#15803D" : "#9C8278", fontSize: 12, fontWeight: 700 }}>{allowed ? "Allowed" : "Not allowed"}</span>
  </div>;

  return <main className="account-page p-6" style={{ maxWidth: 1180 }}>
    <section className="account-hero rounded-2xl flex items-center gap-5" style={{ padding: 22, background: "linear-gradient(135deg, #3D2B1F 0%, #5B4030 100%)", color: "#FDF9F5", boxShadow: "0 10px 30px rgba(61,43,31,0.18)" }}>
      <UserAvatar name={user.fullName} size={68} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26 }}>{user.fullName}</h1>
          <span style={{ padding: "2px 9px", borderRadius: 999, background: isAdmin ? "#FDF9F5" : "#D97706", color: isAdmin ? "#3D2B1F" : "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>{roleLabel(user.role)}</span>
        </div>
        <p style={{ margin: "5px 0 0", color: "rgba(253,249,245,0.75)", fontSize: 13.5 }}>{user.email}</p>
        <p style={{ margin: "3px 0 0", color: "rgba(253,249,245,0.55)", fontSize: 12 }}>{currentDevice ? `Signed in on this device (${currentDevice.device}) since ${new Date(currentDevice.signedInAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}` : "Loading…"}</p>
      </div>
      <button type="button" onClick={onSignOut} className="account-hero-switch flex items-center justify-center gap-2" style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(253,249,245,0.25)", background: "rgba(253,249,245,0.08)", color: "#FDF9F5", fontWeight: 700, fontSize: 13, cursor: "pointer" }}><IconSwitchUser size={17} />Switch user</button>
    </section>

    {loadError && <p style={{ margin: "14px 0 0", padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{loadError}</p>}

    <div className="account-grid grid gap-5" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", alignItems: "start" }}>
      <div className="flex flex-col gap-5">
        <AccountSection eyebrow="Today" title="This shift">
          {!details ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>Loading…</p> : <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(110px, 100%), 1fr))" }}>
              {stat("Clocked in", details.clockedInAt ? new Date(details.clockedInAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }) : "—", details.clockedInAt ? `for ${formatDuration(details.clockedInAt, now)}` : "Not clocked in")}
              {!isQueueOnlyRole(user.role) && stat("Orders you punched", details.shift ? String(details.shift.orders) : "—", details.shift ? `₱${details.shift.sales.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in sales` : "No shift open")}
              {!isQueueOnlyRole(user.role) && stat("Voids & refunds", details.shift ? String(details.shift.reversals) : "—", details.shift ? "made by you this shift" : undefined)}
            </div>
            {!details.shift && !isQueueOnlyRole(user.role) && <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 12 }}>No shift is open. Totals appear once a shift is opened.</p>}
          </>}
        </AccountSection>

        {!isQueueOnlyRole(user.role) && <AccountSection eyebrow="Settings" title="This tablet">
          <div className="flex items-center gap-4" style={{ padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #F0E8E2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p id="keypad-setting-label" style={{ margin: 0, color: "#3D2B1F", fontSize: 14, fontWeight: 700 }}>On-screen keypad for amounts</p>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12, lineHeight: 1.45 }}>Payment and cash boxes open a number pad instead of the tablet keyboard. Saved on this device only, for every cashier who uses it.</p>
            </div>
            <button type="button" role="switch" aria-checked={keypad.enabled} aria-labelledby="keypad-setting-label" onClick={() => keypad.setEnabled(!keypad.enabled)} className={`setting-switch${keypad.enabled ? " is-on" : ""}`}><span /></button>
          </div>
          <div className="flex items-center gap-4" style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #F0E8E2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: "#3D2B1F", fontSize: 14, fontWeight: 700 }}>Receipts</p>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12, lineHeight: 1.45 }}>Print on the thermal printer, or download a PDF instead (for checking, or when there is no printer).</p>
            </div>
            <div className="setting-choice" role="group" aria-label="Receipt output">
              {([["print", "Print"], ["pdf", "PDF"]] as const).map(([output, label]) => <button key={output} type="button" aria-pressed={receipts.settings.output === output} onClick={() => receipts.setSettings({ ...receipts.settings, output })}>{label}</button>)}
            </div>
          </div>
          <div className="flex items-center gap-4" style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #F0E8E2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: "#3D2B1F", fontSize: 14, fontWeight: 700 }}>Receipt paper</p>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12, lineHeight: 1.45 }}>The width of the thermal printer roll. Most small printers use 58 mm. PDFs use the same width.</p>
            </div>
            <div className="setting-choice" role="group" aria-label="Receipt paper width">
              {([58, 80] as const).map((width) => <button key={width} type="button" aria-pressed={receipts.settings.paperWidth === width} onClick={() => receipts.setSettings({ ...receipts.settings, paperWidth: width })}>{width} mm</button>)}
            </div>
          </div>
          <div className="flex items-center gap-4" style={{ marginTop: 10, padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #F0E8E2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p id="autoprint-setting-label" style={{ margin: 0, color: "#3D2B1F", fontSize: 14, fontWeight: 700 }}>Make a receipt after every order</p>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12, lineHeight: 1.45 }}>{receipts.settings.output === "pdf" ? "Downloads the receipt PDF" : "Opens the print window"} as soon as an order is placed. When off, tap Receipt on the order confirmation instead.</p>
            </div>
            <button type="button" role="switch" aria-checked={receipts.settings.autoPrint} aria-labelledby="autoprint-setting-label" onClick={() => receipts.setSettings({ ...receipts.settings, autoPrint: !receipts.settings.autoPrint })} className={`setting-switch${receipts.settings.autoPrint ? " is-on" : ""}`}><span /></button>
          </div>
        </AccountSection>}

        <AccountSection eyebrow="Access" title="What you can do">
          <div className="flex flex-col gap-2">
            {isQueueOnlyRole(user.role) ? permission("View and manage the queue", true) : permission("Take orders & checkout", true)}
            {isQueueOnlyRole(user.role) && permission("Take orders & checkout", false)}
            {permission("Void orders", Boolean(user.canVoidOrders))}
            {permission("Refund orders", Boolean(user.canRefundOrders))}
            {permission("Open the store", Boolean(user.canOpenShift))}
            {permission("Close the shift", Boolean(user.canCloseShift))}
          </div>
          {!isAdmin && <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 12 }}>Permissions are set by an admin in the admin portal.</p>}
        </AccountSection>

        <AccountSection eyebrow="Security" title="Signed-in devices" action={otherDevices.length > 0 ? <button type="button" onClick={() => void signOutOtherDevices()} disabled={signingOutOthers} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, fontWeight: 700, cursor: signingOutOthers ? "default" : "pointer", whiteSpace: "nowrap" }}>{signingOutOthers ? "Signing out…" : "Sign out other devices"}</button> : undefined}>
          {!details ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>Loading…</p> : <div className="flex flex-col" style={{ border: "1px solid #F0E8E2", borderRadius: 12, overflow: "hidden", background: "#FFFFFF" }}>
            {details.devices.map((device, index) => <div key={device.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", fontSize: 13 }}>
              <span>
                <strong style={{ color: "#3D2B1F" }}>{device.device}</strong>
                {device.isCurrent && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: "#DCFCE7", color: "#15803D", fontSize: 10.5, fontWeight: 800 }}>This device</span>}
                <span style={{ display: "block", marginTop: 2, color: "#9C8278", fontSize: 11.5 }}>{device.app === "cashier" ? "Staff app" : "Admin app"} · signed in {new Date(device.signedInAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </span>
            </div>)}
          </div>}
          {devicesMessage && <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 12.5 }}>{devicesMessage}</p>}
        </AccountSection>
      </div>

      <AccountSection eyebrow="Security" title="Change password">
        <form onSubmit={changePassword} className="flex flex-col">
          <div style={{ marginTop: -16 }} />
          <AuthPasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" placeholder="Your current password" />
          <AuthPasswordField label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" placeholder="At least 8 characters" />
          <AuthPasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Type it again" />
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <li style={{ color: newPassword.length >= 8 ? "#15803D" : "#9C8278" }}>{newPassword.length >= 8 ? "✓" : "•"} At least 8 characters</li>
            <li style={{ color: confirmPassword !== "" && newPassword === confirmPassword ? "#15803D" : "#9C8278" }}>{confirmPassword !== "" && newPassword === confirmPassword ? "✓" : "•"} Both new passwords match</li>
          </ul>
          <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 12 }}>Changing your password signs out your other devices. This tablet stays signed in.</p>
          {passwordError && <AuthAlert tone="error">{passwordError}</AuthAlert>}
          {passwordMessage && <AuthAlert tone="success">{passwordMessage}</AuthAlert>}
          <button type="submit" disabled={savingPassword} className="login-submit">{savingPassword ? "Saving…" : "Change password"}</button>
        </form>
      </AccountSection>
    </div>
  </main>;
}


const ADDONS_TAB = "__addons__";

// ─── On-screen keypad ────────────────────────────────────────────────────────
// Optional, per tablet (My Account → This tablet). When on, money boxes open this keypad instead
// of the tablet keyboard, which covers half of a landscape screen. Saved on the device only, so
// it stays on across cashiers and a phone or PC can keep its normal keyboard.
// ─── Receipts ────────────────────────────────────────────────────────────────
// Printed on the counter's thermal printer through the tablet's print dialog. The slip is read
// back from the saved order, so a reprint matches the record exactly. It is not a BIR official
// receipt: this system is not a BIR-registered POS, so the slip says so.
// Lines under the café name (address, contact number, social media), one per line.
const RECEIPT_BUSINESS = { name: "Brew Houze", lines: ["fb.com/BrewHouzeCafe"] as string[] };
const RECEIPT_STORAGE_KEY = "brew-houze-cashier-receipt";

// output: send the slip to the printer, or download it as a PDF (no printer needed).
type ReceiptSettings = { paperWidth: 58 | 80; autoPrint: boolean; output: "print" | "pdf" };
const defaultReceiptSettings: ReceiptSettings = { paperWidth: 58, autoPrint: false, output: "print" };

function readReceiptSettings(): ReceiptSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECEIPT_STORAGE_KEY) ?? "{}") as Partial<ReceiptSettings>;
    return { paperWidth: saved.paperWidth === 80 ? 80 : 58, autoPrint: saved.autoPrint === true, output: saved.output === "pdf" ? "pdf" : "print" };
  } catch {
    return defaultReceiptSettings;
  }
}

function saveReceiptSettings(settings: ReceiptSettings) {
  try { window.localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage unavailable: applies until the page reloads */ }
}

type ReceiptData = {
  orderId: number; queueNumber: number | null; shiftId: number | null; status: string; total: number;
  paymentMethod: string; paymentProvider: string | null; paymentReference: string | null; cashPortion: number | null;
  received: number | null; change: number | null; orderSource: string; returnMethod: string | null;
  createdAt: string; reversedAt: string | null; cashierName: string | null; customerName?: string | null;
  loyalty?: { starsEarned: number; starsUsed?: number; balance: number; campaignName: string } | null;
  subtotal?: number | null; discountAmount?: number; discountLabel?: string | null; serviceType?: string | null;
  // Senior, PWD and other ID discounts: one per person, with the VAT removed (senior and PWD) and the discount.
  vatExemptAmount?: number; idDiscounts?: ReceiptIdDiscount[];
  // Delivery orders: the fee, and where it went.
  deliveryFee?: number; delivery?: { recipient: string; phone: string; street: string; landmark: string | null; zone: string; status: string; rider: string | null; checkId?: boolean; notes?: string | null; codCollected?: number | null; deliveredAt?: string | null } | null;
  // rewardName: the line was a loyalty reward (free, paid with stars).
  items: { name: string; size: string | null; temperature: string | null; quantity: number; unitPrice: number; rewardName?: string | null; additions: { name: string; quantity: number; unitPrice: number }[] }[];
};

type ReceiptIdDiscount = { code: string; name: string; holderName: string; idNumber: string | null; groupSize: number | null; coveredAmount: number; vatExempt: number; discount: number };
// Senior and PWD sales are signed by the customer (the shop keeps the record).
function needsSignature(entry: ReceiptIdDiscount): boolean {
  return entry.code === "senior" || entry.code === "pwd";
}

const ReceiptContext = createContext<{ settings: ReceiptSettings; setSettings: (settings: ReceiptSettings) => void; printReceipt: (orderId: number, options?: { reprint?: boolean }) => Promise<string | null> }>({
  settings: defaultReceiptSettings, setSettings: () => undefined, printReceipt: async () => "Printing is not available here.",
});

// A delivery order's progress, printed on its receipt.
const receiptDeliveryStatus: Record<string, string> = { preparing: "Preparing", ready: "Packed for the rider", out: "On the way", delivered: "Delivered", failed: "Not delivered", cancelled: "Cancelled" };
// What the receipt says under the total for a delivery: the customer's thanks, or the rider's reminder.
const receiptFooter = (receipt: ReceiptData) => receipt.serviceType === "delivery" ? "Thank you! Enjoy your order." : `Thank you!${receipt.queueNumber !== null ? " Please wait for your number." : ""}`;
// The subtotal of the items (orders saved before subtotals were recorded work it out from the total).
const receiptSubtotal = (receipt: ReceiptData) => receipt.subtotal ?? receipt.total + (receipt.discountAmount ?? 0) + (receipt.vatExemptAmount ?? 0) - (receipt.deliveryFee ?? 0);

function receiptMoney(value: number): string {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function receiptTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// The receipt as a PDF the width of the thermal roll and as long as the receipt, with the same
// content as the printed slip. Built with jsPDF (loaded only when needed). Its built-in fonts have
// no peso sign, so amounts read "PHP 345.00".
async function downloadReceiptPdf(receipt: ReceiptData, reprint: boolean, paperWidth: 58 | 80) {
  const { jsPDF } = await import("jspdf");
  const margin = 4;
  const inner = paperWidth - margin * 2;
  const base = paperWidth === 80 ? 9.5 : 8.5;
  const lineHeight = (size: number) => size * 0.3528 * 1.3;
  type Op =
    | { kind: "text"; lines: string[]; size: number; bold: boolean; y: number }
    | { kind: "row"; lines: string[]; right: string; size: number; bold: boolean; indent: number; y: number }
    | { kind: "rule"; y: number }
    | { kind: "box"; y: number; height: number };
  const measure = new jsPDF({ unit: "mm", format: [paperWidth, 100] });
  const ops: Op[] = [];
  let y = margin;
  const font = (doc: InstanceType<typeof jsPDF>, size: number, bold: boolean) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); };
  const text = (value: string, size = base, bold = false) => {
    font(measure, size, bold);
    const lines = measure.splitTextToSize(value, inner) as string[];
    ops.push({ kind: "text", lines, size, bold, y });
    y += lines.length * lineHeight(size);
  };
  const row = (left: string, right = "", options: { size?: number; bold?: boolean; indent?: number } = {}) => {
    const size = options.size ?? base;
    const bold = options.bold ?? false;
    const indent = options.indent ?? 0;
    font(measure, size, bold);
    const rightWidth = right ? measure.getTextWidth(right) + 2 : 0;
    const lines = measure.splitTextToSize(left, inner - indent - rightWidth) as string[];
    ops.push({ kind: "row", lines, right, size, bold, indent, y });
    y += lines.length * lineHeight(size);
  };
  const rule = () => { y += 1; ops.push({ kind: "rule", y }); y += 1.8; };
  const money = (value: number) => receiptMoney(value);

  text(RECEIPT_BUSINESS.name, base * 1.7, true);
  RECEIPT_BUSINESS.lines.forEach((line) => text(line, base * 0.85));
  text(`ORDER SLIP${reprint ? " - REPRINT" : ""}`, base, true);
  if (receipt.queueNumber !== null) {
    y += 1.5;
    const boxTop = y;
    y += 1;
    text("QUEUE NUMBER", base * 0.85, true);
    text(`#${receipt.queueNumber}`, base * 2.8, true);
    y -= lineHeight(base * 2.8) * 0.22;
    ops.push({ kind: "box", y: boxTop, height: y - boxTop });
    y += 1;
  }
  const status = receipt.status.startsWith("void") ? "VOIDED" : receipt.status.startsWith("refund") ? "REFUNDED" : null;
  if (status) text(`*** ${status}${receipt.reversedAt ? ` ${receiptTime(receipt.reversedAt)}` : ""} ***`, base, true);
  rule();
  row("Date", receiptTime(receipt.createdAt));
  row("Order", `#${receipt.orderId}${receipt.shiftId ? ` - shift ${receipt.shiftId}` : ""}`);
  row(receipt.orderSource === "online" ? "Ordered on" : "Cashier", receipt.orderSource === "online" ? "Mobile menu" : receipt.cashierName ?? "-");
  if (receipt.customerName) row("Customer", receipt.customerName);
  if (receipt.serviceType) row("Order type", receipt.serviceType === "take_out" ? "TAKE OUT" : receipt.serviceType === "delivery" ? "DELIVERY" : "DINE IN", { bold: true });
  if (receipt.delivery) {
    row("Deliver to", receipt.delivery.recipient);
    row(`${receipt.delivery.street}${receipt.delivery.landmark ? `, near ${receipt.delivery.landmark}` : ""} (${receipt.delivery.zone})`, "", { size: base * 0.9, indent: 3 });
    row(receipt.delivery.phone, receipt.delivery.rider ? `Rider: ${receipt.delivery.rider}` : "", { size: base * 0.9, indent: 3 });
    if (receipt.delivery.notes) row(`Note: ${receipt.delivery.notes}`, "", { size: base * 0.9, indent: 3 });
    row(`Status: ${receiptDeliveryStatus[receipt.delivery.status] ?? receipt.delivery.status}${receipt.delivery.deliveredAt ? ` ${receiptTime(receipt.delivery.deliveredAt)}` : ""}`, "", { size: base * 0.9, indent: 3 });
    if (receipt.delivery.checkId) text("RIDER: CHECK THE DISCOUNT ID AT THE DOOR", base * 0.9, true);
  }
  rule();
  for (const item of receipt.items) {
    row(`${item.quantity} x ${item.name}`, money(item.quantity * item.unitPrice));
    const details = [item.size && item.size !== "Regular" ? item.size : "", item.temperature === "hot" ? "Hot" : item.temperature === "cold" ? "Iced" : "", item.quantity > 1 ? `@ ${money(item.unitPrice)}` : "", item.rewardName ? `Reward: ${item.rewardName}` : ""].filter(Boolean).join(" - ");
    if (details) row(details, "", { size: base * 0.9, indent: 3 });
    for (const addition of item.additions) row(`+ ${addition.name}${addition.quantity !== 1 ? ` x${addition.quantity}` : ""}`, money(addition.quantity * addition.unitPrice), { size: base * 0.9, indent: 3 });
    y += 0.8;
  }
  rule();
  const idDiscounts = receipt.idDiscounts ?? [];
  if (receipt.discountAmount || receipt.vatExemptAmount || receipt.deliveryFee) {
    row(receipt.deliveryFee ? "Items" : "Subtotal", money(receiptSubtotal(receipt)));
    if (idDiscounts.length > 0) {
      for (const entry of idDiscounts) {
        row(`${entry.name}: ${entry.holderName}`, "", { bold: true });
        if (entry.idNumber) row(`ID ${entry.idNumber}`, "", { size: base * 0.9, indent: 3 });
        row(entry.groupSize ? `Share of bill (1 of ${entry.groupSize})` : "Items covered", money(entry.coveredAmount), { size: base * 0.9, indent: 3 });
        if (entry.vatExempt) row("Less VAT (VAT-exempt)", `-${money(entry.vatExempt)}`, { size: base * 0.9, indent: 3 });
        row("Less discount", `-${money(entry.discount)}`, { size: base * 0.9, indent: 3 });
      }
    } else if (receipt.discountAmount) {
      row(`Discount${receipt.discountLabel ? `: ${receipt.discountLabel.replace(/₱/g, "PHP ")}` : ""}`, `-${money(receipt.discountAmount)}`);
    }
  }
  if (receipt.deliveryFee) row("Delivery fee", money(receipt.deliveryFee));
  row("TOTAL", `PHP ${money(receipt.total)}`, { size: base * 1.25, bold: true });
  const isGcash = receipt.paymentProvider === "paymongo_gcash" || receipt.paymentMethod === "online";
  if (receipt.paymentMethod === "split" && receipt.cashPortion !== null) {
    row("Cash", money(receipt.cashPortion));
    if (receipt.received !== null) row("Cash received", money(receipt.received), { indent: 3 });
    if (receipt.change !== null) row("Change", money(receipt.change), { indent: 3 });
    row("GCash", money(receipt.total - receipt.cashPortion));
  } else if (receipt.paymentMethod === "cod") {
    row(receipt.received ? "Cash on delivery" : "To collect on delivery", money(receipt.total), { bold: !receipt.received });
    if (receipt.received) row("Collected by the rider", money(receipt.received), { indent: 3 });
  } else if (isGcash) {
    row("Paid with GCash", money(receipt.total));
  } else {
    if (receipt.received !== null) row("Cash received", money(receipt.received));
    if (receipt.change !== null) row("Change", money(receipt.change));
  }
  if (isGcash && receipt.paymentReference) row(`Payment ref ${receipt.paymentReference}`, "", { size: base * 0.85 });
  if (receipt.loyalty) {
    rule();
    if (receipt.loyalty.starsUsed) row("Stars used", `-${receipt.loyalty.starsUsed}`);
    if (receipt.loyalty.starsEarned) row("Stars earned", `+${receipt.loyalty.starsEarned}`);
    row("Your stars", String(receipt.loyalty.balance));
    text(receipt.loyalty.campaignName, base * 0.85);
  }
  for (const entry of idDiscounts.filter(needsSignature)) {
    rule();
    row(`${entry.name}: ${entry.holderName}${entry.idNumber ? ` - ID ${entry.idNumber}` : ""}`, "", { size: base * 0.9 });
    y += 4;
    row("Signature", "______________________", { size: base * 0.9 });
  }
  rule();
  text(receiptFooter(receipt));
  text("THIS IS NOT AN OFFICIAL RECEIPT", base * 0.85, true);
  if (reprint) text(`Reprinted ${receiptTime(new Date().toISOString())}`, base * 0.85);

  const doc = new jsPDF({ unit: "mm", format: [paperWidth, Math.max(y + margin, 40)] });
  doc.setProperties({ title: `Brew Houze order ${receipt.orderId}`, creator: "Brew Houze staff portal" });
  doc.setDrawColor(0);
  doc.setTextColor(0);
  for (const op of ops) {
    if (op.kind === "text") {
      font(doc, op.size, op.bold);
      doc.text(op.lines, paperWidth / 2, op.y, { align: "center", baseline: "top", lineHeightFactor: 1.3 });
    } else if (op.kind === "row") {
      font(doc, op.size, op.bold);
      doc.text(op.lines, margin + op.indent, op.y, { baseline: "top", lineHeightFactor: 1.3 });
      if (op.right) doc.text([op.right], paperWidth - margin, op.y, { align: "right", baseline: "top", lineHeightFactor: 1.3 });
    } else if (op.kind === "rule") {
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.8, 0.6], 0);
      doc.line(margin, op.y, paperWidth - margin, op.y);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, op.y, inner, op.height, 1, 1);
    }
  }
  doc.save(`brew-houze-receipt-${receipt.orderId}${reprint ? "-reprint" : ""}.pdf`);
}

function ReceiptSlip({ receipt, reprint, paperWidth }: { receipt: ReceiptData; reprint: boolean; paperWidth: 58 | 80 }) {
  const status = receipt.status.startsWith("void") ? "VOIDED" : receipt.status.startsWith("refund") ? "REFUNDED" : null;
  const isGcash = receipt.paymentProvider === "paymongo_gcash" || receipt.paymentMethod === "online";
  const row = (label: React.ReactNode, value: React.ReactNode, strong = false) => <div className={`receipt-row${strong ? " is-strong" : ""}`}><span>{label}</span><span>{value}</span></div>;
  return <div className={`receipt is-${paperWidth}`}>
    <div className="receipt-center">
      <div className="receipt-name">{RECEIPT_BUSINESS.name}</div>
      {RECEIPT_BUSINESS.lines.map((line) => <div key={line} className="receipt-small">{line}</div>)}
      <div className="receipt-title">ORDER SLIP{reprint ? " · REPRINT" : ""}</div>
    </div>
    {receipt.queueNumber !== null && <div className="receipt-queue"><span>Queue number</span><strong>#{receipt.queueNumber}</strong></div>}
    {status && <div className="receipt-stamp">{status}{receipt.reversedAt ? ` ${receiptTime(receipt.reversedAt)}` : ""}</div>}
    <div className="receipt-rule" />
    {row("Date", receiptTime(receipt.createdAt))}
    {row("Order", `#${receipt.orderId}${receipt.shiftId ? ` · shift ${receipt.shiftId}` : ""}`)}
    {row(receipt.orderSource === "online" ? "Ordered on" : "Cashier", receipt.orderSource === "online" ? "Mobile menu" : receipt.cashierName ?? "—")}
    {receipt.customerName && row("Customer", receipt.customerName)}
    {receipt.serviceType && row("Order type", receipt.serviceType === "take_out" ? "TAKE OUT" : receipt.serviceType === "delivery" ? "DELIVERY" : "DINE IN", true)}
    {receipt.delivery && <div className="receipt-item">
      {row("Deliver to", receipt.delivery.recipient)}
      <div className="receipt-detail">{receipt.delivery.street}{receipt.delivery.landmark ? `, near ${receipt.delivery.landmark}` : ""} ({receipt.delivery.zone})</div>
      <div className="receipt-detail">{receipt.delivery.phone}{receipt.delivery.rider ? ` · Rider: ${receipt.delivery.rider}` : ""}</div>
      {receipt.delivery.notes && <div className="receipt-detail">Note: {receipt.delivery.notes}</div>}
      <div className="receipt-detail">Status: {receiptDeliveryStatus[receipt.delivery.status] ?? receipt.delivery.status}{receipt.delivery.deliveredAt ? ` ${receiptTime(receipt.delivery.deliveredAt)}` : ""}</div>
      {receipt.delivery.checkId && <div className="receipt-stamp is-small">Rider: check the discount ID at the door</div>}
    </div>}
    <div className="receipt-rule" />
    {receipt.items.map((item, index) => {
      const details = [item.size && item.size !== "Regular" ? item.size : "", item.temperature === "hot" ? "Hot" : item.temperature === "cold" ? "Iced" : "", item.quantity > 1 ? `@ ${receiptMoney(item.unitPrice)}` : "", item.rewardName ? `Reward: ${item.rewardName}` : ""].filter(Boolean).join(" · ");
      return <div key={index} className="receipt-item">
        {row(`${item.quantity} × ${item.name}`, receiptMoney(item.quantity * item.unitPrice))}
        {details && <div className="receipt-detail">{details}</div>}
        {item.additions.map((addition) => row(<span className="receipt-detail">+ {addition.name}{addition.quantity !== 1 ? ` ×${addition.quantity}` : ""}</span>, receiptMoney(addition.quantity * addition.unitPrice)))}
      </div>;
    })}
    <div className="receipt-rule" />
    {Boolean(receipt.discountAmount || receipt.vatExemptAmount || receipt.deliveryFee) && <>
      {row(receipt.deliveryFee ? "Items" : "Subtotal", receiptMoney(receiptSubtotal(receipt)))}
      {(receipt.idDiscounts ?? []).length > 0 ? (receipt.idDiscounts ?? []).map((entry, index) => <div key={index} className="receipt-item">
        {row(<strong>{entry.name}: {entry.holderName}</strong>, "")}
        {entry.idNumber && <div className="receipt-detail">ID {entry.idNumber}</div>}
        {row(<span className="receipt-detail">{entry.groupSize ? `Share of bill (1 of ${entry.groupSize})` : "Items covered"}</span>, receiptMoney(entry.coveredAmount))}
        {Boolean(entry.vatExempt) && row(<span className="receipt-detail">Less VAT (VAT-exempt)</span>, `-${receiptMoney(entry.vatExempt)}`)}
        {row(<span className="receipt-detail">Less discount</span>, `-${receiptMoney(entry.discount)}`)}
      </div>)
        : Boolean(receipt.discountAmount) && row(`Discount${receipt.discountLabel ? `: ${receipt.discountLabel}` : ""}`, `-${receiptMoney(receipt.discountAmount ?? 0)}`)}
    </>}
    {Boolean(receipt.deliveryFee) && row("Delivery fee", receiptMoney(receipt.deliveryFee ?? 0))}
    {row("TOTAL", `₱${receiptMoney(receipt.total)}`, true)}
    {receipt.paymentMethod === "split" && receipt.cashPortion !== null ? <>
      {row("Cash", receiptMoney(receipt.cashPortion))}
      {receipt.received !== null && row("  Cash received", receiptMoney(receipt.received))}
      {receipt.change !== null && row("  Change", receiptMoney(receipt.change))}
      {row("GCash", receiptMoney(receipt.total - receipt.cashPortion))}
    </> : receipt.paymentMethod === "cod" ? <>
      {row(receipt.received ? "Cash on delivery" : "To collect on delivery", receiptMoney(receipt.total), !receipt.received)}
      {Boolean(receipt.received) && row("  Collected by the rider", receiptMoney(receipt.received ?? 0))}
    </> : isGcash ? row("Paid with GCash", receiptMoney(receipt.total))
      : <>
        {receipt.received !== null && row("Cash received", receiptMoney(receipt.received))}
        {receipt.change !== null && row("Change", receiptMoney(receipt.change))}
      </>}
    {isGcash && receipt.paymentReference && <div className="receipt-small">Payment ref {receipt.paymentReference}</div>}
    {receipt.loyalty && <>
      <div className="receipt-rule" />
      {Boolean(receipt.loyalty.starsUsed) && row("Stars used", `-${receipt.loyalty.starsUsed}`)}
      {Boolean(receipt.loyalty.starsEarned) && row("Stars earned", `+${receipt.loyalty.starsEarned}`)}
      {row("Your stars", String(receipt.loyalty.balance))}
      <div className="receipt-center receipt-small">{receipt.loyalty.campaignName}</div>
    </>}
    {(receipt.idDiscounts ?? []).filter(needsSignature).map((entry, index) => <div key={index}>
      <div className="receipt-rule" />
      <div className="receipt-small">{entry.name}: {entry.holderName}{entry.idNumber ? ` · ID ${entry.idNumber}` : ""}</div>
      <div className="receipt-signature"><span>Signature</span></div>
    </div>)}
    <div className="receipt-rule" />
    <div className="receipt-center">
      <div>{receiptFooter(receipt)}</div>
      <div className="receipt-small receipt-legal">THIS IS NOT AN OFFICIAL RECEIPT</div>
      {reprint && <div className="receipt-small">Reprinted {receiptTime(new Date().toISOString())}</div>}
    </div>
  </div>;
}

const KEYPAD_STORAGE_KEY = "brew-houze-cashier-keypad";
const KeypadContext = createContext<{ enabled: boolean; setEnabled: (enabled: boolean) => void }>({ enabled: false, setEnabled: () => undefined });

function readKeypadSetting(): boolean {
  try { return window.localStorage.getItem(KEYPAD_STORAGE_KEY) === "on"; } catch { return false; }
}

function saveKeypadSetting(enabled: boolean) {
  try { window.localStorage.setItem(KEYPAD_STORAGE_KEY, enabled ? "on" : "off"); } catch { /* storage unavailable: applies until the page reloads */ }
}

// One key press on a peso amount: at most 2 decimals and 7 whole digits, no leading zeros.
function pressAmountKey(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (key === "clear") return "";
  const [whole, decimals] = current.split(".");
  if (key === ".") return current.includes(".") ? current : `${current === "" ? "0" : current}.`;
  if (decimals !== undefined) return decimals.length >= 2 ? current : current + key;
  if (whole === "0") return key;
  return whole.length >= 7 ? current : current + key;
}

const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

function AmountKeypad({ title, value, onChange, onClose, quickAmounts, summary }: { title: string; value: string; onChange: (value: string) => void; onClose: () => void; quickAmounts?: number[]; summary?: (value: string) => React.ReactNode }) {
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const press = useCallback((key: string) => {
    const next = pressAmountKey(valueRef.current, key);
    valueRef.current = next;
    onChange(next);
  }, [onChange]);

  // A physical keyboard still works while the keypad is open (handy on a PC).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if (event.key === "." || event.key === ",") press(".");
      else if (event.key === "Backspace") press("back");
      else if (event.key === "Delete") press("clear");
      else if (event.key === "Enter") { event.preventDefault(); onClose(); }
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, onClose]);

  const amount = Number.parseFloat(value);
  return <Modal onClose={onClose} label={title} zIndex={95}>
    <section className="keypad" onClick={(event) => event.stopPropagation()}>
      <header className="keypad-head">
        <span>{title}</span>
        <button type="button" onClick={onClose} aria-label="Close keypad">×</button>
      </header>
      <div className={`keypad-display${value ? "" : " is-empty"}`} aria-live="polite">₱{value || "0.00"}</div>
      {summary && <div className="keypad-summary">{summary(value)}</div>}
      {quickAmounts && quickAmounts.length > 0 && <div className="keypad-quick">
        {quickAmounts.map((quick, index) => <button key={quick} type="button" aria-pressed={Number.isFinite(amount) && Math.abs(amount - quick) < 0.005} onClick={() => { valueRef.current = quick.toFixed(2); onChange(quick.toFixed(2)); }}>{index === 0 ? "Exact" : `₱${quick.toLocaleString("en-PH")}`}</button>)}
      </div>}
      <div className="keypad-keys">
        {keypadKeys.map((key) => <button key={key} type="button" className={key === "back" ? "is-back" : undefined} onClick={() => press(key)} aria-label={key === "back" ? "Delete last digit" : key === "." ? "Decimal point" : key}>
          {key === "back" ? <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg> : key}
        </button>)}
      </div>
      <div className="keypad-actions">
        <button type="button" className="is-clear" onClick={() => press("clear")}>Clear</button>
        <button type="button" className="is-done" onClick={onClose} data-autofocus>Done</button>
      </div>
    </section>
  </Modal>;
}

// A peso amount box. With the keypad on it opens the keypad; otherwise it is a normal number box.
function MoneyInput({ value, onChange, label, placeholder = "0.00", style, autoFocus, quickAmounts, summary }: { value: string; onChange: (value: string) => void; label: string; placeholder?: string; style?: React.CSSProperties; autoFocus?: boolean; quickAmounts?: number[]; summary?: (value: string) => React.ReactNode }) {
  const { enabled } = useContext(KeypadContext);
  const [open, setOpen] = useState(false);
  if (!enabled) {
    return <input type="number" min={0} step="0.01" inputMode="decimal" autoFocus={autoFocus} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} style={style} />;
  }
  return <>
    <input type="text" readOnly inputMode="none" value={value} placeholder={placeholder} aria-label={`${label}, opens the keypad`} aria-haspopup="dialog" className="money-input-keypad"
      onClick={() => setOpen(true)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); } }}
      style={{ ...style, cursor: "pointer", caretColor: "transparent" }} />
    {open && <AmountKeypad title={label} value={value} onChange={onChange} onClose={() => setOpen(false)} quickAmounts={quickAmounts} summary={summary} />}
  </>;
}

function KeypadSummaryRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="keypad-summary-row"><span>{label}</span><strong style={tone ? { color: tone } : undefined}>{value}</strong></div>;
}

// ─── Windows ─────────────────────────────────────────────────────────────────
// Every pop-up window uses this frame. It closes with Escape or a tap on the backdrop (unless
// something is saving), keeps keyboard focus inside the window, returns focus to whatever opened
// it, and stops the page behind from scrolling. On phones it opens as a sheet from the bottom.
const openModals: symbol[] = [];

function Modal({ onClose, closeDisabled = false, label, labelledBy, zIndex = 60, children }: { onClose: () => void; closeDisabled?: boolean; label?: string; labelledBy?: string; zIndex?: number; children: React.ReactNode }) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, closeDisabled });
  useEffect(() => { latest.current = { onClose, closeDisabled }; });

  useEffect(() => {
    const id = Symbol("modal");
    openModals.push(id);
    const backdrop = backdropRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(backdrop?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => element.offsetParent !== null);
    if (backdrop && !backdrop.contains(document.activeElement)) {
      (backdrop.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0] ?? backdrop).focus();
    }
    // Pages scroll inside .app-content rather than the body, so lock those while a window is open.
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>(".app-content"));
    const previousOverflow = scrollers.map((element) => element.style.overflowY);
    scrollers.forEach((element) => { element.style.overflowY = "hidden"; });

    const onKeyDown = (event: KeyboardEvent) => {
      // Only the top-most window reacts when windows are stacked.
      if (openModals[openModals.length - 1] !== id) return;
      if (event.key === "Escape") {
        if (!latest.current.closeDisabled) {
          event.preventDefault();
          latest.current.onClose();
        }
      } else if (event.key === "Tab") {
        const items = focusable();
        if (items.length === 0) { event.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !backdrop?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openModals.splice(openModals.indexOf(id), 1);
      scrollers.forEach((element, index) => { element.style.overflowY = previousOverflow[index]; });
      previouslyFocused?.focus?.();
    };
  }, []);

  return <div
    ref={backdropRef}
    className="ui-modal-backdrop"
    style={{ zIndex }}
    role="dialog"
    aria-modal="true"
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    tabIndex={-1}
    // mousedown (not click), so dragging a text selection out of the window does not close it.
    onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}
  >
    {children}
  </div>;
}

// ─── GCash (PayMongo) at the counter ─────────────────────────────────────────
// The customer scans the printed GCash sign at the counter (/pay/sign), which opens this payment
// on their phone; the QR on this screen is a fallback. They approve it in GCash. This window asks
// the server every couple of seconds; the server asks PayMongo, and creates the order (queue
// number, stock) only once the payment is confirmed.
// amount: what GCash charges. For a split ticket, cashAmount was already paid in cash.
type GcashCheckout = { token: string; amount: number; cashAmount?: number; total?: number; redirectUrl: string };
type GcashCheckoutView = { token: string; status: "awaiting_payment" | "completed" | "failed" | "cancelled" | "refunded" | "needs_attention"; amount: number; cashAmount?: number; orderId: number | null; queueNumber: number | null; shiftId: number | null; message: string | null };

function GcashPaymentDialog({ checkout, testMode, onPaid, onClose }: { checkout: GcashCheckout; testMode: boolean; onPaid: (view: GcashCheckoutView) => void; onClose: () => void }) {
  const [qr, setQr] = useState("");
  const [view, setView] = useState<GcashCheckoutView | null>(null);
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const finished = view !== null && view.status !== "awaiting_payment";

  useEffect(() => {
    if (!showQr) return;
    let active = true;
    void import("qrcode").then((QRCode) => QRCode.toDataURL(checkout.redirectUrl, { margin: 1, width: 280, color: { dark: "#3D2B1F", light: "#FFFFFF" } }))
      .then((url) => { if (active) setQr(url); })
      .catch(() => { if (active) setNotice("Could not draw the QR code. Use “Open on this tablet” instead."); });
    return () => { active = false; };
  }, [checkout.redirectUrl, showQr]);

  useEffect(() => {
    if (finished) return;
    let active = true;
    let inFlight = false;
    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/payments/${checkout.token}`, { cache: "no-store" });
        const payload = await response.json() as { data?: GcashCheckoutView; error?: string };
        if (!active) return;
        if (response.ok && payload.data) { setView(payload.data); setNotice(""); }
        else setNotice(payload.error || "Checking the payment…");
      } catch {
        if (active) setNotice("Connection hiccup. Still checking…");
      } finally {
        inFlight = false;
      }
    };
    const first = window.setTimeout(() => void check(), 1500);
    const intervalId = window.setInterval(() => void check(), 2500);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(intervalId); };
  }, [checkout.token, finished]);

  useEffect(() => {
    if (view?.status !== "completed") return;
    const timer = window.setTimeout(() => onPaid(view), 1800);
    return () => window.clearTimeout(timer);
  }, [view, onPaid]);

  async function cancel() {
    if (finished) { onClose(); return; }
    setCancelling(true);
    try {
      const response = await fetch(`/api/payments/${checkout.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const payload = await response.json() as { data?: GcashCheckoutView; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "Could not cancel the payment.");
      // Paid just before cancelling: the order was created, so treat it as paid.
      if (payload.data.status === "completed") setView(payload.data);
      else onClose();
    } catch (cancelError) {
      setNotice(cancelError instanceof Error ? cancelError.message : "Could not cancel the payment.");
    } finally {
      setCancelling(false);
    }
  }

  const status = view?.status ?? "awaiting_payment";
  return <Modal onClose={() => void cancel()} closeDisabled={cancelling || status === "completed"} label="GCash payment">
    <section className="gcash-dialog">
      <header>
        <span className="gcash-badge">GCash</span>
        {testMode && <span className="gcash-test">Test mode · no real money</span>}
      </header>
      <p className="gcash-amount">₱{checkout.amount.toFixed(2)}</p>
      {(checkout.cashAmount ?? 0) > 0 && <p className="gcash-split">Split ticket · ₱{(checkout.cashAmount ?? 0).toFixed(2)} paid in cash{checkout.total ? ` · total ₱${checkout.total.toFixed(2)}` : ""}</p>}
      {status === "awaiting_payment" && <>
        {showQr
          ? <div className="gcash-qr">{qr ? <Image src={qr} alt="QR code for the GCash payment" width={240} height={240} unoptimized /> : <span>Preparing QR…</span>}</div>
          : <div className="gcash-sign-hint"><strong>Ask the customer to scan the GCash sign</strong><span>This total appears on their phone. They tap “Pay with GCash” and approve it.</span></div>}
        <ol className="gcash-steps">
          <li>{showQr ? "The customer scans this QR with their phone camera." : "The customer scans the printed GCash sign at the counter."}</li>
          <li>They approve the payment in GCash.</li>
          <li>This window confirms by itself and the order goes to the queue.</li>
        </ol>
        <p className="gcash-waiting"><span className="connection-pulse" />Waiting for the customer to pay…</p>
        <div className="gcash-links">
          <button type="button" className="gcash-link" onClick={() => setShowQr((shown) => !shown)}>{showQr ? "Hide the QR on this screen" : "Show a QR on this screen instead"}</button>
          <a className="gcash-link" href="/pay/sign" target="_blank" rel="noreferrer">Print the counter sign</a>
        </div>
      </>}
      {status === "completed" && <div className="gcash-result is-paid">
        <strong>Paid</strong>
        <span>Queue number</span>
        <b>#{view?.queueNumber ?? "—"}</b>
      </div>}
      {status !== "awaiting_payment" && status !== "completed" && <div className={`gcash-result ${status === "refunded" || status === "cancelled" ? "is-info" : "is-failed"}`}>
        <strong>{status === "failed" ? "Payment didn’t go through" : status === "cancelled" ? "Cancelled" : status === "refunded" ? "Refunded" : "Needs attention"}</strong>
        <span>{view?.message}</span>
      </div>}
      {notice && <p className="gcash-notice">{notice}</p>}
      <div className="gcash-actions">
        {status === "completed"
          ? <button type="button" className="ui-button ui-button-primary" onClick={() => view && onPaid(view)}>Done</button>
          : <button type="button" className="ui-button ui-button-secondary" onClick={() => void cancel()} disabled={cancelling}>{finished ? "Close" : cancelling ? "Cancelling…" : "Cancel payment"}</button>}
      </div>
    </section>
  </Modal>;
}

// A product or size shows "N left" once this few can still be made; cards list up to this many
// sizes (one row each, temperatures side by side) before falling back to the picker window.
const POS_LOW_STOCK = 5;
const POS_MAX_CARD_SIZES = 4;

// Sizes smallest first: "8 oz" before "12 oz"; unnamed (Regular) sizes lead, others keep A to Z.
function sizeOrder(label: string | null): [number, string] {
  if (!label) return [-1, ""];
  const number = Number.parseFloat(label.replace(/[^0-9.]/g, ""));
  return [Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER, label.toLowerCase()];
}

// Cash the customer is likely to hand over: the exact amount, then the next round amounts.
function quickCashAmounts(total: number): number[] {
  if (!(total > 0)) return [];
  const amounts = [total];
  for (const step of [50, 100, 500, 1000]) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total && !amounts.includes(rounded)) amounts.push(rounded);
  }
  return amounts.slice(0, 4);
}

// ─── Customers at the counter ─────────────────────────────────────────────────────────────────
// The cashier can attach a customer to the order (search, or scan the QR in their mobile menu
// account), so the order shows in their purchases and the café's notes about them ("hot drinks
// with a straw") reach the cashier and the barista's ticket.
// stars: balance in the running loyalty campaign (null when none is running).
// birthdayTreat: a birthday campaign is on and they can have their treat now.
type AttachedCustomer = { id: number; fullName: string; username: string | null; notes: string; visits: number; lastVisit: string | null; stars?: number | null; birthdayTreat?: boolean };

function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

// Reads a QR code with the tablet camera (the back camera when there is one). jsQR is loaded
// only when scanning, so the POS stays light.
function QrScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState("");
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let lastScan = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setProblem("This device cannot use its camera here. Search by name instead."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setProblem("The camera is blocked or not available. Allow camera access for this site, or search by name instead.");
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) { stream.getTracks().forEach((track) => track.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const { default: jsQR } = await import("jsqr");
      const tick = (time: number) => {
        if (stopped) return;
        frame = requestAnimationFrame(tick);
        if (time - lastScan < 180 || !context || video.readyState < 2 || !video.videoWidth) return;
        lastScan = time;
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (found?.data) { stopped = true; cancelAnimationFrame(frame); onCodeRef.current(found.data); }
      };
      frame = requestAnimationFrame(tick);
    })();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, []);

  return <div className="pos-scan">
    {problem ? <p className="pos-scan-problem">{problem}</p> : <>
      <video ref={videoRef} playsInline muted className="pos-scan-video" />
      <span className="pos-scan-frame" aria-hidden="true" />
      <p className="pos-scan-hint">Ask the customer to open <strong>Sign in → their account → My QR code</strong> on the mobile menu, then hold it up to the camera.</p>
    </>}
    <button type="button" className="pos-scan-cancel" onClick={onCancel}>Search by name instead</button>
  </div>;
}

function CustomerPickerDialog({ onPick, onClose }: { onPick: (customer: AttachedCustomer) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttachedCustomer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const text = query.trim();
    if (text.replace(/^@/, "").length < 2) { const timer = window.setTimeout(() => { setResults(null); setLoading(false); }, 0); return () => window.clearTimeout(timer); }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/customers?q=${encodeURIComponent(text)}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not search the customers.");
        if (active) { setResults(payload.data ?? []); setError(""); }
      } catch (searchError) {
        if (active) setError(searchError instanceof Error ? searchError.message : "Could not search the customers.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  async function lookUpCode(code: string) {
    setScanning(false);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not look up that code.");
      const found = (payload.data ?? [])[0] as AttachedCustomer | undefined;
      if (found) onPick(found);
      else setError("That QR code is not a Brew Houze customer account (or the account is deactivated). Try searching by name.");
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Could not look up that code.");
    } finally {
      setLoading(false);
    }
  }

  return <Modal onClose={onClose} label="Add a customer to this order">
    <section className="pos-customer-dialog">
      <div className="pos-customer-dialog-head">
        <div><p>Customer</p><h3>Who is this order for?</h3></div>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      {scanning ? <QrScanner onCode={(code) => void lookUpCode(code)} onCancel={() => setScanning(false)} /> : <>
        <div className="pos-customer-search">
          <input data-autofocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or @username" autoComplete="off" autoCapitalize="none" aria-label="Search customers" />
          <button type="button" onClick={() => setScanning(true)}>Scan QR</button>
        </div>
        {error && <p className="pos-customer-error" role="alert">{error}</p>}
        <div className="pos-customer-results">
          {loading ? <p className="pos-customer-empty">Searching…</p>
            : results === null ? <p className="pos-customer-empty">Type at least 2 letters of their name or username, or scan the QR code in their mobile menu account.</p>
              : results.length === 0 ? <p className="pos-customer-empty">No customer matches. The admin can add regulars in Customers, or the customer can make an account on the mobile menu.</p>
                : results.map((customer) => <button key={customer.id} type="button" className="pos-customer-result" onClick={() => onPick(customer)}>
                  <span className="pos-customer-avatar">{customerInitials(customer.fullName)}</span>
                  <span className="pos-customer-result-text">
                    <strong>{customer.fullName}</strong>
                    <em>{customer.username ? `@${customer.username}` : "No app account"} · {customer.visits} visit{customer.visits === 1 ? "" : "s"}{customer.stars !== null && customer.stars !== undefined ? ` · ★ ${customer.stars}` : ""}</em>
                    {customer.notes && <small>📝 {customer.notes}</small>}
                  </span>
                </button>)}
        </div>
      </>}
    </section>
  </Modal>;
}

// Loyalty at the counter. Customers with the app scan the printed Stars sign and pick a reward
// on their phone; their claim waits here until the cashier accepts it into the order. Regulars
// without the app redeem with the cashier confirming their own password.
// A reward is a free item or a discount off the order; birthday treats cost no stars.
type LoyaltyRewardRule = {
  id: number; name: string; starsCost: number; kind?: "seasonal" | "birthday"; rewardType?: "free_item" | "discount";
  productId: number | null; category: string | null; maxPrice: number | null;
  discountKind?: "percent" | "fixed" | null; discountValue?: number | null; maxDiscount?: number | null; minOrderAmount?: number | null;
};
type CounterClaim = { id: number; rewardId: number | null; customerId: number; fullName: string; username: string | null; notes: string; stars: number; birthdayTreat?: boolean; createdAt: string };
type CounterLoyalty = { campaign: { id: number; name: string } | null; birthday?: { id: number; name: string; window: string } | null; rewards: LoyaltyRewardRule[]; claims: CounterClaim[] };

// "10% off (up to ₱50)" / "₱30.00 off Pastries".
function discountText(reward: LoyaltyRewardRule): string {
  if (!reward.discountKind || !reward.discountValue) return "";
  const off = reward.discountKind === "percent" ? `${reward.discountValue}% off` : `₱${Number(reward.discountValue).toFixed(2)} off`;
  return `${off}${reward.category ? ` ${reward.category}` : ""}${reward.discountKind === "percent" && reward.maxDiscount ? ` (up to ₱${Number(reward.maxDiscount).toFixed(2)})` : ""}`;
}

// "Free drink · ★ 10", "Birthday latte · 🎂", "10% off · ★ 8".
function rewardLabel(reward: LoyaltyRewardRule): string {
  const what = reward.rewardType === "discount" ? `${reward.name} (${discountText(reward)})` : reward.name;
  return `${what} · ${reward.kind === "birthday" ? "🎂 birthday treat" : `★ ${reward.starsCost}`}`;
}
const CLAIMS_REFRESH_MS = 5000;

// Why an item cannot be taken as this reward (the server checks the same rules).
function rewardMismatch(reward: LoyaltyRewardRule, item: { productId: number; category: string | null; price: number }): string | null {
  if (reward.rewardType === "discount") return "discount";
  if (reward.productId !== null && reward.productId !== item.productId) return "different product";
  if (reward.productId === null && reward.category && reward.category !== (item.category ?? "")) return `only ${reward.category}`;
  if (reward.maxPrice !== null && item.price > reward.maxPrice + 0.005) return `over ₱${reward.maxPrice.toFixed(2)}`;
  return null;
}

function WaitingClaims({ claims, rewards, busyId, onAccept, onDecline }: { claims: CounterClaim[]; rewards: LoyaltyRewardRule[]; busyId: number | null; onAccept: (claim: CounterClaim) => void; onDecline: (claim: CounterClaim) => void }) {
  if (claims.length === 0) return null;
  return <div className="pos-claims" role="region" aria-label="Customers waiting from the Stars sign">
    <p className="pos-claims-title">★ Waiting at the counter</p>
    {claims.map((claim) => {
      const reward = rewards.find((item) => item.id === claim.rewardId) ?? null;
      return <div key={claim.id} className="pos-claim">
        <span className="pos-customer-avatar">{customerInitials(claim.fullName)}</span>
        <span className="pos-customer-result-text"><strong>{claim.fullName}</strong><em>{reward ? `wants ${rewardLabel(reward)}` : "add me to this order"} · has ★ {claim.stars}{claim.birthdayTreat ? " · 🎂 birthday" : ""}</em></span>
        <button type="button" className="pos-claim-accept" disabled={busyId !== null} onClick={() => onAccept(claim)}>{busyId === claim.id ? "…" : "Add"}</button>
        <button type="button" className="pos-claim-decline" disabled={busyId !== null} onClick={() => onDecline(claim)} aria-label={`Decline ${claim.fullName}`} title="Decline">×</button>
      </div>;
    })}
  </div>;
}

// ID discounts switched on in Admin → Discounts (senior, PWD and others) and the shop's VAT
// setting. Senior and PWD items lose their VAT first (price / 1.12), then the discount.
type CounterDiscountType = { id: number; code: string; name: string; discountKind: "percent" | "fixed"; discountValue: number; maxDiscount: number | null; vatExempt: boolean; requiresId: boolean; idLabel: string | null };
type CounterVat = { registered: boolean; rate: number };
// One person's ID discount in the cart: units of their own cart lines (cart line key → units),
// or a share of the whole bill (lines null, split by groupSize).
type CartIdDiscount = { key: string; type: CounterDiscountType; holderName: string; idNumber: string; lines: Record<string, number> | null; groupSize: number | null };
let nextIdDiscountKey = 0;

// The same calculation as lib/discounts.ts on the server (which has the final say).
function idDiscountAmounts(type: CounterDiscountType, coveredAmount: number, vat: CounterVat): { vatExempt: number; discount: number } {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const covered = Math.max(0, round2(coveredAmount));
  const vatExempt = type.vatExempt && vat.registered && vat.rate > 0 ? round2(covered - covered / (1 + vat.rate / 100)) : 0;
  const base = round2(covered - vatExempt);
  let discount = type.discountKind === "percent" ? base * type.discountValue / 100 : type.discountValue;
  if (type.maxDiscount !== null) discount = Math.min(discount, type.maxDiscount);
  return { vatExempt, discount: round2(Math.min(Math.max(0, discount), base)) };
}

function idDiscountRuleText(type: CounterDiscountType, vat: CounterVat): string {
  const off = type.discountKind === "percent" ? `${type.discountValue}% off` : `₱${type.discountValue.toFixed(2)} off`;
  return `${off}${type.vatExempt && vat.registered ? " + no VAT" : ""}${type.maxDiscount !== null ? ` (up to ₱${type.maxDiscount.toFixed(2)})` : ""}`;
}

type IdDiscountLine = { key: string; label: string; qty: number; unit: number };

// Adds one person's ID discount: the discount, their name and ID number, and what it covers
// (their own items, or their share of a shared bill).
function IdDiscountDialog({ types, vat, lines, taken, lockedMode, lockedGroupSize, existing, initialTypeId = null, onAdd, onClose }: {
  types: CounterDiscountType[]; vat: CounterVat; lines: IdDiscountLine[];
  // The discount a customer claimed on the mobile menu (preselected).
  initialTypeId?: number | null;
  // Units of each line already covered by other people's discounts.
  taken: Record<string, number>;
  // Every ID discount on an order uses the same way of covering (and the same group size).
  lockedMode: "items" | "shared" | null; lockedGroupSize: number | null; existing: number;
  onAdd: (entry: CartIdDiscount) => void; onClose: () => void;
}) {
  const [typeId, setTypeId] = useState(initialTypeId !== null && types.some((entry) => entry.id === initialTypeId) ? initialTypeId : types[0]?.id ?? 0);
  const [holderName, setHolderName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [mode, setMode] = useState<"items" | "shared">(lockedMode ?? "items");
  // The first person gets every item by default (the usual case: one customer, one order).
  const [picks, setPicks] = useState<Record<string, number>>(() => existing === 0 ? Object.fromEntries(lines.map((line) => [line.key, Math.max(0, line.qty - (taken[line.key] ?? 0))])) : {});
  const [groupSize, setGroupSize] = useState(String(lockedGroupSize ?? Math.max(2, existing + 1)));
  const [checked, setChecked] = useState(false);
  const type = types.find((entry) => entry.id === typeId) ?? types[0];
  const orderAmount = lines.reduce((sum, line) => sum + line.unit * line.qty, 0);
  const people = Number.parseInt(groupSize, 10);
  const covered = mode === "shared"
    ? (Number.isInteger(people) && people > 0 ? orderAmount / people : 0)
    : lines.reduce((sum, line) => sum + line.unit * Math.min(picks[line.key] ?? 0, Math.max(0, line.qty - (taken[line.key] ?? 0))), 0);
  const amounts = type ? idDiscountAmounts(type, covered, vat) : { vatExempt: 0, discount: 0 };
  const problem = !type ? "No discount is switched on."
    : holderName.trim().length < 2 ? "Enter their full name."
      : type.requiresId && idNumber.trim().length < 3 ? `Enter the ${type.idLabel ?? "ID number"}.`
        : mode === "shared" && (!Number.isInteger(people) || people < existing + 1 || people > 50) ? `Enter how many people share the bill (at least ${existing + 1}).`
          : covered <= 0 ? "Tick the items that are theirs."
            : type.requiresId && !checked ? "Check the ID, then tick the box above."
              : "";
  function stepGroup(delta: number) {
    setGroupSize(String(Math.min(50, Math.max(existing + 1, (Number.isInteger(people) ? people : 2) + delta))));
  }
  return <Modal onClose={onClose} label="Add an ID discount">
    <form className="pos-customer-dialog pos-idd" onSubmit={(event) => {
      event.preventDefault();
      if (problem || !type) return;
      nextIdDiscountKey += 1;
      onAdd({ key: `idd-${nextIdDiscountKey}`, type, holderName: holderName.trim().replace(/\s+/g, " "), idNumber: idNumber.trim(), lines: mode === "shared" ? null : Object.fromEntries(Object.entries(picks).filter(([, units]) => units > 0)), groupSize: mode === "shared" ? people : null });
    }}>
      <div className="pos-customer-dialog-head"><div><p>ID discount</p><h3>Who gets the discount?</h3></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="pos-idd-scroll">
        <div className="pos-idd-types" role="radiogroup" aria-label="Discount">
          {types.map((entry) => <button key={entry.id} type="button" role="radio" aria-checked={entry.id === type?.id} className={entry.id === type?.id ? "is-on" : ""} onClick={() => { setTypeId(entry.id); setChecked(false); }}>
            <strong>{entry.name}</strong><em>{idDiscountRuleText(entry, vat)}</em>
          </button>)}
        </div>
        <div className="pos-idd-fields">
          <label><span>Full name</span><input autoFocus value={holderName} onChange={(event) => setHolderName(event.target.value)} maxLength={80} placeholder="As on the ID" autoComplete="off" /></label>
          {type && (type.requiresId || type.idLabel) && <label><span>{type.idLabel ?? "ID no."}{type.requiresId ? "" : " (optional)"}</span><input value={idNumber} onChange={(event) => setIdNumber(event.target.value)} maxLength={40} autoComplete="off" /></label>}
        </div>
        <div className="pos-idd-mode" role="radiogroup" aria-label="What the discount covers">
          <button type="button" role="radio" aria-checked={mode === "items"} className={mode === "items" ? "is-on" : ""} disabled={lockedMode === "shared"} onClick={() => setMode("items")}><strong>Their own items</strong><em>Tick what they will eat or drink</em></button>
          <button type="button" role="radio" aria-checked={mode === "shared"} className={mode === "shared" ? "is-on" : ""} disabled={lockedMode === "items"} onClick={() => setMode("shared")}><strong>Shared bill</strong><em>Split evenly by the number of people</em></button>
        </div>
        {mode === "items" ? <div className="pos-idd-lines">
          {lines.map((line) => {
            const max = Math.max(0, line.qty - (taken[line.key] ?? 0));
            const units = Math.min(picks[line.key] ?? 0, max);
            return <div key={line.key} className={`pos-idd-line${units > 0 ? " is-on" : ""}${max === 0 ? " is-taken" : ""}`}>
              <label>
                <input type="checkbox" checked={units > 0} disabled={max === 0} onChange={(event) => setPicks((current) => ({ ...current, [line.key]: event.target.checked ? max : 0 }))} />
                <span><strong>{line.label}</strong><em>{max === 0 ? "Covered by another discount" : `₱${line.unit.toFixed(2)} each${line.qty > 1 ? ` · ${max} of ${line.qty} free to cover` : ""}`}</em></span>
              </label>
              {max > 1 && units > 0 && <span className="pos-idd-step">
                <button type="button" onClick={() => setPicks((current) => ({ ...current, [line.key]: Math.max(1, units - 1) }))} aria-label={`One fewer ${line.label}`}>−</button>
                <b>{units}</b>
                <button type="button" onClick={() => setPicks((current) => ({ ...current, [line.key]: Math.min(max, units + 1) }))} aria-label={`One more ${line.label}`}>+</button>
              </span>}
            </div>;
          })}
        </div> : <div className="pos-idd-shared">
          <span>People sharing the bill</span>
          <span className="pos-idd-step">
            <button type="button" onClick={() => stepGroup(-1)} disabled={lockedGroupSize !== null} aria-label="One person fewer">−</button>
            <input value={groupSize} onChange={(event) => setGroupSize(event.target.value.replace(/\D/g, "").slice(0, 2))} disabled={lockedGroupSize !== null} inputMode="numeric" aria-label="People sharing the bill" />
            <button type="button" onClick={() => stepGroup(1)} disabled={lockedGroupSize !== null} aria-label="One person more">+</button>
          </span>
          <em>{Number.isInteger(people) && people > 0 ? `Their share: ₱${orderAmount.toFixed(2)} ÷ ${people} = ₱${(orderAmount / people).toFixed(2)}` : ""}{lockedGroupSize !== null ? " · same group as the other discounts" : ""}</em>
        </div>}
        {type?.requiresId && <label className="pos-idd-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>I checked the {type.name} ID: the photo and the name match the customer.</span>
        </label>}
        {covered > 0 && type && <div className="pos-idd-summary">
          <div><span>Covers</span><b>₱{covered.toFixed(2)}</b></div>
          {amounts.vatExempt > 0 && <div><span>Less VAT ({vat.rate}%)</span><b>−₱{amounts.vatExempt.toFixed(2)}</b></div>}
          <div><span>Less {type.discountKind === "percent" ? `${type.discountValue}%` : "discount"}</span><b>−₱{amounts.discount.toFixed(2)}</b></div>
          <div className="is-total"><span>They pay for these</span><b>₱{Math.max(0, covered - amounts.vatExempt - amounts.discount).toFixed(2)}</b></div>
        </div>}
      </div>
      {problem && <p className="pos-idd-problem">{problem}</p>}
      <button type="submit" className="pos-reward-button" disabled={Boolean(problem)}>Add discount</button>
    </form>
  </Modal>;
}

// ID photos sent from the mobile menu, waiting for the counter to check them. Approving lets the
// customer pay with GCash on their phone; the photo is deleted either way.
type PendingIdCheck = {
  id: number; holderName: string; idNumber: string | null; items: { productVariantId: number; quantity: number; additionIds: number[] }[];
  lines: { line: number; quantity: number }[] | null; groupSize: number | null; serviceType: "dine_in" | "take_out"; remember: boolean;
  discountTypeId: number | null; discountName: string; discountCode: string; idLabel: string | null; hasPhoto: boolean;
  customerName: string | null; username: string | null; createdAt: string; expiresAt: string;
};
const ID_REJECT_REASONS = ["The photo is blurry or cut off", "The ID has expired", "The name doesn't match", "This isn't a valid ID for this discount"];

function WaitingIdChecks({ checks, notice, onOpen }: { checks: PendingIdCheck[]; notice: string; onOpen: (check: PendingIdCheck) => void }) {
  if (checks.length === 0 && !notice) return null;
  return <div className="pos-claims pos-idcheck" role="region" aria-label="ID photos waiting to be checked">
    <p className="pos-claims-title">🪪 Check ID{checks.length > 1 ? ` · ${checks.length} waiting` : ""}</p>
    {notice && <p className="pos-idcheck-notice">{notice}</p>}
    {checks.map((check) => {
      const units = check.items.reduce((sum, item) => sum + item.quantity, 0);
      const minutes = Math.max(0, Math.round((new Date().getTime() - new Date(check.createdAt).getTime()) / 60_000));
      return <div key={check.id} className="pos-claim">
        <span className="pos-customer-avatar" style={{ background: "#1D4ED8" }}>🪪</span>
        <span className="pos-customer-result-text"><strong>{check.discountName} · {check.holderName}</strong><em>{units} item{units === 1 ? "" : "s"} · mobile menu · {minutes < 1 ? "just now" : `${minutes} min ago`}</em></span>
        <button type="button" className="pos-claim-accept" onClick={() => onOpen(check)}>Check</button>
      </div>;
    })}
  </div>;
}

// lines: the order's items as the POS menu knows them, with how many units are the holder's own.
type IdCheckLine = { label: string; qty: number; unit: number; covered: number };

function IdCheckDialog({ check, lines, types, vat, onDecided, onClose }: {
  check: PendingIdCheck; lines: IdCheckLine[]; types: CounterDiscountType[]; vat: CounterVat;
  onDecided: (message: string) => void; onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const orderAmount = lines.reduce((sum, line) => sum + line.unit * line.qty, 0);
  const coveredAmount = check.groupSize ? orderAmount / check.groupSize : lines.reduce((sum, line) => sum + line.unit * line.covered, 0);
  const type = types.find((entry) => entry.id === check.discountTypeId) ?? null;
  const amounts = type ? idDiscountAmounts(type, coveredAmount, vat) : null;

  async function decide(action: "approve" | "reject") {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/id-verifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: check.id, action, reason }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the decision.");
      onDecided(action === "approve" ? `Approved ${check.holderName}'s ${check.discountName} ID. They can pay on their phone now.` : `Rejected ${check.holderName}'s ID. They were told why.`);
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Could not save the decision.");
      setWorking(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={working} label={`Check ${check.holderName}'s ID`}>
    <section className="pos-customer-dialog pos-idd pos-idcheck-dialog">
      <div className="pos-customer-dialog-head"><div><p>Check ID · {check.discountName} · mobile menu</p><h3>{check.holderName}</h3></div><button type="button" onClick={onClose} disabled={working} aria-label="Close">×</button></div>
      <div className="pos-idd-scroll">
        {check.hasPhoto && !photoFailed
          ? <button type="button" className={`pos-idcheck-photo${zoomed ? " is-zoomed" : ""}`} onClick={() => setZoomed((value) => !value)} aria-label={zoomed ? "Make the photo smaller" : "Make the photo bigger"}>
            <Image src={`/api/id-verifications/${check.id}/photo`} alt={`${check.discountName} ID sent by ${check.holderName}`} width={640} height={400} unoptimized onError={() => setPhotoFailed(true)} />
            <span>{zoomed ? "Tap to make smaller" : "Tap to zoom"}</span>
          </button>
          : <p className="pos-idd-problem">The photo is no longer available (the request may have expired or been cancelled).</p>}
        <div className="pos-idcheck-facts">
          <span><em>Name typed</em><strong>{check.holderName}</strong></span>
          <span><em>{check.idLabel ?? "ID no."}</em><strong>{check.idNumber ?? "—"}</strong></span>
          <span><em>Order</em><strong>{check.serviceType === "take_out" ? "Take out" : "Dine in"}{check.customerName ? ` · ${check.customerName}` : " · guest"}</strong></span>
        </div>
        {check.remember && check.username && <p className="pos-idcheck-remember">They asked to remember this ID on their account (@{check.username}), so their next orders get the discount without a photo. Only the name and ID number are saved.</p>}
        <div className="pos-idd-lines">
          {lines.map((line, index) => <div key={index} className={`pos-idd-line${check.groupSize || line.covered > 0 ? " is-on" : ""}`}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}><strong style={{ color: "#3D2B1F", fontSize: 12.5 }}>{line.qty} × {line.label}</strong><em style={{ color: "#9C8278", fontSize: 11, fontStyle: "normal" }}>₱{line.unit.toFixed(2)} each{check.groupSize ? "" : line.covered > 0 ? ` · ${line.covered} theirs` : " · not theirs"}</em></span>
          </div>)}
        </div>
        {amounts && <div className="pos-idd-summary">
          <div><span>{check.groupSize ? `Their share (1 of ${check.groupSize})` : "Their items"}</span><b>₱{coveredAmount.toFixed(2)}</b></div>
          {amounts.vatExempt > 0 && <div><span>Less VAT ({vat.rate}%)</span><b>−₱{amounts.vatExempt.toFixed(2)}</b></div>}
          <div><span>Less discount</span><b>−₱{amounts.discount.toFixed(2)}</b></div>
          <div className="is-total"><span>Order total after the discount</span><b>₱{Math.max(0, orderAmount - amounts.vatExempt - amounts.discount).toFixed(2)}</b></div>
        </div>}
        {rejecting ? <div className="pos-idcheck-reject">
          <span>Why? The customer sees this.</span>
          <div className="pos-idcheck-reasons">{ID_REJECT_REASONS.map((option) => <button key={option} type="button" className={reason === option ? "is-on" : ""} onClick={() => setReason(option)}>{option}</button>)}</div>
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={160} placeholder="Or type a reason" />
        </div> : <label className="pos-idd-check">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>The photo shows a valid {check.discountName} ID, and the name and number match what they typed. The barista will still check the real ID at pickup.</span>
        </label>}
      </div>
      {error && <p className="pos-idd-problem">{error}</p>}
      {rejecting
        ? <div className="pos-idcheck-actions">
          <button type="button" className="pos-idcheck-secondary" disabled={working} onClick={() => setRejecting(false)}>Back</button>
          <button type="button" className="pos-reward-button pos-idcheck-reject-button" disabled={working || !reason.trim()} onClick={() => void decide("reject")}>{working ? "Saving…" : "Reject ID"}</button>
        </div>
        : <div className="pos-idcheck-actions">
          <button type="button" className="pos-idcheck-secondary" disabled={working} onClick={() => setRejecting(true)}>Reject…</button>
          <button type="button" className="pos-reward-button" disabled={working || !confirmed} onClick={() => void decide("approve")}>{working ? "Saving…" : "Approve"}</button>
        </div>}
    </section>
  </Modal>;
}

// Carts customers sent from the mobile menu to claim an ID discount: the cashier loads one into
// the POS, checks the ID, and takes payment.
type CounterCart = {
  id: number; code: string; items: { productVariantId: number; quantity: number; additionIds: number[] }[];
  serviceType: "dine_in" | "take_out"; discountTypeId: number | null; discountName: string | null;
  createdAt: string; expiresAt: string; customer: AttachedCustomer | null;
};

function WaitingCounterCarts({ carts, loadedId, onLoad, onDismiss }: { carts: CounterCart[]; loadedId: number | null; onLoad: (cart: CounterCart) => void; onDismiss: (cart: CounterCart) => void }) {
  const visible = carts.filter((cart) => cart.id !== loadedId);
  if (visible.length === 0) return null;
  return <div className="pos-claims pos-sent" role="region" aria-label="Carts sent from the mobile menu">
    <p className="pos-claims-title">📱 Sent to the counter</p>
    {visible.map((cart) => {
      const units = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      return <div key={cart.id} className="pos-claim">
        <span className="pos-sent-code">{cart.code}</span>
        <span className="pos-customer-result-text"><strong>{cart.discountName ?? "ID discount"}{cart.customer ? ` · ${cart.customer.fullName}` : ""}</strong><em>{units} item{units === 1 ? "" : "s"} · {cart.serviceType === "take_out" ? "take out" : "dine in"} · sent {new Date(cart.createdAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}</em></span>
        <button type="button" className="pos-claim-accept" onClick={() => onLoad(cart)}>Load</button>
        <button type="button" className="pos-claim-decline" onClick={() => onDismiss(cart)} aria-label={`Dismiss cart ${cart.code}`} title="Dismiss">×</button>
      </div>;
    })}
  </div>;
}

// The customer line in the cart: a button to attach one, or who it is with the café's notes.
function CartCustomerSlot({ customer, onAdd, onRemove, onUseReward, rewardNote }: { customer: AttachedCustomer | null; onAdd: () => void; onRemove: () => void; onUseReward?: () => void; rewardNote?: string }) {
  if (!customer) return <button type="button" className="pos-customer-add" onClick={onAdd}>+ Add customer <span>for their purchases and notes</span></button>;
  return <div className="pos-customer-slot">
    <div className="pos-customer-slot-top">
      <span className="pos-customer-avatar">{customerInitials(customer.fullName)}</span>
      <span className="pos-customer-result-text"><strong>{customer.fullName}</strong><em>{customer.username ? `@${customer.username}` : "No app account"} · {customer.visits} visit{customer.visits === 1 ? "" : "s"}</em></span>
      {customer.stars !== null && customer.stars !== undefined && <span className="pos-customer-stars" title="Stars in the running loyalty campaign">★ {customer.stars}</span>}
      <button type="button" onClick={onRemove} aria-label={`Remove ${customer.fullName} from this order`} title="Remove customer">×</button>
    </div>
    {customer.notes && <p className="pos-customer-note">📝 {customer.notes}</p>}
    {onUseReward && <button type="button" className="pos-reward-button" onClick={onUseReward}>🎁 Use a reward</button>}
    {rewardNote && <p className="pos-reward-note">{rewardNote}</p>}
  </div>;
}

function POSPage({ userName, onQueueAssigned }: { userName: string; onQueueAssigned: (queueNumber: number, shiftId: number) => void }) {
  type Ingredient = { inventory_id: number; required_quantity: string | number; available_quantity: string | number };
  type Addition = { addition_id: number; addition_name: string; quantity: string | number; price: string | number; unit_of_measure: string; inventory_id: number; available_quantity: string | number };
  type Variant = { product_variant_id: number; price: string | number; size_label: string | null; temperature?: "hot" | "cold" | "both" | null; available?: boolean; max_quantity?: number; ingredients: Ingredient[] };
  type Product = { product_id: number; product_name: string; product_description?: string; product_category: string | null; product_type?: "recipe" | "stock"; image_url?: string | null; variants: Variant[] };
  type ProductsResponse = { data?: Product[]; additions?: Addition[] };
  // "count" is how many of this add-on go on EACH cup of the line (Double Shot x2 per cup).
  type CartAddition = Addition & { count: number };
  // rewardId: a loyalty reward line (one item, free, paid with stars; its add-ons are still charged).
  type CartItem = { key: string; productId: number; variantId: number | null; name: string; size?: string | null; temperature?: "hot" | "cold" | "both" | null; isRecipe: boolean; qty: number; price: number; ingredients: Ingredient[]; additions: CartAddition[]; rewardId?: number; rewardName?: string; rewardCost?: number; rewardBirthday?: boolean };
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash" | "split">("cash");
  // Split ticket: the part the customer pays in cash; GCash covers the rest.
  const [cashPart, setCashPart] = useState("");
  // Phones only: the cart opens as a full-height sheet over the products (see .pos-cart in CSS).
  const [cartOpen, setCartOpen] = useState(false);
  // The order just placed, with a button to print its receipt (or printing it right away).
  const receipts = useContext(ReceiptContext);
  // stars: "+2 ★ for Maria" when the attached customer earned loyalty stars.
  const [lastPlaced, setLastPlaced] = useState<{ orderId: number; queueNumber: number; note: string; stars?: string } | null>(null);
  useEffect(() => {
    if (!lastPlaced) return;
    const timer = window.setTimeout(() => setLastPlaced(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [lastPlaced]);
  async function printPlacedReceipt(orderId: number, queueNumber: number) {
    setLastPlaced((current) => ({ orderId, queueNumber, stars: current?.orderId === orderId ? current.stars : undefined, note: receipts.settings.output === "pdf" ? "Downloading the receipt PDF…" : "Opening the print window…" }));
    const problem = await receipts.printReceipt(orderId);
    setLastPlaced((current) => current && current.orderId === orderId ? { ...current, note: problem ?? (receipts.settings.output === "pdf" ? "Receipt PDF downloaded" : "") } : current);
  }
  // GCash through PayMongo, when the server has PayMongo keys.
  const [gcashConfig, setGcashConfig] = useState<{ gcash: boolean; testMode: boolean; minimumAmount: number } | null>(null);
  const [gcashCheckout, setGcashCheckout] = useState<GcashCheckout | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [additions, setAdditions] = useState<Addition[]>([]);
  // The cart line that add-ons tapped in the POS list attach to.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Category tab shown in the product area; ADDONS_TAB shows the add-on buttons.
  const [activeCategory, setActiveCategory] = useState("");
  const [selectionProduct, setSelectionProduct] = useState<Product | null>(null);
  const cartLineId = useRef(0);
  // The customer attached to this order (optional).
  const [customer, setCustomer] = useState<AttachedCustomer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  // Loyalty: the running campaign's rewards and the claims from the Stars sign (refreshed while
  // the POS is open), the accepted claim of this order, and the reward being given.
  const [loyalty, setLoyalty] = useState<CounterLoyalty>({ campaign: null, rewards: [], claims: [] });
  const [claimId, setClaimId] = useState<number | null>(null);
  const [claimBusyId, setClaimBusyId] = useState<number | null>(null);
  const [rewardChoiceOpen, setRewardChoiceOpen] = useState(false);
  const [rewardForItem, setRewardForItem] = useState<LoyaltyRewardRule | null>(null);
  // A discount reward on this order (at most one).
  const [discountReward, setDiscountReward] = useState<LoyaltyRewardRule | null>(null);
  // Eaten at the café or taken away: the barista's mug or cup, and the receipt.
  const [serviceType, setServiceType] = useState<"dine_in" | "take_out">("dine_in");
  const [rewardPasswordOpen, setRewardPasswordOpen] = useState(false);
  const [rewardPassword, setRewardPassword] = useState("");
  const [rewardPasswordInvalid, setRewardPasswordInvalid] = useState(false);
  // ID discounts (senior, PWD and others): what the admin switched on, and the people on this order.
  const [idDiscountSetup, setIdDiscountSetup] = useState<{ types: CounterDiscountType[]; vat: CounterVat }>({ types: [], vat: { registered: true, rate: 12 } });
  const [idDiscounts, setIdDiscounts] = useState<CartIdDiscount[]>([]);
  const [idDiscountDialogOpen, setIdDiscountDialogOpen] = useState(false);
  const [idDiscountInitialType, setIdDiscountInitialType] = useState<number | null>(null);
  // Carts sent from the mobile menu, and the one loaded into this order.
  const [counterCarts, setCounterCarts] = useState<CounterCart[]>([]);
  const [counterCartId, setCounterCartId] = useState<number | null>(null);
  // ID photos sent from the mobile menu, the one being checked, and the last decision made.
  const [idChecks, setIdChecks] = useState<PendingIdCheck[]>([]);
  const [idCheckOpen, setIdCheckOpen] = useState<PendingIdCheck | null>(null);
  const [idCheckNotice, setIdCheckNotice] = useState("");
  const refreshIdChecks = useCallback(async () => {
    try {
      const response = await fetch("/api/id-verifications", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: PendingIdCheck[] };
      if (payload.data) setIdChecks(payload.data);
    } catch {
      // Offline for a moment: the next refresh catches up.
    }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void refreshIdChecks(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshIdChecks(); }, CLAIMS_REFRESH_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [refreshIdChecks]);
  useEffect(() => {
    if (!idCheckNotice) return;
    const timer = window.setTimeout(() => setIdCheckNotice(""), 12_000);
    return () => window.clearTimeout(timer);
  }, [idCheckNotice]);
  const refreshCounterCarts = useCallback(async () => {
    try {
      const response = await fetch("/api/counter-carts", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: CounterCart[] };
      if (payload.data) setCounterCarts(payload.data);
    } catch {
      // Offline for a moment: the next refresh catches up.
    }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void refreshCounterCarts(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshCounterCarts(); }, CLAIMS_REFRESH_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [refreshCounterCarts]);
  const loadIdDiscountSetup = useCallback(async () => {
    try {
      const response = await fetch("/api/discounts", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: { types: CounterDiscountType[]; vat: CounterVat } };
      if (payload.data) setIdDiscountSetup(payload.data);
    } catch {
      // Offline for a moment: keeps the last list.
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadIdDiscountSetup(), 0);
    return () => window.clearTimeout(timer);
  }, [loadIdDiscountSetup]);

  const refreshLoyalty = useCallback(async () => {
    try {
      const response = await fetch("/api/claims", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: CounterLoyalty };
      if (payload.data) setLoyalty(payload.data);
    } catch {
      // Offline for a moment: the next refresh catches up.
    }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void refreshLoyalty(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshLoyalty(); }, CLAIMS_REFRESH_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [refreshLoyalty]);

  useEffect(() => {
    let active = true;
    fetch("/api/payments", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (active && payload?.data) setGcashConfig(payload.data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProducts(showLoading = true) {
      if (showLoading) setLoading(true);
      try {
        const tries = ["/api/products"];
        let payload: ProductsResponse | null = null;
        for (const url of tries) {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`bad status ${res.status}`);
            payload = await res.json();
            break;
          } catch {
            continue;
          }
        }
        if (!payload) throw new Error("Unable to load products");
        if (active) {
          const nextProducts = payload.data ?? [];
          const nextAdditions = payload.additions ?? [];
          setProducts((current) => JSON.stringify(current) === JSON.stringify(nextProducts) ? current : nextProducts);
          setAdditions((current) => JSON.stringify(current) === JSON.stringify(nextAdditions) ? current : nextAdditions);
        }
      } catch (err) {
        console.error("POS: failed to load products", err);
        if (active) setProducts((current) => current.length === 0 ? current : []);
      } finally {
        if (active && showLoading) setLoading(false);
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadProducts(false);
    };
    void loadProducts();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadProducts(false);
    }, 15_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Inventory that ONE unit of a cart line consumes: its recipe components plus its add-ons.
  function getUnitUsage(item: Pick<CartItem, "ingredients" | "additions">) {
    const usage = new Map<number, { required: number; available: number }>();
    const addUsage = (inventoryId: number, required: number, available: number) => {
      const current = usage.get(inventoryId);
      usage.set(inventoryId, { required: (current?.required ?? 0) + required, available: Math.min(current?.available ?? Number.POSITIVE_INFINITY, available) });
    };
    item.ingredients.forEach((ingredient) => addUsage(ingredient.inventory_id, Number(ingredient.required_quantity), Number(ingredient.available_quantity)));
    item.additions.forEach((addition) => addUsage(addition.inventory_id, Number(addition.quantity) * addition.count, Number(addition.available_quantity)));
    return usage;
  }

  function getCartUsage(currentCart: CartItem[], excludeKey = "") {
    const used = new Map<number, number>();
    currentCart.filter((item) => item.key !== excludeKey).forEach((item) => {
      getUnitUsage(item).forEach(({ required }, inventoryId) => used.set(inventoryId, (used.get(inventoryId) ?? 0) + required * item.qty));
    });
    return used;
  }

  // How many units of a line the remaining stock allows, after everything else in the cart.
  function getLineLimit(item: Pick<CartItem, "ingredients" | "additions">, currentCart: CartItem[], excludeKey: string): number {
    const usage = getUnitUsage(item);
    if (usage.size === 0) return 0;
    const used = getCartUsage(currentCart, excludeKey);
    const limit = Math.min(...Array.from(usage).map(([inventoryId, resource]) => (resource.available - (used.get(inventoryId) ?? 0)) / resource.required));
    return Math.max(0, Math.floor(limit));
  }

  function getCartLimit(candidate: Variant, currentCart: CartItem[], candidateKey: string): number {
    return getLineLimit({ ingredients: candidate.ingredients, additions: [] }, currentCart, candidateKey);
  }

  function getRemainingQuantity(product: Product, variant: Variant): number {
    return getCartLimit(variant, cart, "");
  }

  // Add-ons attach to the selected recipe line; if that line was removed, fall back to the
  // most recently added recipe item still in the cart.
  const selectedLine = cart.find((item) => item.key === selectedKey && item.isRecipe) ?? [...cart].reverse().find((item) => item.isRecipe) ?? null;

  function canAddAddition(addition: Addition): boolean {
    if (!selectedLine) return false;
    const used = getCartUsage(cart).get(addition.inventory_id) ?? 0;
    return used + Number(addition.quantity) <= Number(addition.available_quantity);
  }

  function addToCart(product: Product, variant: Variant | null) {
    const variantId = variant ? Number(variant.product_variant_id) : null;
    cartLineId.current += 1;
    const key = `${product.product_id}:${variantId ?? "v"}:${cartLineId.current}`;
    const price = variant ? Number(variant.price) : 0;
    const isRecipe = product.product_type !== "stock";
    if (variant && getCartLimit(variant, cart, key) <= 0) return;
    setCart((prev) => [...prev, { key, productId: product.product_id, variantId, name: product.product_name, size: variant?.size_label ?? null, temperature: variant?.temperature, isRecipe, qty: 1, price, ingredients: variant?.ingredients ?? [], additions: [] }]);
    // A newly punched drink becomes the target for the add-ons tapped next.
    if (isRecipe) setSelectedKey(key);
  }

  // Products with a single option go straight into the cart. Sizes are tapped on the card
  // itself; the picker window is only for products with many options.
  function selectProduct(product: Product) {
    const onlyVariant = product.variants.length === 1 ? product.variants[0] : null;
    if (onlyVariant && onlyVariant.available !== false && getRemainingQuantity(product, onlyVariant) > 0) {
      addToCart(product, onlyVariant);
      return;
    }
    setSelectionProduct(product);
  }

  // Adds one serving of an add-on to ONE cup of the selected line. If the line holds several
  // cups, one cup is split off into its own line so only that cup is customised.
  function addAdditionToSelected(addition: Addition) {
    const target = selectedLine;
    if (!target || !canAddAddition(addition)) return;
    const withAddition = (list: CartAddition[]) => list.some((current) => current.addition_id === addition.addition_id)
      ? list.map((current) => current.addition_id === addition.addition_id ? { ...current, count: current.count + 1 } : current)
      : [...list, { ...addition, count: 1 }];
    if (target.qty === 1) {
      setCart(cart.map((item) => item.key === target.key ? { ...item, additions: withAddition(item.additions) } : item));
      setSelectedKey(target.key);
      return;
    }
    cartLineId.current += 1;
    const splitKey = `${target.productId}:${target.variantId ?? "v"}:${cartLineId.current}`;
    setCart(cart.flatMap((item) => item.key !== target.key
      ? [item]
      : [{ ...item, qty: item.qty - 1 }, { ...item, key: splitKey, qty: 1, additions: withAddition(item.additions) }]));
    setSelectedKey(splitKey);
  }

  function removeAddition(key: string, additionId: number) {
    setCart((prev) => prev.map((item) => item.key !== key ? item : {
      ...item,
      additions: item.additions.flatMap((addition) => addition.addition_id !== additionId ? [addition] : addition.count > 1 ? [{ ...addition, count: addition.count - 1 }] : []),
    }));
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) => {
      const item = prev.find((entry) => entry.key === key);
      if (!item) return prev;
      if (item.rewardId && delta > 0) return prev;
      const limit = getLineLimit(item, prev, key);
      const nextQuantity = Math.min(limit, Math.max(0, item.qty + delta));
      return prev.flatMap((entry) => {
        if (entry.key !== key) return [entry];
        return nextQuantity > 0 ? [{ ...entry, qty: nextQuantity }] : [];
      });
    });
  }

  function getLineTotal(item: CartItem): number {
    return (item.price + item.additions.reduce((total, addition) => total + Number(addition.price) * addition.count, 0)) * item.qty;
  }

  function getLineLabel(item: CartItem): string {
    return `${item.rewardId ? "🎁 " : ""}${item.name}${item.size ? ` — ${item.size}` : ""}${item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}`;
  }

  // The discount a discount reward gives on these cart lines (the server works it out the same
  // way and has the final say): its minimum order, the lines it applies to, % or ₱, its cap.
  function previewDiscount(items: CartItem[]): { amount: number; problem: string | null } {
    const reward = discountReward;
    if (!reward || !reward.discountKind || !reward.discountValue) return { amount: 0, problem: null };
    const itemsSubtotal = items.reduce((sum, item) => sum + getLineTotal(item), 0);
    if (reward.minOrderAmount && itemsSubtotal + 0.005 < reward.minOrderAmount) return { amount: 0, problem: `${reward.name} needs an order of at least ${formatPeso(reward.minOrderAmount)}.` };
    const eligible = items.filter((item) => !item.rewardId).filter((item) => {
      if (reward.productId !== null) return item.productId === reward.productId;
      if (!reward.category) return true;
      return (products.find((product) => product.product_id === item.productId)?.product_category ?? "") === reward.category;
    }).reduce((sum, item) => sum + getLineTotal(item), 0);
    if (eligible <= 0) return { amount: 0, problem: `${reward.name} applies to ${reward.category ? `${reward.category} items` : "a product"} that is not in this order.` };
    let amount = reward.discountKind === "percent" ? eligible * Number(reward.discountValue) / 100 : Number(reward.discountValue);
    if (reward.maxDiscount) amount = Math.min(amount, Number(reward.maxDiscount));
    return { amount: Math.round(Math.min(amount, eligible) * 100) / 100, problem: null };
  }

  // ID discounts on these cart lines. Units are handed out in the order the people were added, so
  // a line made smaller (or removed) never counts twice; the server checks the same.
  function resolveIdDiscounts(items: CartItem[]) {
    const byKey = new Map(items.map((item) => [item.key, item]));
    const orderAmount = items.reduce((sum, item) => sum + getLineTotal(item), 0);
    const used = new Map<string, number>();
    const entries = idDiscounts.map((entry) => {
      const lines: Record<string, number> = {};
      let covered = 0;
      if (entry.lines === null) covered = orderAmount / Math.max(1, entry.groupSize ?? 1);
      else for (const [key, wanted] of Object.entries(entry.lines)) {
        const item = byKey.get(key);
        if (!item || item.qty <= 0) continue;
        const units = Math.min(wanted, item.qty - (used.get(key) ?? 0));
        if (units <= 0) continue;
        used.set(key, (used.get(key) ?? 0) + units);
        lines[key] = units;
        covered += getLineTotal(item) / item.qty * units;
      }
      covered = Math.round(covered * 100) / 100;
      return { entry, lines, covered, ...idDiscountAmounts(entry.type, covered, idDiscountSetup.vat) };
    });
    const round2 = (value: number) => Math.round(value * 100) / 100;
    return { entries, used, discount: round2(entries.reduce((sum, item) => sum + item.discount, 0)), vatExempt: round2(entries.reduce((sum, item) => sum + item.vatExempt, 0)) };
  }

  // Stars left for more rewards in this order (the customer's balance minus rewards in the cart).
  const starsInCart = cart.reduce((sum, item) => sum + (item.rewardCost ?? 0), 0) + (discountReward && discountReward.kind !== "birthday" ? discountReward.starsCost : 0);
  // One birthday treat per order.
  const birthdayInOrder = cart.some((item) => item.rewardBirthday) || discountReward?.kind === "birthday";
  const availableRewards = loyalty.rewards.filter((reward) => reward.kind === "birthday" ? Boolean(customer?.birthdayTreat) && !birthdayInOrder : true);

  function chooseReward(reward: LoyaltyRewardRule) {
    setRewardChoiceOpen(false);
    if (reward.rewardType === "discount") setDiscountReward(reward);
    else setRewardForItem(reward);
  }
  const starsLeft = customer?.stars !== null && customer?.stars !== undefined ? customer.stars - starsInCart : 0;

  function addRewardLine(product: Product, variant: Variant, reward: LoyaltyRewardRule) {
    cartLineId.current += 1;
    const key = `${product.product_id}:${variant.product_variant_id}:reward:${cartLineId.current}`;
    if (getCartLimit(variant, cart, key) <= 0) return;
    setCart((prev) => [...prev, { key, productId: product.product_id, variantId: Number(variant.product_variant_id), name: product.product_name, size: variant.size_label, temperature: variant.temperature, isRecipe: product.product_type !== "stock", qty: 1, price: 0, ingredients: variant.ingredients, additions: [], rewardId: reward.id, rewardName: reward.name, rewardCost: reward.kind === "birthday" ? 0 : reward.starsCost, rewardBirthday: reward.kind === "birthday" }]);
    if (product.product_type !== "stock") setSelectedKey(key);
    setRewardForItem(null);
  }

  function removeCustomer() {
    if (claimId !== null) void fetch("/api/claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: claimId, action: "decline" }) }).catch(() => undefined);
    setCustomer(null);
    setClaimId(null);
    setDiscountReward(null);
    setCart((prev) => prev.filter((item) => !item.rewardId));
  }

  // The items of an ID check as this menu knows them, with how many units are the holder's own.
  function idCheckLines(check: PendingIdCheck): IdCheckLine[] {
    const variants = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })));
    return check.items.map((item, index) => {
      const match = variants.find(({ variant }) => Number(variant.product_variant_id) === item.productVariantId);
      const extras = additions.filter((addition) => item.additionIds.includes(addition.addition_id));
      const unit = Number(match?.variant.price ?? 0) + extras.reduce((sum, addition) => sum + Number(addition.price), 0);
      const covered = check.lines === null ? 0 : check.lines.filter((entry) => entry.line === index).reduce((sum, entry) => sum + entry.quantity, 0);
      const label = match ? `${match.product.product_name}${match.variant.size_label ? ` — ${match.variant.size_label}` : ""}${extras.length ? ` + ${extras.map((addition) => addition.addition_name).join(", ")}` : ""}` : "An item no longer on the menu";
      return { label, qty: item.quantity, unit, covered };
    });
  }

  // Puts a sent cart into the POS (the current order must be empty), then asks for the ID.
  function loadCounterCart(sent: CounterCart) {
    if (cart.length > 0) { setCheckoutError("Finish or clear the current order before loading a sent cart."); setCartOpen(true); return; }
    const variants = products.flatMap((product) => product.variants.map((variant) => ({ product, variant })));
    let missing = 0;
    const lines: CartItem[] = sent.items.flatMap((item) => {
      const match = variants.find(({ variant }) => Number(variant.product_variant_id) === item.productVariantId);
      if (!match) { missing += item.quantity; return []; }
      cartLineId.current += 1;
      const { product, variant } = match;
      return [{
        key: `${product.product_id}:${variant.product_variant_id}:${cartLineId.current}`, productId: product.product_id, variantId: Number(variant.product_variant_id), name: product.product_name,
        size: variant.size_label ?? null, temperature: variant.temperature, isRecipe: product.product_type !== "stock", qty: item.quantity, price: Number(variant.price), ingredients: variant.ingredients ?? [],
        additions: additions.filter((addition) => item.additionIds.includes(addition.addition_id)).map((addition) => ({ ...addition, count: 1 })),
      }];
    });
    if (lines.length === 0) { setCheckoutError(`Nothing in cart ${sent.code} is available anymore.`); return; }
    setCart(lines);
    setServiceType(sent.serviceType);
    setCustomer(sent.customer);
    setCounterCartId(sent.id);
    setCheckoutError(missing > 0 ? `${missing} item${missing === 1 ? "" : "s"} from cart ${sent.code} ${missing === 1 ? "is" : "are"} no longer available.` : "");
    setCartOpen(true);
    setIdDiscountInitialType(sent.discountTypeId);
    void loadIdDiscountSetup();
    setIdDiscountDialogOpen(true);
  }

  async function dismissCounterCart(sent: CounterCart) {
    await fetch("/api/counter-carts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sent.id, action: "dismiss" }) }).catch(() => undefined);
    if (counterCartId === sent.id) setCounterCartId(null);
    void refreshCounterCarts();
  }

  async function acceptClaim(claim: CounterClaim) {
    setClaimBusyId(claim.id);
    setCheckoutError("");
    try {
      const response = await fetch("/api/claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: claim.id, action: "accept" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not add the customer.");
      // A different customer's rewards leave the cart with them.
      if (customer && customer.id !== payload.data.customer.id) { setCart((prev) => prev.filter((item) => !item.rewardId)); setDiscountReward(null); }
      setCustomer(payload.data.customer as AttachedCustomer);
      setClaimId(Number(payload.data.claimId));
      const reward = payload.data.reward as LoyaltyRewardRule | null;
      if (reward) {
        if (reward.rewardType === "discount") setDiscountReward(reward);
        else setRewardForItem(reward);
      }
      setCartOpen(true);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not add the customer.");
    } finally {
      setClaimBusyId(null);
      void refreshLoyalty();
    }
  }

  async function declineClaim(claim: CounterClaim) {
    setClaimBusyId(claim.id);
    try {
      await fetch("/api/claims", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: claim.id, action: "decline" }) });
    } finally {
      setClaimBusyId(null);
      void refreshLoyalty();
    }
  }

  // Clears the cart and refreshes stock once an order is in the queue (cash or GCash).
  async function afterOrderPlaced(orderId: number, queueNumber: number, shiftId: number, starsEarned = 0, starsRedeemed = 0) {
    const starNotes = [starsRedeemed > 0 ? `${starsRedeemed} ★ used` : "", starsEarned > 0 ? `+${starsEarned} ★` : ""].filter(Boolean).join(", ");
    setLastPlaced({ orderId, queueNumber, note: "", stars: starNotes && customer ? `${starNotes} for ${customer.fullName.split(" ")[0]}` : undefined });
    setClaimId(null);
    setDiscountReward(null);
    setIdDiscounts([]);
    setCounterCartId(null);
    void refreshCounterCarts();
    setServiceType("dine_in");
    setRewardPassword("");
    void refreshLoyalty();
    if (receipts.settings.autoPrint) void printPlacedReceipt(orderId, queueNumber);
    setCart([]);
    setReceivedAmount("");
    setCashPart("");
    setCustomer(null);
    setCartOpen(false);
    onQueueAssigned(queueNumber, shiftId);
    const refresh = await fetch("/api/products", { cache: "no-store" });
    if (refresh.ok) {
      const refreshedPayload = await refresh.json() as ProductsResponse;
      setProducts(refreshedPayload.data ?? []);
      setAdditions(refreshedPayload.additions ?? []);
    }
  }

  async function checkout(password?: string) {
    if (cart.length === 0 || checkingOut) return;
    const hasRewards = cart.some((item) => item.rewardId) || discountReward !== null;
    const discountCheck = previewDiscount(cart);
    if (discountCheck.problem) { setCheckoutError(discountCheck.problem); return; }
    const idCheck = resolveIdDiscounts(cart);
    if (idCheck.entries.length > 0 && discountReward) { setCheckoutError("An order can have the loyalty discount or ID discounts, not both. Remove one of them."); return; }
    const emptyId = idCheck.entries.find((resolved) => resolved.covered <= 0);
    if (emptyId) { setCheckoutError(`${emptyId.entry.holderName}'s ${emptyId.entry.type.name} discount no longer covers anything. Remove it, or add it again.`); return; }
    // Line numbers point into the items sent with the order.
    const sentLineIndex = new Map(cart.filter((item) => item.variantId !== null).map((item, index) => [item.key, index]));
    const idPayload = idCheck.entries.map(({ entry, lines }) => ({
      type_id: entry.type.id, holder_name: entry.holderName, id_number: entry.idNumber || null, group_size: entry.groupSize,
      lines: entry.lines === null ? null : Object.entries(lines).filter(([key]) => sentLineIndex.has(key)).map(([key, quantity]) => ({ line: sentLineIndex.get(key), quantity })),
    }));
    // Regulars without the app: the cashier confirms the reward with their own password.
    if (hasRewards && claimId === null && password === undefined) {
      setRewardPasswordInvalid(false);
      setRewardPasswordOpen(true);
      return;
    }
    // Sent with the order: dine in or take out, and how its rewards were confirmed.
    const rewardAuth = { service_type: serviceType, claim_id: claimId, discount_reward_id: discountReward?.id ?? null, id_discounts: idPayload, counter_cart_id: counterCartId, ...(password !== undefined ? { reward_password: password } : {}) };
    // What the customer pays: the cart minus a reward discount or the ID discounts (and their VAT).
    const subtotalValue = Math.max(0, Math.round((cart.reduce((sum, item) => sum + getLineTotal(item), 0) - discountCheck.amount - idCheck.discount - idCheck.vatExempt) * 100) / 100);
    const parsedReceivedAmount = Number.parseFloat(receivedAmount);
    if (paymentMethod === "cash" && subtotalValue > 0) {
      if (!Number.isFinite(parsedReceivedAmount) || parsedReceivedAmount < subtotalValue) {
        setCheckoutError("Received payment must be at least the subtotal.");
        return;
      }
    }
    setCheckingOut(true);
    setCheckoutError("");
    const cartItems = cart.filter((item) => item.variantId !== null).map((item) => ({
      product_variant_id: item.variantId,
      quantity: item.qty,
      addition_ids: item.additions.flatMap((addition) => Array.from({ length: addition.count }, () => addition.addition_id)),
      reward_id: item.rewardId ?? null,
    }));
    if (paymentMethod === "split") {
      const cash = Number.parseFloat(cashPart);
      const received = receivedAmount.trim() === "" ? cash : parsedReceivedAmount;
      const minimum = gcashConfig?.minimumAmount ?? 0;
      if (!Number.isFinite(cash) || cash <= 0 || cash >= subtotalValue) { setCheckoutError("Enter a cash part between ₱0 and the subtotal."); return; }
      if (subtotalValue - cash < minimum) { setCheckoutError(`The GCash part must be at least ₱${minimum.toFixed(2)}.`); return; }
      if (!Number.isFinite(received) || received < cash) { setCheckoutError("The cash received must cover the cash part."); return; }
    }
    if (paymentMethod === "gcash" || paymentMethod === "split") {
      const split = paymentMethod === "split" ? { cash_amount: Number.parseFloat(cashPart), received_amount: receivedAmount.trim() === "" ? Number.parseFloat(cashPart) : parsedReceivedAmount } : null;
      try {
        const response = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cartItems, split, customer_id: customer?.id ?? null, ...rewardAuth }) });
        const payload = await response.json();
        if (payload?.code === "wrong_password") { setRewardPasswordInvalid(true); setRewardPasswordOpen(true); return; }
        if (!response.ok) throw new Error(payload?.error || "Could not start the GCash payment.");
        setRewardPasswordOpen(false);
        setGcashCheckout(payload.data as GcashCheckout);
      } catch (error) {
        setCheckoutError(error instanceof Error ? error.message : "Could not start the GCash payment.");
      } finally {
        setCheckingOut(false);
      }
      return;
    }
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Repeated addition ids mean repeated servings on each cup of the line.
          items: cartItems,
          payment_method: paymentMethod,
          received_amount: paymentMethod === "cash" && Number.isFinite(parsedReceivedAmount) ? parsedReceivedAmount : 0,
          customer_id: customer?.id ?? null,
          ...rewardAuth,
        }),
      });
      const payload = await response.json();
      if (payload?.code === "wrong_password") { setRewardPasswordInvalid(true); setRewardPasswordOpen(true); return; }
      if (!response.ok) throw new Error(payload?.error || "Unable to complete checkout.");
      setRewardPasswordOpen(false);
      await afterOrderPlaced(Number(payload.data.orderId), Number(payload.data.queueNumber), Number(payload.data.shiftId), Number(payload.data.starsEarned ?? 0), Number(payload.data.starsRedeemed ?? 0));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to complete checkout.");
    } finally {
      setCheckingOut(false);
    }
  }

  const filtered = products.filter((p) => p.product_name.toLowerCase().includes(search.toLowerCase()) || (p.product_category ?? "").toLowerCase().includes(search.toLowerCase()));
  const categories = Array.from(new Set(products.map((product) => product.product_category?.trim() || "Other")));
  const currentCategory = activeCategory === ADDONS_TAB || categories.includes(activeCategory) ? activeCategory : categories[0] ?? ADDONS_TAB;
  // Searching looks across every category and the add-ons; otherwise only the active tab is shown.
  const searching = search.trim() !== "";
  const filteredAdditions = additions.filter((addition) => addition.addition_name.toLowerCase().includes(search.toLowerCase().trim()));
  const visibleProducts = searching ? filtered : products.filter((product) => (product.product_category?.trim() || "Other") === currentCategory);
  const visibleAdditions = searching ? filteredAdditions : currentCategory === ADDONS_TAB ? additions : [];
  const itemsSubtotal = cart.reduce((sum, item) => sum + getLineTotal(item), 0);
  const discountPreview = previewDiscount(cart);
  const idPreview = resolveIdDiscounts(cart);
  const hasOrderDiscount = discountReward !== null || idPreview.entries.length > 0;
  // What the customer pays (after a reward discount or ID discounts). Every payment figure below uses it.
  const subtotal = Math.max(0, Math.round((itemsSubtotal - discountPreview.amount - idPreview.discount - idPreview.vatExempt) * 100) / 100);
  const parsedReceivedAmount = Number.parseFloat(receivedAmount);
  const changeDue = Number.isFinite(parsedReceivedAmount) ? Math.max(0, parsedReceivedAmount - subtotal) : 0;
  // Split ticket figures: the cash part, what GCash charges, and change on the cash part.
  const parsedCashPart = Number.parseFloat(cashPart);
  const splitCash = Number.isFinite(parsedCashPart) ? Math.round(parsedCashPart * 100) / 100 : 0;
  const splitGcash = Math.max(0, Math.round((subtotal - splitCash) * 100) / 100);
  const splitReceived = receivedAmount.trim() === "" ? splitCash : parsedReceivedAmount;
  const splitChange = Number.isFinite(splitReceived) ? Math.max(0, splitReceived - splitCash) : 0;
  const splitProblem = paymentMethod !== "split" || subtotal === 0 ? ""
    : splitCash <= 0 ? "Enter how much the customer pays in cash."
      : splitCash >= subtotal ? "The cash part must be less than the subtotal. Use Cash instead."
        : gcashConfig && splitGcash < gcashConfig.minimumAmount ? `The GCash part must be at least ₱${gcashConfig.minimumAmount.toFixed(2)}. Lower the cash part to ₱${Math.max(0, subtotal - gcashConfig.minimumAmount).toFixed(2)} or less.`
          : !Number.isFinite(splitReceived) || splitReceived < splitCash ? "The cash received must cover the cash part."
            : "";
  const hasValidPayment = (paymentMethod === "gcash" && (!gcashConfig || subtotal >= gcashConfig.minimumAmount)) || subtotal === 0 || (paymentMethod === "cash" && Number.isFinite(parsedReceivedAmount) && parsedReceivedAmount >= subtotal) || (paymentMethod === "split" && cashPart.trim() !== "" && splitProblem === "");

  return <main className="pos-layout" style={{ display: "flex", gap: 20, padding: 20, height: "100%", minHeight: 0 }}>
    <section className="pos-menu" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <input className="pos-search" placeholder="Search all products and add-ons..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1px solid #E8DDD5", minWidth: 0, background: "#FDF9F5", color: "#3D2B1F", outline: "none", boxShadow: "0 2px 8px rgba(61,43,31,0.04)" }} />
        <div style={{ color: "#9C8278", fontSize: 12, whiteSpace: "nowrap", fontFamily: "JetBrains Mono, monospace" }}>{loading ? "LOADING..." : searching ? `${visibleProducts.length + visibleAdditions.length} RESULTS` : `${currentCategory === ADDONS_TAB ? visibleAdditions.length : visibleProducts.length} ITEMS`}</div>
      </div>

      <div className="pos-product-area" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {(currentCategory === ADDONS_TAB || searching) && visibleAdditions.length > 0 && (
          <div style={{ marginBottom: 12, padding: "9px 12px", borderRadius: 10, background: selectedLine ? "#FFF7ED" : "#F3EDE5", border: `1px solid ${selectedLine ? "#FED7AA" : "#E8DDD5"}`, color: selectedLine ? "#C2410C" : "#9C8278", fontSize: 12, fontWeight: 600 }}>
            {selectedLine ? `Add-ons go to: ${getLineLabel(selectedLine)}` : "Punch a drink first, then tap add-ons to attach them to it."}
          </div>
        )}
        {visibleProducts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: visibleAdditions.length > 0 ? 16 : 0 }}>
            {visibleProducts.map((product) => {
              const options = product.variants.map((variant) => {
                const remaining = getRemainingQuantity(product, variant);
                return { variant, remaining, unavailable: variant.available === false || remaining <= 0 };
              });
              const soldOut = options.length > 0 && options.every((option) => option.unavailable);
              const mostLeft = Math.max(0, ...options.filter((option) => !option.unavailable).map((option) => option.remaining));
              const lowStock = !soldOut && options.length > 0 && mostLeft <= POS_LOW_STOCK;
              const prices = product.variants.map((variant) => Number(variant.price));
              const lowestPrice = prices.length ? Math.min(...prices) : 0;
              const priceLabel = prices.length === 0 ? "" : prices.every((price) => price === lowestPrice) ? formatPeso(lowestPrice) : `from ${formatPeso(lowestPrice)}`;
              // One row per size, its temperatures as buttons on that row.
              const sizeRows = Array.from(options.reduce((rows, option) => {
                const key = option.variant.size_label ?? "";
                rows.set(key, [...(rows.get(key) ?? []), option]);
                return rows;
              }, new Map<string, typeof options>()).entries())
                .sort(([a], [b]) => { const [na, la] = sizeOrder(a || null); const [nb, lb] = sizeOrder(b || null); return na - nb || la.localeCompare(lb); })
                .map(([size, list]) => ({ size, list: [...list].sort((a, b) => (a.variant.temperature === "hot" ? 0 : 1) - (b.variant.temperature === "hot" ? 0 : 1)) }));
              // Every size has one temperature (or none): sizes sit two to a row instead.
              const oneOptionPerSize = sizeRows.every((row) => row.list.length === 1);
              const showOptions = options.length > 1 && (oneOptionPerSize ? options.length <= POS_MAX_CARD_SIZES * 2 : sizeRows.length <= POS_MAX_CARD_SIZES);
              const samePrice = prices.every((price) => price === lowestPrice);
              const single = options.length === 1 ? options[0] : null;
              const headDisabled = soldOut || (single !== null && single.unavailable);
              return <article key={product.product_id} className={`pos-card rounded-2xl${soldOut ? " is-sold-out" : ""}`} style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 200, color: "#3D2B1F" }}>
                <button type="button" className="pos-card-head" disabled={headDisabled} onClick={() => selectProduct(product)} aria-label={single ? `Add ${product.product_name}` : `Choose ${product.product_name}`}>
                  <div className="pos-card-image" style={{ height: 104, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {product.image_url ? <Image src={product.image_url} alt={product.product_name} width={180} height={92} unoptimized style={{ maxHeight: 92, maxWidth: "82%", width: "auto", objectFit: "contain", position: "relative", zIndex: 1 }} /> : <div style={{ color: "#B9A398", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15, padding: "0 10px", textAlign: "center" }}>{product.product_name}</div>}
                    {soldOut ? <span className="pos-badge is-out">Sold out</span> : lowStock ? <span className="pos-badge is-low">{mostLeft} left</span> : null}
                  </div>
                  <div style={{ padding: "10px 12px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, lineHeight: 1.15 }}>{product.product_name}</div>
                      <span style={{ display: "inline-block", marginTop: 5, padding: "3px 7px", borderRadius: 6, background: "#F3EDE5", color: "#6B4C3B", fontSize: 9, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.03em" }}>{product.product_category ?? "Menu"}</span>
                    </div>
                    {priceLabel && <span style={{ flexShrink: 0, color: soldOut ? "#B9A398" : "#B45309", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 13.5, whiteSpace: "nowrap" }}>{priceLabel}</span>}
                  </div>
                </button>
                <div style={{ padding: "10px 12px 12px", marginTop: "auto" }}>
                  {showOptions && oneOptionPerSize ? <div className="pos-size-grid">
                    {sizeRows.map(({ size, list: [{ variant, remaining, unavailable }] }) => {
                      const temperature = variant.temperature === "hot" ? "Hot" : variant.temperature === "cold" ? "Iced" : "";
                      const detail = unavailable ? "Sold out" : remaining <= POS_LOW_STOCK ? `${remaining} left` : [temperature, samePrice ? "" : `₱${Number(variant.price).toLocaleString("en-PH")}`].filter(Boolean).join(" · ");
                      return <button key={variant.product_variant_id} type="button" className={`pos-option${unavailable ? " is-out" : remaining <= POS_LOW_STOCK ? " is-low" : ""}`} disabled={unavailable} onClick={() => addToCart(product, variant)} aria-label={`${product.product_name} ${size || "Regular"} ${temperature} ${formatPeso(Number(variant.price))}${unavailable ? ", sold out" : `, ${remaining} left`}`}>
                        <span className="pos-option-name">{size || "Regular"}</span>
                        {detail && <span className={`pos-option-price${variant.temperature === "cold" && !unavailable && remaining > POS_LOW_STOCK ? " is-cold" : ""}`}>{detail}</span>}
                      </button>;
                    })}
                  </div> : showOptions ? <div className="pos-size-rows">
                    {sizeRows.map(({ size, list }) => <div key={size || "regular"} className="pos-size-row">
                      <span className="pos-size-label">{size || "Regular"}</span>
                      <div className="pos-size-options">
                        {list.map(({ variant, remaining, unavailable }) => {
                          const temperature = variant.temperature === "hot" ? "Hot" : variant.temperature === "cold" ? "Iced" : "Add";
                          const detail = unavailable ? "Sold out" : remaining <= POS_LOW_STOCK ? `${remaining} left` : samePrice ? "" : `₱${Number(variant.price).toLocaleString("en-PH")}`;
                          return <button key={variant.product_variant_id} type="button" className={`pos-option${unavailable ? " is-out" : remaining <= POS_LOW_STOCK ? " is-low" : ""}${variant.temperature === "hot" ? " is-hot" : variant.temperature === "cold" ? " is-cold" : ""}`} disabled={unavailable} onClick={() => addToCart(product, variant)} aria-label={`${product.product_name} ${size || "Regular"} ${temperature === "Add" ? "" : temperature} ${formatPeso(Number(variant.price))}${unavailable ? ", sold out" : `, ${remaining} left`}`}>
                            <span className="pos-option-name">{temperature}</span>
                            {detail && <span className="pos-option-price">{detail}</span>}
                          </button>;
                        })}
                      </div>
                    </div>)}
                  </div> : <button type="button" className="pos-card-action" disabled={headDisabled} onClick={() => selectProduct(product)}>
                    {soldOut || headDisabled ? "Sold out" : single ? "Tap to add" : options.length > 1 ? `Choose from ${options.length} options` : "Tap to add"}
                  </button>}
                </div>
              </article>;
            })}
          </div>
        )}
        {visibleAdditions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {visibleAdditions.map((addition) => {
                const allowed = canAddAddition(addition);
                return <button key={addition.addition_id} type="button" className="pos-card rounded-2xl" disabled={!allowed} onClick={() => addAdditionToSelected(addition)} style={{ background: allowed ? "#FDF9F5" : "#F3EDE5", border: "1px solid #E8DDD5", padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, textAlign: "left", cursor: allowed ? "pointer" : "not-allowed", color: allowed ? "#3D2B1F" : "#B9A398" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 14, lineHeight: 1.15 }}>{addition.addition_name}</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: allowed ? "#D97706" : "#B9A398", whiteSpace: "nowrap" }}>+₱{Number(addition.price).toFixed(2)}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: allowed ? "#7E22CE" : "#B9A398" }}>{!selectedLine ? "Select a drink in the cart" : allowed ? "Tap to add to selected drink" : "Insufficient stock"}</span>
                </button>;
            })}
          </div>
        )}
        {!loading && visibleProducts.length === 0 && visibleAdditions.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9C8278", fontSize: 13 }}>{searching ? `Nothing matches "${search.trim()}".` : currentCategory === ADDONS_TAB ? "No add-ons are set up yet." : "No products in this category."}</div>
        )}
      </div>

      <nav className="pos-category-bar" aria-label="Product categories" onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY; }} style={{ display: "flex", gap: 10, overflowX: "auto", flexShrink: 0, paddingBottom: 8 }}>
        {[...categories, ADDONS_TAB].map((category) => {
          const isAddOns = category === ADDONS_TAB;
          const active = !searching && currentCategory === category;
          const count = isAddOns ? additions.length : products.filter((product) => (product.product_category?.trim() || "Other") === category).length;
          if (isAddOns && count === 0) return null;
          return <button key={category} type="button" aria-pressed={active} onClick={() => { setActiveCategory(category); setSearch(""); }} style={{ flexShrink: 0, minWidth: 140, height: 52, padding: "0 18px", borderRadius: 12, border: active ? "none" : `1px solid ${isAddOns ? "#E9D5FF" : "#E8DDD5"}`, background: active ? (isAddOns ? "#7E22CE" : "#3D2B1F") : (isAddOns ? "#FAF5FF" : "#FDF9F5"), color: active ? "#FDF9F5" : (isAddOns ? "#7E22CE" : "#3D2B1F"), fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: active ? "0 6px 16px rgba(61,43,31,0.18)" : "none" }}>
            {isAddOns ? "Add-ons" : category}
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{count}</span>
          </button>;
        })}
      </nav>
    </section>

    {cart.length > 0 && !cartOpen && <button type="button" className="pos-cart-bar" onClick={() => setCartOpen(true)}>
      <span className="pos-cart-bar-count">{cart.reduce((sum, item) => sum + item.qty, 0)}</span>
      <span className="pos-cart-bar-text"><strong>{formatPeso(subtotal)}</strong><em>{cart.reduce((sum, item) => sum + item.qty, 0) === 1 ? "1 item" : `${cart.reduce((sum, item) => sum + item.qty, 0)} items`} in the order</em></span>
      <span className="pos-cart-bar-go">View order ›</span>
    </button>}
    <aside className={`pos-cart${cartOpen ? " is-open" : ""}`} aria-label="Current order" style={{ width: 360, flexShrink: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rounded-2xl" style={{ flex: 1, minHeight: 0, background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="flex items-center justify-between gap-3">
          <h3 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif" }}>Cart</h3>
          <button type="button" className="pos-cart-close" onClick={() => setCartOpen(false)}>‹ Add more</button>
        </div>
        <WaitingClaims claims={loyalty.claims} rewards={loyalty.rewards} busyId={claimBusyId} onAccept={(claim) => void acceptClaim(claim)} onDecline={(claim) => void declineClaim(claim)} />
        <WaitingIdChecks checks={idChecks} notice={idCheckNotice} onOpen={(check) => { void loadIdDiscountSetup(); setIdCheckOpen(check); }} />
        <WaitingCounterCarts carts={counterCarts} loadedId={counterCartId} onLoad={loadCounterCart} onDismiss={(sent) => void dismissCounterCart(sent)} />
        {counterCartId !== null && <p className="pos-sent-loaded">📱 Cart {counterCarts.find((sent) => sent.id === counterCartId)?.code ?? ""} from the mobile menu. The customer&apos;s phone follows this order once it is paid.</p>}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }}>
          {cart.length === 0 && <div style={{ color: "#9C8278" }}>Cart is empty</div>}
          {cart.map((item) => {
            const isSelected = selectedLine?.key === item.key;
            return (
            <div key={item.key} onClick={item.isRecipe ? () => setSelectedKey(item.key) : undefined} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 10, border: isSelected ? "2px solid #D97706" : "1px solid #F0E8E2", background: isSelected ? "#FFF7ED" : "transparent", cursor: item.isRecipe ? "pointer" : "default" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{getLineLabel(item)}</div>
                <div style={{ fontSize: 12, color: item.rewardId ? "#B45309" : "#9C8278", fontWeight: item.rewardId ? 700 : 400 }}>{item.rewardId ? `Free · ${item.rewardName} · ${item.rewardBirthday ? "🎂 birthday treat" : `★ ${item.rewardCost}`}` : `₱${(item.price).toFixed(2)} • x${item.qty}`}</div>
                {item.additions.length > 0 && <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                  {item.additions.map((addition) => <div key={addition.addition_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 11, color: "#7E22CE" }}>
                    <span>+ {addition.addition_name} ×{addition.count}{item.qty > 1 ? " each" : ""} · ₱{(Number(addition.price) * addition.count).toFixed(2)}</span>
                    <button type="button" onClick={(event) => { event.stopPropagation(); removeAddition(item.key, addition.addition_id); }} aria-label={`Remove one ${addition.addition_name}`} style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #E9D5FF", background: "#fff", color: "#7E22CE", lineHeight: 1, cursor: "pointer" }}>−</button>
                  </div>)}
                </div>}
                {isSelected && <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.04em" }}>Add-ons go to this drink</div>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => updateQty(item.key, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E8DDD5", background: "#fff" }}>-</button>
                <button onClick={() => updateQty(item.key, +1)} disabled={Boolean(item.rewardId)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E8DDD5", background: "#fff", opacity: item.rewardId ? 0.4 : 1 }}>+</button>
              </div>
            </div>
            );
          })}
        </div>

        <CartCustomerSlot customer={customer} onAdd={() => setCustomerPickerOpen(true)} onRemove={removeCustomer}
          onUseReward={customer && availableRewards.length > 0 && ((customer.stars !== null && customer.stars !== undefined) || customer.birthdayTreat) && (claimId !== null || !customer.username) ? () => setRewardChoiceOpen(true) : undefined}
          rewardNote={customer && availableRewards.length > 0 && customer.username && claimId === null ? `To use ${customer.birthdayTreat ? "their birthday treat or stars" : "their stars"}, ask them to scan the Stars sign and pick it on their phone.` : customer?.birthdayTreat ? "🎂 Birthday treat available today." : undefined} />
        {idDiscountSetup.types.length > 0 && cart.length > 0 && <button type="button" className="pos-idd-open" disabled={discountReward !== null} title={discountReward ? "This order has a loyalty discount. Remove it to use an ID discount." : undefined} onClick={() => { void loadIdDiscountSetup(); setIdDiscountDialogOpen(true); }}>
          <span className="pos-idd-open-icon" aria-hidden="true">🪪</span>
          <span className="pos-idd-open-text"><strong>{idDiscounts.length ? "Add another ID discount" : "ID discount"}</strong><em>{discountReward ? "Not with the loyalty discount" : idDiscountSetup.types.map((type) => type.name).join(" · ")}</em></span>
          <span aria-hidden="true">›</span>
        </button>}
        <div style={{ borderTop: "1px solid #E8DDD5", paddingTop: 8, flexShrink: 0 }}>
        {checkoutError && <p style={{ color: "#B91C1C", fontSize: 12, margin: "0 0 8px" }}>{checkoutError}</p>}
          {discountReward && <div className="pos-discount-row">
            <span>🎁 {discountReward.name}<em>{discountPreview.problem ?? discountText(discountReward)}</em></span>
            <strong>{discountPreview.amount ? `−₱${discountPreview.amount.toFixed(2)}` : "—"}</strong>
            <button type="button" onClick={() => setDiscountReward(null)} aria-label={`Remove ${discountReward.name}`} title="Remove discount">×</button>
          </div>}
          {idPreview.entries.map(({ entry, covered, vatExempt, discount }) => <div key={entry.key} className="pos-discount-row is-id">
            <span>🪪 {entry.type.name} · {entry.holderName}<em>{covered <= 0 ? "Covers nothing now. Remove it, or add it again." : [entry.idNumber ? `ID ${entry.idNumber}` : "", entry.lines === null ? `1 of ${entry.groupSize} sharing the bill` : `covers ₱${covered.toFixed(2)}`, vatExempt ? `VAT −₱${vatExempt.toFixed(2)}` : ""].filter(Boolean).join(" · ")}</em></span>
            <strong>{covered > 0 ? `−₱${(discount + vatExempt).toFixed(2)}` : "—"}</strong>
            <button type="button" onClick={() => setIdDiscounts((current) => current.filter((item) => item.key !== entry.key))} aria-label={`Remove ${entry.holderName}'s discount`} title="Remove discount">×</button>
          </div>)}
          {hasOrderDiscount && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#9C8278" }}><div>Items</div><div>₱{itemsSubtotal.toFixed(2)}</div></div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ color: "#9C8278" }}>{hasOrderDiscount ? "Total after discount" : "Subtotal"}</div><div>₱{subtotal.toFixed(2)}</div></div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="pos-service" role="radiogroup" aria-label="Dine in or take out">
              {([["dine_in", "Dine in"], ["take_out", "Take out"]] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={serviceType === value} className={serviceType === value ? `is-on is-${value}` : ""} onClick={() => setServiceType(value)}>{label}</button>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ color: "#6B4C3B", fontSize: 12, fontWeight: 600 }}>Payment method</span>
              <div style={{ display: "flex", gap: 6 }}>
                {([["cash", "Cash"], ...(gcashConfig?.gcash ? [["gcash", "GCash"] as const, ["split", "Split"] as const] : [])] as const).map(([method, label]) => {
                  const tone = method === "gcash" ? "#0057E4" : method === "split" ? "#7E22CE" : "#3D2B1F";
                  return <button key={method} type="button" onClick={() => { setPaymentMethod(method); if (checkoutError) setCheckoutError(""); }} title={method === "split" ? "Part cash, part GCash" : undefined} style={{ flex: 1, border: paymentMethod === method ? `1px solid ${tone}` : "1px solid #E8DDD5", background: paymentMethod === method ? tone : "#FFFDF9", color: paymentMethod === method ? "#FFFFFF" : method === "cash" ? "#6B4C3B" : tone, padding: "9px 6px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{label}</button>;
                })}
              </div>
            </div>
            {paymentMethod === "cash" ? <>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "#6B4C3B", fontSize: 12, fontWeight: 600 }}>
                <span>Received payment</span>
                <MoneyInput label="Received payment" value={receivedAmount} onChange={(next) => { setReceivedAmount(next); if (checkoutError) setCheckoutError(""); }} quickAmounts={quickCashAmounts(subtotal)}
                  summary={(draft) => { const paid = Number.parseFloat(draft); return <><KeypadSummaryRow label="Amount due" value={formatPeso(subtotal)} /><KeypadSummaryRow label={Number.isFinite(paid) && paid < subtotal ? "Still short" : "Change"} value={formatPeso(Number.isFinite(paid) ? Math.abs(paid - subtotal) : 0)} tone={Number.isFinite(paid) && paid < subtotal ? "#B91C1C" : "#0F766E"} /></>; }}
                  style={{ border: "1px solid #E8DDD5", borderRadius: 8, background: "#FFFDF9", color: "#3D2B1F", padding: "10px 11px", fontSize: 14 }} />
              </label>
              {subtotal > 0 && <div className="pos-quick-cash" role="group" aria-label="Quick cash amounts">
                {quickCashAmounts(subtotal).map((amount, index) => {
                  const active = Number.isFinite(parsedReceivedAmount) && Math.abs(parsedReceivedAmount - amount) < 0.005;
                  return <button key={amount} type="button" aria-pressed={active} onClick={() => { setReceivedAmount(amount.toFixed(2)); if (checkoutError) setCheckoutError(""); }}>{index === 0 ? "Exact" : `₱${amount.toLocaleString("en-PH")}`}</button>;
                })}
              </div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6B4C3B" }}>
                <span>Change</span>
                <strong style={{ color: changeDue > 0 ? "#0F766E" : "#3D2B1F" }}>₱{changeDue.toFixed(2)}</strong>
              </div>
            </> : paymentMethod === "split" ? <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, color: "#6B4C3B", fontSize: 12, fontWeight: 600 }}>
                  <span>Cash part</span>
                  <MoneyInput label="Cash part" value={cashPart} onChange={(next) => { setCashPart(next); if (checkoutError) setCheckoutError(""); }}
                    summary={(draft) => { const cash = Number.parseFloat(draft); return <><KeypadSummaryRow label="Order total" value={formatPeso(subtotal)} /><KeypadSummaryRow label="Then GCash" value={formatPeso(Math.max(0, subtotal - (Number.isFinite(cash) ? cash : 0)))} tone="#0057E4" /></>; }}
                    style={{ minWidth: 0, width: "100%", border: "1px solid #E8DDD5", borderRadius: 8, background: "#FFFDF9", color: "#3D2B1F", padding: "10px 11px", fontSize: 14 }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, color: "#6B4C3B", fontSize: 12, fontWeight: 600 }}>
                  <span>Cash received</span>
                  <MoneyInput label="Cash received" value={receivedAmount} onChange={(next) => { setReceivedAmount(next); if (checkoutError) setCheckoutError(""); }} placeholder={splitCash > 0 ? splitCash.toFixed(2) : "Exact"} quickAmounts={quickCashAmounts(splitCash)}
                    summary={(draft) => { const paid = draft.trim() === "" ? splitCash : Number.parseFloat(draft); return <><KeypadSummaryRow label="Cash part" value={formatPeso(splitCash)} /><KeypadSummaryRow label={Number.isFinite(paid) && paid < splitCash ? "Still short" : "Change"} value={formatPeso(Number.isFinite(paid) ? Math.abs(paid - splitCash) : 0)} tone={Number.isFinite(paid) && paid < splitCash ? "#B91C1C" : "#0F766E"} /></>; }}
                    style={{ minWidth: 0, width: "100%", border: "1px solid #E8DDD5", borderRadius: 8, background: "#FFFDF9", color: "#3D2B1F", padding: "10px 11px", fontSize: 14 }} />
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", borderRadius: 8, background: "#FAF5FF", border: "1px solid #E9D5FF", fontSize: 12.5, color: "#6B4C3B" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Cash now</span><strong style={{ color: "#3D2B1F" }}>₱{splitCash.toFixed(2)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Then GCash</span><strong style={{ color: "#0057E4" }}>₱{splitGcash.toFixed(2)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Change</span><strong style={{ color: splitChange > 0 ? "#0F766E" : "#3D2B1F" }}>₱{splitChange.toFixed(2)}</strong></div>
              </div>
              {splitProblem && cashPart.trim() !== "" ? <p style={{ margin: 0, color: "#B91C1C", fontSize: 11.5, lineHeight: 1.4 }}>{splitProblem}</p>
                : <p style={{ margin: 0, color: "#9C8278", fontSize: 11, lineHeight: 1.45 }}>Take the cash first. The customer pays the rest with GCash, and the order goes to the queue once GCash confirms.</p>}
            </> : paymentMethod === "gcash" ? <p style={{ margin: 0, color: "#6B4C3B", fontSize: 11.5, lineHeight: 1.5 }}>A QR code appears for the customer to scan and pay in GCash. The order goes to the queue once the payment is confirmed.{gcashConfig && subtotal > 0 && subtotal < gcashConfig.minimumAmount ? <strong style={{ display: "block", color: "#B91C1C" }}>GCash needs at least ₱{gcashConfig.minimumAmount.toFixed(2)}.</strong> : null}</p>
            : null}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button disabled={checkingOut || cart.length === 0 || !hasValidPayment} onClick={() => void checkout()} style={{ flex: 1, border: "none", background: checkingOut || cart.length === 0 || !hasValidPayment ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", padding: "10px", borderRadius: 10, cursor: checkingOut || cart.length === 0 || !hasValidPayment ? "not-allowed" : "pointer" }}>{checkingOut ? "Processing..." : paymentMethod === "gcash" ? "Charge with GCash" : paymentMethod === "split" ? `Cash ₱${splitCash.toFixed(2)} + GCash ₱${splitGcash.toFixed(2)}` : "Checkout"}</button>
            <button onClick={() => { removeCustomer(); setDiscountReward(null); setIdDiscounts([]); setCounterCartId(null); setCart([]); setReceivedAmount(""); setCashPart(""); setCheckoutError(""); }} style={{ border: "1px solid #E8DDD5", background: "#fff", padding: "10px", borderRadius: 10 }}>Clear</button>
          </div>
        </div>
      </div>
    </aside>

    {gcashCheckout && <GcashPaymentDialog checkout={gcashCheckout} testMode={Boolean(gcashConfig?.testMode)} onClose={() => { if ((gcashCheckout.cashAmount ?? 0) > 0) setCheckoutError(`The GCash part was not paid, so no order was made. Give back the ₱${(gcashCheckout.cashAmount ?? 0).toFixed(2)} cash part.`); setGcashCheckout(null); }} onPaid={(view) => { setGcashCheckout(null); if (view.orderId !== null && view.queueNumber !== null && view.shiftId !== null) void afterOrderPlaced(view.orderId, view.queueNumber, view.shiftId); }} />}
    {lastPlaced && <div className="pos-placed" role="status">
      <span className="pos-placed-number">#{lastPlaced.queueNumber}</span>
      <span className="pos-placed-text"><strong>Order sent to the queue</strong>{lastPlaced.stars && <em className="pos-placed-stars">{lastPlaced.stars}</em>}{lastPlaced.note && <em>{lastPlaced.note}</em>}</span>
      <button type="button" className="pos-placed-print" onClick={() => void printPlacedReceipt(lastPlaced.orderId, lastPlaced.queueNumber)}><IconPrinter size={16} />{receipts.settings.output === "pdf" ? "Receipt PDF" : "Receipt"}</button>
      <button type="button" className="pos-placed-close" onClick={() => setLastPlaced(null)} aria-label="Dismiss">×</button>
    </div>}
    {rewardChoiceOpen && customer && <Modal onClose={() => setRewardChoiceOpen(false)} label="Choose a reward">
      <section className="pos-customer-dialog">
        <div className="pos-customer-dialog-head"><div><p>Rewards{loyalty.campaign ? ` · ${loyalty.campaign.name}` : ""}{customer.birthdayTreat ? " · 🎂 birthday" : ""}</p><h3>{customer.fullName.split(" ")[0]} has ★ {starsLeft}{starsInCart ? ` left (★ ${starsInCart} in this order)` : ""}</h3></div><button type="button" onClick={() => setRewardChoiceOpen(false)} aria-label="Close">×</button></div>
        <div className="pos-customer-results">
          {availableRewards.map((reward) => {
            const birthdayTreat = reward.kind === "birthday";
            const affordable = birthdayTreat || reward.starsCost <= starsLeft;
            const blocked = reward.rewardType === "discount" && ((discountReward !== null && discountReward.id !== reward.id) || idDiscounts.length > 0);
            return <button key={reward.id} type="button" className="pos-customer-result" disabled={!affordable || blocked} style={{ opacity: affordable && !blocked ? 1 : 0.5 }} onClick={() => chooseReward(reward)}>
              <span className="pos-customer-avatar" style={{ background: birthdayTreat ? "#DB2777" : "#F59E0B" }}>{birthdayTreat ? "🎂" : "★"}</span>
              <span className="pos-customer-result-text"><strong>{reward.name}</strong><em>{reward.rewardType === "discount" ? `${discountText(reward)} · ` : ""}{birthdayTreat ? "Birthday treat, no stars" : `★ ${reward.starsCost}`}{affordable ? "" : ` · needs ${reward.starsCost - starsLeft} more`}{blocked ? " · one discount per order" : ""}</em></span>
            </button>;
          })}
        </div>
      </section>
    </Modal>}
    {rewardForItem && <Modal onClose={() => setRewardForItem(null)} label={`Choose the item for ${rewardForItem.name}`}>
      <section className="pos-customer-dialog">
        <div className="pos-customer-dialog-head"><div><p>Reward · ★ {rewardForItem.starsCost}</p><h3>{rewardForItem.name}: which item?</h3></div><button type="button" onClick={() => setRewardForItem(null)} aria-label="Close">×</button></div>
        <div className="pos-customer-results">
          {(() => {
            const options = products.flatMap((product) => product.variants.map((variant) => ({ product, variant, why: rewardMismatch(rewardForItem, { productId: product.product_id, category: product.product_category, price: Number(variant.price) }), left: getRemainingQuantity(product, variant) })))
              .filter((option) => option.why === null);
            if (options.length === 0) return <p className="pos-customer-empty">No menu item fits this reward right now. Check the reward in Admin → Loyalty.</p>;
            return options.map(({ product, variant, left }) => {
              const unavailable = variant.available === false || left <= 0;
              return <button key={variant.product_variant_id} type="button" className="pos-customer-result" disabled={unavailable} style={{ opacity: unavailable ? 0.5 : 1 }} onClick={() => addRewardLine(product, variant, rewardForItem)}>
                <span className="pos-customer-avatar" style={{ background: "#3D2B1F" }}>🎁</span>
                <span className="pos-customer-result-text"><strong>{product.product_name}{variant.size_label ? ` — ${variant.size_label}` : ""}{variant.temperature === "hot" ? " · Hot" : variant.temperature === "cold" ? " · Cold" : ""}</strong><em>Normally {formatPeso(Number(variant.price))}{unavailable ? " · sold out" : ""}</em></span>
              </button>;
            });
          })()}
        </div>
      </section>
    </Modal>}
    {rewardPasswordOpen && customer && <Modal onClose={() => setRewardPasswordOpen(false)} label="Confirm the reward">
      <form className="pos-customer-dialog" onSubmit={(event) => { event.preventDefault(); if (rewardPassword) void checkout(rewardPassword); }}>
        <div className="pos-customer-dialog-head"><div><p>Confirm reward</p><h3>{[starsInCart > 0 ? `Use ★ ${starsInCart} of ${customer.fullName.split(" ")[0]}'s stars` : "", birthdayInOrder ? `${starsInCart > 0 ? "and give" : `Give ${customer.fullName.split(" ")[0]}`} their birthday treat` : ""].filter(Boolean).join(" ")}?</h3></div><button type="button" onClick={() => setRewardPasswordOpen(false)} aria-label="Close">×</button></div>
        <p className="pos-customer-empty" style={{ margin: 0 }}>{customer.fullName} has no app account, so you confirm the reward with your password. It is recorded under your name.</p>
        <ConfirmPasswordField value={rewardPassword} onChange={(value) => { setRewardPassword(value); setRewardPasswordInvalid(false); }} userName={userName} invalid={rewardPasswordInvalid} autoFocus />
        <button type="submit" className="pos-reward-button" disabled={!rewardPassword || checkingOut}>{checkingOut ? "Placing the order…" : "Confirm and check out"}</button>
      </form>
    </Modal>}
    {idDiscountDialogOpen && <IdDiscountDialog types={idDiscountSetup.types} vat={idDiscountSetup.vat}
      lines={cart.filter((item) => item.variantId !== null && getLineTotal(item) > 0).map((item) => ({ key: item.key, label: getLineLabel(item), qty: item.qty, unit: getLineTotal(item) / item.qty }))}
      taken={Object.fromEntries(idPreview.used)} existing={idDiscounts.length} initialTypeId={idDiscounts.length === 0 ? idDiscountInitialType : null}
      lockedMode={idDiscounts.length === 0 ? null : idDiscounts[0].lines === null ? "shared" : "items"} lockedGroupSize={idDiscounts.length > 0 && idDiscounts[0].lines === null ? idDiscounts[0].groupSize : null}
      onAdd={(entry) => { setIdDiscounts((current) => [...current, entry]); setIdDiscountDialogOpen(false); setIdDiscountInitialType(null); if (checkoutError) setCheckoutError(""); }} onClose={() => { setIdDiscountDialogOpen(false); setIdDiscountInitialType(null); }} />}
    {idCheckOpen && <IdCheckDialog key={idCheckOpen.id} check={idCheckOpen} lines={idCheckLines(idCheckOpen)} types={idDiscountSetup.types} vat={idDiscountSetup.vat}
      onDecided={(message) => { setIdCheckOpen(null); setIdCheckNotice(message); void refreshIdChecks(); }} onClose={() => { setIdCheckOpen(null); void refreshIdChecks(); }} />}
    {customerPickerOpen && <CustomerPickerDialog onClose={() => setCustomerPickerOpen(false)} onPick={(picked) => { if (customer && customer.id !== picked.id) removeCustomer(); setCustomer(picked); setCustomerPickerOpen(false); if (checkoutError) setCheckoutError(""); }} />}
    {selectionProduct && (
      <Modal onClose={() => setSelectionProduct(null)} label={`Choose ${selectionProduct.product_name}`}>
        <section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 420px)", maxHeight: "85vh", overflowY: "auto", padding: 20, borderRadius: 18, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 18px 48px rgba(61,43,31,0.24)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>Customize order</p>
              <h3 style={{ margin: "5px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 21, color: "#3D2B1F" }}>{selectionProduct.product_name}</h3>
            </div>
            <button type="button" onClick={() => setSelectionProduct(null)} aria-label="Close product selection" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, lineHeight: 1, cursor: "pointer" }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
            {selectionProduct.variants?.length ? selectionProduct.variants.map((variant) => {
              const remaining = getRemainingQuantity(selectionProduct, variant);
              const unavailable = variant.available === false || remaining <= 0;
              return <button type="button" className="pos-variant-button" key={variant.product_variant_id} disabled={unavailable} onClick={() => { addToCart(selectionProduct, variant); setSelectionProduct(null); }} style={{ border: "none", background: unavailable ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", padding: "12px 13px", borderRadius: 9, cursor: unavailable ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{variant.size_label ?? "Regular"}{variant.temperature === "hot" ? " · Hot" : variant.temperature === "cold" ? " · Cold" : ""}</span>
                <span>₱{Number(variant.price).toFixed(2)} · {unavailable ? "Unavailable" : `${remaining} left`}</span>
              </button>;
            }) : <button type="button" onClick={() => { addToCart(selectionProduct, null); setSelectionProduct(null); }} style={{ border: "none", background: "#3D2B1F", color: "#FDF9F5", padding: "12px 13px", borderRadius: 9, cursor: "pointer", fontWeight: 700 }}>Add to cart</button>}
          </div>
          <button type="button" onClick={() => setSelectionProduct(null)} style={{ width: "100%", marginTop: 14, padding: "10px 12px", border: "1px solid #E8DDD5", borderRadius: 9, background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
        </section>
      </Modal>
    )}
  </main>;
}

// Minutes an order has been waiting, and the colour the barista sees for it.
function getWaitInfo(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  const label = minutes < 1 ? "Just now" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes >= 10) return { minutes, label, color: "#B91C1C", background: "#FEE2E2", border: "#FCA5A5" };
  if (minutes >= 5) return { minutes, label, color: "#B45309", background: "#FEF3C7", border: "#FCD34D" };
  return { minutes, label, color: "#15803D", background: "#DCFCE7", border: "#86EFAC" };
}

// Add-on quantities are stored as a total for the line; the barista needs them per cup.
function formatQueueAddition(addition: { name: string; quantity: number }, lineQuantity: number) {
  const total = Number(addition.quantity);
  const perCup = lineQuantity > 0 ? total / lineQuantity : total;
  return lineQuantity > 1 && Number.isInteger(perCup) ? `${addition.name} ×${perCup} each` : `${addition.name} ×${total}`;
}

// onCounts: tells the sidebar the waiting/ready counts whenever this page's lists change, so the
// badge updates the moment an order is marked ready instead of on its own slower refresh.
// ─── Deliveries ───────────────────────────────────────────────────────────────
// The delivery queue: orders the barista is making, packed orders waiting for a rider, orders on
// their way, and cash on delivery the cashier still has to receive. Riders see what is theirs
// (and every packed order they can take); cashiers and admins see everything.
type DeliveryCard = {
  id: number; orderId: number; queueNumber: number | null; total: number; fee: number; orderStatus: string; discountLabel: string | null;
  status: string; payment: string; recipientName: string; phone: string; street: string; landmark: string | null; riderNotes: string | null; zoneName: string; checkId: boolean;
  codAmount: number | null; codCollected: number | null; failureReason: string | null; riderId: number | null; riderName: string | null; remittedTo: string | null; items: string;
  createdAt: string; readyAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; failedAt: string | null; remittedAt: string | null;
};

function IconTruck({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17h7M15 17l-2-6h-3M13 11l1-3h3M5 12h5v3" /></svg>;
}

function DeliveriesPage({ user, onOpenReversals, onChanged }: { user: Session; onOpenReversals: () => void; onChanged?: () => void }) {
  const [list, setList] = useState<DeliveryCard[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failing, setFailing] = useState<{ id: number; reason: string } | null>(null);
  const [collecting, setCollecting] = useState<number | null>(null);
  // "Picked up" by a cashier: which rider took it (handing: the card being handed over).
  const [riders, setRiders] = useState<{ id: number; name: string; onDuty: boolean }[]>([]);
  const [handing, setHanding] = useState<{ id: number; riderId: number } | null>(null);
  const isRider = user.role.toLowerCase() === "rider";

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/deliveries", { cache: "no-store" });
      const payload = await response.json() as { data?: DeliveryCard[]; riders?: { id: number; name: string; onDuty: boolean }[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load the deliveries.");
      setList(payload.data ?? []);
      setRiders(payload.riders ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the deliveries.");
      setList((current) => current ?? []);
    }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function act(card: DeliveryCard, action: "pickup" | "delivered" | "failed" | "remit", extra: Record<string, unknown> = {}) {
    setBusyId(card.id);
    setError("");
    try {
      const response = await fetch("/api/deliveries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: card.id, action, ...extra }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not update the delivery.");
      const riderName = action === "pickup" && typeof extra.riderId === "number" && extra.riderId !== user.adminId ? riders.find((rider) => rider.id === extra.riderId)?.name : null;
      setNotice(action === "pickup" ? `Order #${card.queueNumber} is on its way${riderName ? ` with ${riderName}` : ""}.` : action === "delivered" ? `Order #${card.queueNumber} delivered.${card.payment === "cod" ? ` Hand the ₱${(card.codAmount ?? 0).toFixed(2)} to the cashier.` : ""}` : action === "failed" ? `Order #${card.queueNumber} marked not delivered. A cashier voids it in Void & Refund.` : `Received ₱${(card.codCollected ?? 0).toFixed(2)} for order #${card.queueNumber}.`);
      setFailing(null);
      setCollecting(null);
      setHanding(null);
      onChanged?.();
      await load();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : "Could not update the delivery.");
    } finally {
      setBusyId(null);
    }
  }

  const mine = (card: DeliveryCard) => !isRider || card.riderId === user.adminId;
  const all = list ?? [];
  const preparing = all.filter((card) => card.status === "preparing" && card.orderStatus === "completed");
  const ready = all.filter((card) => card.status === "ready" && card.orderStatus === "completed");
  const out = all.filter((card) => card.status === "out" && card.orderStatus === "completed" && mine(card));
  const cash = all.filter((card) => card.payment === "cod" && card.codCollected !== null && card.remittedAt === null && mine(card));
  const failed = all.filter((card) => card.status === "failed" && card.orderStatus === "completed" && mine(card));
  const done = all.filter((card) => (card.status === "delivered" || card.status === "cancelled" || (card.status === "failed" && card.orderStatus !== "completed")) && mine(card) && !cash.includes(card));
  const clock = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }) : "";
  const mapsLink = (card: DeliveryCard) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${card.street}, ${card.zoneName}`)}`;

  const cardView = (card: DeliveryCard) => <article key={card.id} className={`dlv-card is-${card.status}`}>
    <header>
      <strong>#{card.queueNumber ?? "—"}</strong>
      <span className="dlv-zone">{card.zoneName}</span>
      <span className={`dlv-pay is-${card.payment}`}>{card.payment === "cod" ? `Collect ₱${(card.codAmount ?? card.total).toFixed(2)}` : "Paid · GCash"}</span>
    </header>
    <div className="dlv-to">
      <strong>{card.recipientName}</strong>
      <a href={`tel:${card.phone}`}>📞 {card.phone}</a>
    </div>
    <p className="dlv-address">{card.street}{card.landmark ? <em> · near {card.landmark}</em> : null}</p>
    {card.riderNotes && <p className="dlv-notes">“{card.riderNotes}”</p>}
    {card.checkId && <p className="dlv-id">🪪 {card.discountLabel ? card.discountLabel.replace(/\s*\(.*\)\s*$/, "") : "ID"} discount · check the ID at the door</p>}
    <p className="dlv-items">{card.items}</p>
    <footer>
      <span className="dlv-meta">₱{card.total.toFixed(2)}{card.fee > 0 ? ` incl. ₱${card.fee.toFixed(2)} fee` : ""} · {card.status === "out" ? `out since ${clock(card.pickedUpAt)}${card.riderName ? ` · ${card.riderName}` : ""}` : card.status === "ready" ? `packed ${clock(card.readyAt)}` : card.status === "preparing" ? `ordered ${clock(card.createdAt)}` : card.status === "delivered" ? `delivered ${clock(card.deliveredAt)}${card.riderName ? ` by ${card.riderName}` : ""}` : card.status === "failed" ? `not delivered: ${card.failureReason ?? ""}` : "cancelled"}</span>
      <span className="dlv-actions">
        <a className="dlv-button is-light" href={mapsLink(card)} target="_blank" rel="noopener">Open in Maps</a>
        {card.status === "ready" && handing?.id !== card.id && <button type="button" className="dlv-button" disabled={busyId !== null} onClick={() => isRider ? void act(card, "pickup") : setHanding({ id: card.id, riderId: riders[0]?.id ?? user.adminId })}>{busyId === card.id ? "…" : isRider ? "Pick up" : "Picked up…"}</button>}
        {card.status === "out" && (card.payment === "cod" && collecting !== card.id
          ? <button type="button" className="dlv-button" disabled={busyId !== null} onClick={() => setCollecting(card.id)}>Delivered</button>
          : card.status === "out" && card.payment !== "cod" && <button type="button" className="dlv-button" disabled={busyId !== null} onClick={() => void act(card, "delivered")}>{busyId === card.id ? "…" : "Delivered"}</button>)}
        {(card.status === "out" || card.status === "ready") && <button type="button" className="dlv-button is-danger" disabled={busyId !== null} onClick={() => setFailing({ id: card.id, reason: "" })}>Not delivered…</button>}
        {cash.includes(card) && !isRider && <button type="button" className="dlv-button" disabled={busyId !== null} onClick={() => void act(card, "remit")}>{busyId === card.id ? "…" : `Received ₱${(card.codCollected ?? 0).toFixed(2)}`}</button>}
        {failed.includes(card) && !isRider && <button type="button" className="dlv-button is-danger" onClick={onOpenReversals}>Void in Void & Refund</button>}
      </span>
    </footer>
    {handing?.id === card.id && <div className="dlv-confirm">
      <span>Picked up by</span>
      <select value={handing.riderId} onChange={(event) => setHanding({ id: card.id, riderId: Number(event.target.value) })} aria-label="Rider">
        {riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}{rider.onDuty ? "" : " (not clocked in)"}</option>)}
        <option value={user.adminId}>Me ({user.fullName})</option>
      </select>
      <button type="button" className="dlv-button" disabled={busyId !== null} onClick={() => void act(card, "pickup", { riderId: handing.riderId })}>{busyId === card.id ? "…" : "Confirm"}</button>
      <button type="button" className="dlv-button is-light" onClick={() => setHanding(null)}>Back</button>
    </div>}
    {collecting === card.id && <div className="dlv-confirm">
      <span>Did you collect <strong>₱{(card.codAmount ?? 0).toFixed(2)}</strong> in cash?</span>
      <button type="button" className="dlv-button" disabled={busyId !== null} onClick={() => void act(card, "delivered", { collected: card.codAmount })}>{busyId === card.id ? "…" : "Yes, collected"}</button>
      <button type="button" className="dlv-button is-light" onClick={() => setCollecting(null)}>Back</button>
    </div>}
    {failing?.id === card.id && <div className="dlv-confirm">
      <input value={failing.reason} onChange={(event) => setFailing({ id: card.id, reason: event.target.value })} placeholder="Why? e.g. no one home, wrong address" maxLength={200} autoFocus />
      <button type="button" className="dlv-button is-danger" disabled={busyId !== null || !failing.reason.trim()} onClick={() => void act(card, "failed", { reason: failing.reason })}>{busyId === card.id ? "…" : "Mark not delivered"}</button>
      <button type="button" className="dlv-button is-light" onClick={() => setFailing(null)}>Back</button>
    </div>}
  </article>;

  const section = (title: string, cards: DeliveryCard[], hint: string) => cards.length > 0 && <section className="dlv-section">
    <h3>{title} <span>{cards.length}</span></h3>
    <p className="dlv-hint">{hint}</p>
    <div className="dlv-grid">{cards.map(cardView)}</div>
  </section>;

  return <main className="dlv-page">
    <div className="dlv-head">
      <div><h2>Deliveries</h2><p>{isRider ? "Pick up packed orders, deliver them, and hand cash on delivery to the cashier." : "Orders to deliver, riders on the way, and cash on delivery to receive."}</p></div>
      <button type="button" className="dlv-button is-light" onClick={() => void load()}>Refresh</button>
    </div>
    {error && <p className="dlv-error" role="alert">{error}</p>}
    {notice && <p className="dlv-notice" role="status">{notice}</p>}
    {list === null ? <p className="dlv-hint">Loading deliveries…</p> : <>
      {section(isRider ? "Your cash to hand in" : "Cash on delivery to receive", cash, isRider ? "Give this cash to the cashier. They record it." : "Riders hand this in. Tap Received when you have counted it: it goes into this shift's drawer.")}
      {section("Ready for pickup", ready, "Packed by the barista.")}
      {section(isRider ? "Your deliveries on the way" : "On the way", out, "Tap Delivered at the door.")}
      {!isRider && section("Not delivered: void these", failed, "Void the order in Void & Refund. It puts the stock back.")}
      {isRider && section("Your deliveries that failed", failed, "A cashier voids these.")}
      {section("Being prepared", preparing, "The barista is making these. They show up as ready once packed.")}
      {section(isRider ? "Your deliveries this shift" : "Done this shift", done.slice(0, 30), "")}
      {cash.length + ready.length + out.length + failed.length + preparing.length + done.length === 0 && <p className="dlv-empty">No deliveries yet this shift.</p>}
    </>}
  </main>;
}

function QueuePage({ onCounts }: { onCounts?: (counts: QueueCounts) => void }) {
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [readyQueue, setReadyQueue] = useState<QueueOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded) onCounts?.({ waiting: queue.length, ready: readyQueue.length });
  }, [loaded, queue.length, readyQueue.length, onCounts]);
  const [queueError, setQueueError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  // Lines the barista has ticked off while making an order ("orderId:lineIndex"). Screen-only.
  const [doneLines, setDoneLines] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  async function loadQueue() {
    const response = await fetch("/api/queue", { cache: "no-store" });
    const payload = await response.json() as { data?: { waiting?: QueueOrder[]; ready?: QueueOrder[]; recent?: QueueOrder[] }; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load queue.");
    setQueue(uniqueQueueOrders(payload.data?.waiting ?? []));
    setReadyQueue(uniqueQueueOrders(payload.data?.ready ?? []));
    setLoaded(true);
  }

  async function serveOrder(orderId: number) {
    const response = await fetch("/api/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Unable to serve order.");
    setQueue((current) => current.filter((order) => order.order_id !== orderId));
    const servedOrder = queue.find((order) => order.order_id === orderId);
    // A packed delivery order goes to the Deliveries page, not the pickup list.
    if (servedOrder && servedOrder.service_type !== "delivery") setReadyQueue((current) => [servedOrder, ...current.filter((order) => order.order_id !== orderId)]);
    setDoneLines((current) => new Set(Array.from(current).filter((key) => !key.startsWith(`${orderId}:`))));
  }

  async function flushOrder(orderId: number) {
    const response = await fetch("/api/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, action: "flush" }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Unable to flush ready order.");
    setReadyQueue((current) => current.filter((order) => order.order_id !== orderId));
  }

  async function runOrderAction(orderId: number, action: (id: number) => Promise<void>, fallbackMessage: string) {
    if (busyOrderId !== null) return;
    setBusyOrderId(orderId);
    try {
      await action(orderId);
      setQueueError("");
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setBusyOrderId(null);
    }
  }

  function toggleLine(key: string) {
    setDoneLines((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await loadQueue();
        if (active) setQueueError("");
      } catch (error) {
        console.error("Queue: failed to load queue", error);
        if (active) setQueueError(error instanceof Error ? error.message : "Unable to load queue.");
      }
    };
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 10_000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, []);

  // Keeps the waiting timers current between queue refreshes.
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const oldestWait = queue.length > 0 ? getWaitInfo(queue.reduce((oldest, order) => order.created_at < oldest ? order.created_at : oldest, queue[0].created_at), now) : null;

  return <main className="queue-board" style={{ display: "flex", gap: 20, padding: 20, height: "100%", minHeight: 0 }}>
    <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26, color: "#3D2B1F", margin: 0 }}>Now Making</h1>
          <p style={{ color: "#9C8278", fontSize: 12.5, margin: "3px 0 0" }}>Oldest orders first. Tap a drink to tick it off, then mark the order ready.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ padding: "8px 14px", borderRadius: 10, background: "#3D2B1F", color: "#FDF9F5", fontWeight: 800, fontSize: 13 }}>{queue.length} waiting</span>
          {oldestWait && <span style={{ padding: "8px 14px", borderRadius: 10, background: oldestWait.background, color: oldestWait.color, border: `1px solid ${oldestWait.border}`, fontWeight: 800, fontSize: 13 }}>Oldest: {oldestWait.label}</span>}
        </div>
      </div>
      {queueError && <p style={{ margin: 0, padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, flexShrink: 0 }}>{queueError}</p>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {queue.length === 0 && !queueError && (
          <div style={{ height: "100%", minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, border: "2px dashed #E8DDD5", borderRadius: 16, color: "#9C8278" }}>
            <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, color: "#6B4C3B" }}>All caught up</strong>
            <span style={{ fontSize: 13 }}>New orders from the counter and the mobile menu appear here automatically.</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14, alignItems: "start" }}>
          {queue.map((order) => {
            const wait = getWaitInfo(order.created_at, now);
            const isOnline = order.order_source === "online";
            const lineKeys = order.order_details.map((_, index) => `${order.order_id}:${index}`);
            const doneCount = lineKeys.filter((key) => doneLines.has(key)).length;
            const busy = busyOrderId === order.order_id;
            return <article key={order.order_id} style={{ display: "flex", flexDirection: "column", background: "#FDF9F5", border: "1px solid #E8DDD5", borderTop: `6px solid ${wait.color}`, borderRadius: 16, boxShadow: "0 4px 16px rgba(61,43,31,0.08)", overflow: "hidden" }}>
              <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px 10px", borderBottom: "1px dashed #E8DDD5" }}>
                <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 34, fontWeight: 800, lineHeight: 1, color: "#3D2B1F" }}>#{order.queue_number}</strong>
                {order.service_type && <span className={`queue-service is-${order.service_type}`}>{order.service_type === "take_out" ? "Take out" : order.service_type === "delivery" ? "🛵 Delivery" : "Dine in"}</span>}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, marginLeft: "auto" }}>
                  <span style={{ padding: "3px 9px", borderRadius: 999, background: wait.background, color: wait.color, border: `1px solid ${wait.border}`, fontSize: 12, fontWeight: 800 }}>{wait.label}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 999, background: isOnline ? "#CCFBF1" : "#F3EDE5", color: isOnline ? "#0F766E" : "#6B4C3B", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace" }}>{isOnline ? "Online" : "Counter"}</span>
                </div>
              </header>
              {order.id_check && <div className="queue-id-check">🪪 {order.id_check} discount · {order.service_type === "delivery" ? "the rider checks the ID at the door" : "check the ID at pickup"}</div>}
              {order.customer_name && <div className="queue-customer">
                <span className="queue-customer-name">For <strong>{order.customer_name}</strong></span>
                {order.customer_notes && <span className="queue-customer-note">📝 {order.customer_notes}</span>}
              </div>}
              <ul style={{ listStyle: "none", margin: 0, padding: "6px 8px" }}>
                {order.order_details.map((detail, index) => {
                  const key = lineKeys[index];
                  const done = doneLines.has(key);
                  const size = detail.size_label && detail.size_label.toLowerCase() !== "regular" ? detail.size_label : "";
                  return <li key={key}>
                    <button type="button" onClick={() => toggleLine(key)} aria-pressed={done} style={{ width: "100%", display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 6px", border: "none", borderRadius: 10, background: done ? "#F0FDF4" : "transparent", textAlign: "left", cursor: "pointer", opacity: done ? 0.55 : 1 }}>
                      <span style={{ flexShrink: 0, minWidth: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#16A34A" : "#3D2B1F", color: "#FDF9F5", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 16 }}>{done ? "✓" : `${detail.quantity}×`}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 16, color: "#3D2B1F", lineHeight: 1.2, textDecoration: done ? "line-through" : "none" }}>{detail.product_name}</span>
                        {(size || detail.temperature === "hot" || detail.temperature === "cold") && <span style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          {size && <span style={{ padding: "1px 7px", borderRadius: 6, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11.5, fontWeight: 700 }}>{size}</span>}
                          {detail.temperature === "hot" && <span style={{ padding: "1px 7px", borderRadius: 6, background: "#FFEDD5", color: "#C2410C", fontSize: 11.5, fontWeight: 800 }}>HOT</span>}
                          {detail.temperature === "cold" && <span style={{ padding: "1px 7px", borderRadius: 6, background: "#DBEAFE", color: "#1D4ED8", fontSize: 11.5, fontWeight: 800 }}>ICED</span>}
                        </span>}
                        {detail.additions.length > 0 && <span style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                          {detail.additions.map((addition) => <span key={addition.name} style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: 6, background: "#F3E8FF", color: "#7E22CE", border: "1px solid #E9D5FF", fontSize: 12, fontWeight: 700 }}>+ {formatQueueAddition(addition, Number(detail.quantity))}</span>)}
                        </span>}
                      </span>
                    </button>
                  </li>;
                })}
              </ul>
              <footer style={{ marginTop: "auto", padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {lineKeys.length > 1 && <span style={{ fontSize: 11, color: "#9C8278", fontFamily: "JetBrains Mono, monospace" }}>{doneCount}/{lineKeys.length} drinks done</span>}
                <button type="button" disabled={busy} onClick={() => void runOrderAction(order.order_id, serveOrder, "Unable to serve order.")} style={{ width: "100%", height: 48, border: "none", borderRadius: 12, background: busy ? "#C9B8AF" : "#D97706", color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", boxShadow: busy ? "none" : "0 6px 14px rgba(217,119,6,0.28)" }}>{busy ? "Updating…" : order.service_type === "delivery" ? "Packed for rider" : "Mark as ready"}</button>
              </footer>
            </article>;
          })}
        </div>
      </div>
    </section>

    <aside className="queue-ready" style={{ width: 300, flexShrink: 0, minHeight: 0, display: "flex", flexDirection: "column", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #FED7AA", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 19, fontWeight: 800, color: "#7C2D12" }}>Ready for Pickup</h2>
          <span style={{ padding: "3px 10px", borderRadius: 999, background: "#EA580C", color: "#FFFFFF", fontSize: 12, fontWeight: 800 }}>{readyQueue.length}</span>
        </div>
        <p style={{ margin: "4px 0 0", color: "#9A3412", fontSize: 11.5 }}>Shown on the customer screen until picked up.</p>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {readyQueue.length === 0 && <p style={{ margin: "18px 0", textAlign: "center", color: "#9A3412", fontSize: 13 }}>No orders waiting for pickup.</p>}
        {readyQueue.map((order) => {
          const busy = busyOrderId === order.order_id;
          return <div key={order.order_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#FFFFFF", border: "1px solid #FED7AA", borderRadius: 12 }}>
            <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, color: "#C2410C", minWidth: 58, lineHeight: 1 }}>#{order.queue_number}</strong>
            <span style={{ flex: 1, minWidth: 0, color: "#7C2D12", fontSize: 11.5, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{(order.customer_name || order.service_type) && <strong style={{ display: "block", color: "#9A3412", fontSize: 12.5 }}>{[order.service_type === "take_out" ? "Take out" : order.service_type === "dine_in" ? "Dine in" : "", order.customer_name ?? ""].filter(Boolean).join(" · ")}</strong>}{order.items}</span>
            <button type="button" disabled={busy} onClick={() => void runOrderAction(order.order_id, flushOrder, "Unable to flush ready order.")} title="Remove from the ready list once the customer has collected it" style={{ flexShrink: 0, border: "1px solid #EA580C", background: busy ? "#FED7AA" : "#FFFFFF", color: "#C2410C", borderRadius: 9, padding: "9px 11px", fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>{busy ? "…" : "Picked up"}</button>
          </div>;
        })}
      </div>
    </aside>
  </main>;
}

type ReversalFilter = "all" | "completed" | "voided" | "refunded";

const reversalStatusStyles: Record<string, { label: string; color: string; background: string; border: string }> = {
  completed: { label: "Completed", color: "#15803D", background: "#DCFCE7", border: "#86EFAC" },
  voided: { label: "Voided", color: "#B91C1C", background: "#FEE2E2", border: "#FCA5A5" },
  refunded: { label: "Refunded", color: "#7E22CE", background: "#F3E8FF", border: "#E9D5FF" },
};

// "2:14 PM" for today's orders, "Sep 25 · 2:14 PM" for older ones.
function formatOrderTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const manilaDay = (moment: Date) => moment.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return manilaDay(date) === manilaDay(new Date()) ? time : `${date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })} · ${time}`;
}

function describeOrderLine(detail: QueueOrderDetail): string {
  const size = detail.size_label && detail.size_label.toLowerCase() !== "regular" ? ` ${detail.size_label}` : "";
  const temperature = detail.temperature === "hot" ? " · Hot" : detail.temperature === "cold" ? " · Iced" : "";
  return `${detail.quantity}× ${detail.product_name}${size}${temperature}`;
}

// 09171234567 -> "0917 123 4567", the way people read GCash numbers aloud.
function formatGcashNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : value;
}

function isValidGcashNumber(value: string): boolean {
  return /^09\d{9}$/.test(value.replace(/[\s-]/g, "").replace(/^\+?63(?=9\d{9}$)/, "0"));
}

const returnFieldStyle: React.CSSProperties = { width: "100%", border: "1px solid #E8DDD5", borderRadius: 10, background: "#FFFFFF", padding: "10px 12px", fontSize: 14, color: "#3D2B1F", outline: "none" };

function ReversalsPage({ user }: { user: Session }) {
  const receipts = useContext(ReceiptContext);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [pendingAction, setPendingAction] = useState<{ order: QueueOrder; action: "void" | "refund" } | null>(null);
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  // How the money goes back: handed back from the drawer, or sent by hand through GCash.
  const [returnMethod, setReturnMethod] = useState<"cash" | "gcash" | "split" | "none">("cash");
  const [gcashName, setGcashName] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashReference, setGcashReference] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReversalFilter>("all");

  async function loadOrders() {
    try {
      const response = await fetch("/api/queue", { cache: "no-store" });
      const payload = await response.json() as { data?: { recent?: QueueOrder[] }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load recent orders.");
      setOrders(payload.data?.recent ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load recent orders.");
    } finally {
      setLoading(false);
    }
  }

  async function reverseOrder(order: QueueOrder, action: "void" | "refund") {
    if (submitting) return;
    if (returnMethod === "gcash" || returnMethod === "split") {
      if (!gcashName.trim()) { setError("Enter the name on the customer’s GCash account."); return; }
      if (!isValidGcashNumber(gcashNumber)) { setError("Enter the customer’s 11-digit GCash number, e.g. 0917 123 4567."); return; }
    }
    if (!password) { setError(`Enter your password to ${action} this order.`); setWrongPassword(true); return; }
    setSubmitting(true);
    setWrongPassword(false);
    try {
      const response = await fetch("/api/order-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.order_id, action, password, return_method: returnMethod, gcash_name: gcashName, gcash_number: gcashNumber, reference: gcashReference }),
      });
      const payload = await response.json();
      if (payload?.code === "wrong_password") { setPassword(""); setWrongPassword(true); }
      if (!response.ok) throw new Error(payload?.error || `Unable to ${action} order.`);
      setPendingAction(null);
      setPassword("");
      setError("");
      setNotice(`Order #${order.queue_number} ${action === "void" ? "voided" : "refunded"}. ${returnMethod === "split" ? `Hand back ₱${Number(order.cash_portion ?? 0).toFixed(2)} in cash and send ₱${(Number(order.total_amount ?? 0) - Number(order.cash_portion ?? 0)).toFixed(2)} through GCash to ${gcashName.trim()} (${formatGcashNumber(gcashNumber.replace(/[\s-]/g, "").replace(/^\+?63/, "0"))}).` : returnMethod === "gcash" ? `Send ₱${Number(order.total_amount ?? 0).toFixed(2)} through GCash to ${gcashName.trim()} (${formatGcashNumber(gcashNumber.replace(/[\s-]/g, "").replace(/^\+?63/, "0"))}).` : `Hand back ₱${Number(order.total_amount ?? 0).toFixed(2)} in cash.`} Its ingredients and add-ons were returned to inventory.`);
      await loadOrders();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} order.`);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadOrders(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const query = search.trim().toLowerCase().replace(/^#/, "");
  const counts: Record<ReversalFilter, number> = {
    all: orders.length,
    completed: orders.filter((order) => order.status === "completed").length,
    voided: orders.filter((order) => order.status === "voided").length,
    refunded: orders.filter((order) => order.status === "refunded").length,
  };
  const visibleOrders = orders.filter((order) => (filter === "all" || order.status === filter)
    && (!query || String(order.queue_number) === query || String(order.order_id) === query || order.items.toLowerCase().includes(query)));
  const pendingTotal = Number(pendingAction?.order.total_amount ?? 0);
  const pendingIsOnline = pendingAction?.order.payment_method === "online";
  const pendingIsGcash = pendingAction?.order.payment_provider === "paymongo_gcash";
  const paymentLabel = (order: QueueOrder) => order.payment_method === "split" ? `Cash ₱${Number(order.cash_portion ?? 0).toFixed(2)} + GCash` : order.payment_provider === "paymongo_gcash" ? "GCash" : order.payment_method === "online" ? "Online payment" : "Cash";
  const pendingIsSplit = pendingAction?.order.payment_method === "split";
  const pendingCashPart = pendingIsSplit ? Number(pendingAction?.order.cash_portion ?? 0) : 0;
  const pendingGcashPart = Math.max(0, pendingTotal - pendingCashPart);
  const openAction = (order: QueueOrder, action: "void" | "refund") => {
    setError(""); setPassword(""); setWrongPassword(false);
    setReturnMethod(order.cod_unpaid ? "none" : order.payment_method === "split" ? "split" : order.payment_provider === "paymongo_gcash" ? "gcash" : "cash");
    setGcashName(""); setGcashNumber(""); setGcashReference("");
    setPendingAction({ order, action });
  };
  const closeAction = () => { setPendingAction(null); setPassword(""); setWrongPassword(false); setError(""); };

  return <main className="p-6" style={{ maxWidth: 1100 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26, color: "#3D2B1F", margin: 0 }}>Void & Refund</h1>
        <p style={{ color: "#9C8278", fontSize: 12.5, margin: "4px 0 0" }}>Orders from the current shift. Orders from earlier shifts can’t be voided or refunded. Reversing an order returns its ingredients and add-ons to inventory.</p>
      </div>
      <button type="button" onClick={() => { setLoading(true); void loadOrders(); }} style={{ border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#6B4C3B", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Refresh</button>
    </div>

    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search queue # or item…" style={{ flex: "1 1 240px", maxWidth: 360, padding: "11px 14px", borderRadius: 12, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#3D2B1F", outline: "none" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["all", "completed", "voided", "refunded"] as const).map((value) => {
          const active = filter === value;
          return <button key={value} type="button" aria-pressed={active} onClick={() => setFilter(value)} style={{ border: active ? "none" : "1px solid #E8DDD5", background: active ? "#3D2B1F" : "#FDF9F5", color: active ? "#FDF9F5" : "#6B4C3B", borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {value === "all" ? "All" : reversalStatusStyles[value].label} <span style={{ opacity: 0.65, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{counts[value]}</span>
          </button>;
        })}
      </div>
    </div>

    {notice && <div role="status" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", fontSize: 13, fontWeight: 600 }}><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss" style={{ border: "none", background: "transparent", color: "#15803D", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button></div>}
    {error && !pendingAction && <p style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{error}</p>}

    {loading && orders.length === 0 ? <p style={{ color: "#9C8278" }}>Loading this shift’s orders…</p>
      : visibleOrders.length === 0 ? <div style={{ padding: "40px 0", textAlign: "center", border: "2px dashed #E8DDD5", borderRadius: 16, color: "#9C8278", fontSize: 13 }}>{orders.length === 0 ? "No orders in this shift yet." : "No orders match this search or filter."}</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.6 : 1 }}>
        {visibleOrders.map((order) => {
          const status = reversalStatusStyles[order.status ?? "completed"] ?? reversalStatusStyles.completed;
          const reversible = order.status === "completed";
          const isOnlineOrder = order.order_source === "online";
          return <article key={order.order_id} className="rev-card" style={{ display: "flex", alignItems: "stretch", gap: 14, padding: "14px 16px", background: reversible ? "#FDF9F5" : "#FAF7F4", border: "1px solid #E8DDD5", borderLeft: `5px solid ${status.color}`, borderRadius: 14 }}>
            <div style={{ minWidth: 76, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1, color: reversible ? "#3D2B1F" : "#9C8278" }}>#{order.queue_number}</strong>
              <span style={{ marginTop: 5, fontSize: 11.5, color: "#9C8278" }}>{formatOrderTime(order.created_at)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: status.background, color: status.color, border: `1px solid ${status.border}`, fontSize: 11, fontWeight: 800 }}>{status.label}{!reversible && order.reversed_at ? ` · ${formatOrderTime(order.reversed_at)}` : ""}</span>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: isOnlineOrder ? "#CCFBF1" : "#F3EDE5", color: isOnlineOrder ? "#0F766E" : "#6B4C3B", fontSize: 11, fontWeight: 700 }}>{isOnlineOrder ? "Mobile order" : "Counter"}</span>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11, fontWeight: 700 }}>{paymentLabel(order)}</span>
              </div>
              {!reversible && order.return_method && <div style={{ padding: "6px 10px", borderRadius: 9, background: order.return_method === "gcash" ? "#EFF6FF" : "#F3EDE5", color: order.return_method === "gcash" ? "#1E40AF" : "#6B4C3B", fontSize: 12, lineHeight: 1.45 }}>
                {order.return_method === "split"
                  ? <>Returned as paid: <strong>₱{Number(order.cash_portion ?? 0).toFixed(2)} cash</strong> + <strong>₱{(Number(order.total_amount ?? 0) - Number(order.cash_portion ?? 0)).toFixed(2)} GCash</strong> to <strong>{order.return_gcash_name}</strong> · {formatGcashNumber(order.return_gcash_number ?? "")}{order.return_reference ? ` · Ref ${order.return_reference}` : " · no reference yet"}</>
                  : order.return_method === "gcash"
                  ? <>Returned through <strong>GCash</strong> to <strong>{order.return_gcash_name}</strong> · {formatGcashNumber(order.return_gcash_number ?? "")}{order.return_reference ? ` · Ref ${order.return_reference}` : " · no reference yet"}</>
                  : <>Returned in <strong>cash</strong> from the drawer</>}
                {order.reversed_by ? ` · by ${order.reversed_by}` : ""}
              </div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, color: reversible ? "#3D2B1F" : "#9C8278", fontSize: 13, textDecoration: reversible ? "none" : "line-through" }}>
                {order.order_details.map((detail, index) => <span key={`${order.order_id}-${index}`}>
                  <strong style={{ fontWeight: 700 }}>{describeOrderLine(detail)}</strong>
                  {detail.additions.length > 0 && <span style={{ color: reversible ? "#7E22CE" : "#B9A398", fontSize: 12 }}> + {detail.additions.map((addition) => formatQueueAddition(addition, Number(detail.quantity))).join(", ")}</span>}
                </span>)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
              <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 19, fontWeight: 800, color: reversible ? "#3D2B1F" : "#9C8278" }}>₱{Number(order.total_amount ?? 0).toFixed(2)}</strong>
              {reversible && (user.canVoidOrders || user.canRefundOrders) && <div style={{ display: "flex", gap: 6 }}>
                {user.canVoidOrders && <button type="button" onClick={() => openAction(order, "void")} style={{ border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Void</button>}
                {user.canRefundOrders && <button type="button" onClick={() => openAction(order, "refund")} style={{ border: "1px solid #E9D5FF", background: "#FAF5FF", color: "#7E22CE", borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Refund</button>}
              </div>}
              <button type="button" className="rev-receipt" onClick={() => { setNotice(""); void receipts.printReceipt(order.order_id, { reprint: true }).then((problem) => { if (problem) setError(problem); }); }} title="Print this order's receipt again"><IconPrinter size={14} />Receipt</button>
            </div>
          </article>;
        })}
      </div>}

    {pendingAction && <Modal onClose={closeAction} closeDisabled={submitting} labelledBy="reverse-order-title" zIndex={50}>
      <section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 480px)", maxHeight: "88vh", overflowY: "auto", background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 18, boxShadow: "0 18px 50px rgba(61,43,31,.25)" }}>
        <div style={{ padding: "18px 22px", background: pendingAction.action === "void" ? "#FEF2F2" : "#FAF5FF", borderBottom: `1px solid ${pendingAction.action === "void" ? "#FECACA" : "#E9D5FF"}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p style={{ margin: 0, color: pendingAction.action === "void" ? "#B91C1C" : "#7E22CE", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>{pendingAction.action === "void" ? "Void order" : "Refund order"}</p>
              <h2 id="reverse-order-title" style={{ margin: "5px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800 }}>Order #{pendingAction.order.queue_number}</h2>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 11.5 }}>{formatOrderTime(pendingAction.order.created_at)} · Ref {pendingAction.order.order_id}</p>
            </div>
            <button type="button" onClick={closeAction} disabled={submitting} aria-label="Close reversal confirmation" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 26, lineHeight: 1, cursor: submitting ? "default" : "pointer" }}>×</button>
          </div>
          <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 12.5, lineHeight: 1.5 }}>{pendingAction.action === "void" ? "Use Void for an order punched by mistake or cancelled before it was handed over." : "Use Refund when the customer already received the order and is given their money back."}</p>
        </div>
        <div style={{ padding: "16px 22px 20px" }}>
          <div style={{ border: "1px solid #E8DDD5", borderRadius: 12, overflow: "hidden" }}>
            {pendingAction.order.order_details.map((detail, index) => <div key={`${pendingAction.order.order_id}-${index}`} style={{ padding: "10px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", color: "#3D2B1F", fontSize: 13 }}>
              <strong>{describeOrderLine(detail)}</strong>
              {detail.additions.length > 0 && <div style={{ marginTop: 3, color: "#7E22CE", fontSize: 12 }}>+ {detail.additions.map((addition) => formatQueueAddition(addition, Number(detail.quantity))).join(", ")}</div>}
            </div>)}
          </div>
          {returnMethod === "none" && <p style={{ margin: "14px 0 0", padding: "10px 12px", borderRadius: 10, background: "#F3EDE5", color: "#3D2B1F", fontSize: 13, lineHeight: 1.5 }}><strong>Nothing to return.</strong> This cash on delivery order was never paid. Voiding it puts the stock back.</p>}
          {returnMethod !== "none" && <>
          <p style={{ margin: "14px 0 6px", color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>How is the money returned? <span style={{ fontWeight: 400, color: "#9C8278" }}>Paid with {pendingIsSplit ? `₱${pendingCashPart.toFixed(2)} cash + ₱${pendingGcashPart.toFixed(2)} GCash` : pendingIsGcash ? "GCash" : pendingIsOnline ? "online payment" : "cash"}</span></p>
          <div role="group" aria-label="Return method" style={{ display: "grid", gridTemplateColumns: pendingIsSplit ? "1fr 1fr 1fr" : "1fr 1fr", gap: 6 }}>
            {([...(pendingIsSplit ? [["split", "As paid", "Cash + GCash"] as const] : []), ["cash", "Cash", "From the drawer"], ["gcash", "GCash", "Sent by the café"]] as const).map(([method, label, hint]) => {
              const active = returnMethod === method;
              const tone = method === "gcash" ? "#0057E4" : method === "split" ? "#7E22CE" : "#3D2B1F";
              return <button key={method} type="button" aria-pressed={active} onClick={() => { setReturnMethod(method); setError(""); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "9px 6px", borderRadius: 10, border: `1px solid ${active ? tone : "#E8DDD5"}`, background: active ? tone : "#FFFDF9", color: active ? "#FFFFFF" : tone, cursor: "pointer" }}>
                <strong style={{ fontSize: 13.5 }}>{label}</strong>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{hint}</span>
              </button>;
            })}
          </div>
          </>}
          <form onSubmit={(event) => { event.preventDefault(); void reverseOrder(pendingAction.order, pendingAction.action); }}>
          {returnMethod !== "none" && <>
          {(returnMethod === "gcash" || returnMethod === "split") && <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>Name on the customer’s GCash
              <input value={gcashName} onChange={(event) => { setGcashName(event.target.value); setError(""); }} maxLength={120} autoComplete="off" placeholder="e.g. Juan Dela Cruz" style={returnFieldStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>Customer’s GCash number
              <input value={gcashNumber} onChange={(event) => { setGcashNumber(event.target.value); setError(""); }} inputMode="tel" autoComplete="off" maxLength={16} placeholder="0917 123 4567" style={{ ...returnFieldStyle, borderColor: gcashNumber && !isValidGcashNumber(gcashNumber) ? "#FCA5A5" : "#E8DDD5" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}><span>Reference no. of the café’s transfer <span style={{ fontWeight: 400, color: "#9C8278" }}>(optional)</span></span>
              <input value={gcashReference} onChange={(event) => setGcashReference(event.target.value)} maxLength={60} autoComplete="off" placeholder="From the GCash receipt after sending" style={returnFieldStyle} />
            </label>
          </div>}
          {pendingAction?.order.discount_label && Number(pendingAction.order.discount_total ?? 0) > 0 && <p style={{ margin: "12px 0 0", padding: "8px 11px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E3A8A", fontSize: 12.5, lineHeight: 1.45 }}>This order had a discount ({pendingAction.order.discount_label}, ₱{Number(pendingAction.order.discount_total).toFixed(2)} off). The amount below is what the customer paid. The discount stays in the register marked {pendingAction.action === "void" ? "voided" : "refunded"}.</p>}
          {returnMethod === "split" && <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "#3D2B1F", color: "#FDF9F5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>Hand back in cash</span>
            <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800, whiteSpace: "nowrap" }}>₱{pendingCashPart.toFixed(2)}</strong>
          </div>}
          <div style={{ marginTop: returnMethod === "split" ? 6 : 12, padding: "12px 14px", borderRadius: 12, background: returnMethod === "cash" ? "#3D2B1F" : "#0057E4", color: "#FDF9F5" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>{returnMethod === "cash" ? "Hand back in cash" : returnMethod === "split" ? "And send through GCash" : "Send through GCash"}</span>
              <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800, whiteSpace: "nowrap" }}>₱{(returnMethod === "split" ? pendingGcashPart : pendingTotal).toFixed(2)}</strong>
            </div>
            {returnMethod !== "cash" && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.25)", fontSize: 13, lineHeight: 1.5 }}>
              <div>To <strong>{gcashName.trim() || "—"}</strong></div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 700, letterSpacing: "0.04em" }}>{gcashNumber && isValidGcashNumber(gcashNumber) ? formatGcashNumber(gcashNumber.replace(/[\s-]/g, "").replace(/^\+?63/, "0")) : "—"}</div>
            </div>}
          </div>
          <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 11.5, lineHeight: 1.5 }}>{returnMethod === "gcash" ? "Send it from the café’s GCash by hand. The cash drawer is not affected." : returnMethod === "split" ? "The cash part comes out of the drawer. Send the GCash part from the café’s GCash by hand." : "Taken out of the expected cash in the drawer."} Stock is returned to inventory, the order leaves the queue, and it no longer counts as a sale. This cannot be undone.</p>
          </>}
          <ConfirmPasswordField value={password} onChange={(value) => { setPassword(value); setWrongPassword(false); }} userName={user.fullName} invalid={wrongPassword} />
          {error && <p style={{ margin: "10px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <button type="button" onClick={closeAction} disabled={submitting} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 16px", background: "#F3EDE5", color: "#6B4C3B", cursor: submitting ? "default" : "pointer", fontWeight: 700 }}>Keep order</button>
            <button type="submit" disabled={submitting} style={{ border: "none", borderRadius: 10, padding: "11px 18px", background: submitting ? "#C9B8AF" : pendingAction.action === "void" ? "#B91C1C" : "#7E22CE", color: "#fff", cursor: submitting ? "default" : "pointer", fontWeight: 800 }}>{submitting ? "Processing…" : pendingAction.action === "void" ? "Void order" : "Refund order"}</button>
          </div>
          </form>
        </div>
      </section>
    </Modal>}
  </main>;
}


// Password of the signed-in account, asked again before opening or closing the shift and before
// voids and refunds (the counter tablet stays signed in, so anyone standing at it could act).
function ConfirmPasswordField({ value, onChange, userName, invalid, autoFocus = false }: { value: string; onChange: (value: string) => void; userName: string; invalid?: boolean; autoFocus?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, color: "#6B4C3B", fontSize: 12, fontWeight: 700, textAlign: "left" }}>
    <span>Your password <span style={{ fontWeight: 400, color: "#9C8278" }}>to confirm as {userName}</span></span>
    <span style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${invalid ? "#FCA5A5" : "#E8DDD5"}`, borderRadius: 12, background: "#FFFFFF", padding: "0 6px 0 14px", color: "#9C8278" }}>
      <LoginFieldIcon kind="lock" />
      <input autoFocus={autoFocus} type={visible ? "text" : "password"} autoComplete="current-password" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Password" aria-invalid={invalid || undefined} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "12px 0", fontSize: 14, color: "#3D2B1F" }} />
      <button type="button" onClick={() => setVisible((shown) => !shown)} aria-label={visible ? "Hide password" : "Show password"} style={{ display: "flex", border: "none", background: "transparent", color: "#9C8278", padding: 8, cursor: "pointer" }}><LoginEyeIcon hidden={visible} /></button>
    </span>
  </label>;
}

function SignOutDialog({ onCancel, onConfirm, signingOut }: { onCancel: () => void; onConfirm: () => void; signingOut: boolean }) {
  return <Modal onClose={onCancel} closeDisabled={signingOut} labelledBy="sign-out-title" zIndex={100}>
    <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 380px)", background: "#FDF9F5", boxShadow: "0 20px 60px rgba(61,43,31,0.25)" }}>
      <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Session</p>
      <h2 id="sign-out-title" style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 21 }}>Switch user?</h2>
      <p style={{ margin: "9px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>This signs you out so the next person can sign in. Your attendance ends unless you are still signed in on another device.</p>
      <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={onCancel} disabled={signingOut} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: signingOut ? "default" : "pointer" }}>Cancel</button><button type="button" onClick={onConfirm} disabled={signingOut} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: signingOut ? "#C9B8AF" : "#B91C1C", color: "#FFF", cursor: signingOut ? "default" : "pointer", fontWeight: 700 }}>{signingOut ? "Signing out..." : "Sign out"}</button></div>
    </div>
  </Modal>;
}

function LoginEyeIcon({ hidden }: { hidden: boolean }) {
  return hidden
    ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
    : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
}

function LoginFieldIcon({ kind }: { kind: "mail" | "lock" }) {
  return kind === "mail"
    ? <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
    : <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
}

const authFieldLabel: React.CSSProperties = { fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: "#9C8278", letterSpacing: "0.08em", textTransform: "uppercase" };
const authEyebrow: React.CSSProperties = { margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase" };
const authTitle: React.CSSProperties = { margin: "6px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 28, color: "#3D2B1F" };
const authLead: React.CSSProperties = { margin: "6px 0 0", color: "#9C8278", fontSize: 13.5, lineHeight: 1.55 };
const authLinkButton: React.CSSProperties = { border: "none", background: "transparent", padding: 0, color: "#D97706", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

function AuthAlert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const colors = tone === "error" ? { background: "#FEF2F2", border: "#FECACA", color: "#B91C1C", mark: "!" } : { background: "#F0FDF4", border: "#BBF7D0", color: "#15803D", mark: "✓" };
  return <div role={tone === "error" ? "alert" : "status"} className="flex items-start gap-2" style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: colors.background, border: `1px solid ${colors.border}`, color: colors.color, fontSize: 13, lineHeight: 1.5 }}>
    <span aria-hidden="true" style={{ fontWeight: 800 }}>{colors.mark}</span><span>{children}</span>
  </div>;
}

// Password input with a show/hide button and a Caps Lock warning.
function AuthPasswordField({ label, value, onChange, autoComplete, placeholder, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; placeholder: string; autoFocus?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const trackCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => setCapsLockOn(event.getModifierState("CapsLock"));
  return <label className="flex flex-col gap-1.5" style={{ marginTop: 16 }}>
    <span style={authFieldLabel}>{label}</span>
    <span className="login-field">
      <span className="login-field-icon"><LoginFieldIcon kind="lock" /></span>
      <input type={visible ? "text" : "password"} required value={value} onChange={(event) => onChange(event.target.value)} onKeyUp={trackCapsLock} onKeyDown={trackCapsLock} onBlur={() => setCapsLockOn(false)} autoComplete={autoComplete} autoFocus={autoFocus} placeholder={placeholder} />
      <button type="button" className="login-reveal" onClick={() => setVisible((current) => !current)} aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"}>
        <LoginEyeIcon hidden={visible} />
      </button>
    </span>
    {capsLockOn && <span role="status" style={{ color: "#B45309", fontSize: 12, fontWeight: 600 }}>Caps Lock is on</span>}
  </label>;
}

// Brand panel + form panel shared by sign-in, forgot password and reset password.
function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="login-shell">
    <section className="login-brand">
      <div className="login-brand-glow" />
      <div className="login-brand-inner">
        <div className="flex items-center gap-3">
          <Image src="/brand/badge.png" alt="" width={52} height={52} unoptimized style={{ flexShrink: 0, borderRadius: "50%", boxShadow: "0 10px 24px rgba(0,0,0,0.3)" }} />
          <div>
            <p style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 20, color: "#FDF9F5", lineHeight: 1.1 }}>Brew Houze</p>
            <p style={{ margin: "3px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#F59E0B", letterSpacing: "0.12em" }}>STAFF PORTAL</p>
          </div>
        </div>
        <div className="login-brand-copy">
          <h2 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 38, lineHeight: 1.1, color: "#FDF9F5" }}>Ready for the next order.</h2>
          <p style={{ margin: "14px 0 0", maxWidth: 380, color: "rgba(253,249,245,0.68)", fontSize: 14.5, lineHeight: 1.6 }}>Punch orders, track the queue and handle the cash drawer for every Brew Houze shift.</p>
          <ul style={{ listStyle: "none", margin: "26px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
            {["Fast point of sale with add-ons", "Live barista queue", "Shift opening and cash count"].map((highlight) => <li key={highlight} className="flex items-center gap-3" style={{ color: "rgba(253,249,245,0.85)", fontSize: 13.5 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(217,119,6,0.2)", color: "#F59E0B", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>✓</span>{highlight}
            </li>)}
          </ul>
        </div>
        <p className="login-brand-foot" style={{ margin: 0, color: "rgba(253,249,245,0.4)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.08em" }}>BREW HOUZE CAFE · STAFF PORTAL</p>
      </div>
    </section>
    <section className="login-panel">{children}</section>
  </main>;
}

function Login({ onLoggedIn, notice = "" }: { onLoggedIn: (session: Session) => void; notice?: string }) {
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to sign in.");
      onLoggedIn(payload.data);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to send the reset link.");
      setMode("sent");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the reset link.");
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: "login" | "forgot") {
    setError("");
    setPassword("");
    setMode(next);
  }

  const emailField = <label className="flex flex-col gap-1.5" style={{ marginTop: 26 }}>
    <span style={authFieldLabel}>Email</span>
    <span className="login-field">
      <span className="login-field-icon"><LoginFieldIcon kind="mail" /></span>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus placeholder="cashier@brewhouze.com" />
    </span>
  </label>;

  return <PortalAuthLayout>
    {mode === "login" && <form onSubmit={signIn} className="login-card">
      <p style={authEyebrow}>Welcome back</p>
      <h1 style={authTitle}>Sign in to the staff portal</h1>
      <p style={authLead}>Use the email and password of your Brew Houze account.</p>
      {notice && <AuthAlert tone="success">{notice}</AuthAlert>}
      {emailField}
      <AuthPasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Enter your password" />
      <div className="flex justify-end" style={{ marginTop: 10 }}>
        <button type="button" onClick={() => switchMode("forgot")} style={authLinkButton}>Forgot password?</button>
      </div>
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <button type="submit" disabled={submitting} className="login-submit">{submitting ? "Signing in…" : "Sign in"}</button>
    </form>}

    {mode === "forgot" && <form onSubmit={requestReset} className="login-card">
      <p style={authEyebrow}>Forgot password</p>
      <h1 style={authTitle}>Reset your password</h1>
      <p style={authLead}>Enter the email of your account. We will send a link to choose a new password.</p>
      {emailField}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <button type="submit" disabled={submitting} className="login-submit">{submitting ? "Sending…" : "Send reset link"}</button>
      <button type="button" onClick={() => switchMode("login")} style={{ ...authLinkButton, marginTop: 16, alignSelf: "center" }}>Back to sign in</button>
    </form>}

    {mode === "sent" && <div className="login-card">
      <p style={authEyebrow}>Check your email</p>
      <h1 style={authTitle}>Reset link sent</h1>
      <p style={{ ...authLead, marginTop: 10, color: "#6B4C3B", fontSize: 14 }}>If an account uses <strong>{email}</strong>, a reset link is on its way. It works once and expires in 30 minutes.</p>
      <p style={authLead}>Not there after a few minutes? Check the spam folder, or ask an admin to reset your password.</p>
      <button type="button" onClick={() => switchMode("login")} className="login-submit">Back to sign in</button>
    </div>}
  </PortalAuthLayout>;
}

// Opened from the emailed link (?reset_token=...). Checks the link first, then lets the person
// choose a new password.
function PasswordResetScreen({ token, onDone }: { token: string; onDone: (notice: string) => void }) {
  const [status, setStatus] = useState<"checking" | "invalid" | "ready">("checking");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json() as { data?: { valid: boolean; email?: string } };
        if (!active) return;
        if (response.ok && payload.data?.valid) {
          setMaskedEmail(payload.data.email ?? "");
          setStatus("ready");
        } else {
          setStatus("invalid");
        }
      } catch {
        if (active) setStatus("invalid");
      }
    })();
    return () => { active = false; };
  }, [token]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("The two passwords do not match."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not reset the password.");
      onDone("Password updated. Sign in with your new password.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not reset the password.");
    } finally {
      setSaving(false);
    }
  }

  const longEnough = password.length >= 8;
  const matches = confirmPassword !== "" && password === confirmPassword;

  return <PortalAuthLayout>
    {status === "checking" && <div className="login-card"><p style={authLead}>Checking your reset link…</p></div>}
    {status === "invalid" && <div className="login-card">
      <p style={authEyebrow}>Reset link</p>
      <h1 style={authTitle}>This link has expired</h1>
      <p style={{ ...authLead, marginTop: 10 }}>Reset links work once and expire after 30 minutes. Request a new one from the sign-in screen.</p>
      <button type="button" onClick={() => onDone("")} className="login-submit">Back to sign in</button>
    </div>}
    {status === "ready" && <form onSubmit={save} className="login-card">
      <p style={authEyebrow}>Reset password</p>
      <h1 style={authTitle}>Choose a new password</h1>
      <p style={authLead}>For the account {maskedEmail}.</p>
      <div style={{ marginTop: 10 }} />
      <AuthPasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" autoFocus />
      <AuthPasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Type it again" />
      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
        <li style={{ color: longEnough ? "#15803D" : "#9C8278" }}>{longEnough ? "✓" : "•"} At least 8 characters</li>
        <li style={{ color: matches ? "#15803D" : "#9C8278" }}>{matches ? "✓" : "•"} Both passwords match</li>
      </ul>
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <button type="submit" disabled={saving} className="login-submit">{saving ? "Saving…" : "Save new password"}</button>
      <button type="button" onClick={() => onDone("")} style={{ ...authLinkButton, marginTop: 16, alignSelf: "center" }}>Cancel</button>
    </form>}
  </PortalAuthLayout>;
}

// ─── Shifts ──────────────────────────────────────────────────────────────────
// A shift is the café's business day. It is opened and closed by hand and may run past
// midnight; sales, queue numbers, attendance and stock changes all belong to the open shift.
type CurrentShift = {
  shiftId: number;
  openedAt: string;
  closedAt: string | null;
  openedByName: string | null;
  closedByName: string | null;
  startingCash: number;
  countedCash: number | null;
  orderCount: number;
  mobileOrderCount: number;
  itemsSold: number;
  grossSales: number;
  cashSales: number;
  onlineSales: number;
  voidCount: number;
  refundCount: number;
  reversedAmount: number;
  cashReversed: number;
  // Discounts in the shift's sales, already taken off the figures above.
  discounts?: { scPwd: number; scPwdCount: number; vatExempt: number; otherId: number; rewards: number };
  gcashReturned?: number;
  cashAdded?: number;
  cashRemoved?: number;
  netSales: number;
  expectedCash: number;
  cashDifference: number | null;
  hoursOpen: number;
  openQueueCount: number;
  signedInCount: number;
};

// A shift open this long was most likely left open by mistake.
const LONG_SHIFT_HOURS = 16;

function formatPeso(value: number): string {
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShiftDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.floor(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  return wholeHours > 0 ? `${wholeHours}h ${totalMinutes % 60}m` : `${totalMinutes}m`;
}

function formatClock(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

function ShiftChip({ shift, canOpenShift, canCloseShift = false, readOnly = false, onOpenShift, onCloseShift, onCashDrawer }: { shift: CurrentShift | null | undefined; canOpenShift: boolean; canCloseShift?: boolean; readOnly?: boolean; onOpenShift: () => void; onCloseShift: () => void; onCashDrawer: () => void }) {
  if (shift === undefined) return null;
  const chipButton: React.CSSProperties = { border: "none", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
  if (shift === null) {
    return <div className="flex items-center gap-2 rounded-xl" style={{ padding: "5px 6px 5px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626" }} />
      <span className="shift-chip-text">{canOpenShift ? "No open shift" : "Store closed"}</span>
      {canOpenShift && <button type="button" onClick={onOpenShift} style={{ ...chipButton, background: "#D97706", color: "#FFFFFF" }}>Open shift</button>}
    </div>;
  }
  const longShift = shift.hoursOpen >= LONG_SHIFT_HOURS;
  return <div className="flex items-center gap-2 rounded-xl" title={longShift ? "This shift has been open unusually long. Close it at the end of the business day." : undefined} style={{ padding: "5px 6px 5px 12px", background: longShift ? "#FEF3C7" : "#F0FDF4", border: `1px solid ${longShift ? "#FCD34D" : "#BBF7D0"}`, color: longShift ? "#B45309" : "#15803D", fontSize: 12.5, fontWeight: 700 }}>
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: longShift ? "#F59E0B" : "#22C55E" }} />
    <span className="shift-chip-text">Shift open since {formatClock(shift.openedAt)} · {formatShiftDuration(shift.hoursOpen)}{longShift ? " · close it?" : ""}</span>
    {!readOnly && <button type="button" onClick={onCashDrawer} title="Cash in, cash out or cash drop" style={{ ...chipButton, background: "#FFFFFF", color: "#3D2B1F", border: "1px solid #E8DDD5" }}>Drawer</button>}
    {!readOnly && canCloseShift && <button type="button" onClick={onCloseShift} style={{ ...chipButton, background: "#3D2B1F", color: "#FDF9F5" }}>Close shift</button>}
  </div>;
}

function WaitingForShiftPanel({ userName, queueOnly = false, onCheckAgain, onSwitchCashier }: { userName: string; queueOnly?: boolean; onCheckAgain: () => Promise<void>; onSwitchCashier: () => void }) {
  const [checking, setChecking] = useState(false);
  // The POS opens by itself once the shift is open (the app checks every 15 seconds), and this
  // also notices when an admin grants this cashier permission to open the store.
  useEffect(() => {
    const intervalId = window.setInterval(() => { if (document.visibilityState === "visible") void onCheckAgain(); }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [onCheckAgain]);

  async function checkNow() {
    setChecking(true);
    try { await onCheckAgain(); } finally { setChecking(false); }
  }

  return <main style={{ height: "100%", minHeight: 420, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", placeItems: "center", padding: 24 }}>
    <section className="rounded-2xl" style={{ width: "100%", maxWidth: 440, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.12)", padding: 28, textAlign: "center" }}>
      <div style={{ width: 56, height: 56, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 18, background: "#FEF3C7", color: "#B45309", fontSize: 26 }} aria-hidden="true">☕</div>
      <p style={{ margin: "16px 0 0", color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Store closed</p>
      <h2 style={{ margin: "6px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800, color: "#3D2B1F" }}>Waiting for the store to open</h2>
      <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.6 }}>{queueOnly ? "An admin or cashier opens the shift. The queue opens here by itself as soon as they do." : "An admin opens the shift from the admin app. The register opens here by itself as soon as they do."} Your attendance is already recorded.</p>
      <button type="button" onClick={() => void checkNow()} disabled={checking} style={{ width: "100%", height: 48, marginTop: 20, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFFFF", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, cursor: checking ? "default" : "pointer" }}>{checking ? "Checking…" : "Check again"}</button>
      <p style={{ margin: "14px 0 0", color: "#9C8278", fontSize: 12.5 }}>Signed in as <strong style={{ color: "#3D2B1F" }}>{userName}</strong>. Not you? <button type="button" onClick={onSwitchCashier} style={{ border: "none", background: "transparent", padding: 0, color: "#D97706", fontWeight: 700, cursor: "pointer" }}>Switch user</button></p>
    </section>
  </main>;
}

function OpenShiftPanel({ userName, onOpened, onSwitchCashier }: { userName: string; onOpened: (shift: CurrentShift) => void; onSwitchCashier: () => void }) {
  const [startingCash, setStartingCash] = useState("");
  const [password, setPassword] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);

  async function openShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening) return;
    const amount = Number(startingCash);
    if (startingCash.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      setError("Enter the starting cash in the drawer (0 if the drawer is empty).");
      return;
    }
    if (!password) { setError("Enter your password to open the shift."); setWrongPassword(true); return; }
    setOpening(true);
    setError("");
    setWrongPassword(false);
    try {
      const response = await fetch("/api/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", starting_cash: amount, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") { setPassword(""); setWrongPassword(true); }
      if (!response.ok) throw new Error(payload?.error || "Unable to open the shift.");
      onOpened(payload.data as CurrentShift);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open the shift.");
    } finally {
      setOpening(false);
    }
  }

  return <main style={{ height: "100%", minHeight: 420, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", placeItems: "center", padding: 24 }}>
    <form onSubmit={openShift} className="rounded-2xl" style={{ width: "100%", maxWidth: 440, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.12)", padding: 28 }}>
      <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Start of business day</p>
      <h2 style={{ margin: "6px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 26, fontWeight: 800, color: "#3D2B1F" }}>Open a shift</h2>
      <p style={{ margin: "8px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.55 }}>Sales, queue numbers, employee attendance and stock changes are recorded under this shift until it is closed, even past midnight.</p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 20, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
        Starting cash in the drawer
        <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFFFF", padding: "0 14px" }}>
          <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, color: "#9C8278" }}>₱</span>
          <MoneyInput label="Starting cash in the drawer" autoFocus value={startingCash} onChange={setStartingCash} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, color: "#3D2B1F" }} />
        </span>
      </label>
      <ConfirmPasswordField value={password} onChange={(value) => { setPassword(value); setWrongPassword(false); }} userName={userName} invalid={wrongPassword} />
      {error && <p style={{ margin: "10px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
      <button type="submit" disabled={opening} style={{ width: "100%", height: 50, marginTop: 18, border: "none", borderRadius: 12, background: opening ? "#C9B8AF" : "#D97706", color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 16, cursor: opening ? "default" : "pointer", boxShadow: opening ? "none" : "0 8px 18px rgba(217,119,6,0.28)" }}>{opening ? "Opening…" : "Open shift"}</button>
      <p style={{ margin: "14px 0 0", textAlign: "center", color: "#9C8278", fontSize: 12.5 }}>Opening as <strong style={{ color: "#3D2B1F" }}>{userName}</strong>. Not you? <button type="button" onClick={onSwitchCashier} style={{ border: "none", background: "transparent", padding: 0, color: "#D97706", fontWeight: 700, cursor: "pointer" }}>Switch user</button></p>
    </form>
  </main>;
}

// ─── Cash drawer ─────────────────────────────────────────────────────────────
// Cash put into or taken out of the drawer for reasons other than a sale. Every entry is kept (a
// mistake is fixed with an opposite entry) and expected cash counts them, so the drawer count at
// closing stays honest.
type DrawerKind = "cash_in" | "cash_out" | "cash_drop";
type DrawerMovement = { id: number; kind: DrawerKind; amount: number; reason: string; note: string | null; by: string | null; source: string; createdAt: string };
const drawerKinds: Record<DrawerKind, { label: string; hint: string; reasons: string[]; tone: string; sign: "+" | "−" }> = {
  cash_in: { label: "Cash in", hint: "Money added to the drawer", reasons: ["Change fund", "Owner added cash"], tone: "#15803D", sign: "+" },
  cash_out: { label: "Cash out", hint: "Something paid for from the drawer", reasons: ["Supplies", "Ice", "Delivery", "Staff meal"], tone: "#B91C1C", sign: "−" },
  cash_drop: { label: "Cash drop", hint: "Large bills moved to the safe", reasons: ["Moved to the safe"], tone: "#1D4ED8", sign: "−" },
};

function CashDrawerDialog({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [summary, setSummary] = useState<CurrentShift | null>(null);
  const [movements, setMovements] = useState<DrawerMovement[]>([]);
  const [kind, setKind] = useState<DrawerKind>("cash_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(drawerKinds.cash_in.reasons[0]);
  const [otherReason, setOtherReason] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [shiftResponse, movementsResponse] = await Promise.all([fetch("/api/shift", { cache: "no-store" }), fetch("/api/cash-movements", { cache: "no-store" })]);
      const shiftPayload = await shiftResponse.json();
      const movementsPayload = await movementsResponse.json();
      if (!shiftResponse.ok) throw new Error(shiftPayload?.error || "Could not load the shift.");
      if (!movementsResponse.ok) throw new Error(movementsPayload?.error || "Could not load the cash drawer entries.");
      setSummary(shiftPayload.data ?? null);
      setMovements(movementsPayload.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the cash drawer.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function chooseKind(next: DrawerKind) {
    setKind(next);
    setReason(drawerKinds[next].reasons[0]);
    setError("");
  }

  const value = Number.parseFloat(amount);
  const finalReason = reason === "__other__" ? otherReason.trim() : reason;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isFinite(value) || value <= 0) { setError("Enter the amount."); return; }
    if (!finalReason) { setError("Choose or type a reason."); return; }
    if (!password) { setError("Enter your password to record this."); setWrongPassword(true); return; }
    setSaving(true);
    setError("");
    setNotice("");
    setWrongPassword(false);
    try {
      const response = await fetch("/api/cash-movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, amount: value, reason: finalReason, note, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") { setPassword(""); setWrongPassword(true); }
      if (!response.ok) throw new Error(payload?.error || "Could not save the entry.");
      setNotice(`${drawerKinds[kind].label} of ${formatPeso(value)} recorded (${finalReason}).`);
      setAmount("");
      setNote("");
      setOtherReason("");
      setPassword("");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  }

  const meta = drawerKinds[kind];
  const sectionLabel: React.CSSProperties = { margin: "16px 0 6px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" };
  return <Modal onClose={onClose} closeDisabled={saving} labelledBy="cash-drawer-title" zIndex={70}>
    <section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 520px)", maxHeight: "92vh", overflowY: "auto", background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 18, boxShadow: "0 18px 50px rgba(61,43,31,.25)" }}>
      <div className="flex items-start justify-between gap-3" style={{ padding: "18px 22px", background: "#F3EDE5", borderBottom: "1px solid #E8DDD5" }}>
        <div>
          <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>This shift</p>
          <h2 id="cash-drawer-title" style={{ margin: "5px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800, color: "#3D2B1F" }}>Cash drawer</h2>
          <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12 }}>Record money added to or taken out of the drawer, so the count at closing matches.</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close the cash drawer" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 26, lineHeight: 1, cursor: saving ? "default" : "pointer" }}>×</button>
      </div>
      <div style={{ padding: "4px 22px 22px" }}>
        {summary && <>
          <p style={sectionLabel}>Should be in the drawer now</p>
          <div className="drawer-expected"><strong>{formatPeso(summary.expectedCash)}</strong></div>
          <ShiftSummaryRow label="Starting cash" value={formatPeso(summary.startingCash)} />
          <ShiftSummaryRow label="+ Cash sales" value={formatPeso(summary.cashSales)} />
          {summary.cashReversed > 0 && <ShiftSummaryRow label="− Cash given back (voids/refunds)" value={formatPeso(summary.cashReversed)} />}
          {(summary.cashAdded ?? 0) > 0 && <ShiftSummaryRow label="+ Cash added" value={formatPeso(summary.cashAdded ?? 0)} tone="#15803D" />}
          {(summary.cashRemoved ?? 0) > 0 && <ShiftSummaryRow label="− Cash taken out" value={formatPeso(summary.cashRemoved ?? 0)} tone="#B91C1C" />}
        </>}

        <form onSubmit={save}>
          <p style={sectionLabel}>New entry</p>
          <div className="drawer-kinds" role="group" aria-label="Kind of entry">
            {(Object.keys(drawerKinds) as DrawerKind[]).map((key) => <button key={key} type="button" aria-pressed={kind === key} onClick={() => chooseKind(key)} style={kind === key ? { borderColor: drawerKinds[key].tone, background: drawerKinds[key].tone, color: "#FFFFFF" } : { color: drawerKinds[key].tone }}>
              <strong>{drawerKinds[key].label}</strong><span>{drawerKinds[key].hint}</span>
            </button>)}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
            Amount
            <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFFFF", padding: "0 14px" }}>
              <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, fontWeight: 800, color: "#9C8278" }}>₱</span>
              <MoneyInput label={`${meta.label} amount`} value={amount} onChange={(next) => { setAmount(next); setError(""); }} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "11px 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, fontWeight: 800, color: "#3D2B1F" }} />
            </span>
          </label>
          <p style={{ margin: "12px 0 6px", color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>Reason</p>
          <div className="drawer-reasons" role="group" aria-label="Reason">
            {[...meta.reasons, "__other__"].map((option) => <button key={option} type="button" aria-pressed={reason === option} onClick={() => { setReason(option); setError(""); }}>{option === "__other__" ? "Other…" : option}</button>)}
          </div>
          {reason === "__other__" && <input value={otherReason} onChange={(event) => { setOtherReason(event.target.value); setError(""); }} maxLength={60} placeholder="Type the reason" aria-label="Reason" style={{ width: "100%", marginTop: 8, border: "1px solid #E8DDD5", borderRadius: 10, background: "#FFFFFF", padding: "10px 12px", fontSize: 14, color: "#3D2B1F", outline: "none" }} />}
          <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
            <span>Note <span style={{ fontWeight: 400, color: "#9C8278" }}>(optional, e.g. receipt number or who took it)</span></span>
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} style={{ border: "1px solid #E8DDD5", borderRadius: 10, background: "#FFFFFF", padding: "10px 12px", fontSize: 14, color: "#3D2B1F", outline: "none" }} />
          </label>
          <ConfirmPasswordField value={password} onChange={(next) => { setPassword(next); setWrongPassword(false); }} userName={userName} invalid={wrongPassword} />
          {error && <p style={{ margin: "10px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
          {notice && <p role="status" style={{ margin: "10px 0 0", color: "#15803D", fontSize: 12.5, fontWeight: 700 }}>{notice}</p>}
          <button type="submit" disabled={saving} className="drawer-save" style={{ background: saving ? "#C9B8AF" : meta.tone }}>
            {saving ? "Saving…" : `Record ${meta.label.toLowerCase()}${Number.isFinite(value) && value > 0 ? ` of ${formatPeso(value)}` : ""}`}
          </button>
        </form>

        <p style={sectionLabel}>Entries this shift ({movements.length})</p>
        {movements.length === 0 ? <p style={{ margin: 0, color: "#9C8278", fontSize: 12.5 }}>None yet.</p> : <ul className="drawer-list">
          {movements.map((entry) => <li key={entry.id}>
            <span className="drawer-list-main"><strong>{drawerKinds[entry.kind]?.label ?? entry.kind} · {entry.reason}</strong><em>{formatClock(entry.createdAt)}{entry.by ? ` · ${entry.by}` : ""}{entry.source === "admin" ? " (admin app)" : ""}{entry.note ? ` · ${entry.note}` : ""}</em></span>
            <strong style={{ color: drawerKinds[entry.kind]?.tone ?? "#3D2B1F" }}>{drawerKinds[entry.kind]?.sign ?? ""}{formatPeso(entry.amount)}</strong>
          </li>)}
        </ul>}
        <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 11.5, lineHeight: 1.5 }}>Entries cannot be deleted. To fix a mistake, record the opposite entry (for example, a cash in for money taken out by mistake).</p>
      </div>
    </section>
  </Modal>;
}

function ShiftSummaryRow({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return <div className="flex items-center justify-between" style={{ padding: "6px 0", fontSize: strong ? 14 : 13, color: tone ?? "#3D2B1F", fontWeight: strong ? 800 : 500 }}>
    <span style={{ color: strong ? tone ?? "#3D2B1F" : "#6B4C3B" }}>{label}</span>
    <span>{value}</span>
  </div>;
}

function describeCashDifference(difference: number): { label: string; tone: string } {
  if (Math.abs(difference) < 0.005) return { label: "Balanced", tone: "#15803D" };
  return difference > 0 ? { label: `Over by ${formatPeso(difference)}`, tone: "#B45309" } : { label: `Short by ${formatPeso(-difference)}`, tone: "#B91C1C" };
}

function CloseShiftDialog({ shiftId, userName, onCancel, onClosed }: { shiftId: number; userName: string; onCancel: () => void; onClosed: () => void }) {
  const [summary, setSummary] = useState<CurrentShift | null>(null);
  const [closedSummary, setClosedSummary] = useState<CurrentShift | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  // Load fresh totals when the dialog opens so the drawer count is checked against current sales.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/shift", { cache: "no-store" });
        const payload = await response.json() as { data?: CurrentShift | null; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load the shift.");
        if (!active) return;
        if (!payload.data || payload.data.shiftId !== shiftId) setError("This shift is no longer open. Refresh to see the current shift.");
        else setSummary(payload.data);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the shift.");
      }
    })();
    return () => { active = false; };
  }, [shiftId]);

  async function closeShift() {
    if (closing || !summary) return;
    const amount = Number(countedCash);
    if (countedCash.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      setError("Count the cash in the drawer and enter the total.");
      return;
    }
    if (!password) { setError("Enter your password to close the shift."); setWrongPassword(true); return; }
    setClosing(true);
    setError("");
    setWrongPassword(false);
    try {
      const response = await fetch("/api/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", shift_id: shiftId, counted_cash: amount, notes, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") { setPassword(""); setWrongPassword(true); }
      if (!response.ok) throw new Error(payload?.error || "Unable to close the shift.");
      setClosedSummary(payload.data as CurrentShift);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Unable to close the shift.");
    } finally {
      setClosing(false);
    }
  }

  const counted = Number(countedCash);
  const liveDifference = summary && countedCash.trim() !== "" && Number.isFinite(counted) ? describeCashDifference(counted - summary.expectedCash) : null;
  const sectionLabel: React.CSSProperties = { margin: "16px 0 4px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" };

  return <Modal onClose={onCancel} closeDisabled={closing || Boolean(closedSummary)} labelledBy="close-shift-title" zIndex={70}>
    <section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 500px)", maxHeight: "90vh", overflowY: "auto", background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 18, boxShadow: "0 18px 50px rgba(61,43,31,.25)" }}>
      {closedSummary ? (
        <div style={{ padding: 26, textAlign: "center" }}>
          <p style={{ margin: 0, color: "#15803D", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Shift closed</p>
          <h2 id="close-shift-title" style={{ margin: "6px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 26, fontWeight: 800, color: "#3D2B1F" }}>{formatPeso(closedSummary.netSales)} net sales</h2>
          <p style={{ margin: "6px 0 0", color: "#6B4C3B", fontSize: 13 }}>{closedSummary.orderCount} order{closedSummary.orderCount === 1 ? "" : "s"} · {formatClock(closedSummary.openedAt)} – {formatClock(closedSummary.closedAt)} ({formatShiftDuration(closedSummary.hoursOpen)})</p>
          {closedSummary.cashDifference !== null && (() => {
            const difference = describeCashDifference(closedSummary.cashDifference);
            return <div style={{ margin: "18px auto 0", maxWidth: 320, padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E8DDD5", textAlign: "left" }}>
              <ShiftSummaryRow label="Expected cash" value={formatPeso(closedSummary.expectedCash)} />
              <ShiftSummaryRow label="Counted cash" value={formatPeso(closedSummary.countedCash ?? 0)} />
              <ShiftSummaryRow label="Difference" value={difference.label} strong tone={difference.tone} />
            </div>;
          })()}
          <p style={{ margin: "14px 0 0", color: "#9C8278", fontSize: 12 }}>Everyone signed in was clocked out. The full report is in Finance in the admin app.</p>
          <button type="button" onClick={onClosed} style={{ marginTop: 18, border: "none", borderRadius: 12, padding: "12px 28px", background: "#3D2B1F", color: "#FDF9F5", fontWeight: 800, cursor: "pointer" }}>Done</button>
        </div>
      ) : <>
        <div style={{ padding: "18px 22px", background: "#F3EDE5", borderBottom: "1px solid #E8DDD5" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>End of business day</p>
              <h2 id="close-shift-title" style={{ margin: "5px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800, color: "#3D2B1F" }}>Close shift</h2>
              {summary && <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12 }}>Opened {formatClock(summary.openedAt)}{summary.openedByName ? ` by ${summary.openedByName}` : ""} · {formatShiftDuration(summary.hoursOpen)}</p>}
            </div>
            <button type="button" onClick={onCancel} disabled={closing} aria-label="Cancel closing the shift" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 26, lineHeight: 1, cursor: closing ? "default" : "pointer" }}>×</button>
          </div>
        </div>
        <div style={{ padding: "6px 22px 20px" }}>
          {!summary && !error && <p style={{ color: "#9C8278", fontSize: 13 }}>Loading shift totals…</p>}
          {summary && <>
            <p style={sectionLabel}>Sales</p>
            <ShiftSummaryRow label={`Orders (${summary.itemsSold} items${summary.mobileOrderCount ? `, ${summary.mobileOrderCount} mobile` : ""})`} value={String(summary.orderCount)} />
            <ShiftSummaryRow label="Gross sales" value={formatPeso(summary.grossSales)} />
            <ShiftSummaryRow label={`Voids & refunds (${summary.voidCount + summary.refundCount})`} value={`− ${formatPeso(summary.reversedAmount)}`} tone={summary.reversedAmount > 0 ? "#B91C1C" : undefined} />
            <div style={{ borderTop: "1px solid #E8DDD5" }}><ShiftSummaryRow label="Net sales" value={formatPeso(summary.netSales)} strong /></div>
            <ShiftSummaryRow label="Paid online" value={formatPeso(summary.onlineSales)} />
            {summary.discounts && summary.discounts.scPwd + summary.discounts.vatExempt + summary.discounts.otherId + summary.discounts.rewards > 0 && <>
              <p style={sectionLabel}>Discounts (already off the sales above)</p>
              {summary.discounts.scPwd > 0 && <ShiftSummaryRow label={`Senior & PWD discount (${summary.discounts.scPwdCount})`} value={`− ${formatPeso(summary.discounts.scPwd)}`} tone="#1D4ED8" />}
              {summary.discounts.vatExempt > 0 && <ShiftSummaryRow label="VAT exempted (senior & PWD)" value={`− ${formatPeso(summary.discounts.vatExempt)}`} tone="#1D4ED8" />}
              {summary.discounts.otherId > 0 && <ShiftSummaryRow label="Other ID discounts" value={`− ${formatPeso(summary.discounts.otherId)}`} tone="#1D4ED8" />}
              {summary.discounts.rewards > 0 && <ShiftSummaryRow label="Loyalty rewards" value={`− ${formatPeso(summary.discounts.rewards)}`} tone="#B45309" />}
            </>}

            <p style={sectionLabel}>Cash drawer</p>
            <ShiftSummaryRow label="Starting cash" value={formatPeso(summary.startingCash)} />
            <ShiftSummaryRow label="+ Cash sales" value={formatPeso(summary.cashSales)} />
            <ShiftSummaryRow label="− Cash given back (voids/refunds)" value={formatPeso(summary.cashReversed)} />
            {(summary.gcashReturned ?? 0) > 0 && <ShiftSummaryRow label="Returned through GCash (not from the drawer)" value={formatPeso(summary.gcashReturned ?? 0)} tone="#1E40AF" />}
            {(summary.cashAdded ?? 0) > 0 && <ShiftSummaryRow label="+ Cash added (cash in)" value={formatPeso(summary.cashAdded ?? 0)} tone="#15803D" />}
            {(summary.cashRemoved ?? 0) > 0 && <ShiftSummaryRow label="− Cash taken out (cash out and drops)" value={formatPeso(summary.cashRemoved ?? 0)} tone="#B91C1C" />}
            <div style={{ borderTop: "1px solid #E8DDD5" }}><ShiftSummaryRow label="Expected in drawer" value={formatPeso(summary.expectedCash)} strong /></div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
              Counted cash in the drawer
              <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFFFF", padding: "0 14px" }}>
                <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, fontWeight: 800, color: "#9C8278" }}>₱</span>
                <MoneyInput label="Counted cash in the drawer" autoFocus value={countedCash} onChange={setCountedCash}
                  summary={(draft) => { const count = Number.parseFloat(draft); const difference = Number.isFinite(count) ? describeCashDifference(count - summary.expectedCash) : null; return <><KeypadSummaryRow label="Expected in drawer" value={formatPeso(summary.expectedCash)} />{difference && <KeypadSummaryRow label="Difference" value={difference.label} tone={difference.tone} />}</>; }}
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "11px 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, fontWeight: 800, color: "#3D2B1F" }} />
              </span>
            </label>
            {liveDifference && <p style={{ margin: "8px 0 0", color: liveDifference.tone, fontSize: 13, fontWeight: 800 }}>{liveDifference.label}</p>}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
              Notes <span style={{ fontWeight: 400, color: "#9C8278" }}>(optional, e.g. why the drawer is short)</span>
              <textarea value={notes} maxLength={500} rows={2} onChange={(event) => setNotes(event.target.value)} style={{ border: "1px solid #E8DDD5", borderRadius: 10, background: "#FFFFFF", padding: "9px 11px", fontSize: 13, color: "#3D2B1F", outline: "none", resize: "vertical" }} />
            </label>
            <ConfirmPasswordField value={password} onChange={(value) => { setPassword(value); setWrongPassword(false); }} userName={userName} invalid={wrongPassword} />

            {(summary.openQueueCount > 0 || summary.signedInCount > 0) && <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FCD34D", color: "#92400E", fontSize: 12, lineHeight: 1.55 }}>
              {summary.openQueueCount > 0 && <div>• {summary.openQueueCount} order{summary.openQueueCount === 1 ? " is" : "s are"} still in the queue and will be cleared from the queue screens.</div>}
              {summary.signedInCount > 0 && <div>• {summary.signedInCount} employee{summary.signedInCount === 1 ? " is" : "s are"} still signed in and will be clocked out.</div>}
            </div>}
          </>}
          {error && <p style={{ margin: "12px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <button type="button" onClick={onCancel} disabled={closing} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 16px", background: "#F3EDE5", color: "#6B4C3B", cursor: closing ? "default" : "pointer", fontWeight: 700 }}>Keep shift open</button>
            <button type="button" onClick={() => void closeShift()} disabled={closing || !summary} style={{ border: "none", borderRadius: 10, padding: "11px 18px", background: closing || !summary ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", cursor: closing || !summary ? "default" : "pointer", fontWeight: 800 }}>{closing ? "Closing…" : "Close shift"}</button>
          </div>
        </div>
      </>}
    </section>
  </Modal>;
}

export default function App() {
  const [user, setUser] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Set when the page was opened from a password reset email (?reset_token=...).
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [loginNotice, setLoginNotice] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setResetToken(new URLSearchParams(window.location.search).get("reset_token")), 0);
    return () => window.clearTimeout(timer);
  }, []);
  // Removes the token from the address bar so it is not left in the browser history.
  function finishPasswordReset(notice: string) {
    window.history.replaceState(null, "", window.location.pathname);
    setResetToken(null);
    setLoginNotice(notice);
  }
  const [page, setPage] = useState<Page>("pos");
  const [showSignOut, setShowSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [queueCounts, setQueueCounts] = useState<QueueCounts | null>(null);
  const [deliveryCounts, setDeliveryCounts] = useState<DeliveryCounts | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // undefined while loading, null when no shift is open.
  const [shift, setShift] = useState<CurrentShift | null | undefined>(undefined);
  const [closingShift, setClosingShift] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [keypadEnabled, setKeypadEnabled] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setKeypadEnabled(readKeypadSetting()), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  const keypadSetting = { enabled: keypadEnabled, setEnabled: (enabled: boolean) => { setKeypadEnabled(enabled); saveKeypadSetting(enabled); } };

  // Receipts: settings saved on this tablet, and the slip being printed right now.
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(defaultReceiptSettings);
  const [receiptJob, setReceiptJob] = useState<{ receipt: ReceiptData; reprint: boolean } | null>(null);
  const receiptSettingsRef = useRef(receiptSettings);
  useEffect(() => { receiptSettingsRef.current = receiptSettings; }, [receiptSettings]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setReceiptSettings(readReceiptSettings()), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  const printReceipt = useCallback(async (orderId: number, options?: { reprint?: boolean }) => {
    try {
      const response = await fetch(`/api/receipts/${orderId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load the receipt.");
      if (receiptSettingsRef.current.output === "pdf") {
        await downloadReceiptPdf(payload.data as ReceiptData, Boolean(options?.reprint), receiptSettingsRef.current.paperWidth);
        return null;
      }
      setReceiptJob({ receipt: payload.data as ReceiptData, reprint: Boolean(options?.reprint) });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not load the receipt.";
    }
  }, []);
  // Once the slip is on the page, open the print window; clear it when printing is done.
  useEffect(() => {
    if (!receiptJob) return;
    document.body.classList.add("is-printing-receipt");
    const finish = () => { document.body.classList.remove("is-printing-receipt"); setReceiptJob(null); };
    const timer = window.setTimeout(() => window.print(), 60);
    window.addEventListener("afterprint", finish);
    return () => { window.clearTimeout(timer); window.removeEventListener("afterprint", finish); document.body.classList.remove("is-printing-receipt"); };
  }, [receiptJob]);
  const receiptContext = { settings: receiptSettings, setSettings: (settings: ReceiptSettings) => { setReceiptSettings(settings); saveReceiptSettings(settings); }, printReceipt };

  // Restore the last punched number after mount (localStorage is browser-only).
  useEffect(() => {
    const timeout = window.setTimeout(() => setLastOrder(readStoredLastOrder()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Returns this device to the login screen, e.g. after signing out, closing the shift, or when
  // the session was ended elsewhere (shift closed on another tablet, password reset, admin).
  const endLocalSession = useCallback((notice: string) => {
    setPage("pos");
    setLastOrder(null);
    try { window.localStorage.removeItem(LAST_ORDER_STORAGE_KEY); } catch { /* ignore */ }
    setShift(undefined);
    setClosingShift(false);
    setShowSignOut(false);
    setSigningOut(false);
    setLoginNotice(notice);
    setUser(null);
  }, []);

  const refreshQueueCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/queue?signatureOnly=1", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { signature?: { waiting_count?: number; ready_count?: number }; deliveries?: { ready?: number; failed?: number; cash?: number; mine_cash?: number } | null };
      setQueueCounts({ waiting: Number(payload.signature?.waiting_count ?? 0), ready: Number(payload.signature?.ready_count ?? 0) });
      setDeliveryCounts(payload.deliveries ? { ready: Number(payload.deliveries.ready ?? 0), failed: Number(payload.deliveries.failed ?? 0), cash: Number(payload.deliveries.cash ?? 0), mineCash: Number(payload.deliveries.mine_cash ?? 0) } : null);
    } catch (error) {
      console.error("Sidebar: failed to load queue counts", error);
    }
  }, []);

  const refreshShift = useCallback(async () => {
    try {
      const response = await fetch("/api/shift", { cache: "no-store" });
      if (response.status === 401) {
        endLocalSession("You were signed out. The shift was closed, your password was reset, or an admin signed you out. Sign in to continue.");
        return;
      }
      if (!response.ok) return;
      const payload = await response.json() as { data?: CurrentShift | null };
      setShift(payload.data ?? null);
    } catch (error) {
      console.error("Failed to load the current shift", error);
    }
  }, [endLocalSession]);

  // Live shift status and waiting/ready counts, refreshed while the tab is visible. Polling also
  // picks up a shift opened or closed from another terminal.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      void refreshQueueCounts();
      void refreshShift();
    };
    const timeout = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 15_000);
    // Coming back to the tab or waking the tablet checks right away, instead of up to 15 s later.
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [user, refreshQueueCounts, refreshShift]);

  // Any request this app makes that comes back "not signed in" (the shift was closed from the
  // admin app or another tablet, the password was reset, or an admin signed this cashier out)
  // returns to the login screen at once, rather than leaving screens that fail to load.
  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return;
    const originalFetch = window.fetch;
    let ended = false;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      const target = args[0];
      const url = typeof target === "string" ? target : target instanceof URL ? target.href : target.url;
      const path = new URL(url, window.location.href);
      if (response.status === 401 && !ended && path.origin === window.location.origin && path.pathname.startsWith("/api/") && path.pathname !== "/api/auth/login") {
        ended = true;
        endLocalSession("You were signed out. The shift was closed, your password was reset, or an admin signed you out. Sign in to continue.");
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, [signedIn, endLocalSession]);

  function recordLastOrder(queueNumber: number, shiftId: number) {
    const next = { queueNumber, punchedAt: Date.now(), shiftId };
    setLastOrder(next);
    setNow(next.punchedAt);
    try { window.localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable: keep it in memory only */ }
    void refreshQueueCounts();
    void refreshShift();
  }

  // Used while waiting for the store to open: refreshes the shift and this cashier's permissions.
  const checkForShift = useCallback(async () => {
    await refreshShift();
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        setUser((current) => current && payload.data ? { ...current, ...payload.data } : current);
      }
    } catch {
      // Offline for a moment: try again on the next check.
    }
  }, [refreshShift]);

  function handleShiftOpened(opened: CurrentShift) {
    setShift(opened);
    setPage("pos");
    void refreshQueueCounts();
  }

  function handleShiftClosed() {
    endLocalSession("Shift closed and everyone was signed out. Sign in again once a new shift is opened.");
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (active && response.ok) {
        const payload = await response.json();
        setUser(payload.data);
      }
      if (active) setAuthLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { if (window.innerWidth <= 640) setCollapsed(true); }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    endLocalSession("");
  }

  if (resetToken) return <PasswordResetScreen token={resetToken} onDone={finishPasswordReset} />;
  if (authLoading) return <div className="min-h-screen" style={{ background: "#F8F9FA" }} />;
  if (!user) return <Login onLoggedIn={(session) => { setLoginNotice(""); setUser(session); }} notice={loginNotice} />;
  const canManageReversals = Boolean(user.canVoidOrders || user.canRefundOrders);
  const queueOnly = isQueueOnlyRole(user.role);
  const allowedPages = limitedPages(user.role);
  const deliveryBadge = !deliveryCounts || (allowedPages && !allowedPages.includes("deliveries")) ? 0
    : user.role.toLowerCase() === "rider" ? deliveryCounts.ready + deliveryCounts.mineCash
      : deliveryCounts.ready + deliveryCounts.failed + deliveryCounts.cash;
  const visiblePage: Page = allowedPages ? (allowedPages.includes(page) ? page : allowedPages[0]) : page === "reversals" && !canManageReversals ? "pos" : page;
  async function confirmSignOut() {
    setSigningOut(true);
    await logout();
  }
  return <KeypadContext.Provider value={keypadSetting}><ReceiptContext.Provider value={receiptContext}><div className="app-shell flex h-screen overflow-hidden"><Sidebar current={visiblePage} collapsed={collapsed} lastOrder={lastOrder && shift && lastOrder.shiftId === shift.shiftId ? lastOrder : null} queueCounts={queueCounts} deliveryBadge={deliveryBadge} now={now} shiftOpen={Boolean(shift)} canManageReversals={canManageReversals} allowedPages={allowedPages} onChange={setPage} onToggle={() => setCollapsed((value) => !value)} /><div className="flex flex-col flex-1 min-w-0 min-h-0"><TopBar page={visiblePage} user={user} shift={shift} onOpenShift={() => setPage("pos")} onCloseShift={() => setClosingShift(true)} onCashDrawer={() => setDrawerOpen(true)} onAccount={() => setPage("accounts")} onRequestLogout={() => setShowSignOut(true)} /><div className="flex-1 min-h-0 overflow-auto app-content">{visiblePage === "pos" ? (shift === null ? (user.canOpenShift ? <OpenShiftPanel userName={user.fullName} onOpened={handleShiftOpened} onSwitchCashier={() => setShowSignOut(true)} /> : <WaitingForShiftPanel userName={user.fullName} onCheckAgain={checkForShift} onSwitchCashier={() => setShowSignOut(true)} />) : shift === undefined ? <div className="p-8" style={{ color: "#9C8278" }}>Checking the current shift…</div> : <POSPage userName={user.fullName} onQueueAssigned={recordLastOrder} />) : visiblePage === "queue" ? (queueOnly && shift === null ? <WaitingForShiftPanel userName={user.fullName} queueOnly onCheckAgain={checkForShift} onSwitchCashier={() => setShowSignOut(true)} /> : <QueuePage onCounts={setQueueCounts} />) : visiblePage === "reversals" ? <ReversalsPage user={user} /> : visiblePage === "deliveries" ? <DeliveriesPage user={user} onOpenReversals={() => setPage("reversals")} onChanged={() => void refreshQueueCounts()} /> : <AccountPage user={user} onSignOut={() => setShowSignOut(true)} />}</div></div><MobileTabBar current={visiblePage} queueWaiting={queueCounts?.waiting ?? 0} deliveryBadge={deliveryBadge} canManageReversals={canManageReversals} allowedPages={allowedPages} onChange={setPage} />{drawerOpen && shift && <CashDrawerDialog userName={user.fullName} onClose={() => { setDrawerOpen(false); void refreshShift(); }} />}{closingShift && shift && <CloseShiftDialog shiftId={shift.shiftId} userName={user.fullName} onCancel={() => setClosingShift(false)} onClosed={handleShiftClosed} />}{showSignOut && <SignOutDialog onCancel={() => setShowSignOut(false)} onConfirm={() => void confirmSignOut()} signingOut={signingOut} />}</div><div className="receipt-print-root" aria-hidden="true">{receiptJob && <ReceiptSlip receipt={receiptJob.receipt} reprint={receiptJob.reprint} paperWidth={receiptSettings.paperWidth} />}</div></ReceiptContext.Provider></KeypadContext.Provider>;
}
