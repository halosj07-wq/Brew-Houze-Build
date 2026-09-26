"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";

type Page = "dashboard" | "inventory" | "products" | "finance" | "accounts" | "account" | "archives";

type AdminSession = { adminId: number; fullName: string; email: string; role: string };

type InventoryItem = {
  inventory_id: number;
  ingredient_category: string;
  item_name: string;
  unit_of_measure: string;
  quantity: number;
  low_stock_threshold: number;
  is_whole_unit: boolean;
  is_permanent: boolean;
  derived_from_inventory_id?: number | null;
  derived_ratio?: number | null;
  derived_from_item_name?: string | null;
  derived_from_unit_of_measure?: string | null;
  derived_from_available_quantity?: number | null;
  unit_cost?: number | string | null;
  effective_unit_cost?: number | string | null;
  recipe_products?: string[];
  direct_sale_products?: string[];
  addition_names?: string[];
  packagings?: InventoryPackaging[];
};

// How a stock item is bought, e.g. "Nescafe Bean Bag 1 kg" containing 1000 grams of Coffee Bean.
type InventoryPackaging = { packagingId: number; name: string; brand: string | null; contentQuantity: number | string; lastPackPrice: number | string | null; lastRestockedAt: string | null };

function toOptionalNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

const singularUnits: Record<string, string> = { grams: "gram", Pieces: "piece", Bottles: "bottle", Boxes: "box", Packs: "pack", Sachets: "sachet" };

function singularUnit(unit: string): string {
  return singularUnits[unit] ?? unit;
}

type InventoryLogEntry = {
  log_id: number;
  inventory_id: number | null;
  item_name: string;
  ingredient_category: string;
  unit_of_measure: string;
  change_type: string;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  unit_cost_before?: number | null;
  unit_cost_after?: number | null;
  order_id: number | null;
  source_app: string;
  shift_id?: number | null;
  packaging_name?: string | null;
  packs_added?: number | null;
  pack_price?: number | null;
  admin_name: string | null;
  created_at: string;
};

type AdditionItem = {
  addition_id: number;
  addition_name: string;
  inventory_id: number;
  item_name: string;
  unit_of_measure: string;
  quantity: number;
  price: number;
};

type ProductCategory = { id: number; name: string };

type InventoryUnit = "mL" | "L" | "grams" | "kg" | "oz" | "Pieces" | "Bottles" | "Boxes" | "Packs" | "Sachets";
const wholeUnitInventoryUnits: ReadonlySet<InventoryUnit> = new Set(["Pieces", "Bottles", "Boxes", "Packs", "Sachets"]);

function normalizeInventoryUnit(value: string): InventoryUnit | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ml") return "mL";
  if (normalized === "l" || normalized === "liter" || normalized === "liters" || normalized === "litre" || normalized === "litres") return "L";
  if (normalized === "gram" || normalized === "grams" || normalized === "g") return "grams";
  if (normalized === "kg" || normalized === "kilogram" || normalized === "kilograms") return "kg";
  if (normalized === "oz" || normalized === "ounce" || normalized === "ounces") return "oz";
  if (normalized === "piece" || normalized === "pieces" || normalized === "pc" || normalized === "#") return "Pieces";
  if (normalized === "bottle" || normalized === "bottles") return "Bottles";
  if (normalized === "box" || normalized === "boxes") return "Boxes";
  if (normalized === "pack" || normalized === "packs" || normalized === "packet" || normalized === "packets") return "Packs";
  if (normalized === "sachet" || normalized === "sachets") return "Sachets";
  return null;
}

function isWholeUnit(unit: string): boolean {
  const normalized = normalizeInventoryUnit(unit);
  return normalized ? wholeUnitInventoryUnits.has(normalized) : false;
}

function IconGrid({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
}
function IconBox({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></svg>;
}
function IconDollar({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
}
function IconUsers({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function IconSearch({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function IconEye({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function IconCoffee({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>;
}
function IconChevron({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function IconPencil({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}
function IconLink({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
}
function IconCheck({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function IconTrash({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
}

function IconX({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function IconPlus({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function IconDownload({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
}
function IconCopy({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
}
function IconPaste({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8" /><rect x="5" y="2" width="14" height="4" rx="1" /><path d="M7 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /></svg>;
}
function IconTag({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
}
function IconImage({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
}
function IconSparkle({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
}
function IconArchive({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>;
}
function IconRotateCcw({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
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

// Confirmation dialog in the Brew Houze style, replacing the browser's confirm() pop-up.
// Usage: const confirmAction = useConfirm(); if (!(await confirmAction({ title, message }))) return;
// Destructive confirmations focus "Cancel" first, so an accidental Enter never deletes anything.
type ConfirmOptions = { title: string; message: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: "danger" | "default" };
type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setRequest((previous) => {
      previous?.resolve(false);
      return { ...options, resolve };
    });
  }), []);

  function settle(confirmed: boolean) {
    if (!request) return;
    request.resolve(confirmed);
    setRequest(null);
  }

  const danger = request?.tone !== "default";
  return <ConfirmContext.Provider value={confirm}>
    {children}
    {request && <Modal onClose={() => settle(false)} labelledBy="ui-confirm-title" zIndex={200}>
      <section className="ui-confirm">
        <div className="ui-confirm-icon" data-tone={danger ? "danger" : "default"} aria-hidden="true">{danger ? "!" : "?"}</div>
        <h2 id="ui-confirm-title">{request.title}</h2>
        <div className="ui-confirm-message">{request.message}</div>
        <div className="ui-confirm-actions">
          <button type="button" className="ui-button ui-button-secondary" onClick={() => settle(false)} data-autofocus>{request.cancelLabel ?? "Cancel"}</button>
          <button type="button" className={`ui-button ${danger ? "ui-button-danger" : "ui-button-primary"}`} onClick={() => settle(true)}>{request.confirmLabel ?? "Confirm"}</button>
        </div>
      </section>
    </Modal>}
  </ConfirmContext.Provider>;
}

// ─── App shell ────────────────────────────────────────────────────────────────
// Built for the two devices the admin uses: a tablet in landscape (sidebar) and a phone in
// portrait (bottom tab bar + "More" sheet). Shares its look with the cashier app.

const navItems: { id: Page; label: string; short: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", Icon: IconGrid },
  { id: "inventory", label: "Inventory", short: "Inventory", Icon: IconBox },
  { id: "products", label: "Menu", short: "Menu", Icon: IconCoffee },
  { id: "finance", label: "Finance", short: "Finance", Icon: IconDollar },
  { id: "accounts", label: "Accounts & Employees", short: "Employees", Icon: IconUsers },
  { id: "archives", label: "Archives", short: "Archives", Icon: IconArchive },
];

const navGroups: { label: string; items: Page[] }[] = [
  { label: "Overview", items: ["dashboard"] },
  { label: "Menu & Stock", items: ["inventory", "products"] },
  { label: "Business", items: ["finance", "accounts", "archives"] },
];

// Destinations on the phone tab bar; everything else is under "More".
const mobileTabs: Page[] = ["dashboard", "inventory", "products", "finance"];

// Initials on a colour picked from the name, the same as in the cashier app.
const avatarColors = ["#B45309", "#9A3412", "#6B4C3B", "#0F766E", "#7E22CE", "#1D4ED8", "#BE185D"];

function UserAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  const color = avatarColors[Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0) % avatarColors.length];
  return <span aria-hidden="true" className="flex items-center justify-center rounded-full" style={{ width: size, height: size, flexShrink: 0, background: color, color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: size * 0.38, boxShadow: "0 0 0 2px #FDF9F5, 0 0 0 4px rgba(217,119,6,0.35)" }}>{initials}</span>;
}

function IconSignal({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.94 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>;
}

function IconLogOut({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}

function IconMore({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>;
}

type ConnectionState = "checking" | "online" | "slow" | "database" | "offline";

// Round trips slower than this make saving feel sluggish.
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

// Shows whether this device has internet, reaches the Brew Houze server, and whether the database
// answers (and how fast). Checks every 20 seconds while visible and whenever the network changes.
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
    setInternet(navigator.onLine);
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
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Connection: ${style.label}. Show details`} title="Connection status" className="connection-chip" style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 12px", borderRadius: 11, border: `1px solid ${style.border}`, background: style.background, color: style.color, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
      <span className={state === "online" ? "" : "connection-pulse"} style={{ width: 8, height: 8, borderRadius: "50%", background: style.color }} />
      <IconSignal size={16} />
      <span className="connection-label">{style.label}</span>
    </button>
    {open && <>
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div role="dialog" aria-label="Connection details" className="connection-popover" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, width: 290, padding: 14, borderRadius: 14, background: "#FFFFFF", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.18)" }}>
        <p style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, color: style.color }}>{style.label}</p>
        <p style={{ margin: "3px 0 8px", color: "#9C8278", fontSize: 11.5, lineHeight: 1.45 }}>{state === "online" ? "Changes are saving normally." : state === "slow" ? "Saving works but responses are slow. Avoid tapping Save twice." : state === "database" ? "The server is up but the database is not answering. Changes cannot be saved right now." : state === "offline" ? (internet ? "This device has internet but cannot reach the Brew Houze server." : "This device has no internet connection. Check Wi-Fi or mobile data.") : "Checking the connection…"}</p>
        {row("Internet", internet ? "Connected" : "Not connected", internet)}
        {row("Brew Houze server", serverReachable === null ? "Checking" : serverReachable ? `Reachable${roundTripMs !== null ? ` · ${roundTripMs} ms` : ""}` : "Not reachable", serverReachable)}
        {row("Database", state === "checking" ? "Checking" : state === "database" ? "Not responding" : dbMs !== null ? `Responding · ${dbMs} ms` : "Unknown", state === "checking" ? null : state === "database" || state === "offline" ? false : dbMs !== null)}
        <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
          <span style={{ color: "#9C8278", fontSize: 11 }}>{checkedAt ? `Checked ${checkedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}</span>
          <button type="button" onClick={() => void check()} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "7px 12px", background: "#F3EDE5", color: "#3D2B1F", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Check again</button>
        </div>
      </div>
    </>}
  </div>;
}

function Sidebar({ current, collapsed, user, onChange, onToggle, onAccount }: { current: Page; collapsed: boolean; user: AdminSession; onChange: (page: Page) => void; onToggle: () => void; onAccount: () => void }) {
  return <aside className={`admin-sidebar ${collapsed ? "is-collapsed" : ""}`}>
    <div className="admin-sidebar-brand">
      <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, flexShrink: 0, background: "#D97706", color: "#FDF9F5", boxShadow: "0 8px 18px rgba(217,119,6,0.3)" }}><IconCoffee size={21} /></div>
      <div className="admin-sidebar-text"><p style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, color: "#FDF9F5", lineHeight: 1.15 }}>Brew Houze</p><p style={{ margin: "2px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, color: "#F59E0B", letterSpacing: "0.1em" }}>ADMIN PORTAL</p></div>
      <button type="button" onClick={onToggle} className="admin-sidebar-toggle" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} style={{ transform: collapsed ? "rotate(180deg)" : "none" }}><IconChevron size={14} /></button>
    </div>
    <nav className="admin-sidebar-nav" aria-label="Admin sections">
      {navGroups.map((group) => <div key={group.label} className="admin-nav-group">
        <p className="admin-nav-group-label">{group.label}</p>
        {group.items.map((id) => {
          const item = navItems.find((entry) => entry.id === id)!;
          const active = current === id;
          return <button key={id} type="button" onClick={() => onChange(id)} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={`admin-nav-item ${active ? "is-active" : ""}`}>
            <item.Icon size={18} /><span className="admin-sidebar-text">{item.label}</span>
          </button>;
        })}
      </div>)}
    </nav>
    <button type="button" onClick={onAccount} className={`admin-sidebar-profile ${current === "account" ? "is-active" : ""}`} title={collapsed ? "My account" : undefined} aria-label={`My account: ${user.fullName}`}>
      <UserAvatar name={user.fullName} size={34} />
      <span className="admin-sidebar-text flex flex-col" style={{ minWidth: 0, textAlign: "left" }}>
        <strong style={{ color: "#FDF9F5", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.fullName}</strong>
        <span style={{ color: "rgba(253,249,245,0.55)", fontSize: 11 }}>My account</span>
      </span>
    </button>
  </aside>;
}

function TopBar({ title, page, user, onAccount, onRequestLogout }: { title: string; page: Page; user: AdminSession; onAccount: () => void; onRequestLogout: () => void }) {
  return <header className="admin-topbar">
    <div className="flex items-center gap-3 min-w-0">
      <div className="admin-topbar-logo flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, flexShrink: 0, background: "#D97706", color: "#FDF9F5" }}><IconCoffee size={19} /></div>
      <h1 className="admin-topbar-title">{title}</h1>
    </div>
    <div className="flex items-center gap-2.5">
      <ConnectionIndicator />
      <button type="button" onClick={onAccount} aria-label={`My account: ${user.fullName}`} title="My account" className="admin-topbar-profile" style={{ border: page === "account" ? "1px solid #D97706" : "1px solid #E8DDD5", background: page === "account" ? "#FFF7ED" : "#FFFFFF" }}>
        <UserAvatar name={user.fullName} size={32} />
        <span className="admin-topbar-profile-text flex flex-col" style={{ lineHeight: 1.2 }}>
          <strong style={{ fontSize: 13, color: "#3D2B1F", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.fullName}</strong>
          <span style={{ alignSelf: "flex-start", marginTop: 3, padding: "1px 7px", borderRadius: 999, background: "#3D2B1F", color: "#FDF9F5", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em" }}>ADMIN</span>
        </span>
      </button>
      <button type="button" onClick={onRequestLogout} title="Sign out" className="admin-topbar-signout">
        <IconLogOut size={17} /><span>Sign out</span>
      </button>
    </div>
  </header>;
}

// Phone only: thumb-friendly tabs for the pages used most, and "More" for the rest.
function MobileTabBar({ current, moreOpen, onChange, onMore }: { current: Page; moreOpen: boolean; onChange: (page: Page) => void; onMore: () => void }) {
  const moreActive = moreOpen || !mobileTabs.includes(current);
  return <nav className="admin-tabbar" aria-label="Admin sections">
    {mobileTabs.map((id) => {
      const item = navItems.find((entry) => entry.id === id)!;
      const active = current === id && !moreOpen;
      return <button key={id} type="button" onClick={() => onChange(id)} aria-current={active ? "page" : undefined} className={`admin-tab ${active ? "is-active" : ""}`}>
        <item.Icon size={21} /><span>{item.short}</span>
      </button>;
    })}
    <button type="button" onClick={onMore} aria-expanded={moreOpen} className={`admin-tab ${moreActive ? "is-active" : ""}`}>
      <IconMore size={21} /><span>More</span>
    </button>
  </nav>;
}

function MoreSheet({ current, user, onChange, onAccount, onRequestLogout, onClose }: { current: Page; user: AdminSession; onChange: (page: Page) => void; onAccount: () => void; onRequestLogout: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="admin-sheet-backdrop" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="All admin sections" className="admin-sheet" onClick={(event) => event.stopPropagation()}>
      <div className="admin-sheet-handle" />
      <button type="button" onClick={onAccount} className="flex items-center gap-3 w-full" style={{ padding: "12px 14px", borderRadius: 14, border: current === "account" ? "1px solid #D97706" : "1px solid #E8DDD5", background: current === "account" ? "#FFF7ED" : "#FFFFFF", cursor: "pointer", textAlign: "left" }}>
        <UserAvatar name={user.fullName} size={42} />
        <span className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 15, color: "#3D2B1F" }}>{user.fullName}</strong>
          <span style={{ fontSize: 12, color: "#9C8278", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>
        </span>
        <span style={{ color: "#D97706", fontSize: 12.5, fontWeight: 700 }}>My account ›</span>
      </button>
      {navGroups.map((group) => <div key={group.label} style={{ marginTop: 16 }}>
        <p style={{ margin: "0 0 8px 2px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>{group.label}</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {group.items.map((id) => {
            const item = navItems.find((entry) => entry.id === id)!;
            const active = current === id;
            return <button key={id} type="button" onClick={() => onChange(id)} aria-current={active ? "page" : undefined} className="flex flex-col items-center justify-center gap-1.5" style={{ minHeight: 76, padding: "10px 6px", borderRadius: 14, border: active ? "1px solid #D97706" : "1px solid #E8DDD5", background: active ? "#D97706" : "#FFFFFF", color: active ? "#FFFFFF" : "#3D2B1F", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
              <item.Icon size={21} /><span style={{ lineHeight: 1.2 }}>{item.short}</span>
            </button>;
          })}
        </div>
      </div>)}
      <button type="button" onClick={onRequestLogout} className="flex items-center justify-center gap-2 w-full" style={{ marginTop: 18, height: 48, borderRadius: 14, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
        <IconLogOut size={18} />Sign out
      </button>
    </div>
  </div>;
}

type MyDevice = { id: number; app: string; device: string; signedInAt: string; lastSeenAt: string; isCurrent: boolean };
type AdminAccountDetails = { createdAt: string | null; shift: { shiftId: number; openedAt: string; openedByName: string | null; orders: number; netSales: number; reversals: number } | null; devices: MyDevice[] };

function formatElapsed(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function AccountSection({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 20, boxShadow: "0 4px 14px rgba(61,43,31,0.04)" }}>
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>{eyebrow}</p>
        <h2 style={{ margin: "5px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 19 }}>{title}</h2>
      </div>
      {action}
    </div>
    <div style={{ marginTop: 14 }}>{children}</div>
  </section>;
}

function AccountManagement({ user, onSignOut }: { user: AdminSession; onSignOut: () => void }) {
  const [details, setDetails] = useState<AdminAccountDetails | null>(null);
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

  const loadDetails = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/account", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load your account.");
      setDetails(payload.data as AdminAccountDetails);
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

  const currentDevice = details?.devices.find((device) => device.isCurrent);
  const otherDevices = (details?.devices ?? []).filter((device) => !device.isCurrent);
  const stat = (label: string, value: string, sub?: string) => <div className="rounded-xl" style={{ padding: "12px 14px", background: "#FFFFFF", border: "1px solid #F0E8E2" }}>
    <p style={{ margin: 0, color: "#9C8278", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
    <p style={{ margin: "5px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 22, color: "#3D2B1F" }}>{value}</p>
    {sub && <p style={{ margin: "2px 0 0", color: "#9C8278", fontSize: 11.5 }}>{sub}</p>}
  </div>;

  return <main className="account-page" style={{ maxWidth: 1180, padding: 24 }}>
    <section className="account-hero rounded-2xl flex items-center gap-5" style={{ padding: 22, background: "linear-gradient(135deg, #3D2B1F 0%, #5B4030 100%)", color: "#FDF9F5", boxShadow: "0 10px 30px rgba(61,43,31,0.18)" }}>
      <UserAvatar name={user.fullName} size={68} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26 }}>{user.fullName}</h2>
          <span style={{ padding: "2px 9px", borderRadius: 999, background: "#FDF9F5", color: "#3D2B1F", fontSize: 11, fontWeight: 800, letterSpacing: "0.05em" }}>ADMIN</span>
        </div>
        <p style={{ margin: "5px 0 0", color: "rgba(253,249,245,0.75)", fontSize: 13.5 }}>{user.email}</p>
        <p style={{ margin: "3px 0 0", color: "rgba(253,249,245,0.55)", fontSize: 12 }}>{currentDevice ? `Signed in on this device (${currentDevice.device}) since ${new Date(currentDevice.signedInAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Loading…"}</p>
      </div>
      <button type="button" onClick={onSignOut} className="account-hero-switch flex items-center justify-center gap-2" style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(253,249,245,0.25)", background: "rgba(253,249,245,0.08)", color: "#FDF9F5", fontWeight: 700, fontSize: 13, cursor: "pointer" }}><IconLogOut size={17} />Sign out</button>
    </section>

    {loadError && <p style={{ margin: "14px 0 0", padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{loadError}</p>}

    <div className="grid gap-5" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", alignItems: "start" }}>
      <div className="flex flex-col gap-5">
        <AccountSection eyebrow="Right now" title={details?.shift ? "The café is open" : "The café is closed"}>
          {!details ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>Loading…</p> : details.shift ? <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(110px, 100%), 1fr))" }}>
              {stat("Shift open", formatElapsed(details.shift.openedAt, now), `since ${new Date(details.shift.openedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}${details.shift.openedByName ? ` by ${details.shift.openedByName.split(" ")[0]}` : ""}`)}
              {stat("Orders", String(details.shift.orders), `${details.shift.reversals} voided/refunded`)}
              {stat("Net sales", `₱${details.shift.netSales.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "so far this shift")}
            </div>
            <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 12 }}>Full shift reports are in Finance.</p>
          </> : <p style={{ margin: 0, color: "#6B4C3B", fontSize: 13, lineHeight: 1.55 }}>No shift is open. A cashier opens one from the cashier app to start taking orders; the mobile menu shows the café as closed until then.</p>}
        </AccountSection>

        <AccountSection eyebrow="Security" title="Signed-in devices" action={otherDevices.length > 0 ? <button type="button" onClick={() => void signOutOtherDevices()} disabled={signingOutOthers} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, fontWeight: 700, cursor: signingOutOthers ? "default" : "pointer", whiteSpace: "nowrap" }}>{signingOutOthers ? "Signing out…" : "Sign out other devices"}</button> : undefined}>
          {!details ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>Loading…</p> : <div className="flex flex-col" style={{ border: "1px solid #F0E8E2", borderRadius: 12, overflow: "hidden", background: "#FFFFFF" }}>
            {details.devices.map((device, index) => <div key={device.id} style={{ padding: "10px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", fontSize: 13 }}>
              <strong style={{ color: "#3D2B1F" }}>{device.device}</strong>
              {device.isCurrent && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: "#DCFCE7", color: "#15803D", fontSize: 10.5, fontWeight: 800 }}>This device</span>}
              <span style={{ display: "block", marginTop: 2, color: "#9C8278", fontSize: 11.5 }}>{device.app === "cashier" ? "Cashier app" : "Admin app"} · signed in {new Date(device.signedInAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
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
          <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 12 }}>Changing your password signs out your other devices. This one stays signed in.</p>
          {passwordError && <AuthAlert tone="error">{passwordError}</AuthAlert>}
          {passwordMessage && <AuthAlert tone="success">{passwordMessage}</AuthAlert>}
          <button type="submit" disabled={savingPassword} className="login-submit">{savingPassword ? "Saving…" : "Change password"}</button>
        </form>
      </AccountSection>
    </div>
  </main>;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
// One glance at the café: the shift in progress (or the last one while closed), how the week is
// selling, what is running low, and the latest orders. Refreshes every 30 seconds while visible.
type DashboardShift = {
  shiftId: number; openedAt: string; closedAt: string | null; openedByName: string | null; closedByName: string | null;
  orderCount: number; mobileOrderCount: number; itemsSold: number; grossSales: number; cashSales: number; onlineSales: number;
  voidCount: number; refundCount: number; reversedAmount: number; netSales: number;
  startingCash: number; expectedCash: number; countedCash: number | null; cashDifference: number | null; costOfGoods: number; uncostedItems: number;
};
type DashboardOrder = { orderId: number; queueNumber: number | null; status: string; total: number; paymentMethod: string; orderSource: string; createdAt: string; punchedBy: string; items: string };
type DashboardData = {
  shift: DashboardShift | null;
  previousShift: DashboardShift | null;
  trend: { day: string; orders: number; revenue: number }[];
  week: { costOfGoods: number; costedRevenue: number; uncostedItems: number; itemsSold: number };
  topProducts: { name: string; category: string; quantity: number; revenue: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  queue: { waiting: number; ready: number };
  staffOnDuty: { name: string; role: string; timeIn: string }[];
  recentOrders: DashboardOrder[];
  generatedAt: string;
};
type DashBar = { key: string; label: string; sub?: string; value: number; highlight?: boolean; title: string };

const DASHBOARD_REFRESH_MS = 30_000;
const HOUR_MS = 3_600_000;

function manilaHour(value: string | number): number {
  return Number(new Date(value).toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" })) % 24;
}

function manilaDay(value: string | number): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function hourLabel(hour: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "a" : "p"}`;
}

function compactPeso(value: number): string {
  if (Math.abs(value) >= 1000) return `₱${(value / 1000).toFixed(Math.abs(value) >= 10_000 ? 0 : 1)}k`;
  return `₱${Math.round(value)}`;
}

function clockTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

function isReversedStatus(status: string): boolean {
  return ["void", "voided", "refund", "refunded"].includes(status);
}

function isProductSellable(product: Product, inventory: InventoryItem[]): boolean {
  const recipes = product.variants.length ? product.variants.map((variant) => variant.ingredients) : [product.ingredients];
  return recipes.some((ingredients) => areIngredientsAvailable(ingredients, inventory));
}

// Clock hours covered by a shift, oldest first (at most the last 24), with that hour's sales.
function shiftHourBars(shift: DashboardShift, hourly: DashboardData["hourly"], now: number): DashBar[] {
  const end = shift.closedAt ? new Date(shift.closedAt).getTime() : now;
  const opened = new Date(shift.openedAt).getTime();
  const first = Math.max(Math.floor(opened / HOUR_MS) * HOUR_MS, Math.floor(end / HOUR_MS) * HOUR_MS - 23 * HOUR_MS);
  const byHour = new Map(hourly.map((entry) => [entry.hour, entry]));
  const currentHour = shift.closedAt ? -1 : manilaHour(now);
  const bars: DashBar[] = [];
  for (let time = first; time <= end; time += HOUR_MS) {
    const hour = manilaHour(time);
    const entry = byHour.get(hour);
    bars.push({
      key: String(time),
      label: hourLabel(hour),
      value: entry?.revenue ?? 0,
      highlight: hour === currentHour,
      title: `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}: ${peso(entry?.revenue ?? 0)} from ${entry?.orders ?? 0} order${entry?.orders === 1 ? "" : "s"}`,
    });
  }
  return bars;
}

function DashBars({ bars, emptyLabel }: { bars: DashBar[]; emptyLabel: string }) {
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const peakKey = max > 0 ? bars.find((bar) => bar.value === max)?.key : undefined;
  const crowded = bars.length > 8;
  const labelEvery = bars.length > 16 ? 3 : bars.length > 10 ? 2 : 1;
  return <div className="dash-chart">
    <div className={`dash-bars${crowded ? " is-crowded" : ""}`}>
      {bars.map((bar, index) => <div key={bar.key} className="dash-bar-col" title={bar.title}>
        <div className="dash-bar-track">
          {bar.value > 0 && (!crowded || bar.key === peakKey || bar.highlight) && <span className="dash-bar-value">{compactPeso(bar.value)}</span>}
          <div className={`dash-bar${bar.highlight ? " is-highlight" : ""}${bar.value > 0 && bar.key === peakKey ? " is-peak" : ""}`} style={{ height: `${max > 0 ? Math.max(3, (bar.value / max) * 82) : 3}%` }} />
        </div>
        <span className="dash-bar-label">{index % labelEvery === 0 || bar.highlight ? <><b>{bar.label}</b>{bar.sub && <span>{bar.sub}</span>}</> : " "}</span>
      </div>)}
    </div>
    {max === 0 && <p className="dash-chart-empty">{emptyLabel}</p>}
  </div>;
}

function DashCard({ title, sub, action, className = "", children }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`dash-card ${className}`}>
    <div className="dash-card-head">
      <div style={{ minWidth: 0 }}>
        <h2 className="dash-card-title">{title}</h2>
        {sub && <p className="dash-card-sub">{sub}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>;
}

function DashLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="dash-link" onClick={onClick}>{label} <IconChevron size={13} /></button>;
}

function DashKpi({ label, value, note, accent }: { label: string; value: React.ReactNode; note?: React.ReactNode; accent?: string }) {
  return <div className="dash-card dash-kpi">
    <p className="dash-kpi-label">{label}</p>
    <p className="dash-kpi-value" style={accent ? { color: accent } : undefined}>{value}</p>
    {note && <div className="dash-kpi-note">{note}</div>}
  </div>;
}

function darkCashDifference(difference: number | null): { text: string; color: string } {
  const label = cashDifferenceLabel(difference);
  if (difference === null) return { text: "Not counted", color: "rgba(253,249,245,0.6)" };
  if (Math.abs(difference) < 0.005) return { text: label.text, color: "#86EFAC" };
  return { text: label.text, color: difference > 0 ? "#FCD34D" : "#FCA5A5" };
}

function DashboardShiftCard({ shift, previousShift, now, onOpenReports }: { shift: DashboardShift | null; previousShift: DashboardShift | null; now: number; onOpenReports: () => void }) {
  if (shift) {
    const paid = shift.cashSales + shift.onlineSales;
    const cashShare = paid > 0 ? (shift.cashSales / paid) * 100 : 0;
    const reversals = shift.voidCount + shift.refundCount;
    const longOpen = (now - new Date(shift.openedAt).getTime()) / HOUR_MS > LONG_OPEN_SHIFT_HOURS;
    return <section className="dash-shift">
      <div className="dash-shift-top">
        <span className="dash-shift-pill is-open"><span className="dash-live-dot" />Shift open</span>
        <button type="button" className="dash-shift-link" onClick={onOpenReports}>Shift reports <IconChevron size={13} /></button>
      </div>
      <p className="dash-shift-label">Net sales this shift</p>
      <p className="dash-shift-value">{peso(shift.netSales)}</p>
      <p className="dash-shift-meta">Open for {formatElapsed(shift.openedAt, now)} · opened by {shift.openedByName ?? "a cashier"} at {clockTime(shift.openedAt)}</p>
      <div className="dash-shift-stats">
        <div><span>Orders</span><strong>{shift.orderCount}</strong><em>{shift.mobileOrderCount > 0 ? `${shift.mobileOrderCount} from mobile` : `${shift.itemsSold} item${shift.itemsSold === 1 ? "" : "s"} sold`}</em></div>
        <div><span>Avg. order</span><strong>{shift.orderCount > 0 ? peso(shift.grossSales / shift.orderCount) : "—"}</strong><em>per receipt</em></div>
        <div><span>Voids & refunds</span><strong>{reversals}</strong><em>{shift.reversedAmount > 0 ? `−${peso(shift.reversedAmount)}` : "None so far"}</em></div>
      </div>
      <div className="dash-drawer">
        <div className="dash-drawer-row"><span>Expected in cash drawer</span><strong>{peso(shift.expectedCash)}</strong></div>
        <div className="dash-split" aria-hidden="true"><span style={{ width: `${cashShare}%` }} /></div>
        <div className="dash-drawer-legend">
          <span><i className="is-cash" />Cash {peso(shift.cashSales)}</span>
          <span><i className="is-online" />Online {peso(shift.onlineSales)}</span>
          <span>Started with {peso(shift.startingCash)}</span>
        </div>
      </div>
      {longOpen && <p className="dash-shift-warning">This shift has been open for over {LONG_OPEN_SHIFT_HOURS} hours. Remind the cashier to close it so the day is recorded correctly.</p>}
    </section>;
  }

  const count = previousShift ? darkCashDifference(previousShift.cashDifference) : null;
  return <section className="dash-shift is-closed">
    <div className="dash-shift-top">
      <span className="dash-shift-pill">Store closed</span>
      {previousShift && <button type="button" className="dash-shift-link" onClick={onOpenReports}>Shift reports <IconChevron size={13} /></button>}
    </div>
    {previousShift ? <>
      <p className="dash-shift-label">Net sales last shift</p>
      <p className="dash-shift-value">{peso(previousShift.netSales)}</p>
      <p className="dash-shift-meta">{shiftTime(previousShift.openedAt)} – {shiftTime(previousShift.closedAt)}{previousShift.closedByName ? ` · closed by ${previousShift.closedByName}` : ""}</p>
      <div className="dash-shift-stats">
        <div><span>Orders</span><strong>{previousShift.orderCount}</strong><em>{previousShift.itemsSold} item{previousShift.itemsSold === 1 ? "" : "s"} sold</em></div>
        <div><span>Avg. order</span><strong>{previousShift.orderCount > 0 ? peso(previousShift.grossSales / previousShift.orderCount) : "—"}</strong><em>per receipt</em></div>
        <div><span>Cash count</span><strong style={{ color: count?.color, fontSize: 15 }}>{count?.text}</strong><em>{previousShift.countedCash === null ? "—" : `${peso(previousShift.countedCash)} counted`}</em></div>
      </div>
    </> : <>
      <p className="dash-shift-label">No shifts yet</p>
      <p className="dash-shift-value" style={{ fontSize: 30 }}>Ready to open</p>
    </>}
    <p className="dash-shift-note">A cashier opens the next shift from the cashier app. Mobile ordering stays closed until then.</p>
  </section>;
}

function Dashboard({ user, inventory, products, onNavigate, onRefreshStock }: { user: AdminSession; inventory: InventoryItem[]; products: Product[]; onNavigate: (page: Page) => void; onRefreshStock: () => Promise<unknown> }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load the dashboard.");
      setData(payload.data);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the dashboard.");
    } finally {
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    let inFlight = false;
    const refresh = () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      void load().finally(() => { inFlight = false; });
    };
    const firstLoad = window.setTimeout(refresh, 0);
    const intervalId = window.setInterval(refresh, DASHBOARD_REFRESH_MS);
    const clockId = window.setInterval(() => setNow(Date.now()), 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(intervalId);
      window.clearInterval(clockId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function refreshNow() {
    setRefreshing(true);
    await Promise.all([load(), onRefreshStock()]);
    setRefreshing(false);
  }

  const stock = useMemo(() => {
    const out = inventory.filter((item) => Number(item.quantity) <= 0);
    const low = inventory.filter((item) => isLowStock(item));
    const noCost = inventory.filter((item) => toOptionalNumber(item.effective_unit_cost ?? item.unit_cost) === null);
    const alerts = [...out, ...low.sort((a, b) => Number(a.quantity) / Math.max(1e-9, Number(a.low_stock_threshold)) - Number(b.quantity) / Math.max(1e-9, Number(b.low_stock_threshold)))];
    return { out, low, noCost, alerts };
  }, [inventory]);
  const menu = useMemo(() => {
    const soldOut = products.filter((product) => !isProductSellable(product, inventory));
    return { total: products.length, soldOut };
  }, [products, inventory]);

  const firstName = user.fullName.trim().split(/\s+/)[0] || user.fullName;
  const hour = manilaHour(now);
  const greeting = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Date(now).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const trend = data?.trend ?? [];
  const thisWeek = trend.slice(-7);
  const lastWeek = trend.slice(0, Math.max(0, trend.length - 7));
  const weekSales = thisWeek.reduce((sum, day) => sum + day.revenue, 0);
  const weekOrders = thisWeek.reduce((sum, day) => sum + day.orders, 0);
  const lastWeekSales = lastWeek.reduce((sum, day) => sum + day.revenue, 0);
  const weekChange = lastWeekSales > 0 ? ((weekSales - lastWeekSales) / lastWeekSales) * 100 : null;
  const todayKey = thisWeek[thisWeek.length - 1]?.day ?? manilaDay(now);
  const grossProfit = data ? data.week.costedRevenue - data.week.costOfGoods : 0;
  const margin = data && data.week.costedRevenue > 0 ? (grossProfit / data.week.costedRevenue) * 100 : null;
  const best = thisWeek.reduce<(typeof thisWeek)[number] | null>((top, day) => (day.revenue > (top?.revenue ?? 0) ? day : top), null);

  const trendBars: DashBar[] = thisWeek.map((day) => {
    const date = new Date(`${day.day}T00:00:00+08:00`);
    const weekday = date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short" });
    return {
      key: day.day,
      label: day.day === todayKey ? "Today" : weekday,
      sub: date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }),
      value: day.revenue,
      highlight: day.day === todayKey,
      title: `${date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "short", day: "numeric" })}: ${peso(day.revenue)} from ${day.orders} order${day.orders === 1 ? "" : "s"}`,
    };
  });

  const hourShift = data?.shift ?? data?.previousShift ?? null;
  const hourBars = hourShift && data ? shiftHourBars(hourShift, data.hourly, now) : [];
  const peakHour = data?.hourly.reduce<DashboardData["hourly"][number] | null>((top, entry) => (entry.revenue > (top?.revenue ?? 0) ? entry : top), null) ?? null;

  const statusParts: string[] = [];
  if (data) {
    statusParts.push(data.shift ? `Shift open for ${formatElapsed(data.shift.openedAt, now)}` : "The store is closed");
    if (data.queue.waiting > 0) statusParts.push(`${data.queue.waiting} order${data.queue.waiting === 1 ? "" : "s"} being prepared`);
  }
  if (stock.out.length > 0) statusParts.push(`${stock.out.length} item${stock.out.length === 1 ? "" : "s"} out of stock`);
  else if (stock.low.length > 0) statusParts.push(`${stock.low.length} item${stock.low.length === 1 ? "" : "s"} running low`);

  const topMax = Math.max(1, ...(data?.topProducts ?? []).map((product) => product.quantity));

  return <div className="dash-wrap">
    <div className="dash">
      <header className="dash-head">
        <div style={{ minWidth: 0 }}>
          <p className="dash-eyebrow">{dateLabel}</p>
          <h1 className="dash-greeting">{greeting}, {firstName}</h1>
          {statusParts.length > 0 && <p className="dash-status">{statusParts.join(" · ")}</p>}
        </div>
        <div className="dash-head-actions">
          {data && <span className="dash-updated">Updated {clockTime(data.generatedAt)}</span>}
          <button type="button" className="dash-refresh" onClick={() => void refreshNow()} disabled={refreshing}>
            <span style={{ display: "inline-flex", animation: refreshing ? "spin 0.8s linear infinite" : undefined }}><IconRotateCcw size={14} /></span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {loadError && <div className="dash-error" role="alert">
        <span>{data ? "Could not refresh. Showing the last loaded figures." : loadError}</span>
        <button type="button" onClick={() => void refreshNow()}>Try again</button>
      </div>}

      {!data ? (loadError ? null : <div className="dash-hero" aria-busy="true">
        <div className="dash-skeleton" style={{ minHeight: 300 }} />
        <div className="dash-kpis">{[0, 1, 2, 3].map((index) => <div key={index} className="dash-skeleton" style={{ minHeight: 130 }} />)}</div>
      </div>) : <>
        <div className="dash-hero">
          <DashboardShiftCard shift={data.shift} previousShift={data.previousShift} now={now} onOpenReports={() => onNavigate("finance")} />
          <div className="dash-kpis">
            <DashKpi
              label="Sales · last 7 days"
              value={peso(weekSales)}
              note={weekChange === null
                ? <span>{weekOrders} order{weekOrders === 1 ? "" : "s"}</span>
                : <span><b className={weekChange >= 0 ? "dash-up" : "dash-down"}>{weekChange >= 0 ? "▲" : "▼"} {Math.abs(weekChange).toFixed(0)}%</b> vs the 7 days before</span>}
            />
            <DashKpi
              label="Gross profit · 7 days"
              value={margin === null ? "—" : peso(grossProfit)}
              accent={margin !== null && grossProfit < 0 ? "#B91C1C" : undefined}
              note={margin === null
                ? <span>{data.week.itemsSold > 0 ? "Add item costs in Inventory to see profit" : "No sales yet"}</span>
                : <span>{margin.toFixed(0)}% margin{data.week.uncostedItems > 0 ? <> · <b className="dash-warn">{data.week.uncostedItems} without cost</b></> : null}</span>}
            />
            <DashKpi
              label="Queue now"
              value={<>{data.queue.waiting}<small> preparing</small></>}
              accent={data.queue.waiting > 0 ? "#B45309" : undefined}
              note={<span>{data.queue.ready} ready for pickup</span>}
            />
            <DashKpi
              label="Staff on duty"
              value={data.staffOnDuty.length}
              note={data.staffOnDuty.length === 0
                ? <span>Nobody is clocked in</span>
                : <div className="dash-staff">
                  {data.staffOnDuty.slice(0, 3).map((person) => <span key={`${person.name}-${person.timeIn}`} className="dash-staff-person" title={`${person.name} · in since ${clockTime(person.timeIn)}`}>
                    <UserAvatar name={person.name} size={22} />
                    <span>{person.name.split(/\s+/)[0]}<em> · {clockTime(person.timeIn)}</em></span>
                  </span>)}
                  {data.staffOnDuty.length > 3 && <span className="dash-staff-more">+{data.staffOnDuty.length - 3} more</span>}
                </div>}
            />
          </div>
        </div>

        <div className="dash-row">
          <DashCard
            title="Sales this week"
            sub={<>{peso(weekSales)} from {weekOrders} order{weekOrders === 1 ? "" : "s"}{best ? <> · best day {new Date(`${best.day}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long" })}</> : null}</>}
            action={<DashLink label="Finance" onClick={() => onNavigate("finance")} />}
          >
            <DashBars bars={trendBars} emptyLabel="No sales in the last 7 days yet." />
          </DashCard>
          <DashCard title="Top sellers" sub="Most ordered in the last 7 days" action={<DashLink label="Products" onClick={() => onNavigate("products")} />}>
            {data.topProducts.length === 0
              ? <p className="dash-empty">Best sellers will show here once orders come in.</p>
              : <ol className="dash-rank">
                {data.topProducts.map((product, index) => <li key={product.name}>
                  <span className={`dash-rank-num${index === 0 ? " is-first" : ""}`}>{index + 1}</span>
                  <div className="dash-rank-main">
                    <div className="dash-rank-line"><strong>{product.name}</strong><span>{product.quantity} sold</span></div>
                    <div className="dash-meter"><span style={{ width: `${(product.quantity / topMax) * 100}%` }} /></div>
                    <div className="dash-rank-sub"><span>{product.category || "Uncategorized"}</span><span>{peso(product.revenue)}</span></div>
                  </div>
                </li>)}
              </ol>}
          </DashCard>
        </div>

        <div className="dash-row is-flipped">
          <DashCard
            title="Stock alerts"
            sub={menu.total > 0 ? <>{menu.total - menu.soldOut.length} of {menu.total} menu items can be sold right now</> : "Items at or below their alert level"}
            action={<DashLink label="Inventory" onClick={() => onNavigate("inventory")} />}
          >
            <div className="dash-chips">
              <span className={`dash-chip${stock.out.length ? " is-out" : ""}`}><b>{stock.out.length}</b> out of stock</span>
              <span className={`dash-chip${stock.low.length ? " is-low" : ""}`}><b>{stock.low.length}</b> running low</span>
              <span className={`dash-chip${stock.noCost.length ? " is-info" : ""}`}><b>{stock.noCost.length}</b> without cost</span>
            </div>
            {stock.alerts.length === 0
              ? <div className="dash-all-good"><span><IconCheck size={16} /></span>Everything is well stocked.</div>
              : <ul className="dash-stock">
                {stock.alerts.slice(0, 6).map((item) => {
                  const quantity = Number(item.quantity);
                  const threshold = Number(item.low_stock_threshold);
                  const isOut = quantity <= 0;
                  return <li key={item.inventory_id}>
                    <div className="dash-stock-main"><strong>{item.item_name}</strong><span>{item.ingredient_category}</span></div>
                    <div className="dash-stock-qty">
                      <strong style={{ color: isOut ? "#B91C1C" : "#B45309" }}>{formatAmount(quantity)} {quantity === 1 ? singularUnit(item.unit_of_measure) : item.unit_of_measure}</strong>
                      <div className="dash-meter is-small"><span style={{ width: `${threshold > 0 ? Math.min(100, (quantity / threshold) * 100) : 0}%`, background: isOut ? "#B91C1C" : "#D97706" }} /></div>
                    </div>
                    <span className={`dash-tag ${isOut ? "is-out" : "is-low"}`}>{isOut ? "Out" : "Low"}</span>
                  </li>;
                })}
                {stock.alerts.length > 6 && <li className="dash-stock-more">+{stock.alerts.length - 6} more in Inventory</li>}
              </ul>}
            {menu.soldOut.length > 0 && <p className="dash-soldout"><b>Sold out on the menu:</b> {menu.soldOut.slice(0, 5).map((product) => product.name).join(", ")}{menu.soldOut.length > 5 ? ` and ${menu.soldOut.length - 5} more` : ""}</p>}
          </DashCard>
          <DashCard title="Recent orders" sub="The latest orders from the counter and the mobile menu" action={<DashLink label="Finance" onClick={() => onNavigate("finance")} />}>
            {data.recentOrders.length === 0
              ? <p className="dash-empty">No orders yet.</p>
              : <ul className="dash-orders">
                {data.recentOrders.map((order) => {
                  const reversed = isReversedStatus(order.status);
                  const when = manilaDay(order.createdAt) === manilaDay(now) ? clockTime(order.createdAt) : shiftTime(order.createdAt);
                  const channel = order.orderSource === "online" ? "Mobile" : order.paymentMethod === "online" ? "Online" : "Cash";
                  return <li key={order.orderId}>
                    <span className="dash-order-queue">{order.queueNumber === null ? "—" : `#${order.queueNumber}`}</span>
                    <div className="dash-order-main">
                      <strong>{order.items || "Order"}</strong>
                      <span>{when} · {order.punchedBy} · <b className={`dash-channel is-${channel.toLowerCase()}`}>{channel}</b></span>
                    </div>
                    <div className="dash-order-total">
                      <strong className={reversed ? "is-reversed" : ""}>{peso(order.total)}</strong>
                      {reversed && <span className="dash-tag is-out">{order.status.startsWith("void") ? "Voided" : "Refunded"}</span>}
                    </div>
                  </li>;
                })}
              </ul>}
          </DashCard>
        </div>

        <div className="dash-row">
          <DashCard
            title={data.shift ? "Sales by hour · this shift" : data.previousShift ? "Sales by hour · last shift" : "Sales by hour"}
            sub={peakHour ? <>Busiest hour {hourLabel(peakHour.hour)}–{hourLabel((peakHour.hour + 1) % 24)} with {peso(peakHour.revenue)} from {peakHour.orders} order{peakHour.orders === 1 ? "" : "s"}</> : "Hourly sales show here once a shift has orders"}
          >
            {hourBars.length > 0
              ? <DashBars bars={hourBars} emptyLabel="No orders in this shift yet." />
              : <p className="dash-empty">No shifts yet.</p>}
          </DashCard>
          <section className="dash-card dash-ai">
            <div className="dash-card-head">
              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                <span className="dash-ai-icon"><IconSparkle size={16} /></span>
                <div>
                  <h2 className="dash-card-title">AI Insights</h2>
                  <p className="dash-card-sub">No AI data configured yet</p>
                </div>
              </div>
            </div>
            <div className="dash-ai-empty">AI insights will appear here once the AI service is connected.</div>
          </section>
        </div>
      </>}
    </div>
  </div>;
}

function isLowStock(item: InventoryItem): boolean {
  return Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.low_stock_threshold);
}

// Unit cost input, stored per unit of measure. Buying prices are usually known per purchase
// (₱850 for 1,000 grams), so the helper row converts a purchase total into a per-unit cost.
function UnitCostField({ unit, value, onChange }: { unit: string; value: string; onChange: (value: string) => void }) {
  const [purchaseTotal, setPurchaseTotal] = useState("");
  const [purchaseQuantity, setPurchaseQuantity] = useState("");
  const smallInput: React.CSSProperties = { width: 78, border: "1px solid #E8DDD5", borderRadius: 8, padding: "5px 8px", fontFamily: "Inter, sans-serif", fontSize: 12, color: "#3D2B1F", background: "#FDF9F5", outline: "none" };

  function applyPurchase(total: string, quantity: string) {
    setPurchaseTotal(total);
    setPurchaseQuantity(quantity);
    const parsedTotal = Number(total);
    const parsedQuantity = Number(quantity);
    if (total !== "" && quantity !== "" && Number.isFinite(parsedTotal) && parsedTotal >= 0 && Number.isFinite(parsedQuantity) && parsedQuantity > 0) {
      onChange(String(Math.round((parsedTotal / parsedQuantity) * 10000) / 10000));
    }
  }

  return <div className="flex flex-col gap-1.5">
    <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Unit cost · ₱ per {singularUnit(unit)} <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
    <input type="number" min={0} step="any" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Not set" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }} />
    <div className="flex flex-wrap items-center gap-1.5" style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#9C8278" }}>
      or paid ₱<input type="number" min={0} step="any" value={purchaseTotal} onChange={(event) => applyPurchase(event.target.value, purchaseQuantity)} placeholder="850" style={smallInput} />
      for <input type="number" min={0} step="any" value={purchaseQuantity} onChange={(event) => applyPurchase(purchaseTotal, event.target.value)} placeholder="1000" style={smallInput} /> {unit}
    </div>
  </div>;
}

// Strips anything from the decimal point onward so a whole-unit field can never hold a fraction.
function sanitizeWholeUnitValue(value: string): string {
  const dotIndex = value.indexOf(".");
  return dotIndex === -1 ? value : value.slice(0, dotIndex);
}

// ─── Packaging ────────────────────────────────────────────────────────────────
// A packaging is how a stock item is bought (Nescafe Bean Bag 1 kg -> Coffee Bean, grams). It
// never holds stock: restocking by package adds packs x contents to the item and averages its
// unit cost. An item can have several packagings, e.g. one per brand.

function formatAmount(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

// Same weighted-average rule the server applies when restocking by package.
function previewWeightedAverage(currentQuantity: number, currentUnitCost: number | null, addedQuantity: number, addedTotalCost: number): number {
  const onHand = Math.max(0, currentQuantity);
  return currentUnitCost === null || onHand === 0
    ? addedTotalCost / addedQuantity
    : (onHand * currentUnitCost + addedTotalCost) / (onHand + addedQuantity);
}

const packagingLabel: React.CSSProperties = { fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" };
const packagingInput: React.CSSProperties = { border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none", width: "100%", minWidth: 0 };

function PackagingDialog({ item, onClose, onChanged }: { item: InventoryItem; onClose: () => void; onChanged: (updated: InventoryItem) => void }) {
  const confirmAction = useConfirm();
  const packagings = item.packagings ?? [];
  const emptyDraft = { name: "", brand: "", content: "", price: "" };
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit(pack: InventoryPackaging) {
    setError("");
    setEditingId(pack.packagingId);
    setDraft({ name: pack.name, brand: pack.brand ?? "", content: String(Number(pack.contentQuantity)), price: pack.lastPackPrice === null ? "" : String(Number(pack.lastPackPrice)) });
  }

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, fallback: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/packaging", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || fallback);
      onChanged(payload.data as InventoryItem);
      resetDraft();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = { packaging_name: draft.name, brand: draft.brand, content_quantity: Number(draft.content), pack_price: draft.price === "" ? null : Number(draft.price) };
    if (editingId === null) void send("POST", { inventory_id: item.inventory_id, ...fields }, "Failed to add the packaging.");
    else void send("PATCH", { packaging_id: editingId, ...fields }, "Failed to update the packaging.");
  }

  async function archive(pack: InventoryPackaging) {
    if (!(await confirmAction({ title: `Archive ${pack.name}?`, message: "It will no longer be offered when restocking. Past restock records keep its name.", confirmLabel: "Archive packaging" }))) return;
    void send("DELETE", { packaging_id: pack.packagingId }, "Failed to archive the packaging.");
  }

  const draftContent = Number(draft.content);
  const draftPrice = Number(draft.price);
  const draftPerUnit = draft.price !== "" && draftContent > 0 && Number.isFinite(draftPrice) ? draftPrice / draftContent : null;

  return <Modal onClose={onClose} closeDisabled={saving} label="Packaging">
    <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, maxHeight: "90vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5" }}>
        <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>Packaging</p><p style={{ marginTop: 3, fontSize: 12, color: "#9C8278" }}>How {item.item_name} is bought · stock stays in {item.unit_of_measure}</p></div>
        <button type="button" onClick={onClose} disabled={saving} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        {packagings.length === 0
          ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>No packaging yet. Add how this item is bought, e.g. a 1 kg bag, a 1 L carton, or a case of 24.</p>
          : <div className="flex flex-col" style={{ border: "1px solid #E8DDD5", borderRadius: 12, overflow: "hidden" }}>
            {packagings.map((pack, index) => {
              const content = Number(pack.contentQuantity);
              const price = pack.lastPackPrice === null ? null : Number(pack.lastPackPrice);
              return <div key={pack.packagingId} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", background: editingId === pack.packagingId ? "#FFF7ED" : "#FFFFFF" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "#3D2B1F" }}>{pack.name}{pack.brand && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 6, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11, fontWeight: 600 }}>{pack.brand}</span>}{index === 0 && pack.lastRestockedAt && <span style={{ marginLeft: 6, color: "#15803D", fontSize: 11, fontWeight: 600 }}>last bought</span>}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9C8278" }}>1 pack = {formatAmount(content)} {item.unit_of_measure}{price !== null ? ` · ₱${price.toFixed(2)} per pack (${formatPeso(price / content)} per ${singularUnit(item.unit_of_measure)})` : " · no price yet"}</p>
                </div>
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  <button type="button" onClick={() => startEdit(pack)} disabled={saving} style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 10px", background: "#F3EDE5", color: "#6B4C3B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                  <button type="button" onClick={() => archive(pack)} disabled={saving} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "6px 10px", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Archive</button>
                </div>
              </div>;
            })}
          </div>}

        <form onSubmit={save} className="flex flex-col gap-3 rounded-xl p-4" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "#3D2B1F" }}>{editingId === null ? "Add a packaging" : "Edit packaging"}</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Packaging name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Nescafe Bean Bag 1 kg" style={packagingInput} /></label>
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Brand <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span><input value={draft.brand} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} placeholder="e.g. Nescafe" style={packagingInput} /></label>
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>One pack contains ({item.unit_of_measure})</span><input type="number" min={0} step={item.is_whole_unit ? 1 : "any"} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: item.is_whole_unit ? sanitizeWholeUnitValue(event.target.value) : event.target.value }))} placeholder={item.is_whole_unit ? "e.g. 24" : "e.g. 1000"} style={packagingInput} /></label>
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Price per pack (₱) <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span><input type="number" min={0} step="0.01" value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))} placeholder="e.g. 850" style={packagingInput} /></label>
          </div>
          {draftPerUnit !== null && <span style={{ fontSize: 12, color: "#6B4C3B" }}>= {formatPeso(draftPerUnit)} per {singularUnit(item.unit_of_measure)}</span>}
          {error && <p style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
          <div className="flex justify-end gap-2">
            {editingId !== null && <button type="button" onClick={resetDraft} disabled={saving} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: "pointer" }}>Cancel edit</button>}
            <button type="submit" disabled={saving || !draft.name.trim() || !(draftContent > 0)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: saving || !draft.name.trim() || !(draftContent > 0) ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Saving..." : editingId === null ? "Add packaging" : "Save changes"}</button>
          </div>
        </form>
      </div>
    </div>
  </Modal>;
}

function RestockDialog({ item, onClose, onRestocked, onManagePackaging }: { item: InventoryItem; onClose: () => void; onRestocked: (updated: InventoryItem) => void; onManagePackaging: () => void }) {
  const packagings = item.packagings ?? [];
  const [mode, setMode] = useState<"package" | "quantity">(packagings.length > 0 ? "package" : "quantity");
  const [packagingId, setPackagingId] = useState(packagings[0]?.packagingId ?? 0);
  const [packs, setPacks] = useState("1");
  const [packPrice, setPackPrice] = useState(packagings[0]?.lastPackPrice === null || packagings[0]?.lastPackPrice === undefined ? "" : String(Number(packagings[0].lastPackPrice)));
  const [quantity, setQuantity] = useState(item.is_whole_unit ? "1" : "100");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pack = packagings.find((entry) => entry.packagingId === packagingId);

  function choosePackaging(id: number) {
    setPackagingId(id);
    const chosen = packagings.find((entry) => entry.packagingId === id);
    setPackPrice(chosen?.lastPackPrice === null || chosen?.lastPackPrice === undefined ? "" : String(Number(chosen.lastPackPrice)));
  }

  const packCount = Number(packs);
  const price = packPrice === "" ? null : Number(packPrice);
  const addedQuantity = mode === "package" ? (pack && Number.isInteger(packCount) && packCount > 0 ? packCount * Number(pack.contentQuantity) : 0) : Number(quantity);
  const costBefore = toOptionalNumber(item.unit_cost);
  const costAfter = mode === "package" && addedQuantity > 0 && price !== null && Number.isFinite(price) && price >= 0
    ? previewWeightedAverage(Number(item.quantity), costBefore, addedQuantity, packCount * price)
    : costBefore;
  const valid = mode === "package"
    ? Boolean(pack) && Number.isInteger(packCount) && packCount > 0 && (price === null || (Number.isFinite(price) && price >= 0))
    : Number.isFinite(addedQuantity) && addedQuantity > 0 && (!item.is_whole_unit || Number.isInteger(addedQuantity));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      const body = mode === "package"
        ? { restock_packaging: true, packaging_id: packagingId, packs: packCount, pack_price: price }
        : { inventory_id: item.inventory_id, quantity_delta: addedQuantity };
      const response = await fetch("/api/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to add stock.");
      onRestocked(payload.data as InventoryItem);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to add stock.");
    } finally {
      setSaving(false);
    }
  }

  const tab = (value: "package" | "quantity", label: string) => <button type="button" onClick={() => setMode(value)} aria-pressed={mode === value} style={{ flex: 1, border: mode === value ? "1px solid #3D2B1F" : "1px solid #E8DDD5", background: mode === value ? "#3D2B1F" : "#FDF9F5", color: mode === value ? "#FDF9F5" : "#6B4C3B", borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{label}</button>;

  return <Modal onClose={onClose} closeDisabled={saving} label="Restock">
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 460, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5" }}>
        <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>Restock</p><p style={{ marginTop: 3, fontSize: 12, color: "#9C8278" }}>{item.item_name} · {formatAmount(Number(item.quantity))} {item.unit_of_measure} on hand</p></div>
        <button type="button" onClick={onClose} disabled={saving} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="flex gap-2">{tab("package", "By package")}{tab("quantity", `By ${item.unit_of_measure}`)}</div>
        {mode === "package" ? (packagings.length === 0 ? (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#F3EDE5", color: "#6B4C3B", fontSize: 12.5, lineHeight: 1.5 }}>
            No packaging set up for this item yet.{" "}
            <button type="button" onClick={onManagePackaging} style={{ border: "none", background: "transparent", color: "#D97706", fontWeight: 700, cursor: "pointer", padding: 0 }}>Add a packaging</button>
          </div>
        ) : <>
          <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Packaging bought</span>
            <select value={packagingId} onChange={(event) => choosePackaging(Number(event.target.value))} style={packagingInput}>
              {packagings.map((entry) => <option key={entry.packagingId} value={entry.packagingId}>{entry.name}{entry.brand ? ` (${entry.brand})` : ""} · {formatAmount(Number(entry.contentQuantity))} {item.unit_of_measure}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Number of packs</span><input autoFocus type="number" min={1} step={1} value={packs} onChange={(event) => setPacks(sanitizeWholeUnitValue(event.target.value))} style={packagingInput} /></label>
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Price per pack (₱)</span><input type="number" min={0} step="0.01" value={packPrice} onChange={(event) => setPackPrice(event.target.value)} placeholder="Not recorded" style={packagingInput} /></label>
          </div>
        </>) : (
          <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Quantity to add ({item.unit_of_measure})</span><input autoFocus type="number" min={0} step={item.is_whole_unit ? 1 : "any"} value={quantity} onChange={(event) => setQuantity(item.is_whole_unit ? sanitizeWholeUnitValue(event.target.value) : event.target.value)} style={packagingInput} /></label>
        )}
        {valid && addedQuantity > 0 && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FFFFFF", border: "1px solid #E8DDD5", fontSize: 12.5, color: "#3D2B1F", lineHeight: 1.6 }}>
          <div><strong>+{formatAmount(addedQuantity)} {item.unit_of_measure}</strong> → {formatAmount(Number(item.quantity) + addedQuantity)} {item.unit_of_measure} on hand</div>
          {mode === "package"
            ? price === null
              ? <div style={{ color: "#9C8278" }}>No price entered: the unit cost stays {costBefore === null ? "unset" : formatPeso(costBefore)}.</div>
              : <div>Average cost per {singularUnit(item.unit_of_measure)}: {costBefore === null ? "not set" : formatPeso(costBefore)} → <strong>{costAfter === null ? "—" : formatPeso(costAfter)}</strong></div>
            : <div style={{ color: "#9C8278" }}>Adding by {item.unit_of_measure} keeps the unit cost as is. Restock by package to update it.</div>}
        </div>}
        {error && <p style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        <button type="button" onClick={onClose} disabled={saving} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: saving ? "default" : "pointer" }}>Cancel</button>
        <button type="submit" disabled={saving || !valid} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: saving || !valid ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 600, cursor: saving || !valid ? "default" : "pointer" }}>{saving ? "Adding..." : "Add stock"}</button>
      </div>
    </form>
  </Modal>;
}

// "1 shot (30 mL) of this item uses 9 grams of Coffee Bean": the ratio (source units per one
// unit of this item) is worked out from two real-world amounts instead of typed directly.
function BindingRatioField({ itemUnit, source, ratio, onChange }: { itemUnit: string; source: InventoryItem | undefined; ratio: string; onChange: (ratio: string) => void }) {
  const [itemAmount, setItemAmount] = useState("1");
  const [sourceAmount, setSourceAmount] = useState(ratio);
  function update(nextItemAmount: string, nextSourceAmount: string) {
    setItemAmount(nextItemAmount);
    setSourceAmount(nextSourceAmount);
    const perItem = Number(nextItemAmount);
    const perSource = Number(nextSourceAmount);
    onChange(perItem > 0 && perSource > 0 ? String(Math.round((perSource / perItem) * 1000000) / 1000000) : "");
  }
  const small: React.CSSProperties = { ...packagingInput, width: 90, padding: "8px 10px" };
  const sourceUnit = source?.unit_of_measure ?? "units";
  return <div className="flex flex-col gap-1.5">
    <span style={packagingLabel}>How much of the source it uses</span>
    <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 13, color: "#3D2B1F" }}>
      <input type="number" min={0} step="any" value={itemAmount} onChange={(event) => update(event.target.value, sourceAmount)} style={small} aria-label={`Amount of this item in ${itemUnit}`} />
      <span>{itemUnit} of this item uses</span>
      <input type="number" min={0} step="any" value={sourceAmount} onChange={(event) => update(itemAmount, event.target.value)} style={small} aria-label={`Amount of source in ${sourceUnit}`} />
      <span>{sourceUnit}{source ? ` of ${source.item_name}` : ""}</span>
    </div>
    <span style={{ fontSize: 11.5, color: "#9C8278" }}>e.g. 30 mL of Espresso Shot uses 9 grams of Coffee Bean{ratio ? ` · saved as ${ratio} ${sourceUnit} per ${singularUnit(itemUnit)}` : ""}</span>
  </div>;
}

// ─── Inventory ────────────────────────────────────────────────────────────────
// Listed the way stock is bought: the package on top (Nescafe Bean Bag 1 kg), opening to the
// measured item inside it (Coffee Bean, grams) and the portions drawn from that item (Espresso
// Shot, mL). Stock itself always lives on the measured item, so recipes never depend on a brand.

type StockStatus = "out" | "low" | "ok";
type StockGroup = { item: InventoryItem; packs: InventoryPackaging[]; portions: InventoryItem[]; status: StockStatus; orphan: boolean; lastRestockedAt: number };
type InventoryFilters = {
  search: string;
  category: string;
  status: "all" | "attention" | "out" | "low" | "ok";
  kind: "all" | "packaged" | "loose" | "portions";
  usage: "all" | "recipe" | "direct" | "addon" | "unused";
  cost: "all" | "set" | "missing";
  sort: "category" | "name" | "stock" | "restocked";
};
type AddPreset = { kind?: "packaged" | "loose" | "portion"; sourceId?: number; existingItemId?: number };

const defaultInventoryFilters: InventoryFilters = { search: "", category: "all", status: "all", kind: "all", usage: "all", cost: "all", sort: "category" };
const inventoryUnitGroups: [string, string[]][] = [["Weight", ["grams", "kg", "oz"]], ["Volume", ["mL", "L"]], ["Count", ["Pieces", "Bottles", "Sachets", "Packs", "Boxes"]]];
const stockStatusLabels: Record<StockStatus, string> = { out: "Out of stock", low: "Running low", ok: "In stock" };

function stockStatusOf(item: InventoryItem): StockStatus {
  if (Number(item.quantity) <= 0) return "out";
  return isLowStock(item) ? "low" : "ok";
}

function unitWord(quantity: number, unit: string): string {
  return Math.abs(quantity) === 1 ? singularUnit(unit) : unit;
}

function formatStock(quantity: number, unit: string): string {
  return `${formatAmount(quantity)} ${unitWord(quantity, unit)}`;
}

function buildStockGroups(items: InventoryItem[]): StockGroup[] {
  const ids = new Set(items.map((item) => item.inventory_id));
  const portionsBySource = new Map<number, InventoryItem[]>();
  for (const item of items) {
    const sourceId = item.derived_from_inventory_id;
    if (sourceId && ids.has(sourceId)) portionsBySource.set(sourceId, [...(portionsBySource.get(sourceId) ?? []), item]);
  }
  return items
    .filter((item) => !item.derived_from_inventory_id || !ids.has(item.derived_from_inventory_id))
    .map((item) => {
      const packs = item.packagings ?? [];
      return {
        item,
        packs,
        portions: (portionsBySource.get(item.inventory_id) ?? []).sort((a, b) => a.item_name.localeCompare(b.item_name)),
        status: stockStatusOf(item),
        orphan: Boolean(item.derived_from_inventory_id),
        lastRestockedAt: packs.reduce((latest, pack) => Math.max(latest, pack.lastRestockedAt ? new Date(pack.lastRestockedAt).getTime() : 0), 0),
      };
    });
}

function groupUses(group: StockGroup) {
  const all = [group.item, ...group.portions];
  const recipe = all.some((item) => (item.recipe_products?.length ?? 0) > 0);
  const direct = all.some((item) => (item.direct_sale_products?.length ?? 0) > 0);
  const addon = all.some((item) => (item.addition_names?.length ?? 0) > 0);
  return { recipe, direct, addon, unused: !recipe && !direct && !addon };
}

// Stock in packs when the item has a package: "3 packs" and "+ 450 grams loose".
function stockInPacks(group: StockGroup): { main: string; sub: string } {
  const quantity = Number(group.item.quantity);
  const unit = group.item.unit_of_measure;
  const pack = group.packs[0];
  const content = pack ? Number(pack.contentQuantity) : 0;
  if (!pack || !(content > 0)) return { main: formatStock(quantity, unit), sub: group.orphan ? "source item missing" : "on hand" };
  if (quantity <= 0) return { main: "0 packs", sub: `0 ${unit}` };
  const packs = Math.floor(quantity / content + 1e-9);
  const loose = quantity - packs * content;
  if (packs === 0) return { main: formatStock(quantity, unit), sub: "less than 1 pack" };
  return { main: `${packs} pack${packs === 1 ? "" : "s"}`, sub: loose > 0.005 ? `+ ${formatStock(loose, unit)} · ${formatStock(quantity, unit)} total` : formatStock(quantity, unit) };
}

function InventoryUsageChips({ item }: { item: InventoryItem }) {
  const chips = [
    ...(item.recipe_products ?? []).map((name) => ({ name, kind: "Recipe", className: "is-recipe" })),
    ...(item.direct_sale_products ?? []).map((name) => ({ name, kind: "Sold directly", className: "is-direct" })),
    ...(item.addition_names ?? []).map((name) => ({ name, kind: "Add-on", className: "is-addon" })),
  ];
  if (chips.length === 0) return <span className="inv-usage-none">Not used by any product or add-on yet</span>;
  return <span className="inv-usage">
    {chips.slice(0, 6).map((chip) => <span key={`${chip.kind}-${chip.name}`} title={chip.kind} className={`inv-usage-chip ${chip.className}`}>{chip.name}</span>)}
    {chips.length > 6 && <span className="inv-usage-chip" title={chips.slice(6).map((chip) => `${chip.name} (${chip.kind})`).join(", ")}>+{chips.length - 6} more</span>}
  </span>;
}

function DialogHeader({ title, sub, onClose, disabled }: { title: string; sub?: string; onClose: () => void; disabled?: boolean }) {
  return <div className="flex items-center justify-between gap-3 px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5" }}>
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 17, color: "#3D2B1F" }}>{title}</p>
      {sub && <p style={{ marginTop: 3, fontSize: 12, color: "#9C8278" }}>{sub}</p>}
    </div>
    <button type="button" onClick={onClose} disabled={disabled} title="Close" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button>
  </div>;
}

function UnitSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} style={{ ...packagingInput, opacity: disabled ? 0.65 : 1 }}>
    {inventoryUnitGroups.map(([label, units]) => <optgroup key={label} label={label}>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</optgroup>)}
  </select>;
}

function WizardField({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
    <span style={packagingLabel}>{label}</span>
    {children}
    {hint && <span style={{ fontSize: 11.5, color: "#9C8278", lineHeight: 1.45 }}>{hint}</span>}
  </label>;
}

const optionalTag = <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>;

// ─── Add inventory: package first, then what is inside it ─────────────────────
function InventoryAddDialog({ items, categories, preset, onClose, onCreated }: { items: InventoryItem[]; categories: string[]; preset: AddPreset; onClose: () => void; onCreated: () => Promise<void> }) {
  const stockItems = items.filter((item) => !item.derived_from_inventory_id);
  const [kind, setKind] = useState<AddPreset["kind"]>(preset.kind);
  const [pack, setPack] = useState({ name: "", brand: "", price: "" });
  const [inside, setInside] = useState<"new" | "existing">(preset.existingItemId ? "existing" : "new");
  const [existingId, setExistingId] = useState(preset.existingItemId ? String(preset.existingItemId) : "");
  const [detail, setDetail] = useState({ name: "", category: "", unit: "grams", content: "", packs: "", loose: "", quantity: "", unitCost: "" });
  const [sourceId, setSourceId] = useState(preset.sourceId ? String(preset.sourceId) : "");
  const [ratio, setRatio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existing = stockItems.find((item) => String(item.inventory_id) === existingId);
  const source = stockItems.find((item) => String(item.inventory_id) === sourceId);
  const unit = kind === "packaged" && inside === "existing" ? existing?.unit_of_measure ?? "units" : detail.unit;
  const whole = isWholeUnit(unit);
  const update = (field: keyof typeof detail, value: string) => setDetail((current) => ({ ...current, [field]: value }));
  const wholeAware = (value: string) => (whole ? sanitizeWholeUnitValue(value) : value);

  const content = Number(detail.content);
  const packCount = detail.packs === "" ? 0 : Number(detail.packs);
  const loose = detail.loose === "" ? 0 : Number(detail.loose);
  const packPrice = pack.price === "" ? null : Number(pack.price);
  const startingStock = packCount * (content > 0 ? content : 0) + (inside === "new" ? loose : 0);
  const perUnitCost = packPrice !== null && content > 0 ? packPrice / content : null;

  const problem = (() => {
    if (kind === "packaged") {
      if (!pack.name.trim()) return "Name the package, e.g. Nescafe Bean Bag 1 kg.";
      if (inside === "new" && (!detail.name.trim() || !detail.category.trim())) return "Name the item inside the package and give it a category.";
      if (inside === "existing" && !existing) return "Choose the item this package contains.";
      if (!(content > 0) || (whole && !Number.isInteger(content))) return `Enter how many ${unit} one package contains${whole ? " (a whole number)" : ""}.`;
      if (packPrice !== null && !(packPrice >= 0)) return "The package price must be 0 or more.";
      if (!Number.isInteger(packCount) || packCount < 0) return "Packages on hand must be a whole number.";
      if (!(loose >= 0) || (whole && !Number.isInteger(loose))) return "The loose amount must be 0 or more.";
      return "";
    }
    if (kind === "loose") {
      if (!detail.name.trim() || !detail.category.trim()) return "Name the item and give it a category.";
      const quantity = Number(detail.quantity || 0);
      if (!(quantity >= 0) || (whole && !Number.isInteger(quantity))) return "Enter the stock on hand (0 or more).";
      if (detail.unitCost !== "" && !(Number(detail.unitCost) >= 0)) return "The unit cost must be 0 or more.";
      return "";
    }
    if (kind === "portion") {
      if (!detail.name.trim() || !detail.category.trim()) return "Name the portion and give it a category.";
      if (!source) return "Choose the item this portion is drawn from.";
      if (!(Number(ratio) > 0)) return "Enter how much of the source one portion uses.";
      return "";
    }
    return "Choose what you are adding.";
  })();

  async function request(method: string, url: string, body: Record<string, unknown>, fallback: string) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || fallback);
    return payload.data as InventoryItem;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem || saving) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      const packaging = { packaging_name: pack.name.trim(), brand: pack.brand.trim(), content_quantity: content, pack_price: packPrice };
      if (kind === "packaged" && inside === "new") {
        await request("POST", "/api/inventory", {
          ingredient_category: detail.category.trim(), item_name: detail.name.trim(), unit_of_measure: detail.unit, quantity: 0, unit_cost: null,
          packaging, initial_packs: packCount, initial_loose: loose,
        }, "Could not add the package.");
      } else if (kind === "packaged" && existing) {
        const updated = await request("POST", "/api/inventory/packaging", { inventory_id: existing.inventory_id, ...packaging }, "Could not add the package.");
        const created = (updated.packagings ?? []).find((entry) => entry.name.toLowerCase() === packaging.packaging_name.toLowerCase());
        if (created && packCount > 0) {
          await request("PATCH", "/api/inventory", { restock_packaging: true, packaging_id: created.packagingId, packs: packCount, pack_price: packPrice }, "The package was added, but its stock could not be added. Restock it from the list.");
        }
      } else if (kind === "loose") {
        await request("POST", "/api/inventory", {
          ingredient_category: detail.category.trim(), item_name: detail.name.trim(), unit_of_measure: detail.unit,
          quantity: Number(detail.quantity || 0), unit_cost: detail.unitCost === "" ? null : Number(detail.unitCost),
        }, "Could not add the item.");
      } else if (kind === "portion" && source) {
        await request("POST", "/api/inventory", {
          ingredient_category: detail.category.trim(), item_name: detail.name.trim(), unit_of_measure: detail.unit,
          derived_from_inventory_id: source.inventory_id, derived_ratio: Number(ratio),
        }, "Could not add the portion.");
      }
      await onCreated();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save.");
      await onCreated().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  }

  const categoryList = <datalist id="inventory-category-options">{categories.map((category) => <option key={category} value={category} />)}</datalist>;
  const kindOptions: { id: NonNullable<AddPreset["kind"]>; title: string; text: string; example: string; Icon: React.FC<{ size?: number }> }[] = [
    { id: "packaged", title: "A packaged product", text: "Bought in a bag, box, carton or case. You restock by package.", example: "Nescafe Bean Bag 1 kg → Coffee Bean (grams)", Icon: IconBox },
    { id: "loose", title: "A loose item", text: "Counted directly, with no package to track.", example: "Ice (grams), Lemons (pieces)", Icon: IconTag },
    { id: "portion", title: "A portion of an item", text: "Has no stock of its own. It is drawn from another item.", example: "Espresso Shot (mL) from Coffee Bean", Icon: IconLink },
  ];

  const titles: Record<string, string> = { packaged: "Add a packaged product", loose: "Add a loose item", portion: "Add a portion" };

  return <Modal onClose={onClose} closeDisabled={saving} label="Add inventory" zIndex={50}>
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 620, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={kind ? titles[kind] : "What are you adding?"} sub={kind === "packaged" ? "Start with the package you buy, then what is inside it." : kind ? undefined : "Pick the option that matches how the café buys it."} onClose={onClose} disabled={saving} />
      {categoryList}
      <div className="flex flex-col gap-5 px-6 py-5" style={{ overflowY: "auto" }}>
        {!kind && <div className="inv-kind-options">
          {kindOptions.map((option) => <button key={option.id} type="button" className="inv-kind-option" onClick={() => { setKind(option.id); setError(""); }}>
            <span className={`inv-kind-icon is-${option.id}`}><option.Icon size={20} /></span>
            <span className="inv-kind-text"><strong>{option.title}</strong><span>{option.text}</span><em>{option.example}</em></span>
            <IconChevron size={16} />
          </button>)}
        </div>}

        {kind === "packaged" && <>
          <section className="inv-step">
            <p className="inv-step-title"><span>1</span>The package</p>
            <div className="inv-step-grid">
              <WizardField label="Package name"><input data-autofocus value={pack.name} onChange={(event) => setPack((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Nescafe Bean Bag 1 kg" style={packagingInput} /></WizardField>
              <WizardField label={<>Brand {optionalTag}</>}><input value={pack.brand} onChange={(event) => setPack((current) => ({ ...current, brand: event.target.value }))} placeholder="e.g. Nescafe" style={packagingInput} /></WizardField>
              <WizardField label={<>Price per package (₱) {optionalTag}</>} hint="Sets the item cost. Restocks update it as a weighted average."><input type="number" min={0} step="0.01" value={pack.price} onChange={(event) => setPack((current) => ({ ...current, price: event.target.value }))} placeholder="e.g. 850" style={packagingInput} /></WizardField>
            </div>
          </section>

          <section className="inv-step">
            <p className="inv-step-title"><span>2</span>What is inside one package</p>
            <div className="inv-segment" role="group" aria-label="Item inside the package">
              <button type="button" aria-pressed={inside === "new"} onClick={() => setInside("new")}>A new item</button>
              <button type="button" aria-pressed={inside === "existing"} onClick={() => setInside("existing")} disabled={stockItems.length === 0}>An item already listed</button>
            </div>
            {inside === "new" ? <div className="inv-step-grid">
              <WizardField label="Item name" hint="What recipes use, without the brand."><input value={detail.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Coffee Bean, Coke Can" style={packagingInput} /></WizardField>
              <WizardField label="Category"><input list="inventory-category-options" value={detail.category} onChange={(event) => update("category", event.target.value)} placeholder="e.g. Coffee, Canned Drinks" style={packagingInput} /></WizardField>
              <WizardField label="Counted in" hint="The unit recipes and sales use."><UnitSelect value={detail.unit} onChange={(value) => update("unit", value)} /></WizardField>
              <WizardField label={`One package contains (${unit})`}><input type="number" min={0} step={whole ? 1 : "any"} value={detail.content} onChange={(event) => update("content", wholeAware(event.target.value))} placeholder={whole ? "e.g. 24" : "e.g. 1000"} style={packagingInput} /></WizardField>
            </div> : <div className="inv-step-grid">
              <WizardField label="Item">
                <select value={existingId} onChange={(event) => setExistingId(event.target.value)} style={packagingInput}>
                  <option value="">Choose an item</option>
                  {stockItems.map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name} ({item.unit_of_measure})</option>)}
                </select>
              </WizardField>
              <WizardField label={`One package contains (${unit})`} hint="Use this for another brand or size of the same item."><input type="number" min={0} step={whole ? 1 : "any"} value={detail.content} onChange={(event) => update("content", wholeAware(event.target.value))} placeholder={whole ? "e.g. 24" : "e.g. 1000"} style={packagingInput} /></WizardField>
            </div>}
          </section>

          <section className="inv-step">
            <p className="inv-step-title"><span>3</span>Stock on hand now</p>
            <div className="inv-step-grid">
              <WizardField label="Full packages"><input type="number" min={0} step={1} value={detail.packs} onChange={(event) => update("packs", sanitizeWholeUnitValue(event.target.value))} placeholder="0" style={packagingInput} /></WizardField>
              {inside === "new" && <WizardField label={<>Plus loose ({unit}) {optionalTag}</>} hint="From an opened package."><input type="number" min={0} step={whole ? 1 : "any"} value={detail.loose} onChange={(event) => update("loose", wholeAware(event.target.value))} placeholder="0" style={packagingInput} /></WizardField>}
            </div>
          </section>

          {(pack.name.trim() || detail.name.trim() || existing) && <div className="inv-preview" aria-live="polite">
            <p className="inv-preview-label">Preview</p>
            <div className="inv-preview-tree">
              <div><span className="inv-kind-icon is-packaged"><IconBox size={15} /></span><strong>{pack.name.trim() || "Package"}</strong>{pack.brand.trim() && <em>{pack.brand.trim()}</em>}{content > 0 && <span>{formatStock(content, unit)} each{packPrice !== null ? ` · ${peso(packPrice)}` : ""}</span>}</div>
              <div className="is-child"><span className="inv-kind-icon is-loose"><IconTag size={15} /></span><strong>{inside === "existing" ? existing?.item_name ?? "Item" : detail.name.trim() || "Item"}</strong><span>{inside === "existing" && existing ? `${formatStock(Number(existing.quantity), unit)} now → ${formatStock(Number(existing.quantity) + packCount * (content > 0 ? content : 0), unit)}` : `${formatStock(startingStock, unit)} on hand`}{perUnitCost !== null ? ` · ${formatPeso(perUnitCost)} per ${singularUnit(unit)}` : ""}</span></div>
            </div>
          </div>}
        </>}

        {kind === "loose" && <section className="inv-step">
          <div className="inv-step-grid">
            <WizardField label="Item name"><input data-autofocus value={detail.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Ice, Lemon" style={packagingInput} /></WizardField>
            <WizardField label="Category"><input list="inventory-category-options" value={detail.category} onChange={(event) => update("category", event.target.value)} placeholder="e.g. Produce" style={packagingInput} /></WizardField>
            <WizardField label="Counted in"><UnitSelect value={detail.unit} onChange={(value) => update("unit", value)} /></WizardField>
            <WizardField label={`Stock on hand (${detail.unit})`}><input type="number" min={0} step={whole ? 1 : "any"} value={detail.quantity} onChange={(event) => update("quantity", wholeAware(event.target.value))} placeholder="0" style={packagingInput} /></WizardField>
          </div>
          <UnitCostField unit={detail.unit} value={detail.unitCost} onChange={(value) => update("unitCost", value)} />
          <p className="inv-hint">If you later start buying it in packages, open the item and add its package.</p>
        </section>}

        {kind === "portion" && <section className="inv-step">
          <div className="inv-step-grid">
            <WizardField label="Portion name"><input data-autofocus value={detail.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Espresso Shot" style={packagingInput} /></WizardField>
            <WizardField label="Category"><input list="inventory-category-options" value={detail.category} onChange={(event) => update("category", event.target.value)} placeholder="e.g. Coffee" style={packagingInput} /></WizardField>
            <WizardField label="Counted in"><UnitSelect value={detail.unit} onChange={(value) => update("unit", value)} /></WizardField>
            <WizardField label="Drawn from">
              <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} style={packagingInput}>
                <option value="">Choose the source item</option>
                {stockItems.map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name} ({item.unit_of_measure})</option>)}
              </select>
            </WizardField>
          </div>
          {source && <BindingRatioField key={source.inventory_id} itemUnit={detail.unit} source={source} ratio={ratio} onChange={setRatio} />}
          <p className="inv-hint">A portion has no stock of its own. Selling it uses up the source item, and its cost follows the source.</p>
        </section>}

        {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
      </div>
      {kind && <div className="flex items-center justify-between gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        {preset.kind ? <span /> : <button type="button" onClick={() => { setKind(undefined); setError(""); }} disabled={saving} className="ui-button ui-button-secondary">Back</button>}
        <div className="flex items-center gap-3">
          {problem && <span className="inv-footer-note">{problem}</span>}
          <button type="submit" disabled={saving || Boolean(problem)} className="ui-button ui-button-primary" style={{ opacity: saving || problem ? 0.55 : 1 }}>{saving ? "Saving…" : kind === "packaged" ? "Add package" : kind === "portion" ? "Add portion" : "Add item"}</button>
        </div>
      </div>}
    </form>
  </Modal>;
}

// ─── Edit a measured item: details and a stock count ──────────────────────────
function InventoryItemDialog({ item, categories, unitLockReason, onClose, onSaved }: { item: InventoryItem; categories: string[]; unitLockReason: string | null; onClose: () => void; onSaved: (updated: InventoryItem) => void }) {
  const [draft, setDraft] = useState({ name: item.item_name, category: item.ingredient_category, unit: item.unit_of_measure, quantity: String(Number(item.quantity)) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const whole = isWholeUnit(draft.unit);
  const counted = Number(draft.quantity);
  const difference = draft.quantity === "" ? 0 : counted - Number(item.quantity);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.category.trim() || draft.quantity === "" || !(counted >= 0)) { setError("Enter a name, a category and a stock count of 0 or more."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ details_edit: true, inventory_id: item.inventory_id, item_name: draft.name.trim(), ingredient_category: draft.category.trim(), unit_of_measure: draft.unit, quantity: counted }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the item.");
      onSaved(payload.data as InventoryItem);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the item.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Edit item">
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 520, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title="Edit item" sub={`${item.item_name} · stock is counted in ${item.unit_of_measure}`} onClose={onClose} disabled={saving} />
      <datalist id="inventory-edit-category-options">{categories.map((category) => <option key={category} value={category} />)}</datalist>
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="inv-step-grid">
          <WizardField label="Item name"><input data-autofocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} style={packagingInput} /></WizardField>
          <WizardField label="Category"><input list="inventory-edit-category-options" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} style={packagingInput} /></WizardField>
          <WizardField label="Counted in" hint={unitLockReason ?? undefined}><UnitSelect value={draft.unit} onChange={(value) => setDraft((current) => ({ ...current, unit: value }))} disabled={Boolean(unitLockReason)} /></WizardField>
          <WizardField label={`Stock count (${draft.unit})`} hint={difference !== 0 && Number.isFinite(difference) ? <span style={{ color: difference > 0 ? "#15803D" : "#B91C1C" }}>{difference > 0 ? "+" : "−"}{formatStock(Math.abs(difference), draft.unit)}, recorded in History as a manual correction</span> : "Change this after a physical count."}>
            <input type="number" min={0} step={whole ? 1 : "any"} value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: whole ? sanitizeWholeUnitValue(event.target.value) : event.target.value }))} style={packagingInput} />
          </WizardField>
        </div>
        <p className="inv-hint">To add stock you bought, use <b>Restock</b> instead, so the cost is averaged and the purchase is recorded.</p>
        {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="ui-button ui-button-primary">{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  </Modal>;
}

// ─── One package / loose item, with what it contains ──────────────────────────
type StockGroupActions = {
  onRestock: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onCost: (item: InventoryItem) => void;
  onPackages: (item: InventoryItem) => void;
  onAddPortion: (item: InventoryItem) => void;
  onEditPortion: (item: InventoryItem) => void;
  onArchive: (item: InventoryItem) => void;
  onHistory: (group: StockGroup) => void;
};

function StockGroupCard({ group, expanded, onToggle, actions }: { group: StockGroup; expanded: boolean; onToggle: () => void; actions: StockGroupActions }) {
  const { item, packs, portions, status, orphan } = group;
  const primary = packs[0];
  const stock = stockInPacks(group);
  const unitCost = toOptionalNumber(item.effective_unit_cost ?? item.unit_cost);
  const packPrice = primary ? toOptionalNumber(primary.lastPackPrice) : null;
  const unit = item.unit_of_measure;
  const kindClass = orphan ? "is-portion" : primary ? "is-packaged" : "is-loose";
  const KindIcon = orphan ? IconLink : primary ? IconBox : IconTag;
  const title = primary ? primary.name : item.item_name;
  const subtitle = orphan
    ? `Portion of an archived item · ${item.ingredient_category}`
    : primary
      ? `${formatStock(Number(primary.contentQuantity), unit)} of ${item.item_name} per pack · ${item.ingredient_category}`
      : `Loose item · counted in ${unit} · ${item.ingredient_category}`;
  const detailId = `inventory-detail-${item.inventory_id}`;

  return <article className={`inv-group is-${status}${expanded ? " is-open" : ""}`}>
    <div className="inv-row">
      <button type="button" className="inv-row-main" onClick={onToggle} aria-expanded={expanded} aria-controls={detailId}>
        <span className="inv-chevron" aria-hidden="true"><IconChevron size={16} /></span>
        <span className={`inv-kind-icon ${kindClass}`}><KindIcon size={18} /></span>
        <span className="inv-title-block">
          <span className="inv-title">
            <span className="inv-title-text">{title}</span>
            {primary?.brand && <span className="inv-brand">{primary.brand}</span>}
            {packs.length > 1 && <span className="inv-more">+{packs.length - 1} more package{packs.length > 2 ? "s" : ""}</span>}
            {portions.length > 0 && <span className="inv-more">{portions.length} portion{portions.length === 1 ? "" : "s"}</span>}
          </span>
          <span className="inv-subtitle">{subtitle}</span>
        </span>
      </button>
      <div className="inv-cell inv-stock">
        <strong className={`is-${status}`}>{stock.main}</strong>
        <span>{stock.sub}</span>
      </div>
      <div className="inv-cell inv-cost">
        <strong>{primary && packPrice !== null ? `${peso(packPrice)} / pack` : unitCost !== null ? formatPeso(unitCost) : "No cost"}</strong>
        <span>{unitCost !== null ? `${primary && packPrice !== null ? `${formatPeso(unitCost)} ` : ""}per ${singularUnit(unit)}` : "cost not set"}</span>
      </div>
      <span className={`inv-status is-${status}`}>{stockStatusLabels[status]}</span>
      <div className="inv-row-actions">
        {!orphan && <button type="button" className="inv-restock" onClick={() => actions.onRestock(item)}><IconPlus size={14} />Restock</button>}
      </div>
    </div>

    {expanded && <div className="inv-detail" id={detailId}>
      {!orphan && <div className="inv-tree">
        <section className="inv-node">
          <header className="inv-node-head">
            <p className="inv-node-label"><IconBox size={13} />Package{packs.length === 1 ? "" : "s"} · how it is bought</p>
            <button type="button" className="inv-mini" onClick={() => actions.onPackages(item)}>{packs.length ? "Manage packages" : "+ Add package"}</button>
          </header>
          {packs.length === 0
            ? <p className="inv-hint">Not bought in a package yet. Add one (for example a 1 kg bag or a case of 24) to restock by package and track prices.</p>
            : <ul className="inv-pack-list">
              {packs.map((entry, index) => {
                const price = toOptionalNumber(entry.lastPackPrice);
                const contentQuantity = Number(entry.contentQuantity);
                return <li key={entry.packagingId}>
                  <div className="inv-pack-name"><strong>{entry.name}</strong>{entry.brand && <span className="inv-brand">{entry.brand}</span>}{index === 0 && entry.lastRestockedAt && <span className="inv-latest">last bought</span>}</div>
                  <span>{formatStock(contentQuantity, unit)} per pack{price !== null ? ` · ${peso(price)} (${formatPeso(price / contentQuantity)} per ${singularUnit(unit)})` : " · no price yet"}{entry.lastRestockedAt ? ` · restocked ${shiftTime(entry.lastRestockedAt)}` : ""}</span>
                </li>;
              })}
            </ul>}
        </section>

        <section className="inv-node is-item">
          <header className="inv-node-head">
            <p className="inv-node-label"><IconTag size={13} />Item inside · stock is counted here</p>
            <div className="inv-node-actions">
              <button type="button" className="inv-mini" onClick={() => actions.onEdit(item)}><IconPencil size={12} />Edit</button>
              <button type="button" className="inv-mini" onClick={() => actions.onHistory(group)}>History</button>
              {!item.is_permanent && <button type="button" className="inv-mini is-danger" onClick={() => actions.onArchive(item)}><IconTrash size={12} />Archive</button>}
            </div>
          </header>
          <div className="inv-facts">
            <div><span>Item</span><strong>{item.item_name}</strong><em>{item.ingredient_category}</em></div>
            <div><span>On hand</span><strong className={`is-${status}`}>{formatStock(Number(item.quantity), unit)}</strong><em>Low at {formatStock(Number(item.low_stock_threshold), unit)}</em></div>
            <div><span>Cost</span><strong>{unitCost === null ? "Not set" : formatPeso(unitCost)}</strong><em>{unitCost === null ? "" : `per ${singularUnit(unit)}`} <button type="button" className="inv-link" onClick={() => actions.onCost(item)}>{unitCost === null ? "Set cost" : "Change"}</button></em></div>
            <div><span>Stock value</span><strong>{unitCost === null ? "—" : peso(Math.max(0, Number(item.quantity)) * unitCost)}</strong><em>at current cost</em></div>
          </div>
          <div className="inv-used"><span>Used in</span><InventoryUsageChips item={item} /></div>
        </section>

        <section className="inv-node">
          <header className="inv-node-head">
            <p className="inv-node-label"><IconLink size={13} />Portions · drawn from {item.item_name}</p>
            <button type="button" className="inv-mini" onClick={() => actions.onAddPortion(item)}>+ Add portion</button>
          </header>
          {portions.length === 0
            ? <p className="inv-hint">None. A portion is measured differently from its source, like an espresso shot (mL) drawn from coffee beans (grams).</p>
            : <ul className="inv-portion-list">
              {portions.map((portion) => {
                const portionStatus = stockStatusOf(portion);
                const portionCost = toOptionalNumber(portion.effective_unit_cost);
                return <li key={portion.inventory_id}>
                  <div className="inv-portion-main">
                    <strong>{portion.item_name}</strong>
                    <span>1 {singularUnit(portion.unit_of_measure)} uses {formatAmount(Number(portion.derived_ratio))} {unitWord(Number(portion.derived_ratio), unit)} of {item.item_name}</span>
                    <InventoryUsageChips item={portion} />
                  </div>
                  <div className="inv-portion-stock">
                    <strong className={`is-${portionStatus}`}>{formatStock(Number(portion.quantity), portion.unit_of_measure)}</strong>
                    <span>{portionCost === null ? "no cost" : `${formatPeso(portionCost)} per ${singularUnit(portion.unit_of_measure)}`}</span>
                  </div>
                  <div className="inv-node-actions">
                    <button type="button" className="inv-mini" onClick={() => actions.onEditPortion(portion)}><IconPencil size={12} />Edit</button>
                    {!portion.is_permanent && <button type="button" className="inv-mini is-danger" onClick={() => actions.onArchive(portion)} title="Archive portion"><IconTrash size={12} /></button>}
                  </div>
                </li>;
              })}
            </ul>}
        </section>
      </div>}
      {orphan && <div className="inv-tree">
        <section className="inv-node is-item">
          <header className="inv-node-head">
            <p className="inv-node-label"><IconLink size={13} />Portion without a source</p>
            <div className="inv-node-actions">
              <button type="button" className="inv-mini" onClick={() => actions.onEditPortion(item)}><IconPencil size={12} />Edit portion</button>
              {!item.is_permanent && <button type="button" className="inv-mini is-danger" onClick={() => actions.onArchive(item)}><IconTrash size={12} />Archive</button>}
            </div>
          </header>
          <p className="inv-hint">The item this portion was drawn from is archived. Restore it from Archives, or edit the portion to draw from another item.</p>
          <div className="inv-used"><span>Used in</span><InventoryUsageChips item={item} /></div>
        </section>
      </div>}
    </div>}
  </article>;
}

// ─── History: every stock change, readable in the app ─────────────────────────
const inventoryChangeLabels: Record<string, string> = {
  created: "Item added", restocked: "Restocked", manual_edit: "Stock corrected", order_deduction: "Used by order",
  void_restore: "Void returned", refund_restore: "Refund returned", deleted: "Item deleted", archived: "Archived",
  restored: "Restored", purged: "Deleted for good", cost_updated: "Cost changed",
};
const inventoryChangeTone: Record<string, string> = {
  created: "item", restocked: "restock", manual_edit: "manual", order_deduction: "order", void_restore: "return", refund_restore: "return",
  deleted: "item", archived: "item", restored: "item", purged: "item", cost_updated: "cost",
};
const historyTypeFilters: { id: string; label: string; types: string[] | null }[] = [
  { id: "all", label: "All changes", types: null },
  { id: "restock", label: "Restocks", types: ["restocked"] },
  { id: "orders", label: "Used by orders", types: ["order_deduction"] },
  { id: "returns", label: "Void & refund returns", types: ["void_restore", "refund_restore"] },
  { id: "manual", label: "Stock corrections", types: ["manual_edit"] },
  { id: "cost", label: "Cost changes", types: ["cost_updated"] },
  { id: "items", label: "Added & archived", types: ["created", "archived", "restored", "purged", "deleted"] },
];
const sourceAppLabels: Record<string, string> = { admin: "Admin", cashier: "Cashier", mobile: "Mobile Menu" };

function describeInventoryLog(log: InventoryLogEntry): string {
  const unit = log.unit_of_measure;
  const costBefore = toOptionalNumber(log.unit_cost_before);
  const costAfter = toOptionalNumber(log.unit_cost_after);
  const costChange = costAfter !== null && costBefore !== costAfter ? ` · cost ${costBefore === null ? "not set" : formatPeso(costBefore)} → ${formatPeso(costAfter)} per ${singularUnit(unit)}` : "";
  switch (log.change_type) {
    case "restocked":
      return log.packaging_name
        ? `${log.packs_added ?? "?"} × ${log.packaging_name}${toOptionalNumber(log.pack_price) !== null ? ` at ${peso(Number(log.pack_price))} each` : ""}${costChange}`
        : `Added by amount${costChange}`;
    case "created":
      return log.packaging_name ? `Started with ${log.packs_added ?? 0} × ${log.packaging_name}` : "New item";
    case "order_deduction": return log.order_id ? `Order #${log.order_id}` : "Order";
    case "void_restore": return log.order_id ? `Order #${log.order_id} voided, stock returned` : "Voided order";
    case "refund_restore": return log.order_id ? `Order #${log.order_id} refunded, stock returned` : "Refunded order";
    case "manual_edit": return "Changed by hand after a count";
    case "cost_updated": return `${costBefore === null ? "Not set" : formatPeso(costBefore)} → ${costAfter === null ? "Not set" : formatPeso(costAfter)} per ${singularUnit(unit)}`;
    case "archived": return "Moved to Archives";
    case "restored": return "Restored from Archives";
    default: return inventoryChangeLabels[log.change_type] ?? log.change_type;
  }
}

function exportInventoryLogs(logs: InventoryLogEntry[], rangeLabel: string, fileStamp: string) {
  const workbook = XLSX.utils.book_new();
  const summaryRows = Object.entries(logs.reduce<Record<string, number>>((counts, log) => {
    const label = inventoryChangeLabels[log.change_type] ?? log.change_type;
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {})).map(([changeType, count]) => ({ "Change Type": changeType, Occurrences: count }));
  const summarySheet = XLSX.utils.json_to_sheet([
    { "Report Range": rangeLabel, Generated: formatFinanceDateTime(new Date().toISOString()), "Total Entries": logs.length },
    {},
    ...summaryRows,
  ]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  const logRows = logs.map((log) => ({
    Date: formatFinanceDateTime(log.created_at),
    Item: log.item_name,
    Category: log.ingredient_category,
    Unit: log.unit_of_measure,
    "Change Type": inventoryChangeLabels[log.change_type] ?? log.change_type,
    "Quantity Before": Number(log.quantity_before),
    "Quantity After": Number(log.quantity_after),
    "Quantity Change": Number(log.quantity_delta),
    Details: describeInventoryLog(log),
    Packaging: log.packaging_name ?? "",
    Packs: log.packs_added ?? "",
    "Price per Pack": toOptionalNumber(log.pack_price) ?? "",
    "Unit Cost Before": log.change_type === "cost_updated" || log.packaging_name ? toOptionalNumber(log.unit_cost_before) ?? "Not set" : "",
    "Unit Cost After": log.change_type === "cost_updated" || log.packaging_name ? toOptionalNumber(log.unit_cost_after) ?? "Not set" : "",
    "Order ID": log.order_id ?? "",
    "Performed By": log.admin_name ?? "",
    Source: sourceAppLabels[log.source_app] ?? log.source_app,
    Shift: log.shift_id ? `#${log.shift_id}` : "",
  }));
  const logSheet = XLSX.utils.json_to_sheet(logRows);
  if (logRows.length > 0) logSheet["!cols"] = Object.keys(logRows[0]).map((key) => ({ wch: Math.min(Math.max(key.length + 2, 14), 36) }));
  XLSX.utils.book_append_sheet(workbook, logSheet, "Change Log");
  XLSX.writeFile(workbook, `brew-houze-inventory-history-${fileStamp}.xlsx`);
}

const HISTORY_PAGE_SIZE = 60;

// Calendar arithmetic on YYYY-MM-DD strings.
function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function InventoryHistory({ focus, onClearFocus }: { focus: { ids: number[]; label: string } | null; onClearFocus: () => void }) {
  const today = getFinanceDateStamp();
  const [range, setRange] = useState<"today" | "7" | "30" | "custom">("7");
  const [custom, setCustom] = useState({ start: today, end: today });
  const [logs, setLogs] = useState<InventoryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [visible, setVisible] = useState(HISTORY_PAGE_SIZE);
  const [exportNote, setExportNote] = useState("");

  const start = range === "custom" ? custom.start : addDays(today, range === "today" ? 0 : 1 - Number(range));
  const end = range === "custom" ? custom.end : today;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      try {
        if (start > end) throw new Error("The start date must not be after the end date.");
        const response = await fetch(`/api/inventory/report?start=${start}&end=${end}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the stock history.");
        if (active) { setLogs(payload.data ?? []); setVisible(HISTORY_PAGE_SIZE); }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load the stock history.");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [start, end]);

  const scoped = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => (!focus || (log.inventory_id !== null && focus.ids.includes(log.inventory_id)))
      && (sourceFilter === "all" || log.source_app === sourceFilter)
      && (!query || log.item_name.toLowerCase().includes(query) || (log.ingredient_category ?? "").toLowerCase().includes(query) || (log.packaging_name ?? "").toLowerCase().includes(query) || (log.admin_name ?? "").toLowerCase().includes(query) || String(log.order_id ?? "") === query.replace("#", "")));
  }, [logs, focus, search, sourceFilter]);
  const typeCounts = useMemo(() => Object.fromEntries(historyTypeFilters.map((filter) => [filter.id, filter.types ? scoped.filter((log) => filter.types!.includes(log.change_type)).length : scoped.length])), [scoped]);
  const shown = useMemo(() => {
    const types = historyTypeFilters.find((filter) => filter.id === typeFilter)?.types ?? null;
    return types ? scoped.filter((log) => types.includes(log.change_type)) : scoped;
  }, [scoped, typeFilter]);

  const days: { day: string; entries: InventoryLogEntry[] }[] = [];
  for (const log of shown.slice(0, visible)) {
    const day = manilaDay(log.created_at);
    if (days.length === 0 || days[days.length - 1].day !== day) days.push({ day, entries: [] });
    days[days.length - 1].entries.push(log);
  }
  const yesterday = addDays(today, -1);
  const dayLabel = (day: string) => day === today ? "Today" : day === yesterday ? "Yesterday" : new Date(`${day}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const rangeLabel = start === end ? start : `${start} to ${end}`;

  function exportShown() {
    if (shown.length === 0) { setExportNote("Nothing to export for these filters."); return; }
    setExportNote("");
    exportInventoryLogs(shown, `${rangeLabel}${focus ? ` · ${focus.label}` : ""}${typeFilter !== "all" ? ` · ${historyTypeFilters.find((filter) => filter.id === typeFilter)?.label}` : ""}`, start === end ? start : `${start}-to-${end}`);
  }

  return <div className="flex flex-col gap-4">
    <div className="inv-toolbar">
      <div className="inv-range" role="group" aria-label="Date range">
        {([["today", "Today"], ["7", "7 days"], ["30", "30 days"], ["custom", "Custom"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={range === id} onClick={() => setRange(id)}>{label}</button>)}
      </div>
      {range === "custom" && <div className="inv-dates">
        <input type="date" value={custom.start} max={custom.end} onChange={(event) => setCustom((current) => ({ ...current, start: event.target.value }))} aria-label="From" />
        <span>to</span>
        <input type="date" value={custom.end} min={custom.start} max={today} onChange={(event) => setCustom((current) => ({ ...current, end: event.target.value }))} aria-label="To" />
      </div>}
      <div className="inv-search">
        <IconSearch size={14} />
        <input value={search} onChange={(event) => { setSearch(event.target.value); setVisible(HISTORY_PAGE_SIZE); }} placeholder="Search item, person, order #" />
        {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
      </div>
      <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="inv-select" aria-label="Done from">
        <option value="all">All apps</option>
        <option value="admin">Admin</option>
        <option value="cashier">Cashier</option>
        <option value="mobile">Mobile Menu</option>
      </select>
      <button type="button" className="inv-secondary" onClick={exportShown} disabled={loading}><IconDownload size={14} />Export {shown.length > 0 ? `${shown.length} ` : ""}to Excel</button>
    </div>

    {focus && <div className="inv-focus">
      <span>Showing the history of <b>{focus.label}</b>{focus.ids.length > 1 ? " and its portions" : ""}</span>
      <button type="button" onClick={onClearFocus}>Show all items <IconX size={12} /></button>
    </div>}

    <div className="inv-type-chips" role="group" aria-label="Type of change">
      {historyTypeFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={typeFilter === filter.id} onClick={() => { setTypeFilter(filter.id); setVisible(HISTORY_PAGE_SIZE); }}>
        {filter.label}<b>{typeCounts[filter.id] ?? 0}</b>
      </button>)}
    </div>
    {exportNote && <p style={{ margin: 0, fontSize: 12.5, color: "#B45309" }}>{exportNote}</p>}

    {loading ? <div className="inv-empty">Loading the stock history…</div>
      : loadError ? <div className="inv-empty is-error">{loadError}</div>
        : shown.length === 0 ? <div className="inv-empty">No stock changes {focus ? `for ${focus.label} ` : ""}in this period{typeFilter !== "all" || search || sourceFilter !== "all" ? " match these filters" : ""}.</div>
          : <div className="invh">
            {days.map((group) => <section key={group.day} className="invh-day">
              <p className="invh-day-label">{dayLabel(group.day)}<span>{group.entries.length} change{group.entries.length === 1 ? "" : "s"}</span></p>
              <ul>
                {group.entries.map((log) => {
                  const delta = Number(log.quantity_delta);
                  const tone = inventoryChangeTone[log.change_type] ?? "item";
                  const who = log.admin_name ?? (log.source_app === "mobile" ? "Mobile order" : "System");
                  return <li key={log.log_id} className="invh-row">
                    <span className="invh-time">{clockTime(log.created_at)}</span>
                    <span className={`invh-type is-${tone}`}>{inventoryChangeLabels[log.change_type] ?? log.change_type}</span>
                    <div className="invh-main">
                      <strong>{log.item_name}</strong>
                      <span>{describeInventoryLog(log)}</span>
                    </div>
                    <div className="invh-delta">
                      {log.change_type === "cost_updated"
                        ? <strong>—</strong>
                        : <strong className={delta > 0 ? "is-plus" : delta < 0 ? "is-minus" : ""}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatStock(Math.abs(delta), log.unit_of_measure)}</strong>}
                      <span>{formatAmount(Number(log.quantity_before))} → {formatAmount(Number(log.quantity_after))}</span>
                    </div>
                    <span className="invh-by">{who}<em>{sourceAppLabels[log.source_app] ?? log.source_app}{log.shift_id ? ` · shift #${log.shift_id}` : ""}</em></span>
                  </li>;
                })}
              </ul>
            </section>)}
            {shown.length > visible && <button type="button" className="inv-secondary" style={{ alignSelf: "center" }} onClick={() => setVisible((count) => count + HISTORY_PAGE_SIZE)}>Show {Math.min(HISTORY_PAGE_SIZE, shown.length - visible)} more of {shown.length - visible}</button>}
            {logs.length >= 5000 && <p className="inv-hint" style={{ textAlign: "center" }}>Only the latest 5,000 changes in this period are loaded. Pick a shorter range to see older ones.</p>}
          </div>}
  </div>;
}

// ─── Inventory page ───────────────────────────────────────────────────────────
function Inventory({
  items: initialItems,
  onAdd,
}: {
  items: InventoryItem[];
  onAdd: (item: InventoryItem) => Promise<void>;
  onUpdate: (updated: InventoryItem) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const confirmAction = useConfirm();
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [tab, setTab] = useState<"stock" | "history">("stock");
  const [filters, setFilters] = useState<InventoryFilters>(defaultInventoryFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [addPreset, setAddPreset] = useState<AddPreset | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [historyFocus, setHistoryFocus] = useState<{ ids: number[]; label: string } | null>(null);
  const [costItem, setCostItem] = useState<InventoryItem | null>(null);
  const [costValue, setCostValue] = useState("");
  const [savingCost, setSavingCost] = useState(false);
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [packagingItem, setPackagingItem] = useState<InventoryItem | null>(null);
  const [bindItem, setBindItem] = useState<InventoryItem | null>(null);
  const [bindDraft, setBindDraft] = useState({ ingredient_category: "", item_name: "", unit_of_measure: "grams", derived_from_inventory_id: "", derived_ratio: "" });
  const [savingBind, setSavingBind] = useState(false);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => setItems(initialItems), 0);
    return () => window.clearTimeout(syncTimer);
  }, [initialItems]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to load inventory.");
    setItems(payload.data ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        await reload();
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load inventory.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reload]);

  const groups = useMemo(() => buildStockGroups(items), [items]);
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.ingredient_category))).sort((a, b) => a.localeCompare(b)), [items]);

  const summary = useMemo(() => ({
    total: groups.length,
    packaged: groups.filter((group) => group.packs.length > 0).length,
    low: groups.filter((group) => group.status === "low").length,
    out: groups.filter((group) => group.status === "out").length,
    noCost: groups.filter((group) => !group.orphan && toOptionalNumber(group.item.unit_cost) === null).length,
    value: groups.reduce((sum, group) => {
      const cost = group.orphan ? null : toOptionalNumber(group.item.unit_cost);
      return cost === null ? sum : sum + Math.max(0, Number(group.item.quantity)) * cost;
    }, 0),
  }), [groups]);

  const { visibleGroups, autoExpanded } = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const matchedChild = new Set<number>();
    const list = groups.filter((group) => {
      if (query) {
        const own = [group.item.item_name, group.item.ingredient_category, ...group.packs.flatMap((pack) => [pack.name, pack.brand ?? ""])].some((text) => text.toLowerCase().includes(query));
        const child = group.portions.some((portion) => portion.item_name.toLowerCase().includes(query));
        if (!own && !child) return false;
        if (!own && child) matchedChild.add(group.item.inventory_id);
      }
      if (filters.category !== "all" && group.item.ingredient_category !== filters.category) return false;
      if (filters.status === "attention" ? group.status === "ok" : filters.status !== "all" && group.status !== filters.status) return false;
      if (filters.kind === "packaged" && group.packs.length === 0) return false;
      if (filters.kind === "loose" && (group.packs.length > 0 || group.orphan)) return false;
      if (filters.kind === "portions" && group.portions.length === 0 && !group.orphan) return false;
      if (filters.usage !== "all" && !groupUses(group)[filters.usage]) return false;
      const hasCost = !group.orphan && toOptionalNumber(group.item.unit_cost) !== null;
      if (filters.cost === "set" && !hasCost) return false;
      if (filters.cost === "missing" && (hasCost || group.orphan)) return false;
      return true;
    });
    const displayName = (group: StockGroup) => (group.packs[0]?.name ?? group.item.item_name).toLowerCase();
    const statusRank: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };
    const fill = (group: StockGroup) => Number(group.item.quantity) / Math.max(1e-9, Number(group.item.low_stock_threshold));
    list.sort((a, b) => {
      if (filters.sort === "stock") return statusRank[a.status] - statusRank[b.status] || fill(a) - fill(b);
      if (filters.sort === "restocked") return b.lastRestockedAt - a.lastRestockedAt || displayName(a).localeCompare(displayName(b));
      if (filters.sort === "category") return a.item.ingredient_category.localeCompare(b.item.ingredient_category) || displayName(a).localeCompare(displayName(b));
      return displayName(a).localeCompare(displayName(b));
    });
    return { visibleGroups: list, autoExpanded: matchedChild };
  }, [groups, filters]);

  const activeFilterCount = (["category", "status", "kind", "usage", "cost"] as const).filter((key) => filters[key] !== "all").length;
  const setFilter = <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const toggle = (id: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  function replaceItem(updated: InventoryItem) {
    setItems((prev) => prev.map((item) => item.inventory_id === updated.inventory_id ? updated : item));
  }

  async function refreshAll() {
    await reload();
    await onAdd(items[0]);
  }

  function startCostEdit(row: InventoryItem) {
    setActionError("");
    setCostItem(row);
    const cost = toOptionalNumber(row.unit_cost);
    setCostValue(cost === null ? "" : String(cost));
  }

  async function submitCostEdit() {
    if (!costItem) return;
    if (costValue !== "" && (!Number.isFinite(Number(costValue)) || Number(costValue) < 0)) {
      setActionError("Enter a valid non-negative unit cost, or leave it blank.");
      return;
    }
    try {
      setSavingCost(true);
      setActionError("");
      const response = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost_edit: true, inventory_id: costItem.inventory_id, unit_cost: costValue === "" ? null : Number(costValue) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to update cost.");
      // Portions derive their cost from this item, so reload them as well.
      setItems((prev) => prev.map((item) => item.inventory_id === costItem.inventory_id ? payload.data : item.derived_from_inventory_id === costItem.inventory_id
        ? { ...item, effective_unit_cost: payload.data.unit_cost === null ? null : Number(payload.data.unit_cost) * Number(item.derived_ratio) }
        : item));
      setCostItem(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update cost.");
    } finally {
      setSavingCost(false);
    }
  }

  function startBindEdit(row: InventoryItem) {
    setActionError("");
    setBindItem(row);
    setBindDraft({
      ingredient_category: row.ingredient_category,
      item_name: row.item_name,
      unit_of_measure: row.unit_of_measure,
      derived_from_inventory_id: row.derived_from_inventory_id ? String(row.derived_from_inventory_id) : "",
      derived_ratio: row.derived_ratio ? String(row.derived_ratio) : "",
    });
  }

  async function saveBindEdit() {
    if (!bindItem) return;
    const normalizedUnit = normalizeInventoryUnit(bindDraft.unit_of_measure);
    if (!bindDraft.ingredient_category.trim() || !bindDraft.item_name.trim() || !normalizedUnit) {
      setActionError("Category, name, and a valid unit are required.");
      return;
    }
    const wantsBound = bindDraft.derived_from_inventory_id !== "";
    if (wantsBound && !(Number(bindDraft.derived_ratio) > 0)) {
      setActionError("Enter how much of the source one portion uses.");
      return;
    }
    try {
      setSavingBind(true);
      setActionError("");
      const response = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bind_edit: true,
          inventory_id: bindItem.inventory_id,
          ingredient_category: bindDraft.ingredient_category,
          item_name: bindDraft.item_name,
          unit_of_measure: normalizedUnit,
          derived_from_inventory_id: wantsBound ? Number(bindDraft.derived_from_inventory_id) : null,
          derived_ratio: wantsBound ? Number(bindDraft.derived_ratio) : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to update the portion.");
      await reload();
      setBindItem(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update the portion.");
    } finally {
      setSavingBind(false);
    }
  }

  async function archiveItem(target: InventoryItem) {
    const portionCount = items.filter((item) => item.derived_from_inventory_id === target.inventory_id).length;
    if (!(await confirmAction({
      title: `Archive ${target.item_name}?`,
      message: <>It is hidden from Inventory and can be restored from Archives.{portionCount > 0 ? <> Its {portionCount} portion{portionCount === 1 ? "" : "s"} will show as having no source until it is restored.</> : null} Items still used by a product or add-on cannot be archived.</>,
      confirmLabel: "Archive item",
    }))) return;
    try {
      setActionError("");
      const response = await fetch("/api/inventory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventory_id: target.inventory_id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to archive the item.");
      setItems((prev) => prev.filter((item) => item.inventory_id !== target.inventory_id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to archive the item.");
    }
  }

  function unitLockReason(item: InventoryItem): string | null {
    if (item.is_permanent || (item.addition_names?.length ?? 0) > 0) return "Locked: products or add-ons are measured in this unit.";
    if ((item.packagings?.length ?? 0) > 0) return "Locked: its packages are measured in this unit.";
    if (items.some((other) => other.derived_from_inventory_id === item.inventory_id)) return "Locked: its portions are measured in this unit.";
    return null;
  }

  const actions: StockGroupActions = {
    onRestock: (item) => { setActionError(""); setStockItem(item); },
    onEdit: (item) => setEditItem(item),
    onCost: startCostEdit,
    onPackages: (item) => setPackagingItem(item),
    onAddPortion: (item) => setAddPreset({ kind: "portion", sourceId: item.inventory_id }),
    onEditPortion: startBindEdit,
    onArchive: (item) => void archiveItem(item),
    onHistory: (group) => { setHistoryFocus({ ids: [group.item.inventory_id, ...group.portions.map((portion) => portion.inventory_id)], label: group.item.item_name }); setTab("history"); },
  };

  const sections: { label: string | null; groups: StockGroup[] }[] = filters.sort === "category"
    ? visibleGroups.reduce<{ label: string | null; groups: StockGroup[] }[]>((acc, group) => {
      const label = group.item.ingredient_category;
      if (acc.length === 0 || acc[acc.length - 1].label !== label) acc.push({ label, groups: [] });
      acc[acc.length - 1].groups.push(group);
      return acc;
    }, [])
    : [{ label: null, groups: visibleGroups }];

  const select = <K extends "category" | "status" | "kind" | "usage" | "cost" | "sort">(key: K, label: string, options: [InventoryFilters[K], string][]) =>
    <label className="inv-filter">
      <span>{label}</span>
      <select value={filters[key]} onChange={(event) => setFilter(key, event.target.value as InventoryFilters[K])} className={`inv-select${key !== "sort" && filters[key] !== "all" ? " is-active" : ""}`}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>;

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-head">
        <div className="inv-tabs" role="tablist" aria-label="Inventory views">
          <button type="button" role="tab" aria-selected={tab === "stock"} onClick={() => setTab("stock")}><IconBox size={15} />Stock</button>
          <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}><IconRotateCcw size={14} />History</button>
        </div>
        {tab === "stock" && <button type="button" className="inv-primary" onClick={() => { setActionError(""); setAddPreset({}); }}><IconPlus size={15} />Add inventory</button>}
      </div>

      {actionError && <div className="inv-alert" role="alert">
        <span>{actionError}</span>
        <button type="button" onClick={() => setActionError("")} title="Dismiss"><IconX size={14} /></button>
      </div>}

      {tab === "history" ? <InventoryHistory focus={historyFocus} onClearFocus={() => setHistoryFocus(null)} /> : loading ? <div className="inv-empty">Loading inventory…</div>
        : error ? <div className="inv-empty is-error">Unable to load inventory: {error}</div>
          : <>
            <div className="inv-summary">
              <button type="button" className="inv-stat" aria-pressed={filters.status === "all" && filters.cost === "all"} onClick={() => setFilters((current) => ({ ...current, status: "all", cost: "all" }))}><span>Stock items</span><strong>{summary.total}</strong><em>{summary.packaged} bought in packages</em></button>
              <button type="button" className="inv-stat is-low" aria-pressed={filters.status === "attention"} onClick={() => setFilters((current) => ({ ...current, status: current.status === "attention" ? "all" : "attention" }))}><span>Need restocking</span><strong>{summary.low + summary.out}</strong><em>{summary.out} out · {summary.low} low</em></button>
              <button type="button" className="inv-stat is-info" aria-pressed={filters.cost === "missing"} onClick={() => setFilters((current) => ({ ...current, cost: current.cost === "missing" ? "all" : "missing" }))}><span>Without a cost</span><strong>{summary.noCost}</strong><em>profit can’t be counted</em></button>
              <div className="inv-stat is-static"><span>Stock value</span><strong>{peso(summary.value)}</strong><em>items with a cost</em></div>
            </div>

            <div className="inv-toolbar">
              <div className="inv-search is-wide">
                <IconSearch size={14} />
                <input value={filters.search} onChange={(event) => setFilter("search", event.target.value)} placeholder="Search package, brand, item or category" />
                {filters.search && <button type="button" onClick={() => setFilter("search", "")} title="Clear search"><IconX size={12} /></button>}
              </div>
              <button type="button" className={`inv-secondary inv-filter-toggle${activeFilterCount ? " is-active" : ""}`} aria-expanded={showFilters} onClick={() => setShowFilters((open) => !open)}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
              <div className={`inv-filters${showFilters ? " is-open" : ""}`}>
                {select("category", "Category", [["all", "All categories"], ...categories.map((category) => [category, category] as [string, string])])}
                {select("status", "Stock", [["all", "Any level"], ["attention", "Needs restocking"], ["out", "Out of stock"], ["low", "Running low"], ["ok", "In stock"]])}
                {select("kind", "Type", [["all", "All types"], ["packaged", "Bought in packages"], ["loose", "Loose items"], ["portions", "Has portions"]])}
                {select("usage", "Used in", [["all", "Anything"], ["recipe", "Recipes"], ["direct", "Sold directly"], ["addon", "Add-ons"], ["unused", "Not used yet"]])}
                {select("cost", "Cost", [["all", "Any"], ["set", "Cost set"], ["missing", "No cost"]])}
                {select("sort", "Sort", [["category", "By category"], ["name", "Name A–Z"], ["stock", "Lowest stock first"], ["restocked", "Recently restocked"]])}
                {(activeFilterCount > 0 || filters.search) && <button type="button" className="inv-clear" onClick={() => setFilters((current) => ({ ...defaultInventoryFilters, sort: current.sort }))}>Clear filters</button>}
              </div>
            </div>

            {groups.length === 0 ? <div className="inv-onboard">
              <span className="inv-kind-icon is-packaged" style={{ width: 52, height: 52 }}><IconBox size={24} /></span>
              <h2>Add the first thing the café buys</h2>
              <p>Start with the package, like a <b>Nescafe Bean Bag 1 kg</b> or a <b>case of 24 Coke cans</b>, then say what is inside it. Recipes and products use the item inside, so switching brands never breaks them.</p>
              <button type="button" className="inv-primary" onClick={() => setAddPreset({})}><IconPlus size={15} />Add inventory</button>
            </div> : visibleGroups.length === 0 ? <div className="inv-empty">
              No stock matches these filters. <button type="button" className="inv-link" onClick={() => setFilters(defaultInventoryFilters)}>Clear filters</button>
            </div> : <div className="inv-list">
              <div className="inv-list-head" aria-hidden="true"><span>Package / item</span><span>On hand</span><span>Cost</span><span>Status</span><span /></div>
              {sections.map((section) => <section key={section.label ?? "all"} className="inv-section">
                {section.label !== null && <p className="inv-section-label">{section.label}<span>{section.groups.length}</span></p>}
                {section.groups.map((group) => <StockGroupCard key={group.item.inventory_id} group={group} expanded={expanded.has(group.item.inventory_id) || autoExpanded.has(group.item.inventory_id)} onToggle={() => toggle(group.item.inventory_id)} actions={actions} />)}
              </section>)}
              <p className="inv-count">Showing {visibleGroups.length} of {groups.length} stock item{groups.length === 1 ? "" : "s"} · tap a row to see what is inside</p>
            </div>}
          </>}
    </div>

    {addPreset && <InventoryAddDialog items={items} categories={categories} preset={addPreset} onClose={() => setAddPreset(null)} onCreated={refreshAll} />}
    {editItem && <InventoryItemDialog item={editItem} categories={categories} unitLockReason={unitLockReason(editItem)} onClose={() => setEditItem(null)} onSaved={(updated) => { replaceItem(updated); setEditItem(null); void reload(); }} />}
    {stockItem && <RestockDialog item={stockItem} onClose={() => setStockItem(null)} onRestocked={(updated) => { replaceItem(updated); setStockItem(null); void reload(); }} onManagePackaging={() => { setPackagingItem(stockItem); setStockItem(null); }} />}
    {packagingItem && <PackagingDialog item={packagingItem} onClose={() => setPackagingItem(null)} onChanged={(updated) => { replaceItem(updated); setPackagingItem(updated); }} />}
    {costItem && (
      <Modal onClose={() => setCostItem(null)} closeDisabled={savingCost} label="Unit cost">
        <form className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 440, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }} onSubmit={(event) => { event.preventDefault(); void submitCostEdit(); }}>
          <DialogHeader title="Unit cost" sub={`${costItem.item_name} · ${costItem.unit_of_measure}`} onClose={() => setCostItem(null)} disabled={savingCost} />
          <div className="flex flex-col gap-3 px-6 py-6">
            <UnitCostField unit={costItem.unit_of_measure} value={costValue} onChange={setCostValue} />
            <p style={{ fontSize: 11.5, color: "#9C8278" }}>This is what the café pays, not the selling price. New sales use the new cost. Past sales keep the cost recorded when they were sold. Restocking by package with a price updates it for you.</p>
            {actionError && <p style={{ fontSize: 12.5, color: "#B91C1C" }}>{actionError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
            <button type="button" onClick={() => setCostItem(null)} disabled={savingCost} className="ui-button ui-button-secondary">Cancel</button>
            <button type="submit" disabled={savingCost} className="ui-button ui-button-primary">{savingCost ? "Saving…" : "Save cost"}</button>
          </div>
        </form>
      </Modal>
    )}
    {bindItem && (
      <Modal onClose={() => setBindItem(null)} closeDisabled={savingBind} label="Edit portion">
        <form className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 520, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }} onSubmit={(event) => { event.preventDefault(); void saveBindEdit(); }}>
          <DialogHeader title="Edit portion" sub={`${bindItem.item_name} · has no stock of its own`} onClose={() => setBindItem(null)} disabled={savingBind} />
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="inv-step-grid">
              <WizardField label="Portion name"><input data-autofocus value={bindDraft.item_name} onChange={(event) => setBindDraft((current) => ({ ...current, item_name: event.target.value }))} style={packagingInput} /></WizardField>
              <WizardField label="Category"><input value={bindDraft.ingredient_category} onChange={(event) => setBindDraft((current) => ({ ...current, ingredient_category: event.target.value }))} style={packagingInput} /></WizardField>
              <WizardField label="Counted in"><UnitSelect value={bindDraft.unit_of_measure} onChange={(value) => setBindDraft((current) => ({ ...current, unit_of_measure: value }))} disabled={Boolean(bindItem.is_permanent || (bindItem.addition_names?.length ?? 0) > 0)} /></WizardField>
              <WizardField label="Drawn from">
                <select value={bindDraft.derived_from_inventory_id} onChange={(event) => setBindDraft((current) => ({ ...current, derived_from_inventory_id: event.target.value }))} style={packagingInput}>
                  <option value="">None: keep its current amount as its own stock</option>
                  {items.filter((item) => !item.derived_from_inventory_id && item.inventory_id !== bindItem.inventory_id).map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name} ({item.unit_of_measure})</option>)}
                </select>
              </WizardField>
            </div>
            {bindDraft.derived_from_inventory_id !== "" && <BindingRatioField key={bindDraft.derived_from_inventory_id} itemUnit={bindDraft.unit_of_measure} source={items.find((item) => String(item.inventory_id) === bindDraft.derived_from_inventory_id)} ratio={bindDraft.derived_ratio} onChange={(ratio) => setBindDraft((current) => ({ ...current, derived_ratio: ratio }))} />}
            {actionError && <p style={{ fontSize: 12.5, color: "#B91C1C" }}>{actionError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
            <button type="button" onClick={() => setBindItem(null)} disabled={savingBind} className="ui-button ui-button-secondary">Cancel</button>
            <button type="submit" disabled={savingBind || !bindDraft.item_name.trim() || !bindDraft.ingredient_category.trim() || (bindDraft.derived_from_inventory_id !== "" && !bindDraft.derived_ratio)} className="ui-button ui-button-primary">{savingBind ? "Saving…" : "Save portion"}</button>
          </div>
        </form>
      </Modal>
    )}
  </div>;
}

// ─── Products ─────────────────────────────────────────────────────────────────
type ProductIngredient = { inventoryId: number; label: string; qty: number; unit: string };
type ProductTemperature = "hot" | "cold" | "both";
type ProductVariant = { id?: number; size: string; price: number; temperature: ProductTemperature; hasSales?: boolean; ingredients: ProductIngredient[] };
// "recipe": made from several inventory components (Americano).
// "stock": a direct-sale item that deducts one inventory item per sale (Coke Can).
type ProductType = "recipe" | "stock";
type Product = { id: number; name: string; description: string; category: string; productType: ProductType; imageUrl: string; imageData: string; price: number; hasSales?: boolean; ingredients: ProductIngredient[]; variants: ProductVariant[] };


type DraftIngredient = { inventoryId: number; qty: string };
type DraftVariant = { size: string; price: string; temperature: "hot" | "cold"; ingredients: DraftIngredient[]; active: boolean };

function areIngredientsAvailable(ingredients: ProductIngredient[], inventory: InventoryItem[]): boolean {
  return ingredients.length > 0 && ingredients.every((ingredient) => {
    const inv = inventory.find((item) => item.inventory_id === ingredient.inventoryId);
    return inv !== undefined && Number(inv.quantity) >= Number(ingredient.qty);
  });
}

const standardVariantSizes = ["8 oz", "12 oz", "16 oz", "22 oz"];
const standardTemperatures = ["hot", "cold"] as const;

function buildFormVariants(product: Product | undefined): DraftVariant[] {
  const existing = product?.variants ?? [];
  const seeded: DraftVariant[] = standardVariantSizes.flatMap((size) => standardTemperatures.map((temperature) => {
    const match = existing.find((variant) => variant.size.trim().toLowerCase() === size.toLowerCase() && (variant.temperature === temperature || variant.temperature === "both"));
    return match
      ? { size: match.size, price: String(match.price), temperature, ingredients: match.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })), active: true }
      : { size, price: "", temperature, ingredients: [], active: false };
  }));

  for (const variant of existing.filter((item) => !standardVariantSizes.some((size) => size.toLowerCase() === item.size.trim().toLowerCase()))) {
    if (variant.temperature === "both") {
      for (const temperature of standardTemperatures) seeded.push({ size: variant.size, price: String(variant.price), temperature, ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })), active: true });
    } else {
      seeded.push({ size: variant.size, price: String(variant.price), temperature: variant.temperature, ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })), active: true });
    }
  }

  if (!product) {
    // Brand-new products start with all size-temperature combinations inactive.
    seeded.forEach((variant, index) => { seeded[index] = { ...variant, active: false }; });
  } else if (existing.length === 0 && product.ingredients.length > 0) {
    // Legacy product stored without variants — seed the first size with its flat-level ingredients.
    const legacyIndex = standardVariantSizes.indexOf("16 oz");
    seeded[legacyIndex * 2] = { size: "16 oz", price: String(product.price), temperature: "hot", ingredients: product.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })), active: true };
  }

  const uniqueVariants = new Map<string, DraftVariant>();
  for (const variant of seeded) {
    const key = `${variant.size.trim().toLowerCase()}-${variant.temperature}`;
    if (!uniqueVariants.has(key)) uniqueVariants.set(key, variant);
  }
  return Array.from(uniqueVariants.values());
}

// ─── Menu: products, add-ons and categories on one page ──────────────────────
// Availability and cost are worked out from current inventory, so the list shows at a glance
// what can be sold right now, what is short, and how much each item earns.

type VariantInsight = { key: string; label: string; short: string; price: number; cost: number | null; available: boolean; missing: string[] };
type ProductInsight = { variants: VariantInsight[]; minPrice: number; maxPrice: number; status: "available" | "partial" | "soldout"; costKnown: boolean; costPartial: boolean; minCost: number | null; marginPct: number | null; shortItems: string[]; stockLeft: number | null };
type MenuTab = "products" | "addons" | "categories";

function menuPrice(value: number): string {
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

// Cost of one serving from the cost of each inventory item it uses; null when any is unknown.
function recipeCost(ingredients: { inventoryId: number; qty: number | string }[], inventory: InventoryItem[]): number | null {
  if (ingredients.length === 0) return null;
  let total = 0;
  for (const ingredient of ingredients) {
    const cost = toOptionalNumber(inventory.find((item) => item.inventory_id === ingredient.inventoryId)?.effective_unit_cost);
    if (cost === null) return null;
    total += cost * Number(ingredient.qty || 0);
  }
  return total;
}

function productInsight(product: Product, inventory: InventoryItem[]): ProductInsight {
  const source: ProductVariant[] = product.variants.length ? product.variants : [{ size: "", price: product.price, temperature: "both", ingredients: product.ingredients }];
  const variants = source.map((variant, index) => {
    const missing = variant.ingredients
      .filter((ingredient) => { const item = inventory.find((entry) => entry.inventory_id === ingredient.inventoryId); return !item || Number(item.quantity) < Number(ingredient.qty); })
      .map((ingredient) => ingredient.label || inventory.find((entry) => entry.inventory_id === ingredient.inventoryId)?.item_name || "an item");
    const temperature = variant.temperature === "hot" ? "Hot" : variant.temperature === "cold" ? "Cold" : "";
    return {
      key: String(variant.id ?? index),
      label: [variant.size, temperature].filter(Boolean).join(" · ") || "Regular",
      short: product.productType === "stock" ? variant.size || "Regular" : `${variant.size.replace(/\s+/g, "") || "Reg"}${temperature ? ` ${temperature[0]}` : ""}`,
      price: Number(variant.price),
      cost: recipeCost(variant.ingredients, inventory),
      available: variant.ingredients.length > 0 && missing.length === 0,
      missing,
    };
  });
  const prices = variants.map((variant) => variant.price);
  const availableCount = variants.filter((variant) => variant.available).length;
  const costed = variants.filter((variant) => variant.cost !== null && variant.price > 0);
  const stockIngredient = product.productType === "stock" ? source[0]?.ingredients[0] : undefined;
  const stockItem = stockIngredient ? inventory.find((item) => item.inventory_id === stockIngredient.inventoryId) : undefined;
  return {
    variants,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    status: availableCount === variants.length ? "available" : availableCount === 0 ? "soldout" : "partial",
    costKnown: costed.length === variants.length && variants.length > 0,
    costPartial: costed.length > 0 && costed.length < variants.length,
    minCost: costed.length ? Math.min(...costed.map((variant) => variant.cost!)) : null,
    marginPct: costed.length ? costed.reduce((sum, variant) => sum + (variant.price - variant.cost!) / variant.price, 0) / costed.length * 100 : null,
    shortItems: Array.from(new Set(variants.flatMap((variant) => variant.missing))),
    stockLeft: stockItem && stockIngredient && Number(stockIngredient.qty) > 0 ? Math.max(0, Math.floor(Number(stockItem.quantity) / Number(stockIngredient.qty) + 1e-9)) : null,
  };
}

function InventoryOptionGroups({ inventory }: { inventory: InventoryItem[] }) {
  const groups = Array.from(new Set(inventory.map((item) => item.ingredient_category))).sort((a, b) => a.localeCompare(b));
  return <>{groups.map((group) => <optgroup key={group} label={group}>
    {inventory.filter((item) => item.ingredient_category === group).sort((a, b) => a.item_name.localeCompare(b.item_name)).map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name} ({formatStock(Number(item.quantity), item.unit_of_measure)} left)</option>)}
  </optgroup>)}</>;
}

const productStatusLabels: Record<ProductInsight["status"], string> = { available: "Available", partial: "Some sizes out", soldout: "Sold out" };

function MenuProductCard({ product, insight, onEdit, onArchive }: { product: Product; insight: ProductInsight; onEdit: () => void; onArchive: () => void }) {
  const image = product.imageData || product.imageUrl.trim();
  const isStock = product.productType === "stock";
  const lowMargin = insight.marginPct !== null && insight.marginPct < 30;
  return <article className={`menu-card is-${insight.status}`}>
    <div className="menu-card-image">
      {image
        ? <Image src={image} alt="" fill unoptimized style={{ objectFit: "cover" }} onError={(event) => { event.currentTarget.style.display = "none"; }} />
        : <div className="menu-card-placeholder"><IconCoffee size={30} /></div>}
      <span className={`menu-avail is-${insight.status}`}><i />{insight.status === "partial" ? `${insight.variants.filter((variant) => variant.available).length} of ${insight.variants.length} available` : productStatusLabels[insight.status]}</span>
      {isStock && <span className="menu-type">Direct sale</span>}
    </div>
    <div className="menu-card-body">
      <div className="menu-card-title">
        <strong>{product.name}</strong>
        <span>{insight.minPrice === insight.maxPrice ? menuPrice(insight.minPrice) : `${menuPrice(insight.minPrice)}–${menuPrice(insight.maxPrice)}`}</span>
      </div>
      <span className="menu-card-category">{product.category || "Uncategorized"}</span>
      {isStock
        ? <p className="menu-line">{insight.stockLeft === null ? "Stock item not found" : `${insight.stockLeft} left in stock`}</p>
        : <div className="menu-sizes">
          {insight.variants.map((variant) => <span key={variant.key} className={`menu-size${variant.available ? "" : " is-out"}`} title={`${variant.label} · ${menuPrice(variant.price)}${variant.available ? "" : ` · needs ${variant.missing.join(", ")}`}`}>{variant.short}</span>)}
        </div>}
      <p className={`menu-line menu-cost${lowMargin ? " is-low" : ""}`}>
        {insight.marginPct === null
          ? <span className="menu-muted">No cost yet · set item costs in Inventory</span>
          : <>Cost {insight.minCost !== null && `from ${peso(insight.minCost)}`} · <b>{Math.round(insight.marginPct)}% margin</b>{insight.costPartial && <span className="menu-muted"> · some sizes without cost</span>}</>}
      </p>
      {insight.shortItems.length > 0 && <p className="menu-short">Needs {insight.shortItems.slice(0, 3).join(", ")}{insight.shortItems.length > 3 ? ` +${insight.shortItems.length - 3}` : ""}</p>}
    </div>
    <div className="menu-card-actions">
      <button type="button" className="menu-edit" onClick={onEdit}><IconPencil size={13} />Edit</button>
      <button type="button" className="menu-archive" onClick={onArchive} title={`Archive ${product.name}`} aria-label={`Archive ${product.name}`}><IconTrash size={14} /></button>
    </div>
  </article>;
}

// ─── Add-ons ──────────────────────────────────────────────────────────────────
function addonInsight(addon: AdditionItem, inventory: InventoryItem[]) {
  const item = inventory.find((entry) => entry.inventory_id === addon.inventory_id);
  const perServing = Number(addon.quantity);
  const servings = item && perServing > 0 ? Math.max(0, Math.floor(Number(item.quantity) / perServing + 1e-9)) : 0;
  const unitCost = toOptionalNumber(item?.effective_unit_cost);
  const cost = unitCost === null ? null : unitCost * perServing;
  const price = Number(addon.price);
  return { item, servings, cost, marginPct: cost !== null && price > 0 ? ((price - cost) / price) * 100 : null, status: servings === 0 ? "soldout" as const : item && isLowStock(item) ? "low" as const : "available" as const };
}

function AddonDialog({ addon, inventory, onClose, onSaved }: { addon: AdditionItem | null; inventory: InventoryItem[]; onClose: () => void; onSaved: (saved: AdditionItem) => void }) {
  const [draft, setDraft] = useState({ name: addon?.addition_name ?? "", inventoryId: addon ? String(addon.inventory_id) : "", quantity: addon ? String(addon.quantity) : "", price: addon ? String(addon.price) : "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const item = inventory.find((entry) => String(entry.inventory_id) === draft.inventoryId);
  const quantity = Number(draft.quantity);
  const price = Number(draft.price);
  const unitCost = toOptionalNumber(item?.effective_unit_cost);
  const cost = unitCost !== null && quantity > 0 ? unitCost * quantity : null;
  const problem = !draft.name.trim() ? "Name the add-on." : !item ? "Choose the inventory item it uses." : !(quantity > 0) || (item.is_whole_unit && !Number.isInteger(quantity)) ? `Enter how much ${item.item_name} one add-on uses${item.is_whole_unit ? " (a whole number)" : ""}.` : draft.price === "" || !(price >= 0) ? "Enter the selling price." : "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem || saving) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/additions", {
        method: addon ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addition_id: addon?.addition_id, addition_name: draft.name.trim(), inventory_id: Number(draft.inventoryId), quantity, price }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the add-on.");
      const row = payload.data;
      onSaved({ addition_id: Number(row.addition_id), addition_name: row.addition_name, inventory_id: Number(row.inventory_id), item_name: row.item_name, unit_of_measure: row.unit_of_measure, quantity: Number(row.quantity), price: Number(row.price) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the add-on.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label={addon ? "Edit add-on" : "Add add-on"}>
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 540, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={addon ? "Edit add-on" : "Add an add-on"} sub="Punched on its own at the POS and attached to any drink in the cart." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="inv-step-grid">
          <WizardField label="Add-on name"><input data-autofocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Extra Shot, Oat Milk" style={packagingInput} /></WizardField>
          <WizardField label="Selling price (₱)"><input type="number" min={0} step="0.01" value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))} placeholder="e.g. 30" style={packagingInput} /></WizardField>
          <WizardField label="Uses inventory item">
            <select value={draft.inventoryId} onChange={(event) => setDraft((current) => ({ ...current, inventoryId: event.target.value }))} style={packagingInput}>
              <option value="">Choose an item</option>
              <InventoryOptionGroups inventory={inventory} />
            </select>
          </WizardField>
          <WizardField label={`Amount per add-on${item ? ` (${item.unit_of_measure})` : ""}`}><input type="number" min={0} step={item?.is_whole_unit ? 1 : "any"} value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: item?.is_whole_unit ? sanitizeWholeUnitValue(event.target.value) : event.target.value }))} placeholder={item?.is_whole_unit ? "e.g. 1" : "e.g. 30"} style={packagingInput} /></WizardField>
        </div>
        {item && quantity > 0 && <div className="inv-preview">
          <p className="inv-preview-label">Preview</p>
          <div className="menu-preview-facts">
            <div><span>Stock</span><strong>{Math.floor(Number(item.quantity) / quantity + 1e-9)} servings</strong><em>{formatStock(Number(item.quantity), item.unit_of_measure)} of {item.item_name}</em></div>
            <div><span>Cost</span><strong>{cost === null ? "Not set" : peso(cost)}</strong><em>{cost === null ? "set the item cost in Inventory" : "per add-on"}</em></div>
            <div><span>Margin</span><strong>{cost !== null && price > 0 ? `${Math.round(((price - cost) / price) * 100)}%` : "—"}</strong><em>{cost !== null && draft.price !== "" ? `${peso(price - cost)} per add-on` : ""}</em></div>
          </div>
        </div>}
        {addon && <p className="inv-hint">Past sales keep the name and price they were sold with.</p>}
        {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        {problem && <span className="inv-footer-note">{problem}</span>}
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Cancel</button>
        <button type="submit" disabled={saving || Boolean(problem)} className="ui-button ui-button-primary" style={{ opacity: saving || problem ? 0.55 : 1 }}>{saving ? "Saving…" : addon ? "Save changes" : "Add add-on"}</button>
      </div>
    </form>
  </Modal>;
}

function AddonsPanel({ addons, loading, error, inventory, onChange }: { addons: AdditionItem[]; loading: boolean; error: string; inventory: InventoryItem[]; onChange: (addons: AdditionItem[]) => void }) {
  const confirmAction = useConfirm();
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "attention">("all");
  const [sort, setSort] = useState<"name" | "price" | "stock">("name");
  const [editing, setEditing] = useState<AdditionItem | null | "new">(null);
  const [actionError, setActionError] = useState("");

  const rows = useMemo(() => addons.map((addon) => ({ addon, insight: addonInsight(addon, inventory) })), [addons, inventory]);
  const shown = rows
    .filter(({ addon, insight }) => {
      const query = search.trim().toLowerCase();
      if (query && !addon.addition_name.toLowerCase().includes(query) && !addon.item_name.toLowerCase().includes(query)) return false;
      if (availability === "available" && insight.status === "soldout") return false;
      if (availability === "attention" && insight.status === "available") return false;
      return true;
    })
    .sort((a, b) => sort === "price" ? Number(a.addon.price) - Number(b.addon.price) : sort === "stock" ? a.insight.servings - b.insight.servings : a.addon.addition_name.localeCompare(b.addon.addition_name));
  const soldOut = rows.filter((row) => row.insight.status === "soldout").length;
  const low = rows.filter((row) => row.insight.status === "low").length;

  async function archive(addon: AdditionItem) {
    if (!(await confirmAction({ title: `Archive ${addon.addition_name}?`, message: "It disappears from the cashier and mobile menus. Past sales keep it, and it can be restored from Archives.", confirmLabel: "Archive add-on" }))) return;
    try {
      setActionError("");
      const response = await fetch("/api/additions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addition_id: addon.addition_id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not archive the add-on.");
      onChange(addons.filter((entry) => entry.addition_id !== addon.addition_id));
    } catch (archiveError) {
      setActionError(archiveError instanceof Error ? archiveError.message : "Could not archive the add-on.");
    }
  }

  return <div className="flex flex-col gap-4">
    <div className="inv-summary">
      <button type="button" className="inv-stat" aria-pressed={availability === "all"} onClick={() => setAvailability("all")}><span>Add-ons</span><strong>{addons.length}</strong><em>offered at the POS and mobile menu</em></button>
      <button type="button" className="inv-stat" aria-pressed={availability === "available"} onClick={() => setAvailability(availability === "available" ? "all" : "available")}><span>Available</span><strong style={{ color: "#15803D" }}>{addons.length - soldOut}</strong><em>enough stock for at least one</em></button>
      <button type="button" className="inv-stat is-low" aria-pressed={availability === "attention"} onClick={() => setAvailability(availability === "attention" ? "all" : "attention")}><span>Need stock</span><strong>{soldOut + low}</strong><em>{soldOut} sold out · {low} low</em></button>
    </div>
    <div className="inv-toolbar">
      <div className="inv-search is-wide">
        <IconSearch size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search add-on or inventory item" />
        {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
      </div>
      <label className="inv-filter"><span>Sort</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="inv-select">
          <option value="name">Name A–Z</option><option value="price">Price, low to high</option><option value="stock">Least stock first</option>
        </select>
      </label>
      <button type="button" className="inv-primary" onClick={() => setEditing("new")} disabled={inventory.length === 0}><IconPlus size={15} />Add add-on</button>
    </div>
    {(actionError || error) && <div className="inv-alert" role="alert"><span>{actionError || error}</span>{actionError && <button type="button" onClick={() => setActionError("")} title="Dismiss"><IconX size={14} /></button>}</div>}
    {loading ? <div className="inv-empty">Loading add-ons…</div>
      : addons.length === 0 ? <div className="inv-onboard">
        <span className="inv-kind-icon is-portion" style={{ width: 52, height: 52 }}><IconSparkle size={22} /></span>
        <h2>No add-ons yet</h2>
        <p>Add-ons like an <b>Extra Shot</b> or <b>Oat Milk</b> are punched at the POS and attached to any drink. Each one uses an inventory item, so stock stays accurate.</p>
        <button type="button" className="inv-primary" onClick={() => setEditing("new")} disabled={inventory.length === 0}><IconPlus size={15} />Add add-on</button>
      </div>
        : shown.length === 0 ? <div className="inv-empty">No add-ons match. <button type="button" className="inv-link" onClick={() => { setSearch(""); setAvailability("all"); }}>Clear filters</button></div>
          : <div className="menu-addon-grid">
            {shown.map(({ addon, insight }) => <article key={addon.addition_id} className={`menu-addon is-${insight.status}`}>
              <div className="menu-addon-top">
                <span className="menu-addon-icon"><IconSparkle size={16} /></span>
                <div className="menu-addon-name"><strong>{addon.addition_name}</strong><span>{formatStock(Number(addon.quantity), addon.unit_of_measure)} of {addon.item_name}</span></div>
                <span className="menu-addon-price">+{menuPrice(Number(addon.price))}</span>
              </div>
              <div className="menu-addon-facts">
                <div><span>Stock</span><strong className={insight.status === "soldout" ? "is-out" : insight.status === "low" ? "is-low" : ""}>{insight.status === "soldout" ? "Sold out" : `${insight.servings} left`}</strong></div>
                <div><span>Cost</span><strong>{insight.cost === null ? "Not set" : peso(insight.cost)}</strong></div>
                <div><span>Margin</span><strong className={insight.marginPct !== null && insight.marginPct < 30 ? "is-low" : ""}>{insight.marginPct === null ? "—" : `${Math.round(insight.marginPct)}%`}</strong></div>
              </div>
              <div className="menu-card-actions">
                <button type="button" className="menu-edit" onClick={() => setEditing(addon)}><IconPencil size={13} />Edit</button>
                <button type="button" className="menu-archive" onClick={() => void archive(addon)} title={`Archive ${addon.addition_name}`} aria-label={`Archive ${addon.addition_name}`}><IconTrash size={14} /></button>
              </div>
            </article>)}
          </div>}
    {editing !== null && <AddonDialog addon={editing === "new" ? null : editing} inventory={inventory} onClose={() => setEditing(null)} onSaved={(saved) => {
      onChange(editing === "new" ? [...addons, saved].sort((a, b) => a.addition_name.localeCompare(b.addition_name)) : addons.map((entry) => entry.addition_id === saved.addition_id ? saved : entry));
      setEditing(null);
    }} />}
  </div>;
}

// ─── Categories ───────────────────────────────────────────────────────────────
function CategoriesPanel({ categories, products, onChange, onRenamed, onShowProducts }: { categories: ProductCategory[]; products: Product[]; onChange: (categories: ProductCategory[]) => void; onRenamed: () => void; onShowProducts: (category: string) => void }) {
  const confirmAction = useConfirm();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) map.set(product.category.toLowerCase(), (map.get(product.category.toLowerCase()) ?? 0) + 1);
    return map;
  }, [products]);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, fallback: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/product-categories", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || fallback);
      return payload.data;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : fallback);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const created = await send("POST", { category_name: name.trim() }, "Could not add the category.");
    if (created) { onChange([...categories, created].sort((a, b) => a.name.localeCompare(b.name))); setName(""); }
  }

  async function saveRename() {
    if (!renaming || !renaming.name.trim()) return;
    const saved = await send("PATCH", { category_id: renaming.id, category_name: renaming.name.trim() }, "Could not rename the category.");
    if (saved) {
      onChange(categories.map((category) => category.id === renaming.id ? { id: renaming.id, name: saved.name } : category).sort((a, b) => a.name.localeCompare(b.name)));
      setRenaming(null);
      onRenamed();
    }
  }

  async function archive(category: ProductCategory) {
    if (!(await confirmAction({ title: `Archive ${category.name}?`, message: "It will no longer be offered when adding products.", confirmLabel: "Archive category" }))) return;
    const archived = await send("DELETE", { category_id: category.id }, "Could not archive the category.");
    if (archived) onChange(categories.filter((entry) => entry.id !== category.id));
  }

  return <div className="flex flex-col gap-4">
    <form onSubmit={add} className="menu-cat-add">
      <div className="inv-search is-wide" style={{ color: "#D97706" }}>
        <IconTag size={15} />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category, e.g. Non-Coffee, Pastries" aria-label="New category name" />
      </div>
      <button type="submit" className="inv-primary" disabled={saving || !name.trim()} style={{ opacity: saving || !name.trim() ? 0.55 : 1 }}><IconPlus size={15} />Add category</button>
    </form>
    {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
    {categories.length === 0 ? <div className="inv-empty">No categories yet. Add one above, then use it when adding products.</div>
      : <ul className="menu-cat-list">
        {categories.map((category) => {
          const count = counts.get(category.name.toLowerCase()) ?? 0;
          const isRenaming = renaming?.id === category.id;
          return <li key={category.id}>
            <span className="menu-cat-icon"><IconTag size={15} /></span>
            {isRenaming
              ? <input data-autofocus autoFocus value={renaming.name} onChange={(event) => setRenaming({ id: category.id, name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveRename(); } if (event.key === "Escape") setRenaming(null); }} style={{ ...packagingInput, flex: 1 }} aria-label={`New name for ${category.name}`} />
              : <div className="menu-cat-name"><strong>{category.name}</strong><span>{count === 0 ? "No products" : `${count} product${count === 1 ? "" : "s"}`}</span></div>}
            <div className="inv-node-actions">
              {isRenaming ? <>
                <button type="button" className="inv-mini" onClick={() => setRenaming(null)} disabled={saving}>Cancel</button>
                <button type="button" className="inv-mini" style={{ background: "#3D2B1F", color: "#FDF9F5", borderColor: "#3D2B1F" }} onClick={() => void saveRename()} disabled={saving || !renaming.name.trim()}>Save</button>
              </> : <>
                {count > 0 && <button type="button" className="inv-mini" onClick={() => onShowProducts(category.name)}>View products</button>}
                <button type="button" className="inv-mini" onClick={() => setRenaming({ id: category.id, name: category.name })}><IconPencil size={12} />Rename</button>
                <button type="button" className="inv-mini is-danger" onClick={() => void archive(category)} disabled={count > 0} title={count > 0 ? "Move or archive its products first" : `Archive ${category.name}`} style={count > 0 ? { opacity: 0.45, cursor: "not-allowed" } : undefined}><IconTrash size={12} /></button>
              </>}
            </div>
          </li>;
        })}
      </ul>}
    <p className="inv-hint">Renaming a category moves its products to the new name. A category can be archived once no products use it.</p>
  </div>;
}

function MenuManagement({ products, inventory, categories, onCategoriesChange, onAdd, onEdit, onDelete, onRefreshProducts }: {
  products: Product[];
  inventory: InventoryItem[];
  categories: ProductCategory[];
  onCategoriesChange: (categories: ProductCategory[]) => void;
  onAdd: (product: Product) => Promise<void>;
  onEdit: (product: Product) => Promise<void>;
  onDelete: (id: number, variantSize?: string) => Promise<void>;
  onRefreshProducts: () => Promise<void>;
}) {
  const [tab, setTab] = useState<MenuTab>("products");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [addons, setAddons] = useState<AdditionItem[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [addonsError, setAddonsError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/additions", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load add-ons.");
        if (active) setAddons((payload.data ?? []).map((row: { id: number; name: string; inventoryId: number; itemName: string; unit: string; quantity: number; price: number }) => ({ addition_id: Number(row.id), addition_name: row.name, inventory_id: Number(row.inventoryId), item_name: row.itemName, unit_of_measure: row.unit, quantity: Number(row.quantity), price: Number(row.price) })));
      } catch (error) {
        if (active) setAddonsError(error instanceof Error ? error.message : "Could not load add-ons.");
      } finally {
        if (active) setAddonsLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const productCount = new Set(products.map((product) => product.id)).size;
  const tabs: { id: MenuTab; label: string; count: number | null; Icon: React.FC<{ size?: number }> }[] = [
    { id: "products", label: "Products", count: productCount, Icon: IconCoffee },
    { id: "addons", label: "Add-ons", count: addonsLoading ? null : addons.length, Icon: IconSparkle },
    { id: "categories", label: "Categories", count: categories.length, Icon: IconTag },
  ];

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-head">
        <div className="inv-tabs" role="tablist" aria-label="Menu sections">
          {tabs.map(({ id, label, count, Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={15} />{label}{count !== null && <span className="menu-tab-count">{count}</span>}</button>)}
        </div>
      </div>
      {tab === "products" && <ProductManagement products={products} inventory={inventory} categories={categories} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />}
      {tab === "addons" && <AddonsPanel addons={addons} loading={addonsLoading} error={addonsError} inventory={inventory} onChange={setAddons} />}
      {tab === "categories" && <CategoriesPanel categories={categories} products={products} onChange={onCategoriesChange} onRenamed={() => void onRefreshProducts()} onShowProducts={(category) => { setCategoryFilter(category); setTab("products"); }} />}
    </div>
  </div>;
}

function ProductManagement({
  products,
  inventory,
  categories,
  onAdd,
  onEdit,
  onDelete,
  categoryFilter,
  onCategoryFilterChange,
}: {
  products: Product[];
  inventory: InventoryItem[];
  categories: ProductCategory[];
  onAdd: (product: Product) => Promise<void>;
  onEdit: (product: Product) => Promise<void>;
  onDelete: (id: number, variantSize?: string) => Promise<void>;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
}) {
  const confirmAction = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const filterCat = categoryFilter;
  const setFilterCat = onCategoryFilterChange;
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "attention" | "nocost">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ProductType>("all");
  const [productSort, setProductSort] = useState<"category" | "name" | "price" | "margin">("category");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const categoryNames = categories.map((category) => category.name);
  const [formCat, setFormCat] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formImageData, setFormImageData] = useState("");
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(-1);
  const [formVariants, setFormVariants] = useState<DraftVariant[]>([
    ...standardVariantSizes.flatMap((size) => standardTemperatures.map((temperature) => ({ size, price: "", temperature, ingredients: [], active: false }))),
  ]);
  const [formType, setFormType] = useState<ProductType>("recipe");
  const [stockInventoryId, setStockInventoryId] = useState(0);
  const [stockQuantity, setStockQuantity] = useState("1");
  const [stockPrice, setStockPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [draggedIngredientIndex, setDraggedIngredientIndex] = useState<number | null>(null);
  const [pendingVariantIndex, setPendingVariantIndex] = useState<number | null>(null);
  const [copiedVariantIndices, setCopiedVariantIndices] = useState<number[]>([]);
  const [variantClipboard, setVariantClipboard] = useState<{ price: string; ingredients: DraftIngredient[] } | null>(null);
  const [ingredientDialogOpen, setIngredientDialogOpen] = useState(false);
  const [ingredientInventoryId, setIngredientInventoryId] = useState(0);
  const [ingredientQuantity, setIngredientQuantity] = useState("");
  const activeVariant = formVariants[selectedVariantIndex];
  const formIngredients = activeVariant?.ingredients ?? [];
  const formCategoryNames = formCat && !categoryNames.includes(formCat) ? [formCat, ...categoryNames] : categoryNames;
  const setFormIngredients = (updater: (previous: DraftIngredient[]) => DraftIngredient[]) => setFormVariants((previous) => previous.map((variant, index) => index === selectedVariantIndex ? { ...variant, ingredients: updater(variant.ingredients) } : variant));
  const stockInventoryItem = inventory.find((item) => item.inventory_id === stockInventoryId);

  function resetForm(product?: Product) {
    setEditingProduct(product ?? null);
    setFormName(product?.name ?? "");
    setFormDescription(product?.description ?? "");
    setFormCat(product?.category ?? categoryNames[0] ?? "");
    setFormImage(product?.imageUrl ?? "");
    setFormImageData(product?.imageData ?? "");
    const variants = buildFormVariants(product);
    setSelectedVariantIndex(product ? variants.findIndex((variant) => variant.active) : -1);
    setFormVariants(variants);
    setCopiedVariantIndices([]);
    setPendingVariantIndex(null);
    const stockVariant = product?.productType === "stock" ? product.variants[0] : undefined;
    setFormType(product?.productType ?? "recipe");
    setStockInventoryId(stockVariant?.ingredients[0]?.inventoryId ?? 0);
    setStockQuantity(stockVariant?.ingredients[0] ? String(stockVariant.ingredients[0].qty) : "1");
    setStockPrice(stockVariant ? String(stockVariant.price) : "");
    setActionError("");
  }

  // Picking the stocked item for a new direct-sale product fills in its name as a starting point.
  function selectStockItem(inventoryId: number) {
    setStockInventoryId(inventoryId);
    const item = inventory.find((entry) => entry.inventory_id === inventoryId);
    if (item && !formName.trim()) setFormName(item.item_name);
  }

  function openModal() { resetForm(); setShowModal(true); }
  function openEditModal(product: Product) { resetForm(product); setShowModal(true); }
  function closeModal() { if (!saving) setShowModal(false); }
  function addIngredientRow() {
    if (inventory.length === 0 || selectedVariantIndex < 0) return;
    setIngredientInventoryId(0);
    setIngredientQuantity("");
    setIngredientDialogOpen(true);
  }

  function confirmIngredientRow() {
    if (!ingredientInventoryId || !ingredientQuantity || Number(ingredientQuantity) <= 0) {
      setActionError("Choose an inventory item and enter a quantity greater than zero.");
      return;
    }
    setCopiedVariantIndices((current) => current.filter((index) => index !== selectedVariantIndex));
    setFormVariants((prev) => prev.map((variant, index) => index === selectedVariantIndex
      ? { ...variant, ingredients: [...variant.ingredients, { inventoryId: ingredientInventoryId, qty: ingredientQuantity }] }
      : variant
    ));
    setIngredientDialogOpen(false);
  }
  function removeIngredientRow(ingredientIndex: number, variantIndex = selectedVariantIndex) {
    setCopiedVariantIndices((current) => current.filter((index) => index !== variantIndex));
    setFormVariants((prev) => prev.map((variant, index) => index === variantIndex ? { ...variant, ingredients: variant.ingredients.filter((_, i) => i !== ingredientIndex) } : variant));
  }

  function activateVariant(index: number) {
    setFormVariants((previous) => previous.map((variant, variantIndex) => variantIndex === index
      ? { ...variant, active: true }
      : variant
    ));
    setSelectedVariantIndex(index);
    setPendingVariantIndex(null);
  }

  function selectVariant(index: number) {
    if (!formVariants[index].active) {
      setPendingVariantIndex(index);
      return;
    }
    setSelectedVariantIndex(index);
  }

  function copyVariantTo(sourceIndex: number, targetIndex: number) {
    const source = formVariants[sourceIndex];
    const target = formVariants[targetIndex];
    if (!source || !target || sourceIndex === targetIndex) return;
    setFormVariants((previous) => previous.map((variant, index) => index === targetIndex
      ? { ...variant, active: true, price: source.price, ingredients: source.ingredients.map((ingredient) => ({ ...ingredient })) }
      : variant
    ));
    setCopiedVariantIndices((current) => current.includes(targetIndex) ? current : [...current, targetIndex]);
    setSelectedVariantIndex(targetIndex);
  }

  function copyActiveVariantRecipe() {
    if (!activeVariant) return;
    setVariantClipboard({
      price: activeVariant.price,
      ingredients: activeVariant.ingredients.map((ingredient) => ({ ...ingredient })),
    });
  }

  function pasteToActiveVariantRecipe() {
    if (!activeVariant || selectedVariantIndex < 0 || !variantClipboard) return;
    setFormVariants((previous) => previous.map((variant, index) => index === selectedVariantIndex
      ? {
          ...variant,
          active: true,
          price: variantClipboard.price,
          ingredients: variantClipboard.ingredients.map((ingredient) => ({ ...ingredient })),
        }
      : variant
    ));
    setCopiedVariantIndices((current) => current.includes(selectedVariantIndex) ? current : [...current, selectedVariantIndex]);
  }

  function importProductImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setActionError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionError("Imported images must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormImage("");
      setFormImageData(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  }

  function removeProductImage() {
    setFormImage("");
    setFormImageData("");
    setActionError("");
  }

  function moveIngredientRow(targetIndex: number, variantIndex = selectedVariantIndex) {
    if (draggedIngredientIndex === null || draggedIngredientIndex === targetIndex) return;
    setCopiedVariantIndices((current) => current.filter((index) => index !== variantIndex));
    setFormVariants((prev) => prev.map((variant, index) => {
      if (index !== variantIndex) return variant;
      const next = [...variant.ingredients];
      const [draggedRow] = next.splice(draggedIngredientIndex, 1);
      next.splice(targetIndex, 0, draggedRow);
      return { ...variant, ingredients: next };
    }));
    setDraggedIngredientIndex(null);
  }

  function buildStockVariants(): ProductVariant[] {
    const price = Number(stockPrice);
    const qty = stockInventoryItem?.is_whole_unit ? Math.round(Number(stockQuantity)) : Number(stockQuantity);
    if (!stockInventoryItem || stockPrice === "" || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty <= 0) return [];
    // Keep an existing direct-sale variant's label so the same variant (and its sales history) is reused.
    const size = editingProduct?.productType === "stock" ? editingProduct.variants[0]?.size || "Regular" : "Regular";
    return [{ size, price, temperature: "both", ingredients: [{ inventoryId: stockInventoryItem.inventory_id, label: stockInventoryItem.item_name, qty, unit: stockInventoryItem.unit_of_measure }] }];
  }

  async function submitProduct() {
    if (!formName.trim() || inventory.length === 0) return;
    const variants = formType === "stock" ? buildStockVariants() : formVariants.filter((variant) => variant.active).map((variant) => ({
      size: variant.size,
      price: Number(variant.price),
      temperature: variant.temperature,
      ingredients: variant.ingredients.filter((row) => row.qty !== "" && Number(row.qty) > 0 && row.inventoryId > 0).map((row) => {
        const inv = inventory.find((item) => item.inventory_id === row.inventoryId);
        const qty = inv?.is_whole_unit ? Math.round(Number(row.qty)) : Number(row.qty);
        return { inventoryId: row.inventoryId, label: inv?.item_name ?? "", qty, unit: inv?.unit_of_measure ?? "" };
      }),
    })).filter((variant) => variant.size && Number.isFinite(variant.price) && variant.price >= 0 && variant.ingredients.length > 0);
    if (variants.length === 0) return;

    setSaving(true);
    setActionError("");
    try {
      const product = {
        id: 0,
        name: formName.trim(),
        description: formDescription.trim(),
        category: formCat || categoryNames[0] || "",
        productType: formType,
        price: variants[0].price,
        imageUrl: formImage.trim(),
        imageData: formImageData,
        ingredients: variants[0].ingredients,
        variants,
      };
      if (editingProduct) {
        await onEdit({ ...product, id: editingProduct.id });
      } else {
        await onAdd(product);
      }
      closeModal();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to add product.");
    } finally {
      setSaving(false);
    }
  }

  // Keep the card list unique by product ID. The API/state can temporarily
  // contain the same product more than once after a save + refresh.
  const uniqueProducts = Array.from(
    new Map(products.map((product) => [product.id, product])).values()
  );
  const insights = new Map(uniqueProducts.map((product) => [product.id, productInsight(product, inventory)]));
  const categoryChips = Array.from(new Set([...categoryNames, ...uniqueProducts.map((product) => product.category)]))
    .filter(Boolean)
    .map((name) => ({ name, count: uniqueProducts.filter((product) => product.category === name).length }))
    .filter((chip) => chip.count > 0 || categoryNames.includes(chip.name));
  const query = search.trim().toLowerCase();
  const filtered = uniqueProducts
    .filter((product) => {
      const insight = insights.get(product.id)!;
      if (filterCat !== "All" && product.category !== filterCat) return false;
      if (typeFilter !== "all" && product.productType !== typeFilter) return false;
      if (availability === "available" && insight.status === "soldout") return false;
      if (availability === "attention" && insight.status === "available") return false;
      if (availability === "nocost" && insight.costKnown) return false;
      if (query && ![product.name, product.category, product.description, ...product.variants.flatMap((variant) => variant.ingredients.map((ingredient) => ingredient.label))].some((text) => (text ?? "").toLowerCase().includes(query))) return false;
      return true;
    })
    .sort((a, b) => {
      const insightA = insights.get(a.id)!;
      const insightB = insights.get(b.id)!;
      if (productSort === "price") return insightA.minPrice - insightB.minPrice || a.name.localeCompare(b.name);
      if (productSort === "margin") return (insightA.marginPct ?? Infinity) - (insightB.marginPct ?? Infinity) || a.name.localeCompare(b.name);
      if (productSort === "category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  const productSections = productSort === "category"
    ? filtered.reduce<{ label: string | null; items: Product[] }[]>((acc, product) => {
      if (acc.length === 0 || acc[acc.length - 1].label !== product.category) acc.push({ label: product.category, items: [] });
      acc[acc.length - 1].items.push(product);
      return acc;
    }, [])
    : [{ label: null, items: filtered }];
  const summary = {
    total: uniqueProducts.length,
    available: uniqueProducts.filter((product) => insights.get(product.id)!.status === "available").length,
    attention: uniqueProducts.filter((product) => insights.get(product.id)!.status !== "available").length,
    noCost: uniqueProducts.filter((product) => !insights.get(product.id)!.costKnown).length,
  };
  const filtersActive = filterCat !== "All" || typeFilter !== "all" || availability !== "all" || query !== "";
  const hasValidVariant = formType === "stock" ? buildStockVariants().length > 0 : formVariants.some((variant) => variant.price !== "" && Number(variant.price) >= 0 && variant.ingredients.some((ingredient) => ingredient.inventoryId > 0 && ingredient.qty !== "" && Number(ingredient.qty) > 0));
  const inputBase: React.CSSProperties = { border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none", width: "100%" };

  return (
    <div className="flex flex-col gap-4">
      <div className="inv-summary">
        <button type="button" className="inv-stat" aria-pressed={availability === "all"} onClick={() => setAvailability("all")}><span>Products</span><strong>{summary.total}</strong><em>on the cashier and mobile menus</em></button>
        <button type="button" className="inv-stat" aria-pressed={availability === "available"} onClick={() => setAvailability(availability === "available" ? "all" : "available")}><span>Can be sold now</span><strong style={{ color: "#15803D" }}>{summary.available}</strong><em>every size has stock</em></button>
        <button type="button" className="inv-stat is-low" aria-pressed={availability === "attention"} onClick={() => setAvailability(availability === "attention" ? "all" : "attention")}><span>Need stock</span><strong>{summary.attention}</strong><em>sold out or some sizes out</em></button>
        <button type="button" className="inv-stat is-info" aria-pressed={availability === "nocost"} onClick={() => setAvailability(availability === "nocost" ? "all" : "nocost")}><span>Without a cost</span><strong>{summary.noCost}</strong><em>margin can’t be shown</em></button>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search is-wide">
          <IconSearch size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or ingredient" />
          {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
        </div>
        <label className="inv-filter"><span>Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className={`inv-select${typeFilter !== "all" ? " is-active" : ""}`}>
            <option value="all">All types</option><option value="recipe">Made to order</option><option value="stock">Direct sale</option>
          </select>
        </label>
        <label className="inv-filter"><span>Sort</span>
          <select value={productSort} onChange={(event) => setProductSort(event.target.value as typeof productSort)} className="inv-select">
            <option value="category">By category</option><option value="name">Name A–Z</option><option value="price">Price, low to high</option><option value="margin">Lowest margin first</option>
          </select>
        </label>
        <button type="button" onClick={openModal} disabled={inventory.length === 0} className="inv-primary" style={{ opacity: inventory.length === 0 ? 0.55 : 1 }}><IconPlus size={15} />Add product</button>
      </div>

      <div className="menu-chips" role="group" aria-label="Category">
        <button type="button" aria-pressed={filterCat === "All"} onClick={() => setFilterCat("All")}>All<b>{uniqueProducts.length}</b></button>
        {categoryChips.map((chip) => <button key={chip.name} type="button" aria-pressed={filterCat === chip.name} onClick={() => setFilterCat(filterCat === chip.name ? "All" : chip.name)}>{chip.name}<b>{chip.count}</b></button>)}
      </div>

      {actionError && <div className="inv-alert" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError("")} title="Dismiss"><IconX size={14} /></button></div>}

      {uniqueProducts.length === 0 ? (
        <div className="inv-onboard">
          <span className="inv-kind-icon is-packaged" style={{ width: 52, height: 52 }}><IconCoffee size={24} /></span>
          <h2>{inventory.length === 0 ? "Add inventory first" : "Add the first product"}</h2>
          <p>{inventory.length === 0 ? "Products are made from inventory items, like coffee beans, milk and cups. Add those in Inventory, then come back to build the menu." : <>A <b>made-to-order</b> product uses a recipe for each size, like a Spanish Latte. A <b>direct-sale</b> product sells a stocked item as it is, like a can of Coke.</>}</p>
          {inventory.length > 0 && <button type="button" className="inv-primary" onClick={openModal}><IconPlus size={15} />Add product</button>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="inv-empty">No products match. {filtersActive && <button type="button" className="inv-link" onClick={() => { setSearch(""); setFilterCat("All"); setTypeFilter("all"); setAvailability("all"); }}>Clear filters</button>}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {productSections.map((section) => <section key={section.label ?? "all"} className="inv-section">
            {section.label !== null && <p className="inv-section-label">{section.label || "Uncategorized"}<span>{section.items.length}</span></p>}
            <div className="menu-grid">
              {section.items.map((product) => <MenuProductCard key={product.id} product={product} insight={insights.get(product.id)!} onEdit={() => openEditModal(product)} onArchive={() => setDeleteTarget(product)} />)}
            </div>
          </section>)}
          <p className="inv-count">Showing {filtered.length} of {uniqueProducts.length} products · availability follows current inventory</p>
        </div>
      )}

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)} label="Archive product" zIndex={50}>
          <div className="rounded-2xl p-6" style={{ width: "100%", maxWidth: 390, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 48px rgba(61,43,31,.2)" }}>
            <h3 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 19, fontWeight: 800 }}>Archive {deleteTarget.name}</h3>
            <p style={{ marginTop: 6, color: "#9C8278", fontSize: 13 }}>Choose what you want to remove.</p>
            <div className="flex flex-col gap-2 mt-5">
              {deleteTarget.hasSales ? (
                <div style={{ padding: "12px 13px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontSize: 13 }}>
                  This product cannot be archived because it has finance records. Remove the related test sale from Finance first.
                </div>
              ) : (
                <>
                  {standardVariantSizes.flatMap((size) => standardTemperatures.map((temperature) => ({ size, temperature }))).filter(({ size, temperature }) => deleteTarget.variants.length > 1 && deleteTarget.variants.some((variant) => variant.size.toLowerCase() === size.toLowerCase() && (variant.temperature === temperature || variant.temperature === "both") && !variant.hasSales)).map(({ size, temperature }) => <button key={`${size}-${temperature}`} onClick={async () => { try { setActionError(""); await onDelete(deleteTarget.id, `${size}|${temperature}`); setDeleteTarget(null); } catch (error) { setActionError(error instanceof Error ? error.message : "Failed to archive variant."); } }} style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#F3EDE5", color: "#6B4C3B", textAlign: "left", cursor: "pointer" }}>Archive {size} · {temperature === "hot" ? "Hot" : "Cold"} only</button>)}
                  <button onClick={async () => { if (!(await confirmAction({ title: `Archive ${deleteTarget.name}?`, message: "The product and all its sizes leave the cashier and mobile menus. It can be restored from Archives.", confirmLabel: "Archive product" }))) return; try { setActionError(""); await onDelete(deleteTarget.id); setDeleteTarget(null); } catch (error) { setActionError(error instanceof Error ? error.message : "Failed to archive product."); } }} style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", textAlign: "left", cursor: "pointer" }}>Archive whole product</button>
                </>
              )}
            </div>
            <button onClick={() => setDeleteTarget(null)} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: "pointer" }}>Cancel</button>
          </div>
        </Modal>
      )}

      {pendingVariantIndex !== null && (
        <Modal onClose={() => setPendingVariantIndex(null)} label="Activate size" zIndex={70}>
          <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 420px)", background: "#FDF9F5", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Activate size</p>
            <h3 style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 19 }}>Activate {formVariants[pendingVariantIndex].size} · {formVariants[pendingVariantIndex].temperature === "hot" ? "Hot" : "Cold"}?</h3>
            <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>This size will be activated with its own price and ingredient recipe. You can use the arrows between Hot and Cold to copy a recipe when needed.</p>
            <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={() => setPendingVariantIndex(null)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => activateVariant(pendingVariantIndex)} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", fontWeight: 700 }}>Activate size</button></div>
          </div>
        </Modal>
      )}
      {ingredientDialogOpen && (
        <Modal onClose={() => setIngredientDialogOpen(false)} label="Add ingredient" zIndex={70}>
          <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 420px)", background: "#FDF9F5", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Add ingredient</p>
            <h3 style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 19 }}>Add to {activeVariant?.size ?? "selected size"}</h3>
            <div className="flex flex-col gap-3" style={{ marginTop: 18 }}>
              <label style={{ color: "#6B4C3B", fontSize: 12 }}>Inventory item<select value={ingredientInventoryId || ""} onChange={(event) => setIngredientInventoryId(Number(event.target.value))} style={{ ...inputBase, width: "100%", marginTop: 6 }}><option value="">Select inventory item</option><InventoryOptionGroups inventory={inventory} /></select></label>
              <label style={{ color: "#6B4C3B", fontSize: 12 }}>Quantity<input type="number" min={0} step={inventory.find((item) => item.inventory_id === ingredientInventoryId)?.is_whole_unit ? 1 : "any"} value={ingredientQuantity} onChange={(event) => setIngredientQuantity(event.target.value)} placeholder="Enter quantity" style={{ ...inputBase, width: "100%", marginTop: 6 }} /></label>
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={() => setIngredientDialogOpen(false)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer" }}>Cancel</button><button type="button" onClick={confirmIngredientRow} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", fontWeight: 700 }}>Add ingredient</button></div>
          </div>
        </Modal>
      )}
      {showModal && (
        <Modal onClose={closeModal} closeDisabled={saving} label="Product" zIndex={50}>
          <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, height: "92vh", maxHeight: 760, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5", flexShrink: 0 }}><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>{editingProduct ? "Edit Product" : "Add New Product"}</p><button onClick={closeModal} disabled={saving} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button></div>
            <div className="flex flex-col gap-5 px-6 py-6" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Name</label><input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Vanilla Cold Brew" style={inputBase} /></div>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Short Description <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><textarea value={formDescription} maxLength={240} onChange={(e) => setFormDescription(e.target.value)} placeholder="e.g. Smooth espresso with steamed milk and caramel." rows={3} style={{ ...inputBase, resize: "vertical" }} /><span style={{ color: "#9C8278", fontSize: 11 }}>{formDescription.length}/240</span></div>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Category</label><select value={formCat || categoryNames[0] || ""} onChange={(e) => setFormCat(e.target.value)} style={{ ...inputBase, cursor: "pointer" }} disabled={categoryNames.length === 0}>{categoryNames.length === 0 ? <option value="">Add a category first</option> : formCategoryNames.map((category) => <option key={category}>{category}</option>)}</select></div>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Product type">
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {([["recipe", "Recipe product", "Made from several inventory items, e.g. Americano"], ["stock", "Direct-sale product", "Sells a stocked item as-is, e.g. Coke Can"]] as const).map(([value, title, hint]) => (
                    <button key={value} type="button" role="radio" aria-checked={formType === value} onClick={() => setFormType(value)} disabled={saving} style={{ border: formType === value ? "2px solid #3D2B1F" : "1px solid #E8DDD5", borderRadius: 10, padding: "10px 12px", background: formType === value ? "#3D2B1F" : "#FDF9F5", color: formType === value ? "#FDF9F5" : "#3D2B1F", textAlign: "left", cursor: saving ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{title}</span>
                      <span style={{ display: "block", marginTop: 3, fontSize: 11, opacity: 0.75 }}>{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Image <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><input value={formImage} onChange={(e) => { setFormImage(e.target.value); setFormImageData(""); }} placeholder="Paste an image URL" style={inputBase} /><div className="flex items-center gap-2" style={{ color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}><span style={{ flex: 1, height: 1, background: "#E8DDD5" }} />or<span style={{ flex: 1, height: 1, background: "#E8DDD5" }} /></div><div className="flex items-center gap-2 flex-wrap"><label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "fit-content", border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 13px", background: "#F3EDE5", color: "#6B4C3B", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><IconImage size={14} /> Choose image<input type="file" accept="image/*" onChange={importProductImage} style={{ display: "none" }} /></label>{(formImageData || formImage.trim()) && <button type="button" onClick={removeProductImage} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "9px 13px", background: "#FEF2F2", color: "#B91C1C", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Remove image</button>}</div>{(formImageData || formImage.trim()) && <div style={{ width: "100%", height: 120, borderRadius: 10, overflow: "hidden", background: "#F3EDE5", position: "relative" }}><Image src={formImageData || formImage.trim()} alt="preview" fill unoptimized style={{ objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>}</div>
              {formType === "recipe" ? (
              <div className="flex flex-col gap-3"><div className="flex flex-col gap-2 rounded-xl p-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", width: "100%" }}>{standardVariantSizes.map((size) => { const hotIndex = formVariants.findIndex((variant) => variant.size.toLowerCase() === size.toLowerCase() && variant.temperature === "hot"); const coldIndex = formVariants.findIndex((variant) => variant.size.toLowerCase() === size.toLowerCase() && variant.temperature === "cold"); const hot = formVariants[hotIndex]; const cold = formVariants[coldIndex]; if (!hot || !cold) return null; const variantCard = (variant: DraftVariant, index: number) => <button key={`${variant.size.trim().toLowerCase()}-${variant.temperature}`} type="button" onClick={() => selectVariant(index)} style={{ border: selectedVariantIndex === index ? "2px solid #3D2B1F" : "1px solid #E8DDD5", borderRadius: 10, padding: "9px 11px", minHeight: 52, background: selectedVariantIndex === index ? "#3D2B1F" : variant.active ? "#FDF9F5" : "#F8F3EE", color: selectedVariantIndex === index ? "#FDF9F5" : variant.active ? "#3D2B1F" : "#B8A59C", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left", opacity: variant.active ? 1 : 0.75 }}><span style={{ display: "block", fontSize: 13 }}>{variant.size} · {variant.temperature === "hot" ? "Hot" : "Cold"}</span><span style={{ display: "block", marginTop: 3, fontSize: 11, fontWeight: 600 }}>{variant.active ? "Configured" : "Activate +"}</span></button>; return <div key={size} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">{variantCard(hot, hotIndex)}<div className="flex flex-col items-center gap-1"><button type="button" title={`Copy Hot to Cold for ${size}`} aria-label={`Copy Hot to Cold for ${size}`} disabled={!hot.active} onClick={() => copyVariantTo(hotIndex, coldIndex)} style={{ width: 28, height: 24, border: "1px solid #E8DDD5", borderRadius: 7, background: "#FDF9F5", color: hot.active ? "#6B4C3B" : "#C9B8AF", cursor: hot.active ? "pointer" : "default", fontWeight: 800 }}>→</button><button type="button" title={`Copy Cold to Hot for ${size}`} aria-label={`Copy Cold to Hot for ${size}`} disabled={!cold.active} onClick={() => copyVariantTo(coldIndex, hotIndex)} style={{ width: 28, height: 24, border: "1px solid #E8DDD5", borderRadius: 7, background: "#FDF9F5", color: cold.active ? "#6B4C3B" : "#C9B8AF", cursor: cold.active ? "pointer" : "default", fontWeight: 800 }}>←</button></div>{variantCard(cold, coldIndex)}</div>; })}</div><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "uppercase" }}>Price</label><input type="number" min={0} value={activeVariant?.price ?? ""} disabled={!activeVariant} onChange={(event) => { if (selectedVariantIndex < 0) return; setCopiedVariantIndices((current) => current.filter((index) => index !== selectedVariantIndex)); setFormVariants((prev) => prev.map((variant, index) => index === selectedVariantIndex ? { ...variant, price: event.target.value } : variant)); }} placeholder="0" style={{ ...inputBase, width: 100, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }} /></div>{activeVariant && (() => { const cost = recipeCost(activeVariant.ingredients.filter((row) => row.inventoryId > 0), inventory); const price = Number(activeVariant.price); if (activeVariant.ingredients.length === 0) return <span className="menu-editor-cost">Add ingredients to see the cost</span>; if (cost === null) return <span className="menu-editor-cost is-muted">Cost unknown: an ingredient has no cost in Inventory</span>; return <span className={`menu-editor-cost${activeVariant.price !== "" && price > 0 && (price - cost) / price < 0.3 ? " is-low" : ""}`}>Cost {peso(cost)}{activeVariant.price !== "" && price > 0 ? ` · margin ${peso(price - cost)} (${Math.round(((price - cost) / price) * 100)}%)` : ""}</span>; })()}</div><div className="flex items-center justify-between"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>{activeVariant ? `${activeVariant.size} ${activeVariant.temperature === "hot" ? "Hot" : "Cold"} Ingredients` : "Select a size and temperature to configure ingredients"}</label><div className="flex items-center gap-2"><button type="button" onClick={() => copyActiveVariantRecipe()} title="Copy selected recipe" aria-label="Copy selected recipe" disabled={!activeVariant} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 30, background: "#F3EDE5", border: "1px solid #E8DDD5", color: activeVariant ? "#6B4C3B" : "#C9B8AF", cursor: activeVariant ? "pointer" : "default" }}><IconCopy size={12} /></button><button type="button" onClick={() => pasteToActiveVariantRecipe()} title="Paste copied recipe" aria-label="Paste copied recipe" disabled={!activeVariant || !variantClipboard} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 30, background: "#F3EDE5", border: "1px solid #E8DDD5", color: activeVariant && variantClipboard ? "#6B4C3B" : "#C9B8AF", cursor: activeVariant && variantClipboard ? "pointer" : "default" }}><IconPaste size={12} /></button><button type="button" onClick={() => addIngredientRow()} disabled={!activeVariant || inventory.length === 0} className="flex items-center gap-1 rounded-lg px-3 py-1" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", fontFamily: "Inter, sans-serif", fontSize: 12, color: "#6B4C3B", cursor: activeVariant && inventory.length ? "pointer" : "default" }}><IconPlus size={11} /> Add</button></div></div>
                <div className="flex flex-col gap-2">{formIngredients.map((row, index) => { const inv = inventory.find((item) => item.inventory_id === row.inventoryId); return <div key={index} draggable={!saving} onDragStart={() => setDraggedIngredientIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveIngredientRow(index)} onDragEnd={() => setDraggedIngredientIndex(null)} className="flex items-center gap-2" style={{ opacity: draggedIngredientIndex === index ? 0.45 : 1, border: draggedIngredientIndex !== null && draggedIngredientIndex !== index ? "1px dashed #D97706" : "1px solid transparent", borderRadius: 10, padding: 2 }}><span title="Drag to reorder" style={{ color: "#9C8278", cursor: saving ? "default" : "grab", fontSize: 18, lineHeight: 1, userSelect: "none" }}>:::</span><select value={row.inventoryId || ""} onChange={(e) => { setCopiedVariantIndices((current) => current.filter((variantIndex) => variantIndex !== selectedVariantIndex)); setFormIngredients((prev) => prev.map((r, i) => i === index ? { ...r, inventoryId: Number(e.target.value) } : r)); }} style={{ ...inputBase, flex: 1, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }}><option value="">Select inventory item</option><InventoryOptionGroups inventory={inventory} /></select><input type="number" min={0} step={inv?.is_whole_unit ? 1 : "any"} placeholder="Qty" value={row.qty} onChange={(e) => { setCopiedVariantIndices((current) => current.filter((variantIndex) => variantIndex !== selectedVariantIndex)); setFormIngredients((prev) => prev.map((r, i) => i === index ? { ...r, qty: inv?.is_whole_unit ? sanitizeWholeUnitValue(e.target.value) : e.target.value } : r)); }} style={{ ...inputBase, width: 70, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }} /><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", width: 55, flexShrink: 0 }}>{inv?.unit_of_measure ?? ""}</span><button onClick={() => removeIngredientRow(index)} disabled={formIngredients.length === 1} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#C0392B", cursor: formIngredients.length === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: formIngredients.length === 1 ? 0.5 : 1 }}><IconX size={12} /></button></div>; })}</div>
              </div>
              ) : (
              <div className="flex flex-col gap-4 rounded-xl p-4" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5" }}>
                <div className="flex flex-col gap-1.5">
                  <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Inventory item sold</label>
                  <select value={stockInventoryId || ""} onChange={(event) => selectStockItem(Number(event.target.value))} disabled={saving} style={{ ...inputBase, cursor: "pointer" }}>
                    <option value="">Select the stocked item</option>
                    <InventoryOptionGroups inventory={inventory} />
                  </select>
                  {stockInventoryItem && <span style={{ fontSize: 11.5, color: "#6B4C3B" }}>In stock: {stockInventoryItem.is_whole_unit ? Math.round(Number(stockInventoryItem.quantity)) : Number(stockInventoryItem.quantity)} {stockInventoryItem.unit_of_measure}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Deducted per sale</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} step={stockInventoryItem?.is_whole_unit ? 1 : "any"} value={stockQuantity} onChange={(event) => setStockQuantity(stockInventoryItem?.is_whole_unit ? sanitizeWholeUnitValue(event.target.value) : event.target.value)} disabled={saving} style={{ ...inputBase, width: 90 }} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278" }}>{stockInventoryItem?.unit_of_measure ?? ""}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Selling price (₱)</label>
                    <input type="number" min={0} step="any" value={stockPrice} onChange={(event) => setStockPrice(event.target.value)} disabled={saving} placeholder="0.00" style={inputBase} />
                  </div>
                </div>
                {(() => {
                  const unitCost = toOptionalNumber(stockInventoryItem?.effective_unit_cost);
                  const costPerSale = unitCost === null ? null : unitCost * Number(stockQuantity || 0);
                  if (!stockInventoryItem) return null;
                  if (costPerSale === null) return <p style={{ margin: 0, fontSize: 11.5, color: "#9C8278" }}>No unit cost set for {stockInventoryItem.item_name} yet. Add one in Inventory Management to track margin.</p>;
                  return <p style={{ margin: 0, fontSize: 11.5, color: "#6B4C3B" }}>Cost per sale {formatPeso(costPerSale)}{stockPrice !== "" && ` · Margin ${formatPeso(Number(stockPrice) - costPerSale)}`}</p>;
                })()}
              </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5", flexShrink: 0, background: "#FDF9F5" }}><button onClick={closeModal} disabled={saving} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#9C8278", cursor: saving ? "default" : "pointer" }}>Cancel</button><button onClick={submitProduct} disabled={saving || !formName.trim() || !hasValidVariant || inventory.length === 0} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: saving || !formName.trim() || !hasValidVariant || inventory.length === 0 ? "#C9B8AF" : "#3D2B1F", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, color: "#FDF9F5", cursor: saving ? "default" : "pointer" }}>{saving ? "Saving…" : editingProduct ? "Save Changes" : "Add Product"}</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

type SalesOrder = {
  order_id: number;
  total_amount: number;
  received_amount?: number | null;
  change_amount?: number | null;
  payment_method?: string | null;
  status: string;
  created_at: string;
  queue_number: number | null;
  queue_status: string | null;
  order_source: string | null;
  punched_by: string;
  items: { product_id: number; product_name: string; product_category: string | null; size_label: string; temperature?: "hot" | "cold" | "both" | null; quantity: number; unit_price: number; additions?: { addition_id: number; addition_name: string; quantity: number; unit_price?: number }[] }[];
};
type SalesSummary = { order_count: number; revenue: number; items_sold: number; cost_of_goods?: number; costed_revenue?: number; gross_profit?: number; uncosted_items?: number };
type TopProduct = { product_name: string; quantity: number; revenue: number };
type DailySale = { sale_date: string; order_count: number; revenue: number; items_sold: number };
type ExportSections = { summary: boolean; dailySales: boolean; orderHistory: boolean; productSales: boolean };

function formatSalesDate(value: string): string {
  const rawValue = String(value ?? "").trim();
  const date = new Date(`${rawValue.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return rawValue || "Unknown date";
  return date.toLocaleDateString(undefined, { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatFinanceDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { timeZone: "Asia/Manila" });
}

function getPaymentMethodLabel(order: Pick<SalesOrder, "payment_method" | "order_source">): string {
  if (order.payment_method !== "online") return "Cash Payment";
  return order.order_source === "online" ? "Mobile Menu Payment" : "Cashier Online Payment";
}

function getFinanceDateStamp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

// ─── Shift reports ────────────────────────────────────────────────────────────
// A shift is the café's business day, opened and closed from the cashier app. It can run past
// midnight, so these reports are the accurate per-night view of sales and the cash drawer.
type ShiftReport = {
  shiftId: number;
  businessDate: string;
  openedAt: string;
  closedAt: string | null;
  openedByName: string | null;
  closedByName: string | null;
  isHistorical: boolean;
  closingNotes: string | null;
  hoursOpen: number;
  startingCash: number;
  countedCash: number | null;
  expectedCash: number;
  cashDifference: number | null;
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
  netSales: number;
  costOfGoods: number;
  uncostedItems: number;
};
type ShiftOrder = { orderId: number; queueNumber: number | null; status: string; total: number; paymentMethod: string; orderSource: string; soldInShift: boolean; reversedInShift: boolean; createdAt: string; reversedAt: string | null; punchedBy: string; items: string };
type ShiftAttendance = { id: number; name: string; role: string; timeIn: string; timeOut: string | null };
type ShiftDetail = { summary: ShiftReport; orders: ShiftOrder[]; attendance: ShiftAttendance[] };

const LONG_OPEN_SHIFT_HOURS = 16;

function peso(value: number): string {
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shiftTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function shiftBusinessDate(value: string): string {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function cashDifferenceLabel(difference: number | null): { text: string; color: string } {
  if (difference === null) return { text: "—", color: "#9C8278" };
  if (Math.abs(difference) < 0.005) return { text: "Balanced", color: "#15803D" };
  return difference > 0 ? { text: `+${peso(difference)} over`, color: "#B45309" } : { text: `−${peso(-difference)} short`, color: "#B91C1C" };
}

function ShiftReports({ period }: { period: string }) {
  const [shifts, setShifts] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/shifts?period=${period}`, { cache: "no-store" });
        const payload = await response.json() as { data?: ShiftReport[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load shift reports.");
        if (active) { setShifts(payload.data ?? []); setError(""); }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load shift reports.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [period]);

  async function openDetail(shiftId: number) {
    setDetailLoadingId(shiftId);
    try {
      const response = await fetch(`/api/shifts?shift_id=${shiftId}`, { cache: "no-store" });
      const payload = await response.json() as { data?: ShiftDetail; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to load the shift.");
      setDetail(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the shift.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  function exportShift(shift: ShiftDetail) {
    const { summary } = shift;
    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      ["Shift", `#${summary.shiftId}${summary.isHistorical ? " (historical, grouped by calendar day)" : ""}`],
      ["Business date", shiftBusinessDate(summary.businessDate)],
      ["Opened", `${shiftTime(summary.openedAt)}${summary.openedByName ? ` by ${summary.openedByName}` : ""}`],
      ["Closed", summary.closedAt ? `${shiftTime(summary.closedAt)}${summary.closedByName ? ` by ${summary.closedByName}` : ""}` : "Still open"],
      [],
      ["Orders", summary.orderCount],
      ["Items sold", summary.itemsSold],
      ["Gross sales", summary.grossSales],
      ["Voids", summary.voidCount],
      ["Refunds", summary.refundCount],
      ["Voided/refunded amount", summary.reversedAmount],
      ["Net sales", summary.netSales],
      ["Cost of goods", summary.uncostedItems > 0 ? `${summary.costOfGoods} (${summary.uncostedItems} items without cost)` : summary.costOfGoods],
      ["Gross profit", summary.uncostedItems > 0 ? "Incomplete" : summary.netSales - summary.costOfGoods],
      [],
      ["Starting cash", summary.startingCash],
      ["Cash sales", summary.cashSales],
      ["Cash given back", summary.cashReversed],
      ["Expected cash", summary.expectedCash],
      ["Counted cash", summary.countedCash ?? "Not counted"],
      ["Difference", summary.cashDifference ?? "—"],
      ["Paid online", summary.onlineSales],
      ["Closing notes", summary.closingNotes ?? ""],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");
    if (shift.orders.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(shift.orders.map((order) => ({
        "Queue #": order.queueNumber ?? "",
        "Order Ref": order.orderId,
        Time: shiftTime(order.createdAt),
        Items: order.items,
        Total: order.total,
        Payment: order.paymentMethod === "online" ? "Online" : "Cash",
        Source: order.orderSource === "online" ? "Mobile" : "Counter",
        "Punched By": order.punchedBy,
        Status: order.status,
        "In This Shift": order.soldInShift && order.reversedInShift ? "Sold and reversed" : order.soldInShift ? "Sold" : "Reversed (sold in an earlier shift)",
      }))), "Orders");
    }
    if (shift.attendance.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(shift.attendance.map((log) => ({
        Employee: log.name,
        Role: log.role,
        "Time In": shiftTime(log.timeIn),
        "Time Out": log.timeOut ? shiftTime(log.timeOut) : "Still signed in",
      }))), "Attendance");
    }
    XLSX.writeFile(workbook, `brew-houze-shift-${summary.shiftId}-${summary.businessDate}.xlsx`);
  }

  const th: React.CSSProperties = { padding: "10px 12px", textAlign: "left", color: "#9C8278", fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid #E8DDD5" };
  const td: React.CSSProperties = { padding: "11px 12px", fontSize: 12.5, color: "#3D2B1F", borderBottom: "1px solid #F0E8E2", whiteSpace: "nowrap" };

  return <section className="mb-7">
    <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
      <div>
        <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Shifts</h3>
        <p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>Each shift is one business day, opened and closed from the cashier app, even past midnight. Voids and refunds count in the shift they happened in.</p>
      </div>
    </div>
    {error && <p style={{ color: "#B91C1C", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
    <div className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F3EDE5" }}>
            <th style={th}>Shift</th><th style={th}>Business date</th><th style={th}>Opened → Closed</th><th style={{ ...th, textAlign: "right" }}>Orders</th><th style={{ ...th, textAlign: "right" }}>Net sales</th><th style={{ ...th, textAlign: "right" }}>Voids / Refunds</th><th style={{ ...th, textAlign: "right" }}>Expected cash</th><th style={{ ...th, textAlign: "right" }}>Counted</th><th style={th}>Drawer</th><th style={th} />
          </tr></thead>
          <tbody>
            {loading && shifts.length === 0 && <tr><td colSpan={10} style={{ ...td, color: "#9C8278", textAlign: "center", padding: 24 }}>Loading shifts…</td></tr>}
            {!loading && shifts.length === 0 && <tr><td colSpan={10} style={{ ...td, color: "#9C8278", textAlign: "center", padding: 24 }}>No shifts in this period.</td></tr>}
            {shifts.map((shift) => {
              const open = shift.closedAt === null;
              const longOpen = open && shift.hoursOpen >= LONG_OPEN_SHIFT_HOURS;
              const difference = cashDifferenceLabel(shift.cashDifference);
              return <tr key={shift.shiftId} style={{ background: open ? (longOpen ? "#FFFBEB" : "#F0FDF4") : undefined }}>
                <td style={td}><strong>#{shift.shiftId}</strong>{shift.isHistorical && <span title="Created from calendar-day records before shifts were introduced" style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 6, background: "#F3EDE5", color: "#9C8278", fontSize: 10 }}>historical</span>}</td>
                <td style={td}>{shiftBusinessDate(shift.businessDate)}</td>
                <td style={td}>
                  {shiftTime(shift.openedAt)} → {open ? <strong style={{ color: longOpen ? "#B45309" : "#15803D" }}>{longOpen ? `Open ${Math.floor(shift.hoursOpen)}h — not closed yet` : "Open now"}</strong> : shiftTime(shift.closedAt)}
                  {(shift.openedByName || shift.closedByName) && <div style={{ color: "#9C8278", fontSize: 11, marginTop: 2 }}>{shift.openedByName ?? "—"}{shift.closedByName ? ` → ${shift.closedByName}` : ""}</div>}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{shift.orderCount}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{peso(shift.netSales)}</td>
                <td style={{ ...td, textAlign: "right", color: shift.reversedAmount > 0 ? "#B91C1C" : "#9C8278" }}>{shift.voidCount + shift.refundCount > 0 ? `${shift.voidCount + shift.refundCount} · −${peso(shift.reversedAmount)}` : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{shift.isHistorical ? "—" : peso(shift.expectedCash)}</td>
                <td style={{ ...td, textAlign: "right" }}>{shift.countedCash === null ? "—" : peso(shift.countedCash)}</td>
                <td style={{ ...td, color: difference.color, fontWeight: 700 }}>{shift.isHistorical ? "—" : open ? "Not counted yet" : difference.text}</td>
                <td style={{ ...td, textAlign: "right" }}><button type="button" onClick={() => void openDetail(shift.shiftId)} disabled={detailLoadingId !== null} style={{ border: "1px solid #E8DDD5", background: "#FFFFFF", color: "#6B4C3B", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{detailLoadingId === shift.shiftId ? "Loading…" : "View"}</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>

    {detail && (() => {
      const summary = detail.summary;
      const difference = cashDifferenceLabel(summary.cashDifference);
      const row = (label: string, value: string, strong = false, color?: string) => <div className="flex justify-between" style={{ padding: "5px 0", fontSize: strong ? 14 : 13, fontWeight: strong ? 800 : 500, color: color ?? "#3D2B1F" }}><span style={{ color: strong ? color ?? "#3D2B1F" : "#6B4C3B" }}>{label}</span><span>{value}</span></div>;
      return <Modal onClose={() => setDetail(null)} labelledBy="shift-detail-title">
        <section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 820px)", maxHeight: "90vh", overflowY: "auto", background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 18, boxShadow: "0 18px 50px rgba(61,43,31,.25)" }}>
          <div className="flex items-start justify-between gap-3" style={{ padding: "18px 22px", background: "#F3EDE5", borderBottom: "1px solid #E8DDD5" }}>
            <div>
              <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Shift report{summary.isHistorical ? " · historical" : ""}</p>
              <h2 id="shift-detail-title" style={{ margin: "5px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, color: "#3D2B1F" }}>Shift #{summary.shiftId} · {shiftBusinessDate(summary.businessDate)}</h2>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 12 }}>{shiftTime(summary.openedAt)}{summary.openedByName ? ` (${summary.openedByName})` : ""} → {summary.closedAt ? `${shiftTime(summary.closedAt)}${summary.closedByName ? ` (${summary.closedByName})` : ""}` : "still open"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => exportShift(detail)} className="flex items-center gap-2" style={{ border: "1px solid #E8DDD5", background: "#FFFFFF", color: "#3D2B1F", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><IconDownload size={13} />Export .xlsx</button>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close shift report" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 26, lineHeight: 1, cursor: "pointer" }}>×</button>
            </div>
          </div>
          <div className="grid gap-5" style={{ padding: "16px 22px", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div>
              <p style={{ margin: "0 0 4px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Sales</p>
              {row(`Orders (${summary.itemsSold} items${summary.mobileOrderCount ? `, ${summary.mobileOrderCount} mobile` : ""})`, String(summary.orderCount))}
              {row("Gross sales", peso(summary.grossSales))}
              {row(`Voids (${summary.voidCount}) & refunds (${summary.refundCount})`, `−${peso(summary.reversedAmount)}`, false, summary.reversedAmount > 0 ? "#B91C1C" : undefined)}
              <div style={{ borderTop: "1px solid #E8DDD5" }}>{row("Net sales", peso(summary.netSales), true)}</div>
              {row("Cost of goods", summary.uncostedItems > 0 ? `${peso(summary.costOfGoods)}*` : peso(summary.costOfGoods))}
              {row("Gross profit", summary.uncostedItems > 0 ? "Incomplete*" : peso(summary.netSales - summary.costOfGoods), true, "#2E7D32")}
              {summary.uncostedItems > 0 && <p style={{ margin: "4px 0 0", color: "#9C8278", fontSize: 11 }}>* {summary.uncostedItems} item{summary.uncostedItems === 1 ? "" : "s"} sold without a complete inventory cost.</p>}
            </div>
            <div>
              <p style={{ margin: "0 0 4px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Cash drawer</p>
              {summary.isHistorical ? <p style={{ color: "#9C8278", fontSize: 12.5 }}>Not tracked: this day was recorded before shifts and cash counts were introduced.</p> : <>
                {row("Starting cash", peso(summary.startingCash))}
                {row("+ Cash sales", peso(summary.cashSales))}
                {row("− Cash given back", peso(summary.cashReversed))}
                <div style={{ borderTop: "1px solid #E8DDD5" }}>{row("Expected in drawer", peso(summary.expectedCash), true)}</div>
                {row("Counted", summary.countedCash === null ? "Not counted yet" : peso(summary.countedCash))}
                {row("Difference", summary.closedAt ? difference.text : "—", true, difference.color)}
                {row("Paid online", peso(summary.onlineSales))}
                {summary.closingNotes && <p style={{ margin: "8px 0 0", padding: "8px 10px", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", fontSize: 12 }}>“{summary.closingNotes}”</p>}
              </>}
            </div>
          </div>
          <div style={{ padding: "0 22px 16px" }}>
            <p style={{ margin: "0 0 6px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Orders ({detail.orders.length})</p>
            {detail.orders.length === 0 ? <p style={{ color: "#9C8278", fontSize: 12.5 }}>No orders in this shift.</p> : <div style={{ border: "1px solid #E8DDD5", borderRadius: 12, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
              {detail.orders.map((order, index) => {
                const reversed = order.status !== "completed";
                return <div key={order.orderId} className="flex items-center gap-3" style={{ padding: "8px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", fontSize: 12.5, background: order.reversedInShift && !order.soldInShift ? "#FEF2F2" : undefined }}>
                  <strong style={{ minWidth: 42, color: reversed ? "#9C8278" : "#D97706" }}>#{order.queueNumber ?? "—"}</strong>
                  <span style={{ minWidth: 70, color: "#9C8278" }}>{new Date(order.createdAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}</span>
                  <span style={{ flex: 1, minWidth: 0, color: reversed ? "#9C8278" : "#3D2B1F", textDecoration: reversed ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.items}</span>
                  <span style={{ color: "#9C8278", fontSize: 11 }}>{order.paymentMethod === "online" ? "Online" : "Cash"} · {order.punchedBy}</span>
                  {reversed && <span style={{ padding: "1px 7px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C", fontSize: 10.5, fontWeight: 800, textTransform: "capitalize" }}>{order.status}{order.reversedInShift && !order.soldInShift ? " (earlier sale)" : ""}</span>}
                  <strong style={{ minWidth: 72, textAlign: "right", color: reversed ? "#9C8278" : "#3D2B1F" }}>{peso(order.total)}</strong>
                </div>;
              })}
            </div>}
          </div>
          <div style={{ padding: "0 22px 22px" }}>
            <p style={{ margin: "0 0 6px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Attendance ({detail.attendance.length})</p>
            {detail.attendance.length === 0 ? <p style={{ color: "#9C8278", fontSize: 12.5 }}>No employee logins recorded in this shift.</p> : <div className="flex flex-wrap gap-2">
              {detail.attendance.map((log) => <div key={log.id} style={{ padding: "8px 11px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FFFFFF", fontSize: 12 }}>
                <strong style={{ color: "#3D2B1F" }}>{log.name}</strong> <span style={{ color: "#9C8278", textTransform: "capitalize" }}>· {log.role}</span>
                <div style={{ color: "#6B4C3B", marginTop: 2 }}>{shiftTime(log.timeIn)} → {log.timeOut ? shiftTime(log.timeOut) : <strong style={{ color: "#15803D" }}>signed in</strong>}</div>
              </div>)}
            </div>}
          </div>
        </section>
      </Modal>;
    })()}
  </section>;
}

function Finance() {
  const confirmAction = useConfirm();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [clearingRecords, setClearingRecords] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");
  const [dailySalesDate, setDailySalesDate] = useState("");
  const [orderHistoryDate, setOrderHistoryDate] = useState("");
  const [summary, setSummary] = useState<SalesSummary>({ order_count: 0, revenue: 0, items_sold: 0 });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [selectedDailyDate, setSelectedDailyDate] = useState("");
  const [dailyDetailOrders, setDailyDetailOrders] = useState<SalesOrder[]>([]);
  const [dailyDetailLoading, setDailyDetailLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"period" | "date" | "range">("period");
  const [exportDate, setExportDate] = useState("");
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [exportSections, setExportSections] = useState<ExportSections>({ summary: true, dailySales: true, orderHistory: true, productSales: true });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const salesSignatureRef = useRef("");

  const loadOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    if (showLoading) setError("");
    try {
      if (!showLoading) {
        const signatureResponse = await fetch("/api/sales-orders?signatureOnly=1", { cache: "no-store" });
        const signaturePayload = await signatureResponse.json();
        if (!signatureResponse.ok) throw new Error(signaturePayload?.error || "Failed to check sales changes.");
        const nextSignature = JSON.stringify(signaturePayload.signature ?? {});
        if (salesSignatureRef.current === nextSignature && !dailySalesDate && !orderHistoryDate) return;
        salesSignatureRef.current = nextSignature;
      }
      const query = new URLSearchParams({ period });
      if (dailySalesDate) query.set("daily_date", dailySalesDate);
      if (orderHistoryDate) query.set("history_date", orderHistoryDate);
      const response = await fetch(`/api/sales-orders?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load sales records.");
      if (showLoading) {
        const signatureResponse = await fetch("/api/sales-orders?signatureOnly=1", { cache: "no-store" });
        const signaturePayload = await signatureResponse.json();
        if (signatureResponse.ok) salesSignatureRef.current = JSON.stringify(signaturePayload.signature ?? {});
      }
      const nextOrders = payload.data ?? [];
      const nextSummary = payload.summary ?? { order_count: 0, revenue: 0, items_sold: 0 };
      const nextTopProducts = payload.topProducts ?? [];
      const nextDailySales = payload.dailySales ?? [];
      setOrders((current) => JSON.stringify(current) === JSON.stringify(nextOrders) ? current : nextOrders);
      setSummary((current) => JSON.stringify(current) === JSON.stringify(nextSummary) ? current : nextSummary);
      setTopProducts((current) => JSON.stringify(current) === JSON.stringify(nextTopProducts) ? current : nextTopProducts);
      setDailySales((current) => JSON.stringify(current) === JSON.stringify(nextDailySales) ? current : nextDailySales);
    } catch (loadError) {
      if (showLoading) setError(loadError instanceof Error ? loadError.message : "Failed to load sales records.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [period, dailySalesDate, orderHistoryDate]);

  useEffect(() => {
    let requestInFlight = false;
    const timeoutId = window.setTimeout(() => { void loadOrders(); }, 0);
    const intervalId = window.setInterval(() => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      void loadOrders(false).finally(() => { requestInFlight = false; });
    }, 10_000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [loadOrders]);

  async function deleteOrder(orderId: number) {
    if (!(await confirmAction({ title: "Archive this sales record?", message: "It is removed from Finance totals and moved to Archives, where it can be restored. Use this only to clean up test data.", confirmLabel: "Archive record" }))) return;
    setDeletingId(orderId);
    setError("");
    try {
      const response = await fetch("/api/sales-orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to archive sales record.");
      setOrders((current) => current.filter((order) => order.order_id !== orderId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to archive sales record.");
    } finally {
      setDeletingId(null);
    }

  }

  async function exportFinanceReport() {
      if (!Object.values(exportSections).some(Boolean)) {
        setExportError("Select at least one report section.");
        return;
      }
      if (exportMode === "date" && !exportDate || exportMode === "range" && (!exportStart || !exportEnd)) {
        setExportError("Choose the date or date range for the report.");
        return;
      }
      setExporting(true);
      setExportError("");
      try {
        const query = new URLSearchParams({ period: exportMode === "period" ? period : "all", exclude_reversed: "1" });
        if (exportMode === "date") {
          query.set("history_date", exportDate);
          query.set("daily_date", exportDate);
        }
        if (exportMode === "range") {
          query.set("history_start", exportStart);
          query.set("history_end", exportEnd);
          query.set("daily_start", exportStart);
          query.set("daily_end", exportEnd);
        }
        const response = await fetch(`/api/sales-orders?${query.toString()}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Failed to retrieve report data.");
        const reportOrders: SalesOrder[] = payload.data ?? [];
        const reportDailySales: DailySale[] = payload.dailySales ?? [];
        const historyQuery = new URLSearchParams(query);
        historyQuery.delete("exclude_reversed");
        const historyResponse = await fetch(`/api/sales-orders?${historyQuery.toString()}`, { cache: "no-store" });
        const historyPayload = await historyResponse.json();
        if (!historyResponse.ok) throw new Error(historyPayload?.error || "Failed to retrieve order history.");
        const reportHistoryOrders: SalesOrder[] = historyPayload.data ?? [];
        if (reportOrders.length === 0 && reportHistoryOrders.length === 0 && reportDailySales.length === 0) {
          throw new Error(`No sales data found for ${exportMode === "period" ? periodLabel.toLowerCase() : exportMode === "date" ? exportDate : `${exportStart} to ${exportEnd}`}. Choose a different report period.`);
        }
        const workbook = XLSX.utils.book_new();
        const appendSheet = (name: string, rows: Record<string, unknown>[]) => {
            if (rows.length) {
              const sheet = XLSX.utils.json_to_sheet(rows);
              sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(Math.max(key.length + 2, 14), 32) }));
              XLSX.utils.book_append_sheet(workbook, sheet, name);
            }
          };
          const reportPeriod = exportMode === "period" ? periodLabel : exportMode === "date" ? exportDate : `${exportStart} to ${exportEnd}`;
          const totalItems = reportOrders.reduce((value, order) => value + order.items.reduce((sum, item) => sum + Number(item.quantity), 0), 0);
          const totalRevenue = reportOrders.reduce((value, order) => value + Number(order.total_amount), 0);
          const getAdditionTotal = (item: SalesOrder["items"][number]) => (item.additions ?? []).reduce((sum, addition) => sum + Number(addition.quantity) * Number(addition.unit_price ?? 0), 0);
          const orderItemRows = reportOrders.flatMap((order) => order.items.map((item, index) => ({
            "Order ID": order.order_id,
            "Order Date": formatFinanceDateTime(order.created_at),
            "Punched By": order.punched_by,
            "Order Source": order.order_source === "online" ? "Online" : "Cashier",
            "Payment Method": getPaymentMethodLabel(order),
            "Queue Number": order.queue_number ?? "",
            "Queue Status": order.queue_status ?? "",
            "Order Status": order.status,
            "Item #": index + 1,
            "Product ID": item.product_id,
            Product: item.product_name,
            Category: item.product_category || "Uncategorized",
            Variant: item.size_label || "",
            Temperature: item.temperature === "hot" ? "Hot" : item.temperature === "cold" ? "Cold" : "",
            Quantity: Number(item.quantity),
            "Unit Price": Number(item.unit_price),
            "Product Line Total": Number(item.quantity) * Number(item.unit_price),
            Additions: item.additions?.map((addition) => `${addition.addition_name} x${addition.quantity}`).join(", ") || "",
            "Additions Total": getAdditionTotal(item),
            "Line Total Including Additions": Number(item.quantity) * Number(item.unit_price) + getAdditionTotal(item),
            "Order Total": Number(order.total_amount),
          })));
          const additionRows = reportOrders.flatMap((order) => order.items.flatMap((item) => (item.additions ?? []).map((addition) => ({
            "Order ID": order.order_id,
            "Order Date": formatFinanceDateTime(order.created_at),
            "Punched By": order.punched_by,
            "Order Source": order.order_source === "online" ? "Online" : "Cashier",
            Category: item.product_category || "Uncategorized",
            Product: item.product_name,
            Variant: item.size_label || "",
            Addition: addition.addition_name,
            Quantity: Number(addition.quantity),
            "Unit Price": Number(addition.unit_price ?? 0),
            "Line Total": Number(addition.quantity) * Number(addition.unit_price ?? 0),
          }))));
          if (exportSections.summary) {
            appendSheet("Sales Summary", [{
              "Report Period": reportPeriod,
              Generated: formatFinanceDateTime(new Date().toISOString()),
              Orders: reportOrders.length,
              "Items Sold": totalItems,
              Revenue: totalRevenue,
              "Cashier Orders": reportOrders.filter((order) => order.order_source !== "online").length,
              "Online Orders": reportOrders.filter((order) => order.order_source === "online").length,
              "Average Ticket": reportOrders.length ? totalRevenue / reportOrders.length : 0,
            }]);
          }
          if (exportSections.dailySales) appendSheet("Daily Sales", reportDailySales.map((day) => ({ Date: day.sale_date, Orders: day.order_count, "Items Sold": day.items_sold, Revenue: Number(day.revenue) })));
          if (exportSections.orderHistory) {
            appendSheet("Order History", reportHistoryOrders.map((order) => ({
              "Order ID": order.order_id,
              "Order Date": formatFinanceDateTime(order.created_at),
              "Punched By": order.punched_by,
              "Order Source": order.order_source === "online" ? "Online" : "Cashier",
              "Payment Method": getPaymentMethodLabel(order),
              "Queue Number": order.queue_number ?? "",
              "Queue Status": order.queue_status ?? "",
              Status: order.status,
              "Item Count": order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
              "Order Total": Number(order.total_amount),
            })));
            appendSheet("Order Items", orderItemRows);
          }
          if (exportSections.productSales) {
            const productMap = new Map<string, { productId: number; category: string; quantity: number; revenue: number }>();
            reportOrders.forEach((order) => order.items.forEach((item) => {
              const key = `${item.product_name} · ${item.size_label || "No size"} · ${item.product_category || "Uncategorized"}`;
              const current = productMap.get(key) ?? { productId: item.product_id, category: item.product_category || "Uncategorized", quantity: 0, revenue: 0 };
              current.quantity += Number(item.quantity);
              current.revenue += Number(item.quantity) * Number(item.unit_price) + getAdditionTotal(item);
              productMap.set(key, current);
            }));
            appendSheet("Product Sales", Array.from(productMap, ([product, values]) => ({ "Product ID": values.productId, Product: product, Category: values.category, Quantity: values.quantity, Revenue: values.revenue })));
          }
          if (exportSections.orderHistory || exportSections.productSales) appendSheet("Additions", additionRows);
        XLSX.writeFile(workbook, `brew-houze-sales-${getFinanceDateStamp()}.xlsx`);
        setExportOpen(false);
      } catch (exportError) {
        setExportError(exportError instanceof Error ? exportError.message : "Failed to generate Excel report.");
      } finally {
        setExporting(false);
      }
  }

  async function clearAllFinanceRecords() {
    if (clearConfirmation !== "CLEAR_FINANCE_RECORDS") return;
    setClearingRecords(true);
    setError("");
    try {
      const response = await fetch("/api/sales-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all", confirmation: clearConfirmation }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to clear finance records.");
      await loadOrders();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear finance records.");
    } finally {
      setClearingRecords(false);
      setClearConfirmOpen(false);
      setClearConfirmation("");
    }
  }

  const averageTicket = Number(summary.order_count) ? Number(summary.revenue) / Number(summary.order_count) : 0;
  const periodLabel = period === "all" ? "All time" : `Last ${period} days`;
  async function inspectSalesDate(date: string) {
    const selectedDate = date.slice(0, 10);
    setSelectedDailyDate(selectedDate);
    setDailyDetailLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ period: "all", history_date: selectedDate, exclude_reversed: "1" });
      const response = await fetch(`/api/sales-orders?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load daily sales details.");
      setDailyDetailOrders(payload.data ?? []);
    } catch (detailError) {
      setDailyDetailOrders([]);
      setError(detailError instanceof Error ? detailError.message : "Failed to load daily sales details.");
    } finally {
      setDailyDetailLoading(false);
    }
  }

  return <main className="finance-shell p-8" style={{ color: "#3D2B1F", overflowY: "auto", maxWidth: 1380 }}>
    <div className="flex items-start justify-between gap-4 mb-6">
      <div><div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#D97706" }} /> Business pulse</div><h2 style={{ marginTop: 7, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>Sales Overview</h2><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13 }}>A simple view of how your coffee shop is performing.</p></div>
      <div className="flex items-center gap-2"><select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 12px", background: "#FDF9F5", color: "#6B4C3B", boxShadow: "0 3px 10px rgba(61,43,31,.04)" }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select>      <button onClick={() => void loadOrders()} disabled={loading} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: loading ? "default" : "pointer", boxShadow: "0 4px 12px rgba(61,43,31,.12)" }}>{loading ? "Loading..." : "Refresh"}</button><button type="button" onClick={() => { setExportError(""); setExportOpen(true); }} style={{ border: "1px solid #D97706", borderRadius: 10, padding: "10px 14px", background: "#FFF7ED", color: "#B45309", cursor: "pointer", fontWeight: 700 }}>Export Excel</button></div>
    </div>
    {error && <p className="mb-4" style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}
    {loading && orders.length === 0 && <div className="rounded-2xl p-10 mb-7 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}><div style={{ width: 28, height: 28, margin: "0 auto 12px", border: "3px solid #E8DDD5", borderTopColor: "#D97706", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><strong style={{ display: "block", color: "#3D2B1F", fontSize: 15 }}>Loading finance records...</strong><span style={{ display: "block", marginTop: 5, fontSize: 12 }}>Preparing your sales overview.</span></div>}
    {(!loading || orders.length > 0) && <><div className="grid gap-4 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", opacity: loading ? 0.62 : 1, transition: "opacity .2s ease" }}>
      {[[`Revenue · ${periodLabel}`, `₱${Number(summary.revenue).toFixed(2)}`, "#3D2B1F", "primary"], ["Orders", String(summary.order_count), "#D97706", ""], ["Items sold", String(summary.items_sold), "#6B4C3B", ""], ["Average ticket", `₱${averageTicket.toFixed(2)}`, "#2E7D32", ""]].map(([label, value, color, emphasis]) => <div key={label} className="rounded-2xl p-5" style={{ background: emphasis ? "linear-gradient(135deg, #3D2B1F 0%, #5B4030 100%)" : "#FDF9F5", border: emphasis ? "none" : "1px solid #E8DDD5", boxShadow: "0 5px 18px rgba(61,43,31,.06)", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", right: -25, top: -25, background: emphasis ? "rgba(217,119,6,.18)" : "rgba(217,119,6,.07)" }} /><p style={{ position: "relative", color: emphasis ? "rgba(255,255,255,.62)" : "#9C8278", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p><p style={{ position: "relative", marginTop: 10, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 27, fontWeight: 800, color: emphasis ? "#FDF9F5" : color }}>{value}</p></div>)}
    </div>
    <div className="rounded-2xl px-5 py-4 mb-7 flex flex-wrap items-center gap-x-8 gap-y-2" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", opacity: loading ? 0.62 : 1 }}>
      <div><p style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Cost of goods</p><p style={{ marginTop: 4, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 19, fontWeight: 800, color: "#6B4C3B" }}>₱{Number(summary.cost_of_goods ?? 0).toFixed(2)}</p></div>
      <div><p style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Gross profit</p><p style={{ marginTop: 4, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 19, fontWeight: 800, color: "#2E7D32" }}>₱{Number(summary.gross_profit ?? 0).toFixed(2)}{Number(summary.costed_revenue ?? 0) > 0 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: "#9C8278" }}>{((Number(summary.gross_profit ?? 0) / Number(summary.costed_revenue)) * 100).toFixed(1)}% margin</span>}</p></div>
      <p style={{ flex: "1 1 260px", margin: 0, color: "#9C8278", fontSize: 11.5 }}>{Number(summary.uncosted_items ?? 0) > 0 ? `Based on items with a recorded cost. ${summary.uncosted_items} item${summary.uncosted_items === 1 ? "" : "s"} sold without a complete inventory cost ${summary.uncosted_items === 1 ? "is" : "are"} excluded.` : "Cost is taken from inventory unit costs at the time of each sale."}</p>
    </div>
    <div className="grid gap-5 mb-7" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, .85fr)" }}><section className="rounded-2xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 5px 18px rgba(61,43,31,.05)" }}><div className="flex items-center justify-between mb-4"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>Top Sellers</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>What customers are ordering most</p></div><span style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>TOP 5</span></div>{topProducts.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No product sales in this period.</p> : topProducts.map((product, index) => <div key={product.product_name} className="flex items-center gap-3 py-3" style={{ borderBottom: index === topProducts.length - 1 ? "none" : "1px solid #F0E8E2" }}><span style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: index === 0 ? "#D97706" : "#F3EDE5", color: index === 0 ? "#fff" : "#6B4C3B", fontWeight: 800, fontSize: 12 }}>{index + 1}</span><div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.product_name}</strong><div style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>{product.quantity} sold</div></div><span style={{ fontWeight: 700, fontSize: 13 }}>₱{Number(product.revenue).toFixed(2)}</span></div>)}</section><section className="rounded-2xl p-6" style={{ background: "linear-gradient(145deg, #3D2B1F, #674735)", color: "#FDF9F5", boxShadow: "0 8px 24px rgba(61,43,31,.16)", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", right: -35, bottom: -45, width: 150, height: 150, borderRadius: "50%", border: "22px solid rgba(253,249,245,.08)" }} /><div style={{ position: "relative" }}><span style={{ color: "#FDE68A", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }}>    Owner&apos;s note</span><h3 style={{ margin: "12px 0 10px", fontWeight: 800, fontSize: 20 }}>Keep an eye on your best cups.</h3><p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, lineHeight: 1.65 }}>Use top sellers to guide prep and purchasing. Inventory deductions happen automatically after every completed order.</p><div style={{ marginTop: 24, display: "inline-flex", padding: "6px 10px", borderRadius: 7, background: "rgba(255,255,255,.1)", color: "#FDE68A", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>{periodLabel}</div></div></section></div>
    <ShiftReports period={period} />
    <section className="mb-7"><div className="flex items-end justify-between mb-3"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Sales by Business Day</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>Grouped by the date each shift opened, so after-midnight sales count toward their night · {periodLabel}</p></div><div className="flex items-center gap-2"><label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 12 }}>Date<input type="date" value={dailySalesDate} onChange={(event) => setDailySalesDate(event.target.value)} style={{ border: "none", background: "transparent", color: "#6B4C3B", outline: "none" }} /></label>{dailySalesDate && <button onClick={() => setDailySalesDate("")} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontSize: 12 }}>Clear</button>}<span style={{ color: "#9C8278", fontSize: 11 }}>{dailySales.length} day{dailySales.length === 1 ? "" : "s"}</span></div></div>{dailySales.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>No dated sales records found.</div> : <div className="rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Date", "Orders", "Items sold", "Revenue", "Inspect"].map((heading) => <th key={heading} style={{ padding: "12px 16px", textAlign: heading === "Date" ? "left" : "right", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{dailySales.map((day) => <tr key={day.sale_date} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{formatSalesDate(day.sale_date)}</td><td style={{ padding: "14px 16px", textAlign: "right", color: "#6B4C3B" }}>{day.order_count}</td><td style={{ padding: "14px 16px", textAlign: "right", color: "#6B4C3B" }}>{day.items_sold}</td><td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800 }}>₱{Number(day.revenue).toFixed(2)}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><button type="button" onClick={() => inspectSalesDate(day.sale_date)} aria-label={`Inspect sales for ${formatSalesDate(day.sale_date)}`} title="Inspect sales for this date" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E8DDD5", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer" }}><IconEye size={14} /></button></td></tr>)}</tbody></table></div></div>}</section>
    {exportOpen && <Modal onClose={() => setExportOpen(false)} closeDisabled={exporting} label="Export finance report" zIndex={50}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 560px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Finance report</p><h3 style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>Export Excel report</h3></div><button type="button" onClick={() => setExportOpen(false)} disabled={exporting} aria-label="Close export dialog" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div><div style={{ marginTop: 22 }}><strong style={{ display: "block", marginBottom: 10 }}>Include sections</strong>{(["summary", "dailySales", "orderHistory", "productSales"] as const).map((section) => <label key={section} className="flex items-center gap-2" style={{ marginTop: 9, color: "#6B4C3B", fontSize: 13 }}><input type="checkbox" checked={exportSections[section]} onChange={(event) => setExportSections((current) => ({ ...current, [section]: event.target.checked }))} />{section === "summary" ? "Sales Summary" : section === "dailySales" ? "Daily Sales" : section === "orderHistory" ? "Order History" : "Product Sales"}</label>)}</div><div style={{ marginTop: 22 }}><strong style={{ display: "block", marginBottom: 10 }}>Date range</strong><div className="flex flex-col gap-2"><label className="flex items-center gap-2" style={{ color: "#6B4C3B", fontSize: 13 }}><input type="radio" name="export-date-mode" checked={exportMode === "period"} onChange={() => setExportMode("period")} />Use current period ({periodLabel})</label><label className="flex items-center gap-2" style={{ color: "#6B4C3B", fontSize: 13 }}><input type="radio" name="export-date-mode" checked={exportMode === "date"} onChange={() => setExportMode("date")} />Specific date<input type="date" value={exportDate} onChange={(event) => setExportDate(event.target.value)} disabled={exportMode !== "date"} style={{ marginLeft: 6, border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 8px", background: "#FFFDF9" }} /></label><label className="flex items-center gap-2" style={{ color: "#6B4C3B", fontSize: 13 }}><input type="radio" name="export-date-mode" checked={exportMode === "range"} onChange={() => setExportMode("range")} />Date range<input type="date" value={exportStart} onChange={(event) => setExportStart(event.target.value)} disabled={exportMode !== "range"} style={{ marginLeft: 6, border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 8px", background: "#FFFDF9" }} /><span>to</span><input type="date" value={exportEnd} onChange={(event) => setExportEnd(event.target.value)} disabled={exportMode !== "range"} style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 8px", background: "#FFFDF9" }} /></label></div></div>    {exportError && <p role="alert" style={{ marginTop: 18, marginBottom: 0, padding: "10px 12px", border: "1px solid #FECACA", borderRadius: 10, background: "#FEF2F2", color: "#B91C1C", fontSize: 13 }}>{exportError}</p>}<div className="flex justify-end gap-3" style={{ marginTop: 26 }}><button type="button" onClick={() => setExportOpen(false)} disabled={exporting} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 16px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => void exportFinanceReport()} disabled={exporting} style={{ border: "none", borderRadius: 10, padding: "9px 16px", background: exporting ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", cursor: exporting ? "default" : "pointer", fontWeight: 700 }}>{exporting ? "Generating..." : "Download Excel"}</button></div></section></Modal>}
    {selectedDailyDate && <Modal onClose={() => { setSelectedDailyDate(""); setDailyDetailOrders([]); }} label="Sales for the day" zIndex={45}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 620px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Daily sales record</p><h3 style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>{formatSalesDate(selectedDailyDate)}</h3></div><button type="button" onClick={() => { setSelectedDailyDate(""); setDailyDetailOrders([]); }} aria-label="Close daily sales details" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div>{dailyDetailLoading ? <p style={{ marginTop: 24, color: "#9C8278", fontSize: 13 }}>Loading purchases...</p> : <>{dailyDetailOrders.map((order) => <div key={order.order_id} style={{ marginTop: 22, borderTop: "1px solid #E8DDD5", paddingTop: 16 }}><div className="flex items-start justify-between gap-3"><div><strong style={{ fontSize: 17 }}>Order #{order.order_id}</strong><div style={{ marginTop: 5, color: "#6B4C3B", fontSize: 12 }}>Punched by: {order.punched_by} · {formatFinanceDateTime(order.created_at)}</div></div><strong>₱{Number(order.total_amount).toFixed(2)}</strong></div>{order.items.map((item, index) => <div key={`${order.order_id}-${item.product_id}-${index}`} className="flex items-start justify-between gap-3" style={{ marginTop: 14, paddingBottom: 12, borderBottom: "1px solid #F0E8E2" }}><div>    <strong>{item.product_name}{item.size_label ? ` · ${item.size_label}` : ""}{item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}</strong><div style={{ marginTop: 4, color: "#6B4C3B", fontSize: 12 }}>{item.quantity} × ₱{Number(item.unit_price).toFixed(2)}{item.additions?.length ? ` · Additions: ${item.additions.map((addition) => `${addition.addition_name} × ${addition.quantity}`).join(", ")}` : ""}</div></div><strong>₱{(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}</strong></div>)}</div>)}{!dailyDetailOrders.length && <p style={{ marginTop: 24, color: "#9C8278", fontSize: 13 }}>No purchases found for this date.</p>}<div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 14, borderTop: "2px solid #3D2B1F" }}><strong>Total for the day</strong><strong style={{ fontSize: 20 }}>₱{dailyDetailOrders.reduce((total, order) => total + Number(order.total_amount), 0).toFixed(2)}</strong></div></>}</section></Modal>}
    <section id="order-history"><div className="flex items-end justify-between mb-3"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Order History</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>{orderHistoryDate ? `Completed transactions on ${formatSalesDate(orderHistoryDate)}` : `Completed transactions in the selected period`}</p></div><div className="flex items-center gap-2"><label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 12 }}>Date<input type="date" value={orderHistoryDate} onChange={(event) => setOrderHistoryDate(event.target.value)} style={{ border: "none", background: "transparent", color: "#6B4C3B", outline: "none" }} /></label>{orderHistoryDate && <button onClick={() => setOrderHistoryDate("")} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontSize: 12 }}>Clear</button>}<span style={{ color: "#9C8278", fontSize: 11 }}>{orders.length} shown</span>    <button onClick={() => { setClearConfirmation(""); setClearConfirmOpen(true); }} disabled={clearingRecords} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "8px 10px", background: "#FEF2F2", color: "#B91C1C", cursor: clearingRecords ? "default" : "pointer", fontSize: 11, fontWeight: 700 }}>{clearingRecords ? "Archiving..." : "Archive all records"}</button></div></div>{orders.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>No completed sales records found.</div> : <div className="flex flex-col gap-3">{orders.map((order) =>     <div key={order.order_id} className="rounded-2xl p-4 flex items-center justify-between gap-4" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 3px 12px rgba(61,43,31,.04)" }}><div style={{ minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>    Order #{order.order_id}    <span style={{ color: ["void", "voided", "refund", "refunded"].includes(order.status.toLowerCase()) ? "#B91C1C" : "#2E7D32", background: ["void", "voided", "refund", "refunded"].includes(order.status.toLowerCase()) ? "#FEF2F2" : "#DCFCE7", borderRadius: 20, padding: "3px 8px", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase" }}>{order.status}</span><span style={{ color: "#6B4C3B", background: "#F3EDE5", borderRadius: 20, padding: "3px 8px", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase" }}>{getPaymentMethodLabel(order)}</span></div><div style={{ marginTop: 5, color: "#6B4C3B", fontSize: 11 }}>Punched by: {order.punched_by}</div><div style={{ marginTop: 4, color: "#9C8278", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{new Date(order.created_at).toLocaleString()} · {order.items.map((item) => `${item.product_name} (${item.size_label}) × ${item.quantity}${item.additions?.length ? ` + ${item.additions.map((addition) => addition.addition_name).join(", ")}` : ""}`).join(", ")}</div></div><div className="flex items-center gap-4"><strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 16, whiteSpace: "nowrap" }}>₱{Number(order.total_amount).toFixed(2)}</strong>    <button type="button" onClick={() => setSelectedOrder(order)} aria-label={`Inspect order #${order.order_id}`} title="Inspect order" style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E8DDD5", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer" }}><IconEye size={14} /></button><button type="button" onClick={() => void deleteOrder(order.order_id)} disabled={deletingId === order.order_id} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "8px 11px", background: "#FEF2F2", color: "#B91C1C", cursor: deletingId === order.order_id ? "default" : "pointer", fontSize: 11 }}>{deletingId === order.order_id ? "Archiving..." : "Archive test sale"}</button></div></div>)}</div>}</section></>}    {loading && orders.length > 0 && <div style={{ position: "sticky", bottom: 20, zIndex: 5, display: "flex", justifyContent: "center", pointerEvents: "none" }}><div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 14px", color: "#6B4C3B", background: "rgba(253,249,245,.96)", border: "1px solid #E8DDD5", borderRadius: 999, boxShadow: "0 5px 18px rgba(61,43,31,.12)", fontSize: 12 }}><span style={{ width: 13, height: 13, border: "2px solid #E8DDD5", borderTopColor: "#D97706", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Updating finance records...</div></div>}
    {clearConfirmOpen && <Modal onClose={() => { setClearConfirmOpen(false); setClearConfirmation(""); }} closeDisabled={clearingRecords} label="Archive all finance records" zIndex={50}><section style={{ width: "min(100%, 440px)", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><h3 style={{ margin: 0, color: "#3D2B1F", fontSize: 18 }}>Archive all finance records?</h3><p style={{ margin: "10px 0 16px", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>This moves every sales record and its order items to Archives. They can be restored or permanently deleted from there later. Type <strong>CLEAR_FINANCE_RECORDS</strong> to continue.</p><input autoFocus value={clearConfirmation} onChange={(event) => setClearConfirmation(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void clearAllFinanceRecords(); }} placeholder="CLEAR_FINANCE_RECORDS" style={{ width: "100%", padding: "10px 12px", border: "1px solid #E8DDD5", borderRadius: 8, color: "#3D2B1F", background: "#fff" }} /><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => { setClearConfirmOpen(false); setClearConfirmation(""); }} disabled={clearingRecords} style={{ padding: "9px 13px", border: "1px solid #E8DDD5", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", cursor: clearingRecords ? "default" : "pointer" }}>Cancel</button><button onClick={() => void clearAllFinanceRecords()} disabled={clearingRecords || clearConfirmation !== "CLEAR_FINANCE_RECORDS"} style={{ padding: "9px 13px", border: "1px solid #FECACA", borderRadius: 8, background: "#B91C1C", color: "#fff", cursor: clearingRecords || clearConfirmation !== "CLEAR_FINANCE_RECORDS" ? "default" : "pointer" }}>{clearingRecords ? "Archiving..." : "Archive records"}</button></div></section></Modal>}
   {selectedOrder && <Modal onClose={() => setSelectedOrder(null)} label="Order details" zIndex={45}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 620px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Finance record</p><h3 style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>Order #{selectedOrder.order_id}</h3></div><button onClick={() => setSelectedOrder(null)} aria-label="Close order details" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div>   <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Punched by</span><strong style={{ display: "block", marginTop: 4 }}>{selectedOrder.punched_by}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Order source</span><strong style={{ display: "block", marginTop: 4 }}>{selectedOrder.order_source === "online" ? "Online" : "Cashier"}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Payment method</span><strong style={{ display: "block", marginTop: 4 }}>{getPaymentMethodLabel(selectedOrder)}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Queue number</span><strong style={{ display: "block", marginTop: 4 }}>{selectedOrder.queue_number ?? "—"}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Created</span><strong style={{ display: "block", marginTop: 4 }}>{new Date(selectedOrder.created_at).toLocaleString()}</strong></div>{selectedOrder.payment_method !== "online" && <><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Received</span><strong style={{ display: "block", marginTop: 4 }}>₱{Number(selectedOrder.received_amount ?? 0).toFixed(2)}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Change</span><strong style={{ display: "block", marginTop: 4 }}>₱{Number(selectedOrder.change_amount ?? 0).toFixed(2)}</strong></div></>}</div><div style={{ marginTop: 22, borderTop: "1px solid #E8DDD5" }}>{selectedOrder.items.map((item, index) => <div key={`${item.product_id}-${index}`} style={{ padding: "14px 0", borderBottom: "1px solid #F0E8E2" }}><div className="flex items-start justify-between gap-3">   <strong>{item.product_name}{item.size_label ? ` · ${item.size_label}` : ""}{item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}</strong><strong>₱{(Number(item.unit_price) * item.quantity).toFixed(2)}</strong></div><div style={{ marginTop: 4, color: "#6B4C3B", fontSize: 12 }}>{item.quantity} × ₱{Number(item.unit_price).toFixed(2)}{item.additions?.length ? ` · Additions: ${item.additions.map((addition) => `${addition.addition_name} × ${addition.quantity}`).join(", ")}` : ""}</div></div>)}</div><div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 14, borderTop: "2px solid #3D2B1F" }}><strong>Total</strong><strong style={{ fontSize: 20 }}>₱{Number(selectedOrder.total_amount).toFixed(2)}</strong></div></section></Modal>}  </main>;
}
type EmployeeTimeLog = { id: number; timeIn: string; timeOut: string | null; shiftId?: number | null };
type EmployeeTransaction = { id: number; amount: number; status: string; createdAt: string; reversalType: string | null; reversedAt: string | null };
type EmployeeReversal = { id: number; amount: number; status: string; reversedAt: string | null };
type ArchivingLogEntry = { kind: string; name: string; archivedAt: string };
type CashierAccount = { id: number; fullName: string; email: string; role: string; isActive: boolean; canVoidOrders: boolean; canRefundOrders: boolean; timeLogs: EmployeeTimeLog[]; transactions: EmployeeTransaction[]; reversals: EmployeeReversal[] ; sessions?: AccountDevice[] };
type MyActivity = { fullName: string; email: string; timeLogs: EmployeeTimeLog[]; transactions: EmployeeTransaction[]; reversals: EmployeeReversal[]; archives: ArchivingLogEntry[] };

type AccountDevice = { id: number; app: string; device: string; signedInAt: string; lastSeenAt: string };

// Devices the employee is signed in on right now, with a way to end all of them (lost phone,
// employee leaving). Their cashier attendance ends too, since they are no longer signed in anywhere.
function AccountDevicesPanel({ account, onSignedOut }: { account: CashierAccount; onSignedOut: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const devices = account.sessions ?? [];

  async function signOutEverywhere() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/cashier-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, action: "sign_out_everywhere" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not sign the account out.");
      setConfirming(false);
      onSignedOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign the account out.");
    } finally {
      setWorking(false);
    }
  }

  return <div style={{ marginTop: 22, padding: 14, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFDF9" }}>
    <div className="flex items-center justify-between gap-3">
      <strong style={{ color: "#3D2B1F", fontSize: 14 }}>Signed-in devices <span style={{ color: "#9C8278", fontWeight: 500 }}>({devices.length})</span></strong>
      {devices.length > 0 && !confirming && <button type="button" onClick={() => setConfirming(true)} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "6px 10px", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Sign out of all devices</button>}
    </div>
    {devices.length === 0
      ? <p style={{ margin: "8px 0 0", color: "#9C8278", fontSize: 12.5 }}>Not signed in anywhere right now.</p>
      : <div className="flex flex-col" style={{ marginTop: 8 }}>
        {devices.map((device, index) => <div key={device.id} className="flex items-center justify-between gap-3" style={{ padding: "8px 0", borderTop: index ? "1px solid #F0E8E2" : "none", fontSize: 12.5 }}>
          <span style={{ color: "#3D2B1F" }}><strong>{device.device}</strong> <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 6, background: device.app === "cashier" ? "#FFF7ED" : "#F3EDE5", color: device.app === "cashier" ? "#C2410C" : "#6B4C3B", fontSize: 11, fontWeight: 700 }}>{device.app === "cashier" ? "Cashier app" : "Admin app"}</span></span>
          <span style={{ color: "#9C8278", whiteSpace: "nowrap" }}>active {formatFinanceDateTime(device.lastSeenAt)}</span>
        </div>)}
      </div>}
    {confirming && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12.5, color: "#7F1D1D", lineHeight: 1.5 }}>
      Sign {account.fullName} out of all {devices.length} device{devices.length === 1 ? "" : "s"}? Any open cashier attendance ends now. They can sign in again with their password.
      <div className="flex justify-end gap-2" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => setConfirming(false)} disabled={working} style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 12px", background: "#FFFFFF", color: "#6B4C3B", fontSize: 12, cursor: "pointer" }}>Cancel</button>
        <button type="button" onClick={() => void signOutEverywhere()} disabled={working} style={{ border: "none", borderRadius: 8, padding: "6px 12px", background: working ? "#C9B8AF" : "#B91C1C", color: "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: working ? "default" : "pointer" }}>{working ? "Signing out..." : "Sign out everywhere"}</button>
      </div>
    </div>}
    {error && <p style={{ margin: "8px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
  </div>;
}

function Accounts() {
  const confirmAction = useConfirm();
  const [accounts, setAccounts] = useState<CashierAccount[]>([]);
  const [permissionAccount, setPermissionAccount] = useState<CashierAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myActivity, setMyActivity] = useState<MyActivity | null>(null);
  const [myActivityLoading, setMyActivityLoading] = useState(true);
  const [myActivityError, setMyActivityError] = useState("");
  const [exportingAccountId, setExportingAccountId] = useState<number | null>(null);

  const loadMyActivity = async () => {
    try {
      const response = await fetch("/api/admin-activity", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load your cashier activity.");
      setMyActivity(payload.data ?? null);
      setMyActivityError("");
    } catch (loadError) {
      setMyActivityError(loadError instanceof Error ? loadError.message : "Failed to load your cashier activity.");
    } finally {
      setMyActivityLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const response = await fetch("/api/cashier-accounts", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load cashier accounts.");
      const nextAccounts = payload.data ?? [];
      setAccounts(nextAccounts);
      setPermissionAccount((current) => current ? nextAccounts.find((account: CashierAccount) => account.id === current.id) ?? null : null);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load cashier accounts.");
    } finally {
      setLoading(false);
    }
  };

  async function updatePermissions(account: CashierAccount, changes: Partial<Pick<CashierAccount, "canVoidOrders" | "canRefundOrders">>) {
    const nextAccount = { ...account, ...changes };
    setAccounts((current) => current.map((item) => item.id === account.id ? nextAccount : item));
    setPermissionAccount((current) => current?.id === account.id ? nextAccount : current);
    try {
      const response = await fetch("/api/cashier-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, canVoidOrders: nextAccount.canVoidOrders, canRefundOrders: nextAccount.canRefundOrders }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to update cashier permissions.");
    } catch (updateError) {
      setAccounts((current) => current.map((item) => item.id === account.id ? account : item));
      setError(updateError instanceof Error ? updateError.message : "Failed to update cashier permissions.");
    }

  }

  async function clearEmployeeLogs(account: CashierAccount) {
    if (!(await confirmAction({ title: `Archive ${account.fullName}'s attendance history?`, message: "All their time logs move to Archives, where they can be restored or permanently deleted later.", confirmLabel: "Archive history" }))) return;
    try {
      const response = await fetch("/api/cashier-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, confirmation: "CLEAR_EMPLOYEE_LOGS" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to archive employee log history.");
      await loadAccounts();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to archive employee log history.");
    }
  }

  async function exportEmployeeReport(account: CashierAccount) {
    setExportingAccountId(account.id);
    setError("");
    try {
      const workbook = XLSX.utils.book_new();
      const appendSheet = (name: string, rows: Record<string, unknown>[]) => {
        if (rows.length) {
          const sheet = XLSX.utils.json_to_sheet(rows);
          sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(Math.max(key.length + 2, 14), 32) }));
          XLSX.utils.book_append_sheet(workbook, sheet, name);
        }
      };
      const completedTransactions = account.transactions.filter((transaction) => !transaction.reversalType);
      const totalRevenue = completedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
      appendSheet("Employee Summary", [{
        Employee: account.fullName,
        Email: account.email,
        Role: account.role,
        Status: account.isActive ? "Active" : "Inactive",
        "Can Void Orders": account.canVoidOrders ? "Yes" : "No",
        "Can Refund Orders": account.canRefundOrders ? "Yes" : "No",
        Generated: formatFinanceDateTime(new Date().toISOString()),
        "Transactions On Record": account.transactions.length,
        "Completed Transactions": completedTransactions.length,
        "Void/Refund Count": account.reversals.length,
        "Completed Revenue": totalRevenue,
        "Attendance Entries On Record": account.timeLogs.length,
      }]);
      appendSheet("Transaction Record", account.transactions.map((transaction) => ({
        "Order ID": transaction.id,
        "Order Date": formatFinanceDateTime(transaction.createdAt),
        Amount: transaction.amount,
        Status: transaction.status,
        "Reversal Type": transaction.reversalType || "",
        "Reversed At": transaction.reversedAt ? formatFinanceDateTime(transaction.reversedAt) : "",
      })));
      appendSheet("Void & Refund Activity", account.reversals.map((reversal) => ({
        "Order ID": reversal.id,
        "Reversed At": reversal.reversedAt ? formatFinanceDateTime(reversal.reversedAt) : "Unknown",
        Amount: reversal.amount,
        Status: reversal.status,
      })));
      appendSheet("Attendance History", account.timeLogs.map((log) => ({
        Shift: log.shiftId ? `#${log.shiftId}` : "",
        "Time In": formatFinanceDateTime(log.timeIn),
        "Time Out": log.timeOut ? formatFinanceDateTime(log.timeOut) : "Currently signed in",
      })));
      if (workbook.SheetNames.length === 0) {
        throw new Error(`No activity found for ${account.fullName} yet.`);
      }
      const fileNameSafeName = account.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      XLSX.writeFile(workbook, `brew-houze-employee-${fileNameSafeName}-${getFinanceDateStamp()}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export employee report.");
    } finally {
      setExportingAccountId(null);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadAccounts(); void loadMyActivity(); }, 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") { void loadAccounts(); void loadMyActivity(); }
    }, 15_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(intervalId);
    };
  }, []);

  const activeCount = accounts.filter((account) => account.isActive).length;

  return <main className="p-8" style={{ color: "#3D2B1F", overflowY: "auto", maxWidth: 1180 }}>
    <div className="flex items-start justify-between gap-4 mb-7">
      <div><div style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Team access</div><h2 style={{ marginTop: 7, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: "-.03em" }}>Cashier Accounts</h2><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13 }}>Overview of staff accounts that can access the Brew Houze cashier app.</p></div>
      <button onClick={() => void loadAccounts()} disabled={loading} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: loading ? "default" : "pointer" }}>{loading ? "Loading..." : "Refresh"}</button>
    </div>
    <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
      <div className="rounded-xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ color: "#9C8278", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Total cashiers</div><div style={{ marginTop: 8, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800 }}>{accounts.length}</div></div>
      <div className="rounded-xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ color: "#9C8278", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Active accounts</div><div style={{ marginTop: 8, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, color: "#2E7D32" }}>{activeCount}</div></div>
      <div className="rounded-xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ color: "#9C8278", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>Access status</div><div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: activeCount ? "#2E7D32" : "#B91C1C" }}>{activeCount ? "Ready for POS" : "No active cashier"}</div></div>
    </div>
    {error && <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{error}</div>}
    {loading ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading employees...</div> : accounts.length === 0 ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px dashed #D8C8BE", color: "#9C8278" }}>No cashier employees found.</div> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Employee", "Email", "Role", "Status", "Manage"].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{accounts.map((account) => <tr key={account.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "15px 16px", fontWeight: 700 }}>{account.fullName}</td><td style={{ padding: "15px 16px", color: "#6B4C3B", fontSize: 13 }}>{account.email}</td><td style={{ padding: "15px 16px", color: "#9C8278", fontSize: 12, textTransform: "capitalize" }}>{account.role}</td><td style={{ padding: "15px 16px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "5px 9px", background: account.isActive ? "#DCFCE7" : "#F3EDE5", color: account.isActive ? "#166534" : "#9C8278", fontSize: 11, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: account.isActive ? "#22C55E" : "#B9A398" }} />{account.isActive ? "Active" : "Inactive"}</span></td><td style={{ padding: "12px 16px" }}><div className="flex items-center gap-2"><button type="button" onClick={() => setPermissionAccount(account)} style={{ border: "1px solid #D97706", borderRadius: 8, padding: "8px 11px", background: "#FFF7ED", color: "#B45309", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Manage employee</button><button type="button" onClick={() => void exportEmployeeReport(account)} disabled={exportingAccountId === account.id} style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "8px 11px", background: "#3D2B1F", color: "#FDF9F5", cursor: exportingAccountId === account.id ? "default" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{exportingAccountId === account.id ? "Exporting..." : "Export report"}</button></div></td></tr>)}</tbody></table></div></div>}

    <section className="mt-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div><div style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Your own record</div><h2 style={{ marginTop: 7, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-.03em" }}>My Cashier Activity</h2><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13 }}>Your own attendance, transactions, reversals, and archiving activity when using the cashier and admin apps. Other admins cannot see this, and you cannot see theirs.</p></div>
        <button onClick={() => void loadMyActivity()} disabled={myActivityLoading} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: myActivityLoading ? "default" : "pointer", fontSize: 12, whiteSpace: "nowrap" }}>{myActivityLoading ? "Loading..." : "Refresh"}</button>
      </div>
      {myActivityError && <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{myActivityError}</div>}
      {myActivityLoading ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading your activity...</div> : !myActivity ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px dashed #D8C8BE", color: "#9C8278" }}>No cashier activity found for your account yet.</div> : <div className="rounded-2xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
        <div style={{ marginTop: 4 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Transaction record</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{myActivity.transactions.length} recent</span></div>{myActivity.transactions.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No transactions yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.transactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{transaction.id} · {formatFinanceDateTime(transaction.createdAt)}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{transaction.amount.toFixed(2)}</strong><span style={{ color: transaction.status === "completed" ? "#2E7D32" : "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{transaction.status}</span>{transaction.reversalType && <span style={{ display: "block", color: "#B91C1C", fontSize: 10 }}>Reversed: {transaction.reversalType}</span>}</span></div>)}</div>}</div>
        <div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Void & refund activity</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{myActivity.reversals.length} recent</span></div>{myActivity.reversals.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No voids or refunds yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.reversals.map((reversal) => <div key={reversal.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{reversal.id} · {reversal.reversedAt ? formatFinanceDateTime(reversal.reversedAt) : "Unknown time"}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{reversal.amount.toFixed(2)}</strong><span style={{ color: "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{reversal.status}</span></span></div>)}</div>}</div>
        <div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Attendance history</strong></div>{myActivity.timeLogs.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No time logs yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.timeLogs.map((log) => <div key={log.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>{log.shiftId ? <strong style={{ marginRight: 8, padding: "1px 7px", borderRadius: 6, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11 }}>Shift #{log.shiftId}</strong> : null}In: {formatFinanceDateTime(log.timeIn)}</span><span style={{ color: log.timeOut ? "#6B4C3B" : "#2E7D32", fontWeight: log.timeOut ? 400 : 700 }}>{log.timeOut ? `Out: ${formatFinanceDateTime(log.timeOut)}` : "Currently signed in"}</span></div>)}</div>}</div>
        <div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Archiving activity</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{myActivity.archives.length} recent</span></div>{myActivity.archives.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>You haven&apos;t archived anything yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.archives.map((entry, index) => <div key={`${entry.kind}-${entry.name}-${index}`} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}><span style={{ color: "#9C8278", background: "#F3EDE5", borderRadius: 20, padding: "2px 8px", fontSize: 9, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", marginRight: 8 }}>{entry.kind}</span>{entry.name}</span><span style={{ color: "#9C8278" }}>{formatFinanceDateTime(entry.archivedAt)}</span></div>)}</div>}</div>
      </div>}
    </section>

    {permissionAccount && <Modal onClose={() => setPermissionAccount(null)} labelledBy="cashier-employee-title" zIndex={50}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 520px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Employee management</p><h3 id="cashier-employee-title" style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>{permissionAccount.fullName}</h3><p style={{ margin: "6px 0 0", color: "#9C8278", fontSize: 13 }}>{permissionAccount.email}</p></div><button type="button" onClick={() => setPermissionAccount(null)} aria-label="Close employee management" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div><div className="flex justify-end" style={{ marginTop: 14 }}><button type="button" onClick={() => void exportEmployeeReport(permissionAccount)} disabled={exportingAccountId === permissionAccount.id} style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "8px 12px", background: "#3D2B1F", color: "#FDF9F5", cursor: exportingAccountId === permissionAccount.id ? "default" : "pointer", fontSize: 12, fontWeight: 700 }}>{exportingAccountId === permissionAccount.id ? "Exporting..." : "Export report (.xlsx)"}</button></div><AccountDevicesPanel account={permissionAccount} onSignedOut={() => { const cleared = { ...permissionAccount, sessions: [], timeLogs: permissionAccount.timeLogs.map((log) => log.timeOut ? log : { ...log, timeOut: new Date().toISOString() }) }; setPermissionAccount(cleared); setAccounts((current) => current.map((account) => account.id === cleared.id ? cleared : account)); }} /><div style={{ marginTop: 22, padding: 14, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFDF9" }}><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Order permissions</strong><label className="flex items-center gap-3" style={{ marginTop: 14, color: "#6B4C3B", fontSize: 14, fontWeight: 600 }}><input type="checkbox" checked={permissionAccount.canVoidOrders} onChange={() => void updatePermissions(permissionAccount, { canVoidOrders: !permissionAccount.canVoidOrders })} /> Allow cashier to void orders</label><label className="flex items-center gap-3" style={{ display: "flex", marginTop: 12, color: "#6B4C3B", fontSize: 14, fontWeight: 600 }}><input type="checkbox" checked={permissionAccount.canRefundOrders} onChange={() => void updatePermissions(permissionAccount, { canRefundOrders: !permissionAccount.canRefundOrders })} /> Allow cashier to refund orders    </label></div><div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Transaction record</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{permissionAccount.transactions.length} recent</span></div>{permissionAccount.transactions.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No transactions yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{permissionAccount.transactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{transaction.id} · {formatFinanceDateTime(transaction.createdAt)}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{transaction.amount.toFixed(2)}</strong><span style={{ color: transaction.status === "completed" ? "#2E7D32" : "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{transaction.status}</span>{transaction.reversalType && <span style={{ display: "block", color: "#B91C1C", fontSize: 10 }}>Reversed: {transaction.reversalType}</span>}</span></div>)}</div>}    </div><div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Void & refund activity</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{permissionAccount.reversals.length} recent</span></div>{permissionAccount.reversals.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No voids or refunds yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{permissionAccount.reversals.map((reversal) => <div key={reversal.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{reversal.id} · {reversal.reversedAt ? formatFinanceDateTime(reversal.reversedAt) : "Unknown time"}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{reversal.amount.toFixed(2)}</strong><span style={{ color: "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{reversal.status}</span></span></div>)}</div>}</div><div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Attendance history</strong><button type="button" onClick={() => void clearEmployeeLogs(permissionAccount)} style={{ border: "1px solid #FCA5A5", borderRadius: 8, padding: "6px 9px", background: "#FEF2F2", color: "#B91C1C", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Archive log history</button></div>{permissionAccount.timeLogs.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No time logs yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{permissionAccount.timeLogs.map((log) => <div key={log.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>{log.shiftId ? <strong style={{ marginRight: 8, padding: "1px 7px", borderRadius: 6, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11 }}>Shift #{log.shiftId}</strong> : null}In: {formatFinanceDateTime(log.timeIn)}</span><span style={{ color: log.timeOut ? "#6B4C3B" : "#2E7D32", fontWeight: log.timeOut ? 400 : 700 }}>{log.timeOut ? `Out: ${formatFinanceDateTime(log.timeOut)}` : "Currently signed in"}</span></div>)}</div>}</div><div className="flex justify-end" style={{ marginTop: 22 }}><button type="button" onClick={() => setPermissionAccount(null)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 15px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer", fontWeight: 700 }}>Done</button></div></section></Modal>}
  </main>;
}

type ArchivedProduct = { id: number; name: string; category: string | null; price: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedProductVariant = { id: number; productId: number; productName: string; size: string | null; temperature: string | null; price: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedInventoryItem = { id: number; itemName: string; category: string | null; unit: string | null; quantity: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedAddition = { id: number; name: string; itemName: string; unit: string | null; quantity: number; price: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedSalesOrder = { id: number; totalAmount: number; status: string; createdAt: string; cashierName: string | null; archivedAt: string | null; archivedBy: string | null };
type ArchivedEmployeeTimeLog = { id: number; employeeName: string; timeIn: string; timeOut: string | null; archivedAt: string | null; archivedBy: string | null };
type ArchivesData = {
  products: ArchivedProduct[];
  productVariants: ArchivedProductVariant[];
  inventory: ArchivedInventoryItem[];
  additions: ArchivedAddition[];
  salesOrders: ArchivedSalesOrder[];
  employeeTimeLogs: ArchivedEmployeeTimeLog[];
};
type RestoreType = "product" | "product_variant" | "inventory" | "addition" | "sales_order" | "employee_time_log";
type ArchiveTab = "products" | "inventory" | "additions" | "sales" | "attendance";

function RestoreButton({ type, id, restoringKey, onRestore }: { type: RestoreType; id: number; restoringKey: string | null; onRestore: (type: RestoreType, id: number) => void }) {
  const key = `${type}:${id}`;
  return <button type="button" onClick={() => onRestore(type, id)} disabled={restoringKey === key} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #D97706", borderRadius: 8, padding: "8px 11px", background: "#FFF7ED", color: "#B45309", cursor: restoringKey === key ? "default" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}><IconRotateCcw size={12} />{restoringKey === key ? "Restoring..." : "Restore"}</button>;
}

function PurgeButton({ type, id, label, purgingKey, onPurge }: { type: RestoreType; id: number; label: string; purgingKey: string | null; onPurge: (type: RestoreType, id: number, label: string) => void }) {
  const key = `${type}:${id}`;
  return <button type="button" onClick={() => onPurge(type, id, label)} disabled={purgingKey === key} title="Permanently delete" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #FECACA", borderRadius: 8, padding: "8px 11px", background: "#FEF2F2", color: "#B91C1C", cursor: purgingKey === key ? "default" : "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}><IconTrash size={12} />{purgingKey === key ? "Deleting..." : "Delete forever"}</button>;
}

function ClearAllButton({ type, label, count, clearingType, onClearAll }: { type: RestoreType; label: string; count: number; clearingType: RestoreType | null; onClearAll: (type: RestoreType, label: string) => void }) {
  if (count === 0) return null;
  return <button type="button" onClick={() => onClearAll(type, label)} disabled={clearingType === type} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", background: "#FEF2F2", color: "#B91C1C", cursor: clearingType === type ? "default" : "pointer", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}><IconTrash size={12} />{clearingType === type ? "Clearing..." : `Permanently clear all (${count})`}</button>;
}

function ArchivesEmptyState({ label }: { label: string }) {
  return <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px dashed #D8C8BE", color: "#9C8278" }}>No archived {label} found.</div>;
}

function Archives() {
  const confirmAction = useConfirm();
  const [data, setData] = useState<ArchivesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<ArchiveTab>("products");
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [purgingKey, setPurgingKey] = useState<string | null>(null);
  const [clearingType, setClearingType] = useState<RestoreType | null>(null);

  const loadArchives = async () => {
    try {
      const response = await fetch("/api/archives", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load archives.");
      setData(payload.data ?? null);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load archives.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadArchives(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function restore(type: RestoreType, id: number) {
    const key = `${type}:${id}`;
    setRestoringKey(key);
    try {
      const response = await fetch("/api/archives", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to restore this record.");
      await loadArchives();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Failed to restore this record.");
    } finally {
      setRestoringKey(null);
    }
  }

  async function purge(type: RestoreType, id: number, label: string) {
    if (!(await confirmAction({ title: `Permanently delete this ${label}?`, message: <>This <strong>cannot be undone</strong>. It will be gone from Archives for good.</>, confirmLabel: "Delete permanently" }))) return;
    const key = `${type}:${id}`;
    setPurgingKey(key);
    setNotice("");
    try {
      const response = await fetch("/api/archives", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Failed to permanently delete this ${label}.`);
      setError("");
      await loadArchives();
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : `Failed to permanently delete this ${label}.`);
    } finally {
      setPurgingKey(null);
    }
  }

  async function clearAll(type: RestoreType, label: string) {
    if (!(await confirmAction({ title: `Permanently delete every archived ${label}?`, message: <>This <strong>cannot be undone</strong>. Anything still used elsewhere is skipped and stays in Archives.</>, confirmLabel: "Delete all permanently" }))) return;
    setClearingType(type);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/archives", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, clear_all: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Failed to clear archived ${label}s.`);
      const { deletedCount, skippedCount } = payload.data ?? {};
      if (skippedCount > 0) {
        setNotice(`Permanently deleted ${deletedCount} ${label}${deletedCount === 1 ? "" : "s"}. ${skippedCount} ${skippedCount === 1 ? "was" : "were"} kept because ${skippedCount === 1 ? "it is" : "they are"} still referenced elsewhere.`);
      } else {
        setNotice(`Permanently deleted ${deletedCount} ${label}${deletedCount === 1 ? "" : "s"}.`);
      }
      await loadArchives();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : `Failed to clear archived ${label}s.`);
    } finally {
      setClearingType(null);
    }
  }

  const tabs: { id: ArchiveTab; label: string; count: number }[] = data ? [
    { id: "products", label: "Products", count: data.products.length + data.productVariants.length },
    { id: "inventory", label: "Inventory", count: data.inventory.length },
    { id: "additions", label: "Additions", count: data.additions.length },
    { id: "sales", label: "Sales Records", count: data.salesOrders.length },
    { id: "attendance", label: "Attendance Logs", count: data.employeeTimeLogs.length },
  ] : [];

  return <main className="p-8">
    <div className="mb-6"><div style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Nothing is ever lost</div><h2 style={{ marginTop: 7, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-.03em" }}>Archives</h2><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13, maxWidth: 640 }}>Products, inventory items, additions, sales records, and cleared attendance logs are archived here instead of being permanently deleted. Restore anything back to where it came from at any time.</p></div>

    {error && <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{error}</div>}
    {notice && <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", fontSize: 13 }}>{notice}</div>}

    {loading ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading archives...</div> : !data ? null : <>
      <div className="flex items-center gap-2 mb-5" style={{ flexWrap: "wrap" }}>
        {tabs.map(({ id, label, count }) => <button key={id} type="button" onClick={() => setTab(id)} style={{ border: tab === id ? "1px solid #D97706" : "1px solid #E8DDD5", borderRadius: 10, padding: "9px 14px", background: tab === id ? "#3D2B1F" : "#FDF9F5", color: tab === id ? "#FDF9F5" : "#6B4C3B", cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>{label} <span style={{ opacity: 0.7 }}>({count})</span></button>)}
      </div>

      {tab === "products" && <div className="flex flex-col gap-6">
        <section>
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}><h3 style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Archived products</h3><ClearAllButton type="product" label="product" count={data.products.length} clearingType={clearingType} onClearAll={clearAll} /></div>
          {data.products.length === 0 ? <ArchivesEmptyState label="products" /> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Product", "Category", "Price", "Archived", "By", ""].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{data.products.map((product) => <tr key={product.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{product.name}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{product.category || "—"}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 13 }}>₱{product.price.toFixed(2)}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{product.archivedAt ? formatFinanceDateTime(product.archivedAt) : "—"}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{product.archivedBy || "—"}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><div className="flex items-center justify-end gap-2"><RestoreButton type="product" id={product.id} restoringKey={restoringKey} onRestore={restore} /><PurgeButton type="product" id={product.id} label="product" purgingKey={purgingKey} onPurge={purge} /></div></td></tr>)}</tbody></table></div></div>}
        </section>
        <section>
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}><h3 style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>Archived variants <span style={{ color: "#9C8278", fontWeight: 400, fontSize: 12 }}>(product itself is still active)</span></h3><ClearAllButton type="product_variant" label="variant" count={data.productVariants.length} clearingType={clearingType} onClearAll={clearAll} /></div>
          {data.productVariants.length === 0 ? <ArchivesEmptyState label="variants" /> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Product", "Variant", "Price", "Archived", "By", ""].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{data.productVariants.map((variant) => <tr key={variant.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{variant.productName}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{variant.size}{variant.temperature && variant.temperature !== "both" ? ` (${variant.temperature})` : ""}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 13 }}>₱{variant.price.toFixed(2)}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{variant.archivedAt ? formatFinanceDateTime(variant.archivedAt) : "—"}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{variant.archivedBy || "—"}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><div className="flex items-center justify-end gap-2"><RestoreButton type="product_variant" id={variant.id} restoringKey={restoringKey} onRestore={restore} /><PurgeButton type="product_variant" id={variant.id} label="variant" purgingKey={purgingKey} onPurge={purge} /></div></td></tr>)}</tbody></table></div></div>}
        </section>
      </div>}

      {tab === "inventory" && <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end"><ClearAllButton type="inventory" label="inventory item" count={data.inventory.length} clearingType={clearingType} onClearAll={clearAll} /></div>
        {data.inventory.length === 0 ? <ArchivesEmptyState label="inventory items" /> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Item", "Category", "Last Qty", "Archived", "By", ""].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{data.inventory.map((item) => <tr key={item.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{item.itemName}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{item.category || "—"}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 13 }}>{item.quantity} {item.unit}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{item.archivedAt ? formatFinanceDateTime(item.archivedAt) : "—"}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{item.archivedBy || "—"}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><div className="flex items-center justify-end gap-2"><RestoreButton type="inventory" id={item.id} restoringKey={restoringKey} onRestore={restore} /><PurgeButton type="inventory" id={item.id} label="inventory item" purgingKey={purgingKey} onPurge={purge} /></div></td></tr>)}</tbody></table></div></div>}
      </div>}

      {tab === "additions" && <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end"><ClearAllButton type="addition" label="addition" count={data.additions.length} clearingType={clearingType} onClearAll={clearAll} /></div>
        {data.additions.length === 0 ? <ArchivesEmptyState label="additions" /> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Addition", "Uses", "Price", "Archived", "By", ""].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{data.additions.map((addition) => <tr key={addition.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{addition.name}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{addition.quantity} {addition.unit} of {addition.itemName}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 13 }}>₱{addition.price.toFixed(2)}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{addition.archivedAt ? formatFinanceDateTime(addition.archivedAt) : "—"}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{addition.archivedBy || "—"}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><div className="flex items-center justify-end gap-2"><RestoreButton type="addition" id={addition.id} restoringKey={restoringKey} onRestore={restore} /><PurgeButton type="addition" id={addition.id} label="addition" purgingKey={purgingKey} onPurge={purge} /></div></td></tr>)}</tbody></table></div></div>}
      </div>}

      {tab === "sales" && <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end"><ClearAllButton type="sales_order" label="sales record" count={data.salesOrders.length} clearingType={clearingType} onClearAll={clearAll} /></div>
        {data.salesOrders.length === 0 ? <ArchivesEmptyState label="sales records" /> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Order", "Cashier", "Amount", "Status", "Archived", "By", ""].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{data.salesOrders.map((order) => <tr key={order.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>#{order.id}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{order.cashierName || "—"}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 13 }}>₱{order.totalAmount.toFixed(2)}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12, textTransform: "capitalize" }}>{order.status}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{order.archivedAt ? formatFinanceDateTime(order.archivedAt) : "—"}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{order.archivedBy || "—"}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><div className="flex items-center justify-end gap-2"><RestoreButton type="sales_order" id={order.id} restoringKey={restoringKey} onRestore={restore} /><PurgeButton type="sales_order" id={order.id} label="sales record" purgingKey={purgingKey} onPurge={purge} /></div></td></tr>)}</tbody></table></div></div>}
      </div>}

      {tab === "attendance" && <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end"><ClearAllButton type="employee_time_log" label="attendance log" count={data.employeeTimeLogs.length} clearingType={clearingType} onClearAll={clearAll} /></div>
        {data.employeeTimeLogs.length === 0 ? <ArchivesEmptyState label="attendance logs" /> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Employee", "Time in", "Time out", "Archived", "By", ""].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{data.employeeTimeLogs.map((log) => <tr key={log.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{log.employeeName}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{formatFinanceDateTime(log.timeIn)}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{log.timeOut ? formatFinanceDateTime(log.timeOut) : "—"}</td><td style={{ padding: "14px 16px", color: "#6B4C3B", fontSize: 12 }}>{log.archivedAt ? formatFinanceDateTime(log.archivedAt) : "—"}</td><td style={{ padding: "14px 16px", color: "#9C8278", fontSize: 12 }}>{log.archivedBy || "—"}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><div className="flex items-center justify-end gap-2"><RestoreButton type="employee_time_log" id={log.id} restoringKey={restoringKey} onRestore={restore} /><PurgeButton type="employee_time_log" id={log.id} label="attendance log" purgingKey={purgingKey} onPurge={purge} /></div></td></tr>)}</tbody></table></div></div>}
      </div>}
    </>}
  </main>;
}


function SignOutDialog({ onCancel, onConfirm, signingOut }: { onCancel: () => void; onConfirm: () => void; signingOut: boolean }) {
  return <Modal onClose={onCancel} closeDisabled={signingOut} labelledBy="admin-sign-out-title" zIndex={100}>
    <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 380px)", background: "#FDF9F5", boxShadow: "0 20px 60px rgba(61,43,31,0.25)" }}>
      <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Session</p>
      <h2 id="admin-sign-out-title" style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 21 }}>Sign out?</h2>
      <p style={{ margin: "9px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>You will need to sign in again to access the admin portal.</p>
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
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 48, height: 48, background: "#D97706", color: "#FDF9F5", boxShadow: "0 10px 24px rgba(217,119,6,0.35)" }}><IconCoffee size={24} /></div>
          <div>
            <p style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 20, color: "#FDF9F5", lineHeight: 1.1 }}>Brew Houze</p>
            <p style={{ margin: "3px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#F59E0B", letterSpacing: "0.12em" }}>ADMIN PORTAL</p>
          </div>
        </div>
        <div className="login-brand-copy">
          <h2 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 38, lineHeight: 1.1, color: "#FDF9F5" }}>Run the whole café from one place.</h2>
          <p style={{ margin: "14px 0 0", maxWidth: 380, color: "rgba(253,249,245,0.68)", fontSize: 14.5, lineHeight: 1.6 }}>Inventory, menu, shifts, finance and staff for Brew Houze, all in one dashboard.</p>
          <ul style={{ listStyle: "none", margin: "26px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
            {["Inventory, packaging and recipes", "Shift reports and cash drawer counts", "Staff accounts and attendance"].map((highlight) => <li key={highlight} className="flex items-center gap-3" style={{ color: "rgba(253,249,245,0.85)", fontSize: 13.5 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(217,119,6,0.2)", color: "#F59E0B", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>✓</span>{highlight}
            </li>)}
          </ul>
        </div>
        <p className="login-brand-foot" style={{ margin: 0, color: "rgba(253,249,245,0.4)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.08em" }}>BREW HOUZE CAFE · ADMIN PORTAL</p>
      </div>
    </section>
    <section className="login-panel">{children}</section>
  </main>;
}

function AdminLogin({ onLoggedIn, notice = "" }: { onLoggedIn: (session: AdminSession) => void; notice?: string }) {
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
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus placeholder="admin@brewhouze.com" />
    </span>
  </label>;

  return <PortalAuthLayout>
    {mode === "login" && <form onSubmit={signIn} className="login-card">
      <p style={authEyebrow}>Welcome back</p>
      <h1 style={authTitle}>Sign in to the admin portal</h1>
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

export default function App() {
  const [authUser, setAuthUser] = useState<AdminSession | null>(null);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [showSignOut, setShowSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = await response.json();
        if (active && response.ok) setAuthUser(payload.data);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // A session can be ended from elsewhere (password reset, or an admin signing the account out
  // of all devices). Check once a minute while visible and return to the login if it has ended.
  useEffect(() => {
    if (!authUser) return;
    const intervalId = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (response.status === 401) {
          setLoginNotice("You were signed out. Your password was reset or the account was signed out of all devices. Sign in to continue.");
          setAuthUser(null);
        }
      } catch {
        // Offline for a moment: keep the current screen and try again next minute.
      }
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [authUser]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setPage("dashboard");
    setShowSignOut(false);
    setSigningOut(false);
    setAuthUser(null);
  }

  async function confirmSignOut() {
    setSigningOut(true);
    await handleLogout();
  }

  async function refreshInventory() {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load inventory.");
      const nextInventory = payload.data ?? [];
      setInventory((current) => JSON.stringify(current) === JSON.stringify(nextInventory) ? current : nextInventory);
    } catch {
      setInventory((current) => current.length === 0 ? current : []);
    }
  }

  async function refreshProducts() {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load products.");
      const nextProducts = payload.data ?? [];
      setProducts((current) => JSON.stringify(current) === JSON.stringify(nextProducts) ? current : nextProducts);
    } catch (error) {
      console.error(error);
      setProducts((current) => current.length === 0 ? current : []);
    }
  }

  async function refreshCategories() {
    try {
      const response = await fetch("/api/product-categories", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load drink categories.");
      setCategories(payload.data ?? []);
    } catch (error) {
      console.error(error);
      setCategories([]);
    }
  }

  function handlePageChange(nextPage: Page) {
    setPage(nextPage);
    if (nextPage === "inventory" || nextPage === "products" || nextPage === "dashboard") {
      void refreshInventory();
      void refreshProducts();
    }
    if (nextPage === "products") {
      void refreshCategories();
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/inventory", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Failed to load inventory.");
        if (active) setInventory(payload.data ?? []);
      } catch {
        if (active) setInventory([]);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshCategories(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Failed to load products.");
        if (active) setProducts(payload.data ?? []);
      } catch (error) {
        console.error(error);
        if (active) setProducts([]);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let requestInFlight = false;
    const refreshWhenVisible = () => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      const refreshes = page === "dashboard"
        ? [refreshInventory(), refreshProducts()]
        : page === "inventory"
          ? [refreshInventory()]
          : page === "products"
            ? [refreshInventory(), refreshProducts(), refreshCategories()]
              : [];
      void Promise.all(refreshes)
        .finally(() => { requestInFlight = false; });
    };
    const intervalId = window.setInterval(() => {
      refreshWhenVisible();
    }, 15_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [page]);

  useEffect(() => {
    const collapseOnPhone = window.setTimeout(() => {
      if (window.innerWidth <= 640) setSidebarCollapsed(true);
    }, 0);
    return () => window.clearTimeout(collapseOnPhone);
  }, []);

  async function handleInventoryAdd() {
    await refreshInventory();
  }

  async function handleInventoryUpdate(updated: InventoryItem) {
    const response = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to update inventory.");
    setInventory((prev) => prev.map((item) => item.inventory_id === updated.inventory_id ? payload.data : item));
  }

  async function handleInventoryDelete(id: number) {
    const response = await fetch("/api/inventory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventory_id: id }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to archive inventory.");
    await refreshInventory();
  }

  async function handleProductAdd(product: Product) {
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: product.name,
        product_description: product.description,
        product_category: product.category,
        price: product.price,
        image_url: product.imageUrl,
        image_data: product.imageData,
        product_type: product.productType,
        variants: product.variants.map((variant) => ({ id: variant.id, size: variant.size, price: variant.price, temperature: variant.temperature, ingredients: variant.ingredients.map((ingredient) => ({ inventory_id: ingredient.inventoryId, required_quantity: ingredient.qty })) })),
        ingredients: product.ingredients.map((ingredient) => ({
          inventory_id: ingredient.inventoryId,
          required_quantity: ingredient.qty,
        })),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to add product.");
    setProducts((prev) => [
      ...prev.filter((item) => item.id !== payload.data.id),
      payload.data,
    ]);
    await refreshInventory();
  }

  async function handleProductEdit(product: Product) {
    const response = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.id,
        product_name: product.name,
        product_description: product.description,
        product_category: product.category,
        price: product.price,
        image_url: product.imageUrl,
        image_data: product.imageData,
        product_type: product.productType,
        variants: product.variants.map((variant) => ({ id: variant.id, size: variant.size, price: variant.price, temperature: variant.temperature, ingredients: variant.ingredients.map((ingredient) => ({ inventory_id: ingredient.inventoryId, required_quantity: ingredient.qty })) })),
        ingredients: product.ingredients.map((ingredient) => ({
          inventory_id: ingredient.inventoryId,
          required_quantity: ingredient.qty,
        })),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to update product.");
    setProducts((prev) => prev.map((item) => item.id === product.id ? payload.data : item));
    await refreshInventory();
  }

  async function handleProductDelete(id: number, variantSize?: string) {
    const response = await fetch("/api/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: id, variant_size: variantSize }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to archive product.");
    if (variantSize) {
      await refreshProducts();
    } else {
      setProducts((prev) => prev.filter((product) => product.id !== id));
    }
  }

  const pageTitles: Record<Page, string> = { dashboard: "Dashboard", inventory: "Inventory Management", products: "Menu", finance: "Finance", accounts: "Accounts & Employees", account: "My Account", archives: "Archives" };

  if (resetToken) return <PasswordResetScreen token={resetToken} onDone={finishPasswordReset} />;
  if (authLoading) return <div className="flex items-center justify-center min-h-screen" style={{ background: "#F8F9FA", color: "#9C8278" }}>Loading admin portal...</div>;
  if (!authUser) return <AdminLogin onLoggedIn={(session) => { setLoginNotice(""); setAuthUser(session); }} notice={loginNotice} />;

  function goTo(nextPage: Page) {
    setMoreOpen(false);
    handlePageChange(nextPage);
  }

  return <ConfirmProvider><div className="admin-shell">
    <Sidebar current={page} collapsed={sidebarCollapsed} user={authUser} onChange={goTo} onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)} onAccount={() => goTo("account")} />
    <div className="admin-main">
      <TopBar title={pageTitles[page]} page={page} user={authUser} onAccount={() => goTo("account")} onRequestLogout={() => setShowSignOut(true)} />
      <div className="app-content" style={{ flex: 1, overflowY: "auto", background: "#F8F9FA" }}>
        {page === "dashboard" && <Dashboard user={authUser} inventory={inventory} products={products} onNavigate={goTo} onRefreshStock={() => Promise.all([refreshInventory(), refreshProducts()])} />}
        {page === "inventory" && <Inventory items={inventory} onAdd={handleInventoryAdd} onUpdate={handleInventoryUpdate} onDelete={handleInventoryDelete} />}
        {page === "products" && <MenuManagement products={products} inventory={inventory} categories={categories} onCategoriesChange={setCategories} onAdd={handleProductAdd} onEdit={handleProductEdit} onDelete={handleProductDelete} onRefreshProducts={refreshProducts} />}
        {page === "finance" && <Finance />}
        {page === "accounts" && <Accounts />}
        {page === "archives" && <Archives />}
        {page === "account" && <AccountManagement user={authUser} onSignOut={() => setShowSignOut(true)} />}
      </div>
    </div>
    <MobileTabBar current={page} moreOpen={moreOpen} onChange={goTo} onMore={() => setMoreOpen((open) => !open)} />
    {moreOpen && <MoreSheet current={page} user={authUser} onChange={goTo} onAccount={() => goTo("account")} onRequestLogout={() => { setMoreOpen(false); setShowSignOut(true); }} onClose={() => setMoreOpen(false)} />}
    {showSignOut && <SignOutDialog onCancel={() => setShowSignOut(false)} onConfirm={() => void confirmSignOut()} signingOut={signingOut} />}
  </div></ConfirmProvider>;
}