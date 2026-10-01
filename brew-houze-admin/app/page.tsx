"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { MoneyField, PhoneField } from "@/lib/input-format";

type Page = "dashboard" | "shift" | "inventory" | "products" | "finance" | "treasury" | "insights" | "customers" | "loyalty" | "discounts" | "delivery" | "accounts" | "account" | "archives";

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
  // Customers may ask for less or none of it (the cashier sets it per cart line).
  is_customizable?: boolean;
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
  // Written off (see stock-write-off-migration.sql): why, what it was worth, and the waste report.
  write_off_reason?: string | null;
  write_off_cost?: number | string | null;
  write_off_request_id?: number | null;
  note?: string | null;
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
  // Where the items it goes on are made: drink add-ons (bar) or food add-ons (kitchen).
  station: Station;
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
function IconClock({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
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
// portrait (bottom tab bar + "More" sheet). Shares its look with the staff app.

const navItems: { id: Page; label: string; short: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", Icon: IconGrid },
  { id: "shift", label: "Shift", short: "Shift", Icon: IconClock },
  { id: "inventory", label: "Inventory", short: "Inventory", Icon: IconBox },
  { id: "products", label: "Menu", short: "Menu", Icon: IconCoffee },
  { id: "finance", label: "Finance", short: "Finance", Icon: IconDollar },
  { id: "treasury", label: "Treasury", short: "Treasury", Icon: IconSafe },
  { id: "insights", label: "Insights", short: "Insights", Icon: IconSparkle },
  { id: "customers", label: "Customers", short: "Customers", Icon: IconHeart },
  { id: "loyalty", label: "Loyalty", short: "Loyalty", Icon: IconStar },
  { id: "discounts", label: "Discounts", short: "Discounts", Icon: IconTag },
  { id: "delivery", label: "Delivery", short: "Delivery", Icon: IconTruck },
  { id: "accounts", label: "Accounts & Employees", short: "Employees", Icon: IconUsers },
  { id: "archives", label: "Archives", short: "Archives", Icon: IconArchive },
];

const navGroups: { label: string; items: Page[] }[] = [
  { label: "Overview", items: ["dashboard", "shift"] },
  { label: "Menu & Stock", items: ["inventory", "products"] },
  { label: "Business", items: ["finance", "treasury", "insights", "customers", "loyalty", "discounts", "delivery", "accounts", "archives"] },
];

// Destinations on the phone tab bar; everything else is under "More".
const mobileTabs: Page[] = ["dashboard", "shift", "inventory", "finance"];

// Initials on a colour picked from the name, the same as in the staff app.
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
          <span style={{ color: "#9C8278", fontSize: 11 }}>{checkedAt ? `Checked ${checkedAt.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}</span>
          <button type="button" onClick={() => void check()} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "7px 12px", background: "#F3EDE5", color: "#3D2B1F", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Check again</button>
        </div>
      </div>
    </>}
  </div>;
}

function Sidebar({ current, collapsed, user, onChange, onToggle, onAccount }: { current: Page; collapsed: boolean; user: AdminSession; onChange: (page: Page) => void; onToggle: () => void; onAccount: () => void }) {
  return <aside className={`admin-sidebar ${collapsed ? "is-collapsed" : ""}`}>
    <div className="admin-sidebar-brand">
      <Image src="/brand/badge.png" alt="" width={40} height={40} unoptimized style={{ flexShrink: 0, borderRadius: "50%", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }} />
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

// ─── Notification bell ──────────────────────────────────────────────────────────────────────────
// Alerts worked out by /api/notifications from existing records (stock, GCash problems, voids and
// refunds, drawer short or over, delivery problems, new customer sign-ups). Which ones were seen is remembered per
// device in the browser; keys of alerts that are gone are dropped, so an item that runs low
// again after a restock shows up as new.
type AdminNotification = { key: string; kind: "stock" | "payment" | "reversal" | "cash" | "customer" | "discount" | "delivery" | "waste"; tone: "danger" | "warning" | "info"; title: string; detail: string; at: string; page: Page };
const SEEN_NOTIFICATIONS_KEY = "brew-houze-admin-seen-notifications";
const NOTIFICATION_REFRESH_MS = 60_000;

function IconBell({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}

function readSeenNotifications(): Set<string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_NOTIFICATIONS_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeenNotifications(keys: Set<string>) {
  try { window.localStorage.setItem(SEEN_NOTIFICATIONS_KEY, JSON.stringify(Array.from(keys).slice(-500))); } catch { /* storage unavailable: everything shows as new */ }
}

function notificationAge(value: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

function NotificationBell({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error);
      const next: AdminNotification[] = payload.data ?? [];
      setItems(next);
      setFailed(false);
      setNow(Date.now());
      // Forget alerts that are gone, so they count as new if they come back.
      const current = new Set(next.map((item) => item.key));
      setSeen(() => {
        const kept = new Set(Array.from(readSeenNotifications()).filter((key) => current.has(key)));
        saveSeenNotifications(kept);
        return kept;
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, NOTIFICATION_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(first); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function markSeen(keys: string[]) {
    setSeen((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.add(key));
      saveSeenNotifications(next);
      return next;
    });
  }

  const list = items ?? [];
  const unread = list.filter((item) => !seen.has(item.key));
  const urgent = unread.some((item) => item.tone === "danger");
  const kindIcon = (kind: AdminNotification["kind"]) => kind === "waste" ? <IconTrash size={14} /> : kind === "stock" ? <IconBox size={15} /> : kind === "customer" ? <IconHeart size={15} /> : kind === "discount" ? <IconTag size={15} /> : kind === "delivery" ? <IconTruck size={15} /> : kind === "reversal" ? <IconX size={13} /> : <IconDollar size={15} />;

  return <div className="notif" ref={wrapRef}>
    <button type="button" className={`notif-bell${open ? " is-open" : ""}`} onClick={() => { setOpen((value) => !value); setNow(Date.now()); }} aria-label={unread.length ? `Notifications, ${unread.length} new` : "Notifications"} aria-expanded={open} title="Notifications">
      <IconBell />
      {unread.length > 0 && <span className={`notif-badge${urgent ? " is-urgent" : ""}`}>{unread.length > 99 ? "99+" : unread.length}</span>}
    </button>
    {open && <div className="notif-panel" role="dialog" aria-label="Notifications">
      <header className="notif-head">
        <div><strong>Notifications</strong><span>{unread.length ? `${unread.length} new` : "All caught up"}</span></div>
        {unread.length > 0 && <button type="button" className="inv-link" onClick={() => markSeen(list.map((item) => item.key))}>Mark all as read</button>}
      </header>
      {failed && <p className="notif-error">Could not refresh. Showing the last loaded alerts.</p>}
      {items === null ? <p className="notif-empty">Loading…</p>
        : list.length === 0 ? <p className="notif-empty">Nothing needs your attention. Stock, GCash problems, voids and refunds, drawer differences, delivery problems and new customers show up here.</p>
          : <ul className="notif-list">
            {list.map((item) => <li key={item.key}>
              <button type="button" className={`notif-item is-${item.tone}${seen.has(item.key) ? "" : " is-unread"}`} onClick={() => { markSeen([item.key]); setOpen(false); onNavigate(item.page); }}>
                <span className="notif-icon">{kindIcon(item.kind)}</span>
                <span className="notif-text"><strong>{item.title}</strong><em>{item.detail}</em><small>{item.kind === "stock" ? "Needs restocking" : notificationAge(item.at, now)}</small></span>
                {!seen.has(item.key) && <i className="notif-dot" aria-label="New" />}
              </button>
            </li>)}
          </ul>}
    </div>}
  </div>;
}

function TopBar({ title, page, user, onAccount, onNavigate, onRequestLogout }: { title: string; page: Page; user: AdminSession; onAccount: () => void; onNavigate: (page: Page) => void; onRequestLogout: () => void }) {
  return <header className="admin-topbar">
    <div className="flex items-center gap-3 min-w-0">
      <div className="admin-topbar-logo flex items-center justify-center" style={{ width: 36, height: 36, flexShrink: 0 }}><Image src="/brand/badge.png" alt="" width={36} height={36} unoptimized style={{ flexShrink: 0, borderRadius: "50%" }} /></div>
      <h1 className="admin-topbar-title">{title}</h1>
    </div>
    <div className="flex items-center gap-2.5">
      <ConnectionIndicator />
      <NotificationBell onNavigate={onNavigate} />
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

// 63 -> "1h 3m", 15 -> "15m"
function workedLabel(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  return whole >= 60 ? `${Math.floor(whole / 60)}h ${whole % 60}m` : `${whole}m`;
}

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
        <p style={{ margin: "3px 0 0", color: "rgba(253,249,245,0.55)", fontSize: 12 }}>{currentDevice ? `Signed in on this device (${currentDevice.device}) since ${new Date(currentDevice.signedInAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Loading…"}</p>
      </div>
      <button type="button" onClick={onSignOut} className="account-hero-switch flex items-center justify-center gap-2" style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(253,249,245,0.25)", background: "rgba(253,249,245,0.08)", color: "#FDF9F5", fontWeight: 700, fontSize: 13, cursor: "pointer" }}><IconLogOut size={17} />Sign out</button>
    </section>

    {loadError && <p style={{ margin: "14px 0 0", padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{loadError}</p>}

    <div className="grid gap-5" style={{ marginTop: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))", alignItems: "start" }}>
      <div className="flex flex-col gap-5">
        <AccountSection eyebrow="Right now" title={details?.shift ? "The café is open" : "The café is closed"}>
          {!details ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>Loading…</p> : details.shift ? <>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(110px, 100%), 1fr))" }}>
              {stat("Shift open", formatElapsed(details.shift.openedAt, now), `since ${new Date(details.shift.openedAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}${details.shift.openedByName ? ` by ${details.shift.openedByName.split(" ")[0]}` : ""}`)}
              {stat("Orders", String(details.shift.orders), `${details.shift.reversals} voided/refunded`)}
              {stat("Net sales", `₱${details.shift.netSales.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "so far this shift")}
            </div>
            <p style={{ margin: "10px 0 0", color: "#9C8278", fontSize: 12 }}>Full shift reports are in Finance.</p>
          </> : <p style={{ margin: 0, color: "#6B4C3B", fontSize: 13, lineHeight: 1.55 }}>No shift is open. A cashier opens one from the staff app to start taking orders; the mobile menu shows the café as closed until then.</p>}
        </AccountSection>

        <AccountSection eyebrow="Security" title="Signed-in devices" action={otherDevices.length > 0 ? <button type="button" onClick={() => void signOutOtherDevices()} disabled={signingOutOthers} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, fontWeight: 700, cursor: signingOutOthers ? "default" : "pointer", whiteSpace: "nowrap" }}>{signingOutOthers ? "Signing out…" : "Sign out other devices"}</button> : undefined}>
          {!details ? <p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>Loading…</p> : <div className="flex flex-col" style={{ border: "1px solid #F0E8E2", borderRadius: 12, overflow: "hidden", background: "#FFFFFF" }}>
            {details.devices.map((device, index) => <div key={device.id} style={{ padding: "10px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", fontSize: 13 }}>
              <strong style={{ color: "#3D2B1F" }}>{device.device}</strong>
              {device.isCurrent && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: "#DCFCE7", color: "#15803D", fontSize: 10.5, fontWeight: 800 }}>This device</span>}
              <span style={{ display: "block", marginTop: 2, color: "#9C8278", fontSize: 11.5 }}>{device.app === "cashier" ? "Staff app" : "Admin app"} · signed in {new Date(device.signedInAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
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
  voidCount: number; refundCount: number; reversedAmount: number; netSales: number; codReceived?: number;
  startingCash: number; expectedCash: number; countedCash: number | null; cashDifference: number | null; costOfGoods: number; uncostedItems: number;
};
type DashboardOrder = { orderId: number; queueNumber: number | null; status: string; total: number; discountLabel?: string | null; discountTotal?: number; paymentMethod: string; orderSource: string; createdAt: string; punchedBy: string; items: string };
type DashboardData = {
  shift: DashboardShift | null;
  previousShift: DashboardShift | null;
  trend: { day: string; orders: number; revenue: number }[];
  week: { costOfGoods: number; costedRevenue: number; uncostedItems: number; itemsSold: number };
  topProducts: { name: string; category: string; quantity: number; revenue: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  queue: { waiting: number; ready: number };
  // firstIn: first clock-in of the shift; timeIn: the current sign-in; workedHours: gaps excluded.
  staffOnDuty: { name: string; role: string; timeIn: string; firstIn: string; workedHours: number }[];
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

// Opening and closing the store from the admin app (Dashboard shift card).
// The safe as the open and close dialogs need it: whether it is in use, its balance, and the cash
// the last closing left in the drawer (see treasury-migration.sql).
type SafeSummary = { safe: { balance: number; live: boolean }; lastFloat: number };
function useSafeSummary(onLoaded?: (summary: SafeSummary) => void) {
  const [summary, setSummary] = useState<SafeSummary | null>(null);
  const loadedRef = useRef(onLoaded);
  useEffect(() => {
    let active = true;
    fetch("/api/treasury?view=summary", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => {
      if (!active || !payload?.data) return;
      setSummary(payload.data);
      loadedRef.current?.(payload.data);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return summary;
}

function AdminOpenShiftDialog({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const [startingCash, setStartingCash] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Starts from what the last closing left in the drawer.
  const safe = useSafeSummary((summary) => setStartingCash((typed) => typed === "" && summary.lastFloat > 0 ? summary.lastFloat.toFixed(2) : typed));
  const typedAmount = startingCash.trim() === "" ? null : Number(startingCash);
  const fromSafe = safe?.safe.live && typedAmount !== null && Number.isFinite(typedAmount) ? Math.round((typedAmount - safe.lastFloat) * 100) / 100 : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(startingCash);
    if (startingCash.trim() === "" || !Number.isFinite(amount) || amount < 0) { setError("Enter the starting cash in the drawer (0 if it is empty)."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", starting_cash: amount }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not open the store.");
      onOpened();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open the store.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Open the store">
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 440px)" }}>
      <div className="ui-confirm-icon" data-tone="default" aria-hidden="true" style={{ background: "#DCFCE7", color: "#15803D" }}>☕</div>
      <h2>Open the store</h2>
      <div className="ui-confirm-message">Starts today’s shift. Sales, queue numbers, attendance and stock changes are recorded under it until it is closed, even past midnight. The staff app and mobile menu open right away.</div>
      <label className="acc-money">
        <span>Starting cash in the drawer</span>
        <span className="acc-money-field"><b>₱</b><MoneyField data-autofocus value={startingCash} onChange={(typed) => setStartingCash(typed)} placeholder="0.00" /></span>
        {safe?.safe.live && <em style={{ color: fromSafe !== null && fromSafe > safe.safe.balance + 0.004 ? "#B91C1C" : "#6B4C3B" }}>
          {peso(safe.lastFloat)} was left in the drawer at the last closing.{" "}
          {fromSafe === null || Math.abs(fromSafe) < 0.005 ? "Nothing moves from the safe." : fromSafe > 0 ? `${peso(fromSafe)} comes from the safe (it has ${peso(safe.safe.balance)}).` : `${peso(-fromSafe)} goes back to the safe.`}
        </em>}
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="ui-button ui-button-primary" disabled={saving} style={{ background: "#15803D" }}>{saving ? "Opening…" : "Open the store"}</button>
      </div>
    </form>
  </Modal>;
}

function AdminCloseShiftDialog({ shift, onClose, onClosed }: { shift: DashboardShift; onClose: () => void; onClosed: () => void }) {
  const [counted, setCounted] = useState("");
  // Cash left in the drawer for the next shift; it starts as this shift's own starting cash.
  const [kept, setKept] = useState(shift.startingCash > 0 ? shift.startingCash.toFixed(2) : "0");
  const safe = useSafeSummary();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const countedAmount = counted.trim() === "" ? null : Number(counted);
  const difference = countedAmount === null || !Number.isFinite(countedAmount) ? null : countedAmount - shift.expectedCash;
  const differenceLabel = cashDifferenceLabel(difference);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (countedAmount === null || !Number.isFinite(countedAmount) || countedAmount < 0) { setError("Count the cash in the drawer and enter the amount."); return; }
    const keptAmount = kept.trim() === "" ? 0 : Number(kept);
    if (!Number.isFinite(keptAmount) || keptAmount < 0 || keptAmount > countedAmount) { setError("The cash left in the drawer can be ₱0 up to the counted cash."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", shift_id: shift.shiftId, counted_cash: countedAmount, float_kept: keptAmount, notes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not close the shift.");
      onClosed();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close the shift.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Close the shift">
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 480px)" }}>
      <div className="ui-confirm-icon" data-tone="danger" aria-hidden="true">⏻</div>
      <h2>Close shift #{shift.shiftId}</h2>
      <div className="ui-confirm-message">Everyone still on duty is clocked out, the staff app signs out, the queue clears, and the mobile menu shows the café as closed.</div>
      <div className="acc-close-facts">
        <div><span>Net sales</span><strong>{peso(shift.netSales)}</strong></div>
        <div><span>Orders</span><strong>{shift.orderCount}</strong></div>
        <div><span>Expected in drawer</span><strong>{peso(shift.expectedCash)}</strong></div>
      </div>
      <label className="acc-money">
        <span>Cash counted in the drawer</span>
        <span className="acc-money-field"><b>₱</b><MoneyField data-autofocus value={counted} onChange={(typed) => setCounted(typed)} placeholder="0.00" /></span>
        {difference !== null && <em style={{ color: differenceLabel.color }}>{differenceLabel.text}</em>}
      </label>
      <label className="acc-money">
        <span>Leave in the drawer for the next shift</span>
        <span className="acc-money-field"><b>₱</b><MoneyField value={kept} onChange={(typed) => setKept(typed)} placeholder="0.00" /></span>
        {countedAmount !== null && Number.isFinite(countedAmount) && (() => {
          const keptAmount = kept.trim() === "" ? 0 : Number(kept);
          if (!Number.isFinite(keptAmount) || keptAmount > countedAmount) return <em style={{ color: "#B91C1C" }}>Can be ₱0 up to the counted cash.</em>;
          const toSafe = countedAmount - keptAmount;
          return <em style={{ color: "#6B4C3B" }}>{safe?.safe.live ? `${peso(toSafe)} goes to the safe (it will have ${peso(safe.safe.balance + toSafe)}).` : `${peso(toSafe)} is taken out of the drawer. Start the safe in Treasury to keep track of it.`}</em>;
        })()}
      </label>
      <label className="acc-money">
        <span>Notes <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} placeholder="e.g. short because of a wrong change" style={{ ...packagingInput, resize: "vertical" }} />
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="ui-button ui-button-danger" disabled={saving}>{saving ? "Closing…" : "Close shift"}</button>
      </div>
    </form>
  </Modal>;
}

// Records cash put into or taken out of the drawer from the admin app, for the open shift.
// Once the safe is in use, a cash in is taken from it and a cash drop goes into it.
const adminDrawerReasons: Record<DrawerKind, string[]> = {
  cash_in: ["Change fund", "More change from the safe"],
  cash_out: ["Supplies", "Ice", "Delivery", "Staff meals", "Repairs & maintenance"],
  cash_drop: ["Moved to the safe"],
};

function AdminCashDrawerDialog({ expectedCash, onClose, onSaved }: { expectedCash: number; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<DrawerKind>("cash_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(adminDrawerReasons.cash_in[0]);
  const [otherReason, setOtherReason] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const value = Number(amount);
  const finalReason = reason === "__other__" ? otherReason.trim() : reason;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(value > 0)) { setError("Enter the amount."); return; }
    if (!finalReason) { setError("Choose or type a reason."); return; }
    if (!password) { setError("Enter your password to record this."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/cash-movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, amount: value, reason: finalReason, note, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") setPassword("");
      if (!response.ok) throw new Error(payload?.error || "Could not save the entry.");
      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Cash in or out">
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 460px)" }}>
      <h2>Cash in / cash out</h2>
      <div className="ui-confirm-message">Money added to or taken out of the drawer for reasons other than a sale. The drawer should have <b>{peso(expectedCash)}</b> right now. A cash in is taken from the safe and a cash drop goes into it; a cash out leaves the business. Entries cannot be deleted; fix a mistake with the opposite entry.</div>
      <div className="inv-range" role="group" aria-label="Kind" style={{ marginTop: 14, display: "flex" }}>
        {(Object.keys(adminDrawerReasons) as DrawerKind[]).map((key) => <button key={key} type="button" aria-pressed={kind === key} onClick={() => { setKind(key); setReason(adminDrawerReasons[key][0]); setError(""); }} style={{ flex: 1 }}>{drawerKindLabels[key]}</button>)}
      </div>
      <label className="acc-money">
        <span>Amount</span>
        <span className="acc-money-field"><b>₱</b><MoneyField data-autofocus value={amount} onChange={(typed) => { setAmount(typed); setError(""); }} placeholder="0.00" /></span>
      </label>
      <div className="menu-chips" role="group" aria-label="Reason" style={{ marginTop: 12, flexWrap: "wrap" }}>
        {[...adminDrawerReasons[kind], "__other__"].map((option) => <button key={option} type="button" aria-pressed={reason === option} onClick={() => { setReason(option); setError(""); }}>{option === "__other__" ? "Other…" : option}</button>)}
      </div>
      {reason === "__other__" && <input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} maxLength={60} placeholder="Type the reason" aria-label="Reason" style={{ ...packagingInput, marginTop: 8 }} />}
      <label className="acc-money">
        <span>Note <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder="e.g. receipt number" style={packagingInput} />
      </label>
      <label className="acc-money">
        <span>Your password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={packagingInput} />
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="ui-button ui-button-primary" disabled={saving}>{saving ? "Saving…" : `Record ${drawerKindLabels[kind].toLowerCase()}`}</button>
      </div>
    </form>
  </Modal>;
}

function DashboardShiftCard({ shift, previousShift, now, onOpenReports, onOpenStore, onCloseShift }: { shift: DashboardShift | null; previousShift: DashboardShift | null; now: number; onOpenReports: () => void; onOpenStore: () => void; onCloseShift: () => void }) {
  if (shift) {
    const cashIn = shift.cashSales + (shift.codReceived ?? 0);
    const paid = cashIn + shift.onlineSales;
    const cashShare = paid > 0 ? (cashIn / paid) * 100 : 0;
    const reversals = shift.voidCount + shift.refundCount;
    const longOpen = (now - new Date(shift.openedAt).getTime()) / HOUR_MS > LONG_OPEN_SHIFT_HOURS;
    return <section className="dash-shift">
      <div className="dash-shift-top">
        <span className="dash-shift-pill is-open"><span className="dash-live-dot" />Shift open</span>
        <span className="flex items-center gap-2">
          <button type="button" className="dash-shift-link" onClick={onOpenReports}>Shift details <IconChevron size={13} /></button>
          <button type="button" className="dash-shift-link is-close" onClick={onCloseShift}>Close shift</button>
        </span>
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
          {(shift.codReceived ?? 0) > 0 && <span><i className="is-cash" />Delivery cash {peso(shift.codReceived ?? 0)}</span>}
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
      {previousShift && <button type="button" className="dash-shift-link" onClick={onOpenReports}>Last shift <IconChevron size={13} /></button>}
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
    <div className="dash-shift-open">
      <button type="button" className="dash-open-store" onClick={onOpenStore}>Open the store</button>
      <p className="dash-shift-note">Starts the shift and opens the staff app and mobile menu. Cashiers you allow in Accounts & Employees can also open it from the counter.</p>
    </div>
  </section>;
}

function Dashboard({ user, inventory, products, onNavigate, onRefreshStock }: { user: AdminSession; inventory: InventoryItem[]; products: Product[]; onNavigate: (page: Page) => void; onRefreshStock: () => Promise<unknown> }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shiftAction, setShiftAction] = useState<"open" | "close" | null>(null);

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
          <DashboardShiftCard shift={data.shift} previousShift={data.previousShift} now={now} onOpenReports={() => onNavigate("shift")} onOpenStore={() => setShiftAction("open")} onCloseShift={() => setShiftAction("close")} />
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
                  {data.staffOnDuty.slice(0, 3).map((person) => <span key={`${person.name}-${person.timeIn}`} className="dash-staff-person" title={`${person.name} · first in ${clockTime(person.firstIn)} · ${workedLabel(person.workedHours * 60)} worked${person.firstIn !== person.timeIn ? ` · back since ${clockTime(person.timeIn)}` : ""}`}>
                    <UserAvatar name={person.name} size={22} />
                    <span>{person.name.split(/\s+/)[0]}<em> · since {clockTime(person.firstIn)}</em></span>
                  </span>)}
                  {data.staffOnDuty.length > 3 && <span className="dash-staff-more">+{data.staffOnDuty.length - 3} more</span>}
                </div>}
            />
          </div>
        </div>

        {shiftAction === "open" && <AdminOpenShiftDialog onClose={() => setShiftAction(null)} onOpened={() => { setShiftAction(null); void load(); }} />}
        {shiftAction === "close" && data.shift && <AdminCloseShiftDialog shift={data.shift} onClose={() => setShiftAction(null)} onClosed={() => { setShiftAction(null); void load(); }} />}

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
                  const channel = order.orderSource === "online" ? "Mobile" : order.paymentMethod === "split" ? "Split" : order.paymentMethod === "online" ? "Online" : "Cash";
                  return <li key={order.orderId}>
                    <span className="dash-order-queue">{order.queueNumber === null ? "—" : `#${order.queueNumber}`}</span>
                    <div className="dash-order-main">
                      <strong>{order.items || "Order"}</strong>
                      <span>{when} · {order.punchedBy} · <b className={`dash-channel is-${channel.toLowerCase()}`}>{channel}</b>{order.discountLabel && (order.discountTotal ?? 0) > 0 && <b className="order-discount-tag" title={order.discountLabel}>−{peso(order.discountTotal ?? 0)} {shortDiscountLabel(order.discountLabel)}</b>}</span>
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
    <MoneyField decimals={4} value={value} onChange={(typed) => onChange(typed)} placeholder="Not set" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }} />
    <div className="flex flex-wrap items-center gap-1.5" style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: "#9C8278" }}>
      or paid ₱<MoneyField value={purchaseTotal} onChange={(typed) => applyPurchase(typed, purchaseQuantity)} placeholder="850" style={smallInput} />
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
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Price per pack (₱) <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span><MoneyField value={draft.price} onChange={(typed) => setDraft((current) => ({ ...current, price: typed }))} placeholder="e.g. 850" style={packagingInput} /></label>
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
            <label className="flex flex-col gap-1.5"><span style={packagingLabel}>Price per pack (₱)</span><MoneyField value={packPrice} onChange={(typed) => setPackPrice(typed)} placeholder="Not recorded" style={packagingInput} /></label>
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
              <WizardField label={<>Price per package (₱) {optionalTag}</>} hint="Sets the item cost. Restocks update it as a weighted average."><MoneyField value={pack.price} onChange={(typed) => setPack((current) => ({ ...current, price: typed }))} placeholder="e.g. 850" style={packagingInput} /></WizardField>
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
  onWriteOff: (item: InventoryItem) => void;
  onCustomizable: (item: InventoryItem, value: boolean) => void;
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
              <button type="button" className="inv-mini" onClick={() => actions.onWriteOff(item)} disabled={Number(item.quantity) <= 0} title="Expired, damaged, spilled or used in-house">Write off</button>
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
          <label className={`inv-custom-switch${item.is_customizable ? " is-on" : ""}`}>
            <input type="checkbox" role="switch" checked={Boolean(item.is_customizable)} onChange={(event) => actions.onCustomizable(item, event.target.checked)} />
            <span className="inv-custom-track" aria-hidden="true"><span /></span>
            <span className="inv-custom-text"><strong>Customers can ask for less or none</strong><em>{item.is_customizable ? (item.is_whole_unit ? "The cashier can leave it out of an order, for example no lid." : "The cashier can set Less (half) or None on an order line.") : "Off: it is always used as the recipe says."}</em></span>
          </label>
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
                    <button type="button" className="inv-mini" onClick={() => actions.onWriteOff(portion)} disabled={Number(portion.derived_from_available_quantity ?? 0) <= 0} title="Write off portions (they come off the source)">Write off</button>
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
  restored: "Restored", purged: "Deleted for good", cost_updated: "Cost changed", written_off: "Written off",
};
const inventoryChangeTone: Record<string, string> = {
  created: "item", restocked: "restock", manual_edit: "manual", order_deduction: "order", void_restore: "return", refund_restore: "return",
  deleted: "item", archived: "item", restored: "item", purged: "item", cost_updated: "cost", written_off: "writeoff",
};
const historyTypeFilters: { id: string; label: string; types: string[] | null }[] = [
  { id: "all", label: "All changes", types: null },
  { id: "restock", label: "Restocks", types: ["restocked"] },
  { id: "orders", label: "Used by orders", types: ["order_deduction"] },
  { id: "returns", label: "Void & refund returns", types: ["void_restore", "refund_restore"] },
  { id: "manual", label: "Stock corrections", types: ["manual_edit"] },
  { id: "writeoff", label: "Written off", types: ["written_off"] },
  { id: "cost", label: "Cost changes", types: ["cost_updated"] },
  { id: "items", label: "Added & archived", types: ["created", "archived", "restored", "purged", "deleted"] },
];
const sourceAppLabels: Record<string, string> = { admin: "Admin", cashier: "Staff app", mobile: "Mobile Menu" };

function describeInventoryLog(log: InventoryLogEntry): string {
  const unit = log.unit_of_measure;
  const costBefore = toOptionalNumber(log.unit_cost_before);
  const costAfter = toOptionalNumber(log.unit_cost_after);
  const costChange = costAfter !== null && costBefore !== costAfter ? ` · cost ${costBefore === null ? "not set" : formatPeso(costBefore)} → ${formatPeso(costAfter)} per ${singularUnit(unit)}` : "";
  switch (log.change_type) {
    case "written_off": {
      const cost = toOptionalNumber(log.write_off_cost);
      return `${writeOffReasonLabel(log.write_off_reason)}${cost !== null ? ` · ${formatPeso(cost)}` : " · no cost"}${log.note ? ` · ${log.note}` : ""}`;
    }
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
  const counts = Object.entries(logs.reduce<Record<string, number>>((all, log) => {
    const label = inventoryChangeLabels[log.change_type] ?? log.change_type;
    all[label] = (all[label] ?? 0) + 1;
    return all;
  }, {})).sort((a, b) => b[1] - a[1]);
  const showsCost = (log: InventoryLogEntry) => log.change_type === "cost_updated" || Boolean(log.packaging_name);
  saveWorkbook([
    ["Summary", excelInfo([
      ["Brew Houze stock history"],
      ["Showing", rangeLabel],
      ["Generated", excelNow()],
      ["Entries", logs.length],
      [],
      ["Change type", "Entries"],
      ...counts.map(([label, count]) => [label, count] as ExcelInfoRow),
    ], ["Entries", ...counts.map(([label]) => label)])],
    ["Stock changes", excelTable(logs, [
      { header: "Date and time", value: (log) => excelDateTime(log.created_at) },
      { header: "Item", value: (log) => log.item_name },
      { header: "Category", value: (log) => log.ingredient_category },
      { header: "Change", value: (log) => inventoryChangeLabels[log.change_type] ?? log.change_type },
      { header: "Before", value: (log) => Number(log.quantity_before), kind: "number" },
      { header: "Change amount", value: (log) => Number(log.quantity_delta), kind: "number" },
      { header: "After", value: (log) => Number(log.quantity_after), kind: "number" },
      { header: "Unit", value: (log) => log.unit_of_measure },
      { header: "Details", value: (log) => describeInventoryLog(log) },
      { header: "Package", value: (log) => log.packaging_name ?? "" },
      { header: "Packs", value: (log) => log.packs_added === null || log.packs_added === undefined ? null : Number(log.packs_added), kind: "count" },
      { header: "Price per pack", value: (log) => toOptionalNumber(log.pack_price), kind: "money" },
      { header: "Written off as", value: (log) => log.change_type === "written_off" ? writeOffReasonLabel(log.write_off_reason) : "" },
      { header: "Written off cost", value: (log) => log.change_type === "written_off" ? toOptionalNumber(log.write_off_cost) : null, kind: "money" },
      { header: "Unit cost before", value: (log) => showsCost(log) ? toOptionalNumber(log.unit_cost_before) : null, kind: "cost" },
      { header: "Unit cost after", value: (log) => showsCost(log) ? toOptionalNumber(log.unit_cost_after) : null, kind: "cost" },
      { header: "Order #", value: (log) => log.order_id ?? null },
      { header: "Shift", value: (log) => log.shift_id ? `#${log.shift_id}` : "" },
      { header: "By", value: (log) => log.admin_name ?? "" },
      { header: "From", value: (log) => sourceAppLabels[log.source_app] ?? log.source_app },
    ])],
  ], `brew-houze-stock-history-${fileStamp}.xlsx`);
}

// Current stock for a stocktake: what is on hand, what it is worth, and what needs ordering.
function exportStockList(items: InventoryItem[]) {
  const stocked = items.filter((item) => !item.derived_from_inventory_id);
  const portions = items.filter((item) => item.derived_from_inventory_id);
  const status = (item: InventoryItem) => Number(item.quantity) <= 0 ? "Out of stock" : Number(item.quantity) <= Number(item.low_stock_threshold) ? "Running low" : "OK";
  const value = (item: InventoryItem) => { const cost = toOptionalNumber(item.effective_unit_cost ?? item.unit_cost); return cost === null ? null : Math.round(cost * Number(item.quantity) * 100) / 100; };
  const totalValue = stocked.reduce((sum, item) => sum + (value(item) ?? 0), 0);
  const byName = (a: InventoryItem, b: InventoryItem) => a.ingredient_category.localeCompare(b.ingredient_category) || a.item_name.localeCompare(b.item_name);
  const stamp = getFinanceDateStamp();
  saveWorkbook([
    ["Summary", excelInfo([
      ["Brew Houze stock list"],
      ["As of", excelNow()],
      ["Items", stocked.length],
      ["Out of stock", stocked.filter((item) => status(item) === "Out of stock").length],
      ["Running low", stocked.filter((item) => status(item) === "Running low").length],
      ["Without a cost", stocked.filter((item) => value(item) === null).length],
      ["Stock value (items with a cost)", totalValue],
    ], ["Items", "Out of stock", "Running low", "Without a cost"])],
    ["Stock", excelTable([...stocked].sort(byName), [
      { header: "Item", value: (item) => item.item_name },
      { header: "Category", value: (item) => item.ingredient_category },
      { header: "On hand", value: (item) => Number(item.quantity), kind: "number" },
      { header: "Unit", value: (item) => item.unit_of_measure },
      { header: "Alert at", value: (item) => Number(item.low_stock_threshold), kind: "number" },
      { header: "Status", value: status },
      { header: "Unit cost", value: (item) => toOptionalNumber(item.effective_unit_cost ?? item.unit_cost), kind: "cost" },
      { header: "Stock value", value, kind: "money" },
      { header: "Bought as", value: (item) => (item.packagings ?? []).map((pack) => `${pack.name}${pack.brand ? ` (${pack.brand})` : ""}: ${formatAmount(Number(pack.contentQuantity))} ${item.unit_of_measure}${toOptionalNumber(pack.lastPackPrice) !== null ? ` at ₱${Number(pack.lastPackPrice).toFixed(2)}` : ""}`).join("; ") },
      { header: "Last restocked", value: (item) => excelDateTime((item.packagings ?? []).map((pack) => pack.lastRestockedAt).filter((when): when is string => Boolean(when)).sort().pop()) },
      { header: "Used in", value: (item) => [
        ...(item.recipe_products ?? []),
        ...(item.direct_sale_products ?? []),
        ...(item.addition_names ?? []).map((name) => `${name} (add-on)`),
        ...portions.filter((portion) => portion.derived_from_inventory_id === item.inventory_id).map((portion) => `drinks through the ${portion.item_name} portion`),
      ].join(", ") },
    ])],
    ["Portions", portions.length ? excelTable([...portions].sort(byName), [
      { header: "Portion", value: (item) => item.item_name },
      { header: "Category", value: (item) => item.ingredient_category },
      { header: "Made from", value: (item) => item.derived_from_item_name ?? "" },
      { header: "Uses per portion", value: (item) => toOptionalNumber(item.derived_ratio), kind: "number" },
      { header: "Source unit", value: (item) => item.derived_from_unit_of_measure ?? "" },
      { header: "Portions possible", value: (item) => item.derived_ratio ? Math.floor(Number(item.derived_from_available_quantity ?? 0) / Number(item.derived_ratio)) : null, kind: "count" },
      { header: "Cost per portion", value: (item) => toOptionalNumber(item.effective_unit_cost), kind: "cost" },
    ]) : null],
  ], `brew-houze-stock-list-${stamp}.xlsx`);
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
        <option value="cashier">Staff app</option>
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

// ─── Write-offs: stock that leaves without being sold ─────────────────────────
// Expired or spoiled, damaged, spilled or wasted, or used in-house (see lib/write-offs.ts). Only
// admins write stock off: here directly, or by approving a waste report from the staff app. The
// cost of what is written off counts in Finance as stock written off.
const writeOffReasons: { id: string; label: string; hint: string }[] = [
  { id: "expired", label: "Expired or spoiled", hint: "Past its date, gone bad" },
  { id: "wasted", label: "Spilled or wasted", hint: "Dropped, spilled, made wrong" },
  { id: "damaged", label: "Damaged", hint: "Broken or torn packaging" },
  { id: "in_house", label: "Used in-house", hint: "Staff drinks, tasting, testing a recipe" },
  { id: "other", label: "Other", hint: "Say what happened in the note" },
];
const writeOffReasonLabel = (id: string | null | undefined) => id === "made_order" ? "Made, then voided or refunded" : writeOffReasons.find((reason) => reason.id === id)?.label ?? "Written off";

function WriteOffDialog({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: (message: string) => void }) {
  const unit = item.unit_of_measure;
  const portion = Boolean(item.derived_from_inventory_id);
  const available = portion ? Number(item.derived_from_available_quantity ?? 0) : Number(item.quantity);
  const unitCost = toOptionalNumber(item.effective_unit_cost ?? item.unit_cost);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("expired");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const value = Number(quantity);
  const cost = unitCost !== null && value > 0 ? Math.round(value * unitCost * 100) / 100 : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(value > 0) || (item.is_whole_unit && !Number.isInteger(value))) { setError(item.is_whole_unit ? "Enter how many (whole pieces)." : "Enter how much."); return; }
    if (value > available + 0.0005) { setError(`Only ${formatStock(available, unit)} is in stock.`); return; }
    if (reason === "other" && !note.trim()) { setError("Say what happened."); return; }
    if (!password) { setError("Enter your password to confirm."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/write-offs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "write_off", inventory_id: item.inventory_id, quantity: value, reason, note, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") setPassword("");
      if (!response.ok) throw new Error(payload?.error || "Could not write the stock off.");
      const total = payload?.data?.cost;
      onSaved(`Written off: ${formatStock(value, unit)} of ${item.item_name}${typeof total === "number" ? ` (${peso(total)})` : ""}. It counts in Finance as stock written off.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not write the stock off.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Write off stock">
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 470px)", textAlign: "left" }}>
      <h2>Write off {item.item_name}</h2>
      <div className="ui-confirm-message">Stock that leaves without being sold. It comes off now, and what it was worth counts in Finance as <b>stock written off</b>. To fix a miscount instead, use Edit.{portion ? <> A portion comes off its source, {item.derived_from_item_name}.</> : null}</div>
      <p className="tre-fixing">{formatStock(available, unit)} in stock{unitCost !== null ? ` · ${formatPeso(unitCost)} per ${singularUnit(unit)}` : " · no cost set, so it counts as ₱0"}</p>
      <label className="acc-money">
        <span>How much ({unit})</span>
        <input data-autofocus type="number" min={0} step={item.is_whole_unit ? 1 : "any"} inputMode={item.is_whole_unit ? "numeric" : "decimal"} value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(""); }} style={packagingInput} />
        {cost !== null && <em style={{ color: "#B91C1C" }}>{formatStock(value, unit)} × {formatPeso(unitCost ?? 0)} = {peso(cost)}</em>}
      </label>
      <p className="exp-label">What happened</p>
      <div className="menu-chips" role="group" aria-label="What happened" style={{ flexWrap: "wrap" }}>
        {writeOffReasons.map((option) => <button key={option.id} type="button" aria-pressed={reason === option.id} title={option.hint} onClick={() => { setReason(option.id); setError(""); }}>{option.label}</button>)}
      </div>
      <label className="acc-money">
        <span>Note {reason !== "other" && <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>}</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder={reason === "expired" ? "e.g. best before Sep 30" : "e.g. what happened"} style={packagingInput} />
      </label>
      <label className="acc-money">
        <span>Your password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={packagingInput} />
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="ui-button ui-button-danger" disabled={saving}>{saving ? "Writing off…" : `Write off${value > 0 ? ` ${formatStock(value, unit)}` : ""}`}</button>
      </div>
    </form>
  </Modal>;
}

type WasteReportAdmin = {
  id: number; kind: "product" | "item"; quantity: number; unit: string | null; label: string; reason: string; note: string | null; shiftId: number | null; status: string;
  decisionNote: string | null; approvedCost: number | null; requestedBy: string | null; decidedBy: string | null; createdAt: string; decidedAt: string | null;
  plan: { lines: { inventoryId: number; itemName: string; unit: string; quantity: number; available: number; unitCost: number | null; cost: number | null }[]; cost: number | null } | null;
  planError?: string;
};
const wasteStatusTone: Record<string, string> = { pending: "warning", approved: "ok", rejected: "danger", cancelled: "muted" };

function WasteReports({ onChanged, onCount }: { onChanged: () => void; onCount: (count: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [reports, setReports] = useState<WasteReportAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deciding, setDeciding] = useState<{ report: WasteReportAdmin; approve: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/write-offs?status=${showAll ? "all" : "pending"}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the waste reports.");
        if (active) { setReports(payload.data.requests); onCount(payload.data.pending); setError(""); }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load the waste reports.");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [showAll, reloadKey, onCount]);

  async function decide(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deciding) return;
    if (!deciding.approve && !note.trim()) { setError("Say why it is rejected."); return; }
    if (!password) { setError("Enter your password to confirm."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/write-offs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: deciding.approve ? "approve" : "reject", request_id: deciding.report.id, note, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") setPassword("");
      if (!response.ok) throw new Error(payload?.error || "Could not save the decision.");
      setNotice(deciding.approve ? `Approved: ${deciding.report.label} written off${typeof payload?.data?.cost === "number" ? ` (${peso(payload.data.cost)})` : ""}.` : `Rejected: ${deciding.report.label}.`);
      setDeciding(null);
      setNote("");
      setPassword("");
      setReloadKey((key) => key + 1);
      if (deciding.approve) onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the decision.");
    } finally {
      setSaving(false);
    }
  }

  const amount = (report: WasteReportAdmin) => `${Number(report.quantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })}${report.unit ? ` ${report.unit}` : " ×"} ${report.label}`;
  return <div className="flex flex-col gap-3">
    <div className="inv-head">
      <p className="inv-hint" style={{ maxWidth: 640 }}>Waste reported from the staff app: a spilled drink, expired milk, a staff drink. Nothing comes off stock until you approve it; then it is written off at its cost now and counts in Finance as stock written off.</p>
      <label className="inv-filter" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />Show decided ones (60 days)</label>
    </div>
    {notice && <div className="acc-notice" role="status">{notice}</div>}
    {error && !deciding && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
    {loading && reports.length === 0 ? <div className="inv-empty">Loading waste reports…</div>
      : reports.length === 0 ? <div className="inv-empty">{showAll ? "No waste reports in the last 60 days." : "No waste reports waiting. Staff report waste from the staff app (the Waste button by the shift)."}</div>
        : <ul className="wst-list">
          {reports.map((report) => <li key={report.id} className={`is-${wasteStatusTone[report.status] ?? "muted"}`}>
            <div className="wst-main">
              <strong>{amount(report)}</strong>
              <span>{writeOffReasonLabel(report.reason)} · {report.requestedBy ?? "—"} · {shiftTime(report.createdAt)}{report.shiftId ? ` · shift #${report.shiftId}` : ""}{report.note ? ` · “${report.note}”` : ""}</span>
              {report.plan && <ul className="wst-lines">{report.plan.lines.map((line) => <li key={line.inventoryId} className={line.quantity > line.available + 0.0005 ? "is-short" : undefined}>
                <span>{line.itemName}</span><span>−{formatStock(line.quantity, line.unit)}{line.quantity > line.available + 0.0005 ? ` (only ${formatStock(line.available, line.unit)} in stock)` : ""}</span><span>{line.cost === null ? "no cost" : peso(line.cost)}</span>
              </li>)}</ul>}
              {report.planError && <span style={{ color: "#B91C1C" }}>{report.planError}</span>}
              {report.status !== "pending" && <span className="wst-decision">{report.status === "approved" ? `Approved${report.approvedCost !== null ? `, ${peso(report.approvedCost)}` : ""}` : report.status === "rejected" ? "Rejected" : "Taken back by staff"}{report.decidedBy && report.status !== "cancelled" ? ` by ${report.decidedBy}` : ""}{report.decidedAt ? ` · ${shiftTime(report.decidedAt)}` : ""}{report.decisionNote && report.status !== "cancelled" ? ` · “${report.decisionNote}”` : ""}</span>}
            </div>
            <div className="wst-side">
              {report.status === "pending" ? <>
                <strong>{report.plan?.cost === null || report.plan?.cost === undefined ? "—" : peso(report.plan.cost)}</strong>
                <div className="flex gap-2">
                  <button type="button" className="inv-mini" onClick={() => { setError(""); setNote(""); setPassword(""); setDeciding({ report, approve: false }); }}>Reject</button>
                  <button type="button" className="inv-mini is-primary" disabled={!report.plan} onClick={() => { setError(""); setNote(""); setPassword(""); setDeciding({ report, approve: true }); }}>Approve</button>
                </div>
              </> : <span className={`wst-pill is-${report.status}`}>{report.status === "cancelled" ? "Taken back" : report.status.charAt(0).toUpperCase() + report.status.slice(1)}</span>}
            </div>
          </li>)}
        </ul>}
    {deciding && <Modal onClose={() => setDeciding(null)} closeDisabled={saving} label={deciding.approve ? "Approve the waste report" : "Reject the waste report"}>
      <form onSubmit={decide} className="ui-confirm" style={{ width: "min(100%, 440px)" }}>
        <h2>{deciding.approve ? "Approve and write off?" : "Reject this report?"}</h2>
        <div className="ui-confirm-message">{deciding.approve
          ? <><b>{amount(deciding.report)}</b> comes off stock now{deciding.report.plan?.cost !== null && deciding.report.plan?.cost !== undefined ? <>, worth <b>{peso(deciding.report.plan.cost)}</b></> : null}, as {writeOffReasonLabel(deciding.report.reason).toLowerCase()}.</>
          : <>Nothing comes off stock. {deciding.report.requestedBy ?? "The staff member"} sees that it was rejected, with your reason.</>}</div>
        <label className="acc-money">
          <span>{deciding.approve ? <>Note <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></> : "Why"}</span>
          <input data-autofocus value={note} onChange={(event) => { setNote(event.target.value); setError(""); }} maxLength={200} placeholder={deciding.approve ? "" : "e.g. It was found, not spilled"} style={packagingInput} />
        </label>
        <label className="acc-money">
          <span>Your password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={packagingInput} />
        </label>
        {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
        <div className="ui-confirm-actions">
          <button type="button" className="ui-button ui-button-secondary" onClick={() => setDeciding(null)} disabled={saving}>Cancel</button>
          <button type="submit" className={`ui-button ${deciding.approve ? "ui-button-primary" : "ui-button-danger"}`} disabled={saving}>{saving ? "Saving…" : deciding.approve ? "Approve and write off" : "Reject"}</button>
        </div>
      </form>
    </Modal>}
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
  const [tab, setTab] = useState<"stock" | "history" | "waste">("stock");
  const [writeOffItem, setWriteOffItem] = useState<InventoryItem | null>(null);
  const [wasteCount, setWasteCount] = useState(0);
  const [stockNotice, setStockNotice] = useState("");
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
      // A portion can have its own category (Espresso Shot in "Coffee Shot"): picking it shows the
      // item it is drawn from, opened so the portion is visible.
      if (filters.category !== "all") {
        const ownCategory = group.item.ingredient_category === filters.category;
        if (!ownCategory && !group.portions.some((portion) => portion.ingredient_category === filters.category)) return false;
        if (!ownCategory) matchedChild.add(group.item.inventory_id);
      }
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

  async function setCustomizable(target: InventoryItem, value: boolean) {
    setItems((prev) => prev.map((item) => item.inventory_id === target.inventory_id ? { ...item, is_customizable: value } : item));
    try {
      setActionError("");
      const response = await fetch("/api/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customizable_edit: true, inventory_id: target.inventory_id, is_customizable: value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not change the setting.");
    } catch (err) {
      setItems((prev) => prev.map((item) => item.inventory_id === target.inventory_id ? { ...item, is_customizable: !value } : item));
      setActionError(err instanceof Error ? err.message : "Could not change the setting.");
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
    onWriteOff: (item) => { setActionError(""); setStockNotice(""); setWriteOffItem(item); },
    onCustomizable: (item, value) => void setCustomizable(item, value),
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
          <button type="button" role="tab" aria-selected={tab === "waste"} onClick={() => setTab("waste")}><IconTrash size={13} />Waste reports{wasteCount > 0 && <span className="menu-tab-count">{wasteCount}</span>}</button>
        </div>
        {tab === "stock" && <div className="flex items-center gap-2">
          <button type="button" className="inv-secondary" onClick={() => exportStockList(items)} disabled={items.length === 0}><IconDownload size={14} />Export stock list</button>
          <button type="button" className="inv-primary" onClick={() => { setActionError(""); setAddPreset({}); }}><IconPlus size={15} />Add inventory</button>
        </div>}
      </div>

      {actionError && <div className="inv-alert" role="alert">
        <span>{actionError}</span>
        <button type="button" onClick={() => setActionError("")} title="Dismiss"><IconX size={14} /></button>
      </div>}

      {stockNotice && tab === "stock" && <div className="acc-notice" role="status">{stockNotice}</div>}
      {tab === "waste" ? <WasteReports onChanged={() => void reload()} onCount={setWasteCount} /> : tab === "history" ? <InventoryHistory focus={historyFocus} onClearFocus={() => setHistoryFocus(null)} /> : loading ? <div className="inv-empty">Loading inventory…</div>
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
    {writeOffItem && <WriteOffDialog item={writeOffItem} onClose={() => setWriteOffItem(null)} onSaved={(message) => { setWriteOffItem(null); setStockNotice(message); void reload(); }} />}
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
// Where a product is made: the bar or the kitchen (each has its own queue in the staff app).
type Station = "bar" | "kitchen";
const STATION_TEXT: Record<Station, string> = { bar: "☕ Bar", kitchen: "🍳 Kitchen" };
type Product = { id: number; name: string; description: string; category: string; productType: ProductType; station?: Station; imageUrl: string; imageData: string; price: number; hasSales?: boolean; ingredients: ProductIngredient[]; variants: ProductVariant[] };


type DraftIngredient = { inventoryId: number; qty: string };
// "none": a plain option with no hot or cold, such as Regular, With Rice or Ala Carte (food).
type DraftVariant = { size: string; price: string; temperature: "hot" | "cold" | "none"; ingredients: DraftIngredient[]; active: boolean };
// How a recipe product's choices are set up: the drink grid (sizes, hot and cold) or plain options.
type VariantMode = "sizes" | "options";

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
    const match = existing.find((variant) => variant.size.trim().toLowerCase() === size.toLowerCase() && variant.temperature === temperature);
    return match
      ? { size: match.size, price: String(match.price), temperature, ingredients: match.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })), active: true }
      : { size, price: "", temperature, ingredients: [], active: false };
  }));

  for (const variant of existing.filter((item) => item.temperature === "both" || !standardVariantSizes.some((size) => size.toLowerCase() === item.size.trim().toLowerCase()))) {
    if (variant.temperature === "both") {
      seeded.push({ size: variant.size || "Regular", price: String(variant.price), temperature: "none", ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })), active: true });
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

// The station decides the layout: bar drinks get sizes, kitchen items get plain options. A bar
// product already set up with plain options only (Affogato) keeps them.
function variantModeFor(product: Product | undefined, station: Station): VariantMode {
  if (station === "kitchen") return "options";
  if (product && product.variants.length > 0) return product.variants.every((variant) => variant.temperature === "both") ? "options" : "sizes";
  return "sizes";
}
const inVariantMode = (variant: DraftVariant, mode: VariantMode) => mode === "options" ? variant.temperature === "none" : variant.temperature !== "none";

// ─── Menu: products, add-ons and categories on one page ──────────────────────
// Availability and cost are worked out from current inventory, so the list shows at a glance
// what can be sold right now, what is short, and how much each item earns.

type VariantInsight = { key: string; label: string; short: string; price: number; cost: number | null; available: boolean; missing: string[] };
type ProductInsight = { variants: VariantInsight[]; minPrice: number; maxPrice: number; status: "available" | "partial" | "soldout"; costKnown: boolean; costPartial: boolean; minCost: number | null; marginPct: number | null; shortItems: string[]; stockLeft: number | null };
type MenuTab = "products" | "addons" | "categories" | "requests";

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

// The menu with the cost and margin of every size, from the current inventory costs.
function exportMenu(products: Product[], inventory: InventoryItem[]) {
  type MenuRow = { product: Product; variant: ProductVariant; cost: number | null; available: boolean };
  const rows: MenuRow[] = [];
  for (const product of [...products].sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name))) {
    const insight = productInsight(product, inventory);
    const source = product.variants.length ? product.variants : [{ size: "", price: product.price, temperature: "both" as ProductTemperature, ingredients: product.ingredients }];
    source.forEach((variant, index) => rows.push({ product, variant, cost: insight.variants[index]?.cost ?? null, available: insight.variants[index]?.available ?? false }));
  }
  const margin = (row: MenuRow) => row.cost === null ? null : Math.round((Number(row.variant.price) - row.cost) * 100) / 100;
  const marginRate = (row: MenuRow) => row.cost === null || Number(row.variant.price) <= 0 ? null : Math.round(((Number(row.variant.price) - row.cost) / Number(row.variant.price)) * 1000) / 10;
  const itemName = (id: number) => inventory.find((item) => item.inventory_id === id)?.item_name ?? "an item";
  const itemUnit = (id: number) => inventory.find((item) => item.inventory_id === id)?.unit_of_measure ?? "";
  saveWorkbook([
    ["Summary", excelInfo([
      ["Brew Houze menu and costing"],
      ["As of", excelNow()],
      ["Products", products.length],
      ["Sizes", rows.length],
      ["Sizes without a cost", rows.filter((row) => row.cost === null).length],
      ["Sizes that cannot be made now", rows.filter((row) => !row.available).length],
      [],
      ["Costs use the current unit cost of each inventory item."],
    ], ["Products", "Sizes", "Sizes without a cost", "Sizes that cannot be made now"])],
    ["Menu", excelTable(rows, [
      { header: "Product", value: (row) => row.product.name },
      { header: "Category", value: (row) => row.product.category || "Uncategorized" },
      { header: "Type", value: (row) => row.product.productType === "stock" ? "Direct sale" : "Made to order" },
      { header: "Made at", value: (row) => row.product.station === "kitchen" ? "Kitchen" : "Bar" },
      { header: "Size", value: (row) => row.variant.size || "Regular" },
      { header: "Temperature", value: (row) => row.variant.temperature === "hot" ? "Hot" : row.variant.temperature === "cold" ? "Cold" : "" },
      { header: "Price", value: (row) => Number(row.variant.price), kind: "money" },
      { header: "Cost", value: (row) => row.cost, kind: "money" },
      { header: "Margin", value: margin, kind: "money" },
      { header: "Margin %", value: marginRate, kind: "number" },
      { header: "Can be made now", value: (row) => row.available ? "Yes" : "No" },
      { header: "Recipe", value: (row) => row.variant.ingredients.map((ingredient) => {
        const unit = itemUnit(ingredient.inventoryId);
        const name = ingredient.label || itemName(ingredient.inventoryId);
        return isWholeUnit(unit) ? `${name} ×${formatAmount(Number(ingredient.qty))}` : `${name} ${formatAmount(Number(ingredient.qty))} ${unit === "grams" ? "g" : unit}`;
      }).join(", ") },
    ])],
  ], `brew-houze-menu-${getFinanceDateStamp()}.xlsx`);
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

// Menu photos only need to look good on a card or a phone screen, so they are resized to at
// most 800 px and saved as WebP (JPEG where the browser cannot make WebP) before upload: a
// 4 MB phone photo becomes roughly 40-80 KB. Keeps the database and every menu load small.
const PRODUCT_IMAGE_MAX_SIDE = 800;
async function shrinkProductImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("unreadable"));
      element.src = url;
    });
    const scale = Math.min(1, PRODUCT_IMAGE_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", 0.8);
    if (webp.startsWith("data:image/webp")) return webp;
    // No WebP encoder (older Safari): JPEG has no transparency, so paint a white background.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// How an order with drinks and food is called at the counter (store_settings.pickup_mode, see
// /api/stations): together when every part is ready, or each part on its own.
function PickupModeButton() {
  const [mode, setMode] = useState<"together" | "separate" | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/stations", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: { pickupMode: "together" | "separate" } } | null) => { if (active && payload?.data) setMode(payload.data.pickupMode); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function choose(next: "together" | "separate") {
    if (saving || next === mode) { setOpen(false); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/stations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickupMode: next }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save.");
      setMode(next); setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }
  if (mode === null) return null;
  return <>
    <button type="button" className="inv-secondary" onClick={() => setOpen(true)} title="How orders with drinks and food are called">🔔 Pickup: {mode === "separate" ? "Separately" : "Together"}</button>
    {open && <Modal onClose={() => setOpen(false)} closeDisabled={saving} label="Pickup">
      <div className="pickup-dialog">
        <DialogHeader title="Orders with drinks and food" sub="How the counter calls them. The bar and the kitchen always mark their own part ready." onClose={() => setOpen(false)} disabled={saving} />
        <div className="pickup-options" role="radiogroup" aria-label="Pickup">
          {([["together", "Called together", "The number is called once, when the drinks and the food are both ready. One pickup."], ["separate", "Called separately", "Drinks and food are each called when they are ready. The customer may pick up twice."]] as const).map(([value, title, text]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} disabled={saving} onClick={() => void choose(value)}><strong>{title}</strong><span>{text}</span></button>
          ))}
        </div>
        {error && <p className="pickup-error">{error}</p>}
      </div>
    </Modal>}
  </>;
}

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
      <span className="menu-card-category">{product.category || "Uncategorized"} · <span className={`menu-station is-${product.station ?? "bar"}`}>{STATION_TEXT[product.station ?? "bar"]}</span></span>
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
  const [draft, setDraft] = useState({ name: addon?.addition_name ?? "", inventoryId: addon ? String(addon.inventory_id) : "", quantity: addon ? String(addon.quantity) : "", price: addon ? String(addon.price) : "", station: addon?.station ?? "bar" as Station });
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
        body: JSON.stringify({ addition_id: addon?.addition_id, addition_name: draft.name.trim(), inventory_id: Number(draft.inventoryId), quantity, price, station: draft.station }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the add-on.");
      const row = payload.data;
      onSaved({ addition_id: Number(row.addition_id), addition_name: row.addition_name, inventory_id: Number(row.inventory_id), item_name: row.item_name, unit_of_measure: row.unit_of_measure, quantity: Number(row.quantity), price: Number(row.price), station: row.station === "kitchen" ? "kitchen" : "bar" });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the add-on.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label={addon ? "Edit add-on" : "Add add-on"}>
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 540, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={addon ? "Edit add-on" : "Add an add-on"} sub="Punched on its own at the POS and attached to an item in the cart made at the same station." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5">
        <div className="menu-addon-station" role="radiogroup" aria-label="Goes on">
          {([["bar", "☕ Drink add-on", "Goes on bar items, e.g. Extra Shot"], ["kitchen", "🍳 Food add-on", "Goes on kitchen items, e.g. Extra Rice"]] as const).map(([value, title, hint]) => <button key={value} type="button" role="radio" aria-checked={draft.station === value} onClick={() => setDraft((current) => ({ ...current, station: value }))} disabled={saving}><strong>{title}</strong><span>{hint}</span></button>)}
        </div>
        <div className="inv-step-grid">
          <WizardField label="Add-on name"><input data-autofocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={draft.station === "kitchen" ? "e.g. Extra Rice, Extra Egg" : "e.g. Extra Shot, Oat Milk"} style={packagingInput} /></WizardField>
          <WizardField label="Selling price (₱)"><MoneyField value={draft.price} onChange={(typed) => setDraft((current) => ({ ...current, price: typed }))} placeholder="e.g. 30" style={packagingInput} /></WizardField>
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
  const [stationFilter, setStationFilter] = useState<"all" | Station>("all");
  const [editing, setEditing] = useState<AdditionItem | null | "new">(null);
  const [actionError, setActionError] = useState("");

  const rows = useMemo(() => addons.map((addon) => ({ addon, insight: addonInsight(addon, inventory) })), [addons, inventory]);
  const shown = rows
    .filter(({ addon, insight }) => {
      const query = search.trim().toLowerCase();
      if (query && !addon.addition_name.toLowerCase().includes(query) && !addon.item_name.toLowerCase().includes(query)) return false;
      if (stationFilter !== "all" && addon.station !== stationFilter) return false;
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
      <label className="inv-filter"><span>Goes on</span>
        <select value={stationFilter} onChange={(event) => setStationFilter(event.target.value as typeof stationFilter)} className="inv-select">
          <option value="all">Drinks and food</option><option value="bar">☕ Drinks</option><option value="kitchen">🍳 Food</option>
        </select>
      </label>
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
        <p>Add-ons like an <b>Extra Shot</b> or <b>Extra Rice</b> are punched at the POS and attached to a drink or a dish. Each one uses an inventory item, so stock stays accurate.</p>
        <button type="button" className="inv-primary" onClick={() => setEditing("new")} disabled={inventory.length === 0}><IconPlus size={15} />Add add-on</button>
      </div>
        : shown.length === 0 ? <div className="inv-empty">No add-ons match. <button type="button" className="inv-link" onClick={() => { setSearch(""); setAvailability("all"); }}>Clear filters</button></div>
          : <div className="menu-addon-grid">
            {shown.map(({ addon, insight }) => <article key={addon.addition_id} className={`menu-addon is-${insight.status}`}>
              <div className="menu-addon-top">
                <span className="menu-addon-icon"><IconSparkle size={16} /></span>
                <div className="menu-addon-name"><strong>{addon.addition_name}</strong><span>{formatStock(Number(addon.quantity), addon.unit_of_measure)} of {addon.item_name} · <span className={`menu-station is-${addon.station}`}>{addon.station === "kitchen" ? "🍳 Food" : "☕ Drinks"}</span></span></div>
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

// Quick requests: the buttons the cashier taps in the Customize window (Less ice, Spicy...), each
// for drinks or food. Notes only, so a removed one is simply gone (orders keep the text).
type QuickRequest = { id: number; text: string; station: Station };

function RequestsPanel() {
  const confirmAction = useConfirm();
  const [requests, setRequests] = useState<QuickRequest[] | null>(null);
  const [drafts, setDrafts] = useState<Record<Station, string>>({ bar: "", kitchen: "" });
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quick-requests", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the requests.");
        if (active) setRequests(payload.data ?? []);
      } catch (loadError) {
        if (active) { setRequests([]); setError(loadError instanceof Error ? loadError.message : "Could not load the requests."); }
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, fallback: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/quick-requests", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  async function add(station: Station) {
    const text = drafts[station].trim();
    if (!text) return;
    const created = await send("POST", { request_text: text, station }, "Could not add the request.");
    if (created) { setRequests((current) => [...(current ?? []), created]); setDrafts((current) => ({ ...current, [station]: "" })); }
  }

  async function saveEdit(entry: QuickRequest) {
    if (!editing || !editing.text.trim()) return;
    const saved = await send("PATCH", { request_id: entry.id, request_text: editing.text.trim(), station: entry.station }, "Could not save the request.");
    if (saved) { setRequests((current) => (current ?? []).map((item) => item.id === entry.id ? saved : item)); setEditing(null); }
  }

  async function remove(entry: QuickRequest) {
    if (!(await confirmAction({ title: `Remove ${entry.text}?`, message: "It disappears from the Customize window. Orders that already have it keep it.", confirmLabel: "Remove request" }))) return;
    const removed = await send("DELETE", { request_id: entry.id }, "Could not remove the request.");
    if (removed) setRequests((current) => (current ?? []).filter((item) => item.id !== entry.id));
  }

  if (requests === null) return <div className="inv-empty">Loading requests…</div>;
  return <div className="flex flex-col gap-4">
    <p className="inv-hint">Quick buttons the cashier taps in the Customize window of a cart item. Drinks only show drink requests and dishes only food requests. They are notes for the bar and kitchen, so they never change stock or price. For less or none of an ingredient, use the switch on the item in Inventory.</p>
    {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
    <div className="menu-req-columns">
      {([["bar", "☕ Drinks", "e.g. Less ice, Extra hot"], ["kitchen", "🍳 Food", "e.g. Spicy, Well done"]] as const).map(([station, title, example]) => {
        const list = requests.filter((entry) => entry.station === station);
        return <section key={station} className="menu-req-column">
          <h3>{title} <span>{list.length}</span></h3>
          <form className="menu-cat-add" onSubmit={(event) => { event.preventDefault(); void add(station); }}>
            <div className="inv-search is-wide" style={{ color: "#D97706" }}>
              <IconPlus size={14} />
              <input value={drafts[station]} maxLength={40} onChange={(event) => setDrafts((current) => ({ ...current, [station]: event.target.value }))} placeholder={`New request, ${example}`} aria-label={`New ${station === "kitchen" ? "food" : "drink"} request`} />
            </div>
            <button type="submit" className="inv-primary" disabled={saving || !drafts[station].trim()} style={{ opacity: saving || !drafts[station].trim() ? 0.55 : 1 }}>Add</button>
          </form>
          {list.length === 0 ? <div className="inv-empty">No {station === "kitchen" ? "food" : "drink"} requests yet.</div>
            : <ul className="menu-cat-list">
              {list.map((entry) => {
                const isEditing = editing?.id === entry.id;
                return <li key={entry.id}>
                  {isEditing
                    ? <input autoFocus value={editing.text} maxLength={40} onChange={(event) => setEditing({ id: entry.id, text: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveEdit(entry); } if (event.key === "Escape") setEditing(null); }} style={{ ...packagingInput, flex: 1 }} aria-label={`New text for ${entry.text}`} />
                    : <div className="menu-cat-name"><strong>{entry.text}</strong></div>}
                  <div className="inv-node-actions">
                    {isEditing ? <>
                      <button type="button" className="inv-mini" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                      <button type="button" className="inv-mini" style={{ background: "#3D2B1F", color: "#FDF9F5", borderColor: "#3D2B1F" }} onClick={() => void saveEdit(entry)} disabled={saving || !editing.text.trim()}>Save</button>
                    </> : <>
                      <button type="button" className="inv-mini" onClick={() => setEditing({ id: entry.id, text: entry.text })}><IconPencil size={12} />Rename</button>
                      <button type="button" className="inv-mini is-danger" onClick={() => void remove(entry)} disabled={saving} title={`Remove ${entry.text}`} aria-label={`Remove ${entry.text}`}><IconTrash size={12} /></button>
                    </>}
                  </div>
                </li>;
              })}
            </ul>}
        </section>;
      })}
    </div>
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
        if (active) setAddons((payload.data ?? []).map((row: { id: number; name: string; inventoryId: number; itemName: string; unit: string; quantity: number; price: number; station?: string }) => ({ addition_id: Number(row.id), addition_name: row.name, inventory_id: Number(row.inventoryId), item_name: row.itemName, unit_of_measure: row.unit, quantity: Number(row.quantity), price: Number(row.price), station: row.station === "kitchen" ? "kitchen" : "bar" })));
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
    { id: "requests", label: "Requests", count: null, Icon: IconPencil },
  ];

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-head">
        <div className="inv-tabs" role="tablist" aria-label="Menu sections">
          {tabs.map(({ id, label, count, Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={15} />{label}{count !== null && <span className="menu-tab-count">{count}</span>}</button>)}
        </div>
      </div>
      {tab === "products" && <ProductManagement products={products} inventory={inventory} categories={categories} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} onCategoryCreated={(category) => onCategoriesChange([...categories.filter((entry) => entry.id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name)))} />}
      {tab === "addons" && <AddonsPanel addons={addons} loading={addonsLoading} error={addonsError} inventory={inventory} onChange={setAddons} />}
      {tab === "requests" && <RequestsPanel />}
      {tab === "categories" && <CategoriesPanel categories={categories} products={products} onChange={onCategoriesChange} onRenamed={() => void onRefreshProducts()} onShowProducts={(category) => { setCategoryFilter(category); setTab("products"); }} />}
    </div>
  </div>;
}

// Category field of the product window. A new category can be created right here, so adding
// the first product never requires leaving the window for the Categories tab.
function CategoryPicker({ value, names, onChange, onCreated, inputStyle }: { value: string; names: string[]; onChange: (name: string) => void; onCreated: (category: ProductCategory) => void; inputStyle: React.CSSProperties }) {
  const [adding, setAdding] = useState(names.length === 0);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    const name = draft.trim();
    if (!name || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/product-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category_name: name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not add the category.");
      onCreated(payload.data as ProductCategory);
      onChange((payload.data as ProductCategory).name);
      setDraft("");
      setAdding(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not add the category.");
    } finally {
      setSaving(false);
    }
  }

  if (adding || names.length === 0) {
    return <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void create(); } if (event.key === "Escape" && names.length > 0) { event.stopPropagation(); setAdding(false); } }} placeholder="New category, e.g. Espresso Based" style={{ ...inputStyle, flex: 1 }} aria-label="New category name" />
        <button type="button" onClick={() => void create()} disabled={saving || !draft.trim()} style={{ flexShrink: 0, border: "none", borderRadius: 10, padding: "0 14px", background: saving || !draft.trim() ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 700, fontSize: 13, cursor: saving || !draft.trim() ? "default" : "pointer" }}>{saving ? "Adding…" : "Add"}</button>
        {names.length > 0 && <button type="button" onClick={() => { setAdding(false); setError(""); }} style={{ flexShrink: 0, border: "1px solid #E8DDD5", borderRadius: 10, padding: "0 12px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 13, cursor: "pointer" }}>Cancel</button>}
      </div>
      <span style={{ color: error ? "#B91C1C" : "#9C8278", fontSize: 11.5 }}>{error || (names.length === 0 ? "No categories yet. Type one to create it." : "It is added to the menu categories too.")}</span>
    </div>;
  }

  return <select value={value || names[0] || ""} onChange={(event) => { if (event.target.value === "__new__") { setAdding(true); return; } onChange(event.target.value); }} style={{ ...inputStyle, cursor: "pointer" }}>
    {names.map((category) => <option key={category} value={category}>{category}</option>)}
    <option value="__new__">+ New category…</option>
  </select>;
}

// Barista Featured Specials: the products the mobile menu opens with, in order, each with an
// optional badge ("Customer Favorites", "Houze Favorites"…).
type FeaturedEntry = { id: number; name: string; category: string; isFeatured: boolean; badgeLabel: string; order: number };
const BADGE_SUGGESTIONS = ["Customer Favorites", "Houze Favorites", "Best Seller", "New", "Seasonal"];

function FeaturedDialog({ onClose }: { onClose: () => void }) {
  const [all, setAll] = useState<FeaturedEntry[] | null>(null);
  const [picked, setPicked] = useState<{ id: number; badgeLabel: string }[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/products/featured", { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Could not load the products."); return payload.data as FeaturedEntry[]; })
      .then((list) => { if (!active) return; setAll(list); setPicked(list.filter((entry) => entry.isFeatured).sort((a, b) => a.order - b.order).map((entry) => ({ id: entry.id, badgeLabel: entry.badgeLabel }))); })
      .catch((loadError) => { if (active) { setAll([]); setError(loadError instanceof Error ? loadError.message : "Could not load the products."); } });
    return () => { active = false; };
  }, []);

  const byId = new Map((all ?? []).map((entry) => [entry.id, entry]));
  const query = search.trim().toLowerCase();
  const available = (all ?? []).filter((entry) => !picked.some((item) => item.id === entry.id) && (!query || `${entry.name} ${entry.category}`.toLowerCase().includes(query)));
  const move = (index: number, delta: number) => setPicked((current) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/products/featured", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ featured: picked }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save.");
      setSaved(picked.length ? `Saved. The mobile menu now features ${picked.length} product${picked.length === 1 ? "" : "s"}.` : "Saved. Nothing is featured on the mobile menu.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Featured on the mobile menu">
    <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 640, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title="Barista Featured Specials" sub="The products the mobile menu opens with, in this order. A badge is optional." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        {all === null ? <div className="inv-empty">Loading products…</div> : <>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Featured <span>({picked.length})</span></h3><p>Shown as large cards at the top of the mobile menu.</p></div></header>
            {picked.length === 0 ? <p className="inv-hint" style={{ margin: 0 }}>Nothing featured yet. Add products from the list below.</p> : <ul className="feat-list">
              {picked.map((item, index) => {
                const product = byId.get(item.id);
                return <li key={item.id}>
                  <span className="feat-order">{index + 1}</span>
                  <span className="feat-name"><strong>{product?.name ?? "Product"}</strong><em>{product?.category ?? ""}</em></span>
                  <input list="feat-badges" value={item.badgeLabel} maxLength={30} placeholder="Badge (optional)" aria-label={`Badge for ${product?.name ?? "product"}`} onChange={(event) => setPicked((current) => current.map((entry) => entry.id === item.id ? { ...entry, badgeLabel: event.target.value } : entry))} style={{ ...packagingInput, width: 170 }} />
                  <button type="button" className="inv-mini" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="inv-mini" disabled={index === picked.length - 1} onClick={() => move(index, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="inv-mini" onClick={() => setPicked((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${product?.name ?? "product"}`}><IconX size={12} /></button>
                </li>;
              })}
            </ul>}
            <datalist id="feat-badges">{BADGE_SUGGESTIONS.map((badge) => <option key={badge} value={badge} />)}</datalist>
          </section>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Add products</h3></div></header>
            <div className="inv-search is-wide" style={{ marginBottom: 8 }}><IconSearch size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" /></div>
            <ul className="feat-list is-pick">
              {available.slice(0, 40).map((entry) => <li key={entry.id}>
                <span className="feat-name"><strong>{entry.name}</strong><em>{entry.category}</em></span>
                <button type="button" className="inv-mini" disabled={picked.length >= 30} onClick={() => { setPicked((current) => [...current, { id: entry.id, badgeLabel: entry.badgeLabel }]); setSaved(""); }}><IconPlus size={12} />Feature</button>
              </li>)}
              {available.length === 0 && <li className="inv-hint">No other products match.</li>}
            </ul>
          </section>
        </>}
        {error && <p role="alert" className="acc-error">{error}</p>}
        {saved && <div className="acc-notice" role="status">{saved}</div>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-wrap" style={{ borderColor: "#E8DDD5" }}>
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Close</button>
        <button type="button" onClick={() => void save()} disabled={saving || all === null} className="ui-button ui-button-primary">{saving ? "Saving…" : "Save featured"}</button>
      </div>
    </div>
  </Modal>;
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
  onCategoryCreated,
}: {
  products: Product[];
  inventory: InventoryItem[];
  categories: ProductCategory[];
  onAdd: (product: Product) => Promise<void>;
  onEdit: (product: Product) => Promise<void>;
  onDelete: (id: number, variantSize?: string) => Promise<void>;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  onCategoryCreated: (category: ProductCategory) => void;
}) {
  // The window choosing Barista Featured Specials for the mobile menu.
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const confirmAction = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const filterCat = categoryFilter;
  const setFilterCat = onCategoryFilterChange;
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "attention" | "nocost">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ProductType>("all");
  const [stationFilter, setStationFilter] = useState<"all" | Station>("all");
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
  const [formStation, setFormStation] = useState<Station>("bar");
  const [variantMode, setVariantMode] = useState<VariantMode>("sizes");
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
    const mode = variantModeFor(product, product?.station ?? "bar");
    setVariantMode(mode);
    setSelectedVariantIndex(product ? variants.findIndex((variant) => variant.active && inVariantMode(variant, mode)) : -1);
    setFormVariants(variants);
    setCopiedVariantIndices([]);
    setPendingVariantIndex(null);
    const stockVariant = product?.productType === "stock" ? product.variants[0] : undefined;
    setFormType(product?.productType ?? "recipe");
    setFormStation(product?.station ?? "bar");
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

  // Switches between the drink grid and plain options when the station changes. Each keeps its
  // own choices while the editor is open; only the current layout is saved.
  function switchVariantMode(mode: VariantMode) {
    setVariantMode(mode);
    setCopiedVariantIndices([]);
    let next = formVariants;
    if (mode === "options" && !next.some((variant) => variant.temperature === "none")) {
      next = [...next, { size: "Regular", price: "", temperature: "none", ingredients: [], active: true }];
      setFormVariants(next);
    }
    setSelectedVariantIndex(next.findIndex((variant) => variant.active && inVariantMode(variant, mode)));
  }

  function changeStation(station: Station) {
    setFormStation(station);
    const mode = variantModeFor(editingProduct ?? undefined, station);
    if (mode !== variantMode) switchVariantMode(mode);
  }

  function addOption() {
    const taken = new Set(formVariants.filter((variant) => variant.temperature === "none").map((variant) => variant.size.trim().toLowerCase()));
    let name = "New option";
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `New option ${n}`;
    setFormVariants((previous) => [...previous, { size: name, price: "", temperature: "none", ingredients: [], active: true }]);
    setSelectedVariantIndex(formVariants.length);
  }

  function renameOption(index: number, size: string) {
    setFormVariants((previous) => previous.map((variant, variantIndex) => variantIndex === index ? { ...variant, size } : variant));
  }

  function removeOption(index: number) {
    const remaining = formVariants.filter((_, variantIndex) => variantIndex !== index);
    setFormVariants(remaining);
    setCopiedVariantIndices([]);
    setSelectedVariantIndex(remaining.findIndex((variant) => variant.active && variant.temperature === "none"));
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

  async function importProductImage(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setActionError("Please select a photo (JPG, PNG, WebP or HEIC).");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setActionError("That photo is over 25 MB. Choose a smaller one.");
      return;
    }
    try {
      const shrunk = await shrinkProductImage(file);
      setActionError("");
      setFormImage("");
      setFormImageData(shrunk);
    } catch {
      setActionError("Could not read that image. Try a JPG or PNG.");
    }
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
    if (formType === "recipe" && variantMode === "options") {
      const names = formVariants.filter((variant) => variant.active && variant.temperature === "none").map((variant) => variant.size.trim().toLowerCase());
      if (names.some((name) => !name)) { setActionError("Give every option a name, such as Regular or With Rice."); return; }
      if (new Set(names).size !== names.length) { setActionError("Two options have the same name. Give each option its own name."); return; }
    }
    const variants = formType === "stock" ? buildStockVariants() : formVariants.filter((variant) => variant.active && inVariantMode(variant, variantMode)).map((variant) => ({
      size: variant.size.trim(),
      price: Number(variant.price),
      temperature: (variant.temperature === "none" ? "both" : variant.temperature) as ProductTemperature,
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
        station: formStation,
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
      if (stationFilter !== "all" && (product.station ?? "bar") !== stationFilter) return false;
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
  const filtersActive = filterCat !== "All" || typeFilter !== "all" || stationFilter !== "all" || availability !== "all" || query !== "";
  const hasValidVariant = formType === "stock" ? buildStockVariants().length > 0 : formVariants.some((variant) => variant.active && inVariantMode(variant, variantMode) && variant.price !== "" && Number(variant.price) >= 0 && variant.ingredients.some((ingredient) => ingredient.inventoryId > 0 && ingredient.qty !== "" && Number(ingredient.qty) > 0));
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
        <label className="inv-filter"><span>Made at</span>
          <select value={stationFilter} onChange={(event) => setStationFilter(event.target.value as typeof stationFilter)} className={`inv-select${stationFilter !== "all" ? " is-active" : ""}`}>
            <option value="all">Bar and kitchen</option><option value="bar">Bar</option><option value="kitchen">Kitchen</option>
          </select>
        </label>
        <label className="inv-filter"><span>Sort</span>
          <select value={productSort} onChange={(event) => setProductSort(event.target.value as typeof productSort)} className="inv-select">
            <option value="category">By category</option><option value="name">Name A–Z</option><option value="price">Price, low to high</option><option value="margin">Lowest margin first</option>
          </select>
        </label>
        <PickupModeButton />
        <button type="button" className="inv-secondary" onClick={() => setFeaturedOpen(true)} disabled={products.length === 0} title="Barista Featured Specials on the mobile menu"><IconStar size={14} />Featured</button>
        <button type="button" className="inv-secondary" onClick={() => exportMenu(products, inventory)} disabled={products.length === 0}><IconDownload size={14} />Export menu</button>
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
        <div className="inv-empty">No products match. {filtersActive && <button type="button" className="inv-link" onClick={() => { setSearch(""); setFilterCat("All"); setTypeFilter("all"); setStationFilter("all"); setAvailability("all"); }}>Clear filters</button>}</div>
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
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Category</label><CategoryPicker value={formCat} names={formCategoryNames} onChange={setFormCat} onCreated={onCategoryCreated} inputStyle={inputBase} /></div>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Made at">
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Made at</label>
                <div className="grid grid-cols-2 gap-2">
                  {([["bar", "☕ Bar", "Drinks. Shows on the barista's queue."], ["kitchen", "🍳 Kitchen", "Food. Shows on the kitchen staff's queue."]] as const).map(([value, title, hint]) => (
                    <button key={value} type="button" role="radio" aria-checked={formStation === value} onClick={() => changeStation(value)} disabled={saving} style={{ border: formStation === value ? "2px solid #3D2B1F" : "1px solid #E8DDD5", borderRadius: 10, padding: "10px 12px", background: formStation === value ? "#3D2B1F" : "#FDF9F5", color: formStation === value ? "#FDF9F5" : "#3D2B1F", textAlign: "left", cursor: saving ? "default" : "pointer", fontFamily: "Inter, sans-serif" }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{title}</span>
                      <span style={{ display: "block", marginTop: 3, fontSize: 11, opacity: 0.75 }}>{hint}</span>
                    </button>
                  ))}
                </div>
              </div>
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
              <div className="flex flex-col gap-3">{variantMode === "options" ? <div className="menu-options">{formVariants.map((variant, index) => variant.temperature !== "none" ? null : <div key={index} className={`menu-option${selectedVariantIndex === index ? " is-selected" : ""}`} onClick={() => setSelectedVariantIndex(index)}><input value={variant.size} onChange={(event) => renameOption(index, event.target.value)} onFocus={() => setSelectedVariantIndex(index)} placeholder="Option name" aria-label="Option name" maxLength={40} /><span className="menu-option-meta">{variant.price === "" ? "No price" : peso(Number(variant.price))} · {variant.ingredients.length} item{variant.ingredients.length === 1 ? "" : "s"}</span><button type="button" title="Remove option" aria-label={`Remove ${variant.size || "option"}`} disabled={formVariants.filter((entry) => entry.temperature === "none").length <= 1} onClick={(event) => { event.stopPropagation(); removeOption(index); }}><IconX size={12} /></button></div>)}<button type="button" className="menu-option-add" onClick={() => addOption()}><IconPlus size={11} /> Add option</button></div> : <div className="flex flex-col gap-2 rounded-xl p-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", width: "100%" }}>{standardVariantSizes.map((size) => { const hotIndex = formVariants.findIndex((variant) => variant.size.toLowerCase() === size.toLowerCase() && variant.temperature === "hot"); const coldIndex = formVariants.findIndex((variant) => variant.size.toLowerCase() === size.toLowerCase() && variant.temperature === "cold"); const hot = formVariants[hotIndex]; const cold = formVariants[coldIndex]; if (!hot || !cold) return null; const variantCard = (variant: DraftVariant, index: number) => <button key={`${variant.size.trim().toLowerCase()}-${variant.temperature}`} type="button" onClick={() => selectVariant(index)} style={{ border: selectedVariantIndex === index ? "2px solid #3D2B1F" : "1px solid #E8DDD5", borderRadius: 10, padding: "9px 11px", minHeight: 52, background: selectedVariantIndex === index ? "#3D2B1F" : variant.active ? "#FDF9F5" : "#F8F3EE", color: selectedVariantIndex === index ? "#FDF9F5" : variant.active ? "#3D2B1F" : "#B8A59C", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left", opacity: variant.active ? 1 : 0.75 }}><span style={{ display: "block", fontSize: 13 }}>{variant.size} · {variant.temperature === "hot" ? "Hot" : "Cold"}</span><span style={{ display: "block", marginTop: 3, fontSize: 11, fontWeight: 600 }}>{variant.active ? "Configured" : "Activate +"}</span></button>; return <div key={size} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">{variantCard(hot, hotIndex)}<div className="flex flex-col items-center gap-1"><button type="button" title={`Copy Hot to Cold for ${size}`} aria-label={`Copy Hot to Cold for ${size}`} disabled={!hot.active} onClick={() => copyVariantTo(hotIndex, coldIndex)} style={{ width: 28, height: 24, border: "1px solid #E8DDD5", borderRadius: 7, background: "#FDF9F5", color: hot.active ? "#6B4C3B" : "#C9B8AF", cursor: hot.active ? "pointer" : "default", fontWeight: 800 }}>→</button><button type="button" title={`Copy Cold to Hot for ${size}`} aria-label={`Copy Cold to Hot for ${size}`} disabled={!cold.active} onClick={() => copyVariantTo(coldIndex, hotIndex)} style={{ width: 28, height: 24, border: "1px solid #E8DDD5", borderRadius: 7, background: "#FDF9F5", color: cold.active ? "#6B4C3B" : "#C9B8AF", cursor: cold.active ? "pointer" : "default", fontWeight: 800 }}>←</button></div>{variantCard(cold, coldIndex)}</div>; })}</div>}<div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "uppercase" }}>Price</label><MoneyField value={activeVariant?.price ?? ""} disabled={!activeVariant} onChange={(typed) => { if (selectedVariantIndex < 0) return; setCopiedVariantIndices((current) => current.filter((index) => index !== selectedVariantIndex)); setFormVariants((prev) => prev.map((variant, index) => index === selectedVariantIndex ? { ...variant, price: typed } : variant)); }} placeholder="0" style={{ ...inputBase, width: 100, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }} /></div>{activeVariant && (() => { const cost = recipeCost(activeVariant.ingredients.filter((row) => row.inventoryId > 0), inventory); const price = Number(activeVariant.price); if (activeVariant.ingredients.length === 0) return <span className="menu-editor-cost">Add ingredients to see the cost</span>; if (cost === null) return <span className="menu-editor-cost is-muted">Cost unknown: an ingredient has no cost in Inventory</span>; return <span className={`menu-editor-cost${activeVariant.price !== "" && price > 0 && (price - cost) / price < 0.3 ? " is-low" : ""}`}>Cost {peso(cost)}{activeVariant.price !== "" && price > 0 ? ` · margin ${peso(price - cost)} (${Math.round(((price - cost) / price) * 100)}%)` : ""}</span>; })()}</div><div className="flex items-center justify-between"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>{activeVariant ? activeVariant.temperature === "none" ? `${activeVariant.size.trim() || "This option"} Ingredients` : `${activeVariant.size} ${activeVariant.temperature === "hot" ? "Hot" : "Cold"} Ingredients` : variantMode === "options" ? "Select an option to configure ingredients" : "Select a size and temperature to configure ingredients"}</label><div className="flex items-center gap-2"><button type="button" onClick={() => copyActiveVariantRecipe()} title="Copy selected recipe" aria-label="Copy selected recipe" disabled={!activeVariant} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 30, background: "#F3EDE5", border: "1px solid #E8DDD5", color: activeVariant ? "#6B4C3B" : "#C9B8AF", cursor: activeVariant ? "pointer" : "default" }}><IconCopy size={12} /></button><button type="button" onClick={() => pasteToActiveVariantRecipe()} title="Paste copied recipe" aria-label="Paste copied recipe" disabled={!activeVariant || !variantClipboard} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 30, background: "#F3EDE5", border: "1px solid #E8DDD5", color: activeVariant && variantClipboard ? "#6B4C3B" : "#C9B8AF", cursor: activeVariant && variantClipboard ? "pointer" : "default" }}><IconPaste size={12} /></button><button type="button" onClick={() => addIngredientRow()} disabled={!activeVariant || inventory.length === 0} className="flex items-center gap-1 rounded-lg px-3 py-1" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", fontFamily: "Inter, sans-serif", fontSize: 12, color: "#6B4C3B", cursor: activeVariant && inventory.length ? "pointer" : "default" }}><IconPlus size={11} /> Add</button></div></div>
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
                    <MoneyField value={stockPrice} onChange={(typed) => setStockPrice(typed)} disabled={saving} placeholder="0.00" style={inputBase} />
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
      {featuredOpen && <FeaturedDialog onClose={() => setFeaturedOpen(false)} />}
    </div>
  );
}

// ─── Excel exports ───────────────────────────────────────────────────────────
// Every export uses these so the files look the same: a cover sheet first, then tables with a
// filter on the header row, columns sized to their contents, pesos as #,##0.00, and dates and
// times written in Philippine time as 2026-09-28 14:05 (the same on every device).
type ExcelValue = string | number | null | undefined;
type ExcelKind = "text" | "money" | "cost" | "number" | "count" | "hours";
type ExcelColumn<T> = { header: string; value: (row: T) => ExcelValue; kind?: ExcelKind };
type ExcelInfoRow = [label: string, ...values: ExcelValue[]] | [];

const excelFormats: Partial<Record<ExcelKind, string>> = { money: "#,##0.00", cost: "#,##0.00##", number: "#,##0.###", count: "#,##0", hours: "0.00" };

function excelDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function excelNow(): string {
  return excelDateTime(new Date().toISOString());
}

function excelWidth(value: ExcelValue, kind: ExcelKind = "text"): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return kind === "money" || kind === "cost" ? value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).length : String(value).length;
  return String(value).length;
}

// A table: header row, one row per record, number formats per column and a filter on the header.
function excelTable<T>(rows: T[], columns: ExcelColumn<T>[]): XLSX.WorkSheet {
  const matrix: ExcelValue[][] = [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => { const value = column.value(row); return value === undefined ? null : value; }))];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  columns.forEach((column, columnIndex) => {
    const format = column.kind ? excelFormats[column.kind] : undefined;
    if (!format) return;
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      // Whole numbers get no decimal point at all (Excel would show "2,000." otherwise).
      if (cell && cell.t === "n") cell.z = column.kind === "number" && Number.isInteger(cell.v) ? "#,##0" : format;
    }
  });
  sheet["!cols"] = columns.map((column, columnIndex) => ({ wch: Math.min(50, Math.max(8, column.header.length + 2, ...matrix.slice(1).map((row) => excelWidth(row[columnIndex], column.kind) + 2))) }));
  if (rows.length > 0) sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
  return sheet;
}

// A cover or summary sheet: a label in column A and its values beside it. Numbers get the
// money format unless the label is in `plainNumbers` (counts such as orders or items).
function excelInfo(rows: ExcelInfoRow[], plainNumbers: string[] = []): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((value) => value === undefined ? null : value)));
  rows.forEach((row, rowIndex) => {
    if (row.length === 0 || plainNumbers.includes(String(row[0]))) return;
    for (let columnIndex = 1; columnIndex < row.length; columnIndex++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell && cell.t === "n") cell.z = excelFormats.money!;
    }
  });
  const widest = (index: number) => Math.max(0, ...rows.map((row) => excelWidth(row[index] as ExcelValue, index === 0 ? "text" : "money")));
  sheet["!cols"] = [{ wch: Math.min(48, widest(0) + 2) }, ...Array.from({ length: Math.max(0, ...rows.map((row) => row.length)) - 1 }, (_, index) => ({ wch: Math.min(40, Math.max(14, widest(index + 1) + 2)) }))];
  return sheet;
}

function saveWorkbook(sheets: [name: string, sheet: XLSX.WorkSheet | null][], fileName: string) {
  const workbook = XLSX.utils.book_new();
  for (const [name, sheet] of sheets) if (sheet) XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  if (workbook.SheetNames.length === 0) throw new Error("There is nothing to export.");
  XLSX.writeFile(workbook, fileName);
}

const excelStatus = (status: string) => status.startsWith("void") ? "Voided" : status.startsWith("refund") ? "Refunded" : status === "completed" ? "Completed" : status.charAt(0).toUpperCase() + status.slice(1);
const excelPayment = (order: { orderSource: string; paymentMethod: string }) => order.paymentMethod === "cod" ? "Cash on delivery" : order.orderSource === "online" ? "Mobile menu (GCash)" : order.paymentMethod === "split" ? "Split (cash + GCash)" : order.paymentMethod === "online" ? "GCash" : "Cash";
const excelReturnMethod = (method: string | null | undefined) => method === "gcash" ? "GCash" : method === "cash" ? "Cash" : method === "split" ? "As paid (cash + GCash)" : "";

function getFinanceDateStamp(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

// ─── Shift ───────────────────────────────────────────────────────────────────
// The shift as it happens: open or close the store, the drawer and sales so far, and a running
// log of everything recorded under it (orders, voids and refunds, clock-ins, stock changes and
// GCash payments). Earlier shifts open in the same view from the picker.
type ShiftLive = Omit<ShiftReport, "hoursOpen"> & { isOpen: boolean; previousShiftId: number | null; nextShiftId: number | null };
// deliveryStatus: a delivery order's progress (its queue status stays "served" once packed).
type ShiftLiveOrder = ShiftOrder & { queueStatus: string | null; reversedBy: string | null; deliveryStatus?: string | null } & ReturnDetails;
// How the money of a voided or refunded order went back to the customer (set by the cashier).
type ReturnDetails = { returnMethod?: string | null; returnGcashName?: string | null; returnGcashNumber?: string | null; returnReference?: string | null; cashPortion?: number | null; total?: number };
type ShiftStockLog = {
  logId: number; inventoryId: number | null; itemName: string; unit: string; changeType: string; delta: number | null; quantityAfter: number | null;
  orderId: number | null; packagingName: string | null; packsAdded: number | null; sourceApp: string | null; adminName: string | null; createdAt: string;
};
type ShiftPayment = { checkoutId: number; sourceApp: string; status: string; amount: number; error: string | null; createdAt: string };
type ShiftActivityData = {
  shifts: { shiftId: number; isOpen: boolean; openedAt: string }[];
  shift: ShiftLive | null;
  orders: ShiftLiveOrder[];
  attendance: ShiftAttendance[];
  stock: ShiftStockLog[];
  products: { name: string; category: string; quantity: number; revenue: number }[];
  payments: ShiftPayment[];
  movements?: DrawerMovement[];
  deliveries?: ShiftDelivery[];
  generatedAt: string;
};
type ShiftEventKind = "shift" | "order" | "reversal" | "staff" | "stock" | "payment" | "drawer" | "delivery";
type ShiftEvent = { key: string; at: string; kind: ShiftEventKind; title: string; detail: string; amount?: { text: string; tone: "plus" | "minus" | "muted" } };
type ShiftTab = "activity" | "orders" | "staff" | "stock";

const SHIFT_REFRESH_MS = 20_000;
const orderUsageTypes = new Set(["order_deduction", "void_restore", "refund_restore"]);
const shiftFeedFilters: { id: "all" | ShiftEventKind; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "order", label: "Orders" },
  { id: "reversal", label: "Voids & refunds" },
  { id: "staff", label: "Staff" },
  { id: "stock", label: "Stock" },
  { id: "payment", label: "GCash" },
  { id: "delivery", label: "Deliveries" },
  { id: "drawer", label: "Cash drawer" },
];

function formatGcashNumber(value: string): string {
  return /^09\d{9}$/.test(value) ? `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}` : value;
}

// "Returned through GCash to Juan Dela Cruz · 0917 123 4567 · Ref 123", or null for orders
// reversed before return methods were recorded.
function describeReturn(order: ReturnDetails): string | null {
  if (order.returnMethod === "cash") return "Returned in cash from the drawer";
  if (order.returnMethod === "split") return `Returned as paid: ${peso(order.cashPortion ?? 0)} in cash and ${peso(Math.max(0, (order.total ?? 0) - (order.cashPortion ?? 0)))} through GCash to ${order.returnGcashName ?? "—"} · ${formatGcashNumber(order.returnGcashNumber ?? "")}${order.returnReference ? ` · Ref ${order.returnReference}` : " · no reference recorded"}`;
  if (order.returnMethod === "gcash") return `Returned through GCash to ${order.returnGcashName ?? "—"} · ${formatGcashNumber(order.returnGcashNumber ?? "")}${order.returnReference ? ` · Ref ${order.returnReference}` : " · no reference recorded"}`;
  return null;
}

function shiftOrderChannel(order: { orderSource: string; paymentMethod: string }): "Mobile" | "Online" | "Cash" | "Split" {
  return order.orderSource === "online" ? "Mobile" : order.paymentMethod === "split" ? "Split" : order.paymentMethod === "online" ? "Online" : "Cash";
}

function durationLabel(fromIso: string, toIso: string | null, now: number): string {
  return formatElapsed(fromIso, toIso ? new Date(toIso).getTime() : now);
}

function unitAmount(amount: number, unit: string): string {
  return `${formatAmount(amount)} ${Math.abs(amount) === 1 ? singularUnit(unit) : unit}`;
}

function buildShiftEvents(data: ShiftActivityData, now: number): ShiftEvent[] {
  const shift = data.shift;
  if (!shift) return [];
  const events: ShiftEvent[] = [{ key: "opened", at: shift.openedAt, kind: "shift", title: "Store opened", detail: `${shift.openedByName ? `By ${shift.openedByName} · ` : ""}${shift.isHistorical ? "recorded before shifts were introduced" : `started with ${peso(shift.startingCash)} in the drawer`}` }];
  if (shift.closedAt) {
    const difference = cashDifferenceLabel(shift.cashDifference);
    events.push({ key: "closed", at: shift.closedAt, kind: "shift", title: "Store closed", detail: `${shift.closedByName ? `By ${shift.closedByName} · ` : ""}${shift.countedCash === null ? "cash not counted" : `counted ${peso(shift.countedCash)} (${difference.text.toLowerCase()})`}` });
  }
  for (const order of data.orders) {
    const queue = order.queueNumber === null ? `Order ${order.orderId}` : `Order #${order.queueNumber}`;
    const reversed = isReversedStatus(order.status);
    if (order.soldInShift) {
      events.push({
        key: `order-${order.orderId}`, at: order.createdAt, kind: "order",
        title: `${queue} · ${shiftOrderChannel(order)}`,
        detail: `${order.items || "No items"} · ${order.punchedBy}`,
        amount: { text: peso(order.total), tone: reversed ? "muted" : "plus" },
      });
    }
    if (order.reversedInShift && order.reversedAt) {
      const label = order.status.startsWith("void") ? "voided" : "refunded";
      events.push({
        key: `reversal-${order.orderId}`, at: order.reversedAt, kind: "reversal",
        title: `${queue} ${label}`,
        detail: `${order.reversedBy ? `By ${order.reversedBy}` : "Reversed"}${order.soldInShift ? "" : " · sold in an earlier shift"} · ${describeReturn(order) ?? (order.paymentMethod === "cash" ? "cash given back" : "online payment")}`,
        amount: { text: `−${peso(order.total)}`, tone: "minus" },
      });
    }
  }
  for (const log of data.attendance) {
    events.push({ key: `in-${log.id}`, at: log.timeIn, kind: "staff", title: `${log.name} clocked in`, detail: log.role });
    if (log.timeOut) events.push({ key: `out-${log.id}`, at: log.timeOut, kind: "staff", title: `${log.name} clocked out`, detail: `Worked ${durationLabel(log.timeIn, log.timeOut, now)}` });
  }
  for (const log of data.stock) {
    if (orderUsageTypes.has(log.changeType)) continue;
    const who = log.adminName ? ` · by ${log.adminName}` : log.sourceApp ? ` · ${sourceAppLabels[log.sourceApp] ?? log.sourceApp}` : "";
    const change = log.delta === null || log.delta === 0 ? "" : `${log.delta > 0 ? "+" : "−"}${unitAmount(Math.abs(log.delta), log.unit)}`;
    const detail = log.changeType === "restocked" && log.packagingName
      ? `${log.packsAdded ?? "?"} × ${log.packagingName}${change ? ` (${change})` : ""}`
      : change;
    events.push({ key: `stock-${log.logId}`, at: log.createdAt, kind: "stock", title: `${inventoryChangeLabels[log.changeType] ?? log.changeType}: ${log.itemName}`, detail: `${detail || "No quantity change"}${log.quantityAfter !== null && change ? ` → ${unitAmount(log.quantityAfter, log.unit)} left` : ""}${who}` });
  }
  for (const payment of data.payments) {
    const title = payment.status === "awaiting_payment" ? "GCash payment waiting" : payment.status === "needs_attention" ? "GCash payment needs attention" : "GCash payment failed";
    events.push({ key: `pay-${payment.checkoutId}`, at: payment.createdAt, kind: "payment", title, detail: `${payment.sourceApp === "mobile" ? "Mobile menu" : "Staff app"}${payment.error ? ` · ${payment.error}` : ""}`, amount: { text: peso(payment.amount), tone: "muted" } });
  }
  for (const delivery of data.deliveries ?? []) {
    const queue = `Order #${delivery.queueNumber ?? delivery.orderId}`;
    if (delivery.soldInShift && delivery.pickedUpAt) events.push({ key: `dlv-out-${delivery.id}`, at: delivery.pickedUpAt, kind: "delivery", title: `${queue} on the way`, detail: `${delivery.rider ?? "Rider"} · ${delivery.zone}` });
    if (delivery.soldInShift && delivery.deliveredAt) events.push({ key: `dlv-done-${delivery.id}`, at: delivery.deliveredAt, kind: "delivery", title: `${queue} delivered`, detail: `${delivery.rider ?? "Rider"} · ${delivery.zone}${delivery.codCollected !== null ? ` · collected ${peso(delivery.codCollected)} cash` : ""}` });
    if (delivery.soldInShift && delivery.failedAt) events.push({ key: `dlv-fail-${delivery.id}`, at: delivery.failedAt, kind: "delivery", title: `${queue} not delivered`, detail: `${delivery.failureReason ?? "No reason given"}${delivery.rider ? ` · ${delivery.rider}` : ""}` });
    // The rider's cash goes into this shift's drawer when the cashier receives it.
    if (delivery.remittedInShift && delivery.remittedAt && delivery.codCollected !== null) events.push({ key: `dlv-cash-${delivery.id}`, at: delivery.remittedAt, kind: "drawer", title: `Cash on delivery handed in: ${queue}`, detail: `${delivery.rider ? `From ${delivery.rider}` : "From the rider"}${delivery.remittedTo ? ` to ${delivery.remittedTo}` : ""}`, amount: { text: `+${peso(delivery.codCollected)}`, tone: "plus" } });
  }
  for (const entry of data.movements ?? []) {
    events.push({ key: `drawer-${entry.id}`, at: entry.createdAt, kind: "drawer", title: `${drawerKindLabels[entry.kind] ?? entry.kind}: ${entry.reason}`, detail: `${entry.by ? `By ${entry.by}` : ""}${entry.source === "admin" ? " (admin app)" : ""}${entry.note ? ` · ${entry.note}` : ""}`, amount: { text: `${entry.kind === "cash_in" ? "+" : "−"}${peso(entry.amount)}`, tone: entry.kind === "cash_in" ? "plus" : "minus" } });
  }
  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || a.key.localeCompare(b.key));
}

function ShiftMonitor({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [data, setData] = useState<ShiftActivityData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [action, setAction] = useState<"open" | "close" | "drawer" | null>(null);
  const [tab, setTab] = useState<ShiftTab>("activity");
  const [feedFilter, setFeedFilter] = useState<"all" | ShiftEventKind>("all");
  const [feedLimit, setFeedLimit] = useState(60);
  const [orderStatus, setOrderStatus] = useState<"all" | "completed" | "voided" | "refunded">("all");
  const [orderChannelFilter, setOrderChannelFilter] = useState<"all" | "Cash" | "Online" | "Split" | "Mobile">("all");
  const [orderCashier, setOrderCashier] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const requestRef = useRef(0);
  const liveRef = useRef(false);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const response = await fetch(`/api/shift-activity${selectedId === null ? "" : `?shift_id=${selectedId}`}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load the shift.");
      if (request !== requestRef.current) return;
      setData(payload.data);
      setLoadError("");
    } catch (error) {
      if (request === requestRef.current) setLoadError(error instanceof Error ? error.message : "Could not load the shift.");
    } finally {
      if (request === requestRef.current) { setSwitching(false); setNow(Date.now()); }
    }
  }, [selectedId]);

  useEffect(() => { liveRef.current = Boolean(data?.shift?.isOpen); }, [data]);

  useEffect(() => {
    let inFlight = false;
    const refresh = (force: boolean) => {
      if (inFlight || document.visibilityState !== "visible" || (!force && !liveRef.current)) return;
      inFlight = true;
      void load().finally(() => { inFlight = false; });
    };
    const firstLoad = window.setTimeout(() => refresh(true), 0);
    const intervalId = window.setInterval(() => refresh(false), SHIFT_REFRESH_MS);
    const clockId = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => refresh(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(intervalId);
      window.clearInterval(clockId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  function viewShift(shiftId: number | null) {
    if (shiftId === selectedId) return;
    setSwitching(true);
    setFeedLimit(60);
    setSelectedId(shiftId);
  }

  async function refreshNow() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const events = useMemo(() => (data ? buildShiftEvents(data, now) : []), [data, now]);
  const shownEvents = feedFilter === "all" ? events : events.filter((event) => event.kind === feedFilter);
  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = { all: events.length };
    for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    return counts;
  }, [events]);

  const shift = data?.shift ?? null;
  const openShiftId = data?.shifts.find((entry) => entry.isOpen)?.shiftId ?? null;
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const soldOrders = useMemo(() => orders.filter((order) => order.soldInShift), [orders]);

  const hourly = useMemo(() => {
    const byHour = new Map<number, { hour: number; orders: number; revenue: number }>();
    for (const order of soldOrders) {
      if (isReversedStatus(order.status)) continue;
      const hour = manilaHour(order.createdAt);
      const entry = byHour.get(hour) ?? { hour, orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += order.total;
      byHour.set(hour, entry);
    }
    return Array.from(byHour.values());
  }, [soldOrders]);
  const hourBars = shift ? shiftHourBars(shift, hourly, now) : [];
  const peakHour = hourly.reduce<(typeof hourly)[number] | null>((top, entry) => (entry.revenue > (top?.revenue ?? 0) ? entry : top), null);

  const staff = useMemo(() => {
    const people = new Map<string, { name: string; role: string; logs: ShiftAttendance[]; orders: number; sales: number; reversals: number }>();
    const person = (name: string, role = "") => {
      const existing = people.get(name);
      if (existing) return existing;
      const created = { name, role, logs: [] as ShiftAttendance[], orders: 0, sales: 0, reversals: 0 };
      people.set(name, created);
      return created;
    };
    for (const log of data?.attendance ?? []) {
      const entry = person(log.name, log.role);
      entry.role = log.role;
      entry.logs.push(log);
    }
    for (const order of soldOrders) {
      if (order.orderSource === "online" && order.punchedBy === "Mobile order") continue;
      const entry = person(order.punchedBy);
      if (isReversedStatus(order.status)) entry.reversals += 1;
      else { entry.orders += 1; entry.sales += order.total; }
    }
    return Array.from(people.values()).sort((a, b) => Number(b.logs.some((log) => !log.timeOut)) - Number(a.logs.some((log) => !log.timeOut)) || b.sales - a.sales || a.name.localeCompare(b.name));
  }, [data, soldOrders]);
  const onDuty = staff.filter((entry) => entry.logs.some((log) => !log.timeOut));

  const stockUse = useMemo(() => {
    const items = new Map<string, { name: string; unit: string; used: number; orders: Set<number> }>();
    for (const log of data?.stock ?? []) {
      if (!orderUsageTypes.has(log.changeType) || log.delta === null) continue;
      const key = String(log.inventoryId ?? log.itemName);
      const entry = items.get(key) ?? { name: log.itemName, unit: log.unit, used: 0, orders: new Set<number>() };
      entry.used -= log.delta;
      if (log.orderId !== null && log.changeType === "order_deduction") entry.orders.add(log.orderId);
      items.set(key, entry);
    }
    return Array.from(items.values()).filter((entry) => Math.abs(entry.used) > 1e-9).sort((a, b) => b.orders.size - a.orders.size || a.name.localeCompare(b.name));
  }, [data]);
  const stockChanges = useMemo(() => (data?.stock ?? []).filter((log) => !orderUsageTypes.has(log.changeType)), [data]);

  const cashierNames = useMemo(() => Array.from(new Set(orders.map((order) => order.punchedBy))).sort((a, b) => a.localeCompare(b)), [orders]);
  const shownOrders = orders.filter((order) => {
    const reversed = isReversedStatus(order.status);
    if (orderStatus === "completed" && reversed) return false;
    if (orderStatus === "voided" && !order.status.startsWith("void")) return false;
    if (orderStatus === "refunded" && !order.status.startsWith("refund")) return false;
    if (orderChannelFilter !== "all" && shiftOrderChannel(order) !== orderChannelFilter) return false;
    if (orderCashier !== "all" && order.punchedBy !== orderCashier) return false;
    const query = orderSearch.trim().toLowerCase().replace(/^#/, "");
    if (query && !(String(order.queueNumber ?? "") === query || String(order.orderId) === query || order.items.toLowerCase().includes(query))) return false;
    return true;
  });
  const queueWaiting = shift?.isOpen ? orders.filter((order) => order.queueStatus === "waiting").length : 0;
  const queueReady = shift?.isOpen ? orders.filter((order) => order.queueStatus === "served" && order.serviceType !== "delivery").length : 0;
  const paymentsNeedingAttention = (data?.payments ?? []).filter((payment) => payment.status === "needs_attention");

  const dayOf = (value: string) => manilaDay(value);
  const shiftDay = shift ? dayOf(shift.openedAt) : "";
  const timeWithDay = (value: string) => dayOf(value) === shiftDay ? clockTime(value) : shiftTime(value);

  if (!data) {
    return <div className="dash-wrap"><div className="dash">
      {loadError
        ? <div className="dash-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => void refreshNow()}>Try again</button></div>
        : <><div className="dash-skeleton" style={{ minHeight: 230 }} /><div className="dash-skeleton" style={{ minHeight: 420 }} /></>}
    </div></div>;
  }

  const codReceived = shift?.delivery?.codReceived ?? 0;
  const paid = shift ? shift.cashSales + codReceived + shift.onlineSales : 0;
  const cashShare = shift && paid > 0 ? ((shift.cashSales + codReceived) / paid) * 100 : 0;
  const riders = shiftRiders(data.deliveries ?? []);
  const reversals = shift ? shift.voidCount + shift.refundCount : 0;
  const longOpen = shift?.isOpen && (now - new Date(shift.openedAt).getTime()) / HOUR_MS > LONG_OPEN_SHIFT_HOURS;
  const counted = shift ? cashDifferenceLabel(shift.cashDifference) : null;
  const tabs: { id: ShiftTab; label: string; count: number }[] = [
    { id: "activity", label: "Activity", count: events.length },
    { id: "orders", label: "Orders", count: orders.length },
    { id: "staff", label: "Staff", count: staff.length },
    { id: "stock", label: "Items & stock", count: (data.products.length || 0) + stockChanges.length },
  ];

  return <div className="dash-wrap">
    <div className="dash">
      <div className="shiftm-bar">
        {shift && <div className="shiftm-picker" role="group" aria-label="Choose a shift">
          <button type="button" onClick={() => shift?.previousShiftId && viewShift(shift.previousShiftId)} disabled={!shift?.previousShiftId || switching} aria-label="Previous shift" title="Previous shift"><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><IconChevron size={16} /></span></button>
          <select value={shift?.shiftId ?? ""} onChange={(event) => viewShift(Number(event.target.value) === openShiftId ? null : Number(event.target.value))} disabled={data.shifts.length === 0 || switching} aria-label="Shift">
            {shift && !data.shifts.some((entry) => entry.shiftId === shift.shiftId) && <option value={shift.shiftId}>Shift #{shift.shiftId}</option>}
            {data.shifts.map((entry) => <option key={entry.shiftId} value={entry.shiftId}>#{entry.shiftId} · {shiftTime(entry.openedAt)}{entry.isOpen ? " · open now" : ""}</option>)}
          </select>
          <button type="button" onClick={() => shift?.nextShiftId && viewShift(shift.nextShiftId === openShiftId ? null : shift.nextShiftId)} disabled={!shift?.nextShiftId || switching} aria-label="Next shift" title="Next shift"><IconChevron size={16} /></button>
        </div>}
        {selectedId !== null && <button type="button" className="shiftm-current" onClick={() => viewShift(null)} disabled={switching}>{openShiftId ? "Back to the open shift" : "Back to the latest shift"}</button>}
        <div className="dash-head-actions" style={{ marginLeft: "auto" }}>
          <span className="dash-updated">{switching ? "Loading…" : shift?.isOpen ? `Live · updated ${clockTime(data.generatedAt)}` : `Updated ${clockTime(data.generatedAt)}`}</span>
          <button type="button" className="dash-refresh" onClick={() => void refreshNow()} disabled={refreshing}>
            <span style={{ display: "inline-flex", animation: refreshing ? "spin 0.8s linear infinite" : undefined }}><IconRotateCcw size={14} /></span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loadError && <div className="dash-error" role="alert"><span>Could not refresh. Showing the last loaded shift.</span><button type="button" onClick={() => void refreshNow()}>Try again</button></div>}

      {!shift ? <section className="dash-shift is-closed shiftm-hero">
        <div className="shiftm-hero-main">
          <span className="dash-shift-pill">Store closed</span>
          <p className="dash-shift-value" style={{ fontSize: 30, marginTop: 14 }}>No shifts yet</p>
          <p className="dash-shift-meta">Open the store to start the first shift. Sales, queue numbers, attendance and stock changes are recorded under it.</p>
        </div>
        <div className="shiftm-hero-actions"><button type="button" className="dash-open-store" onClick={() => setAction("open")}>Start shift</button></div>
      </section> : <section className={`dash-shift shiftm-hero${shift.isOpen ? "" : " is-closed"}`} style={switching ? { opacity: 0.7 } : undefined}>
        <div className="shiftm-hero-main">
          <div className="flex items-center gap-2 flex-wrap">
            {shift.isOpen ? <span className="dash-shift-pill is-open"><span className="dash-live-dot" />Shift open</span> : <span className="dash-shift-pill">{shift.shiftId === data.shifts[0]?.shiftId ? "Store closed" : "Past shift"}</span>}
            {shift.isHistorical && <span className="dash-shift-pill">Historical</span>}
          </div>
          <p className="dash-shift-label">Shift #{shift.shiftId} · {shiftBusinessDate(shift.businessDate)}</p>
          <p className="dash-shift-value">{peso(shift.netSales)}<span className="shiftm-value-note">net sales</span></p>
          <p className="dash-shift-meta">
            {shift.isOpen
              ? <>Open for {formatElapsed(shift.openedAt, now)} · opened by {shift.openedByName ?? "a cashier"} at {clockTime(shift.openedAt)}</>
              : <>{shiftTime(shift.openedAt)} – {shiftTime(shift.closedAt)} · {durationLabel(shift.openedAt, shift.closedAt, now)}{shift.openedByName ? ` · opened by ${shift.openedByName}` : ""}{shift.closedByName ? `, closed by ${shift.closedByName}` : ""}</>}
          </p>
        </div>
        <div className="shiftm-hero-actions">
          {shift.isOpen
            ? <><button type="button" className="shiftm-end" onClick={() => setAction("close")}>End shift</button><button type="button" className="dash-shift-link" onClick={() => setAction("drawer")}>Cash in / out</button></>
            : openShiftId === null
              ? <button type="button" className="dash-open-store" onClick={() => setAction("open")}>Start shift</button>
              : <button type="button" className="dash-shift-link" onClick={() => viewShift(null)}>Go to the open shift <IconChevron size={13} /></button>}
          <button type="button" className="dash-shift-link" onClick={() => exportShiftReport({ summary: { ...shift, hoursOpen: ((shift.closedAt ? new Date(shift.closedAt).getTime() : now) - new Date(shift.openedAt).getTime()) / HOUR_MS }, orders, attendance: data.attendance, movements: data.movements, deliveries: data.deliveries })}><IconDownload size={13} />Export shift</button>
          <button type="button" className="dash-shift-link" onClick={() => onNavigate("finance")}>Shift reports <IconChevron size={13} /></button>
        </div>
        <div className="dash-shift-stats shiftm-stats">
          <div><span>Orders</span><strong>{shift.orderCount}</strong><em>{shift.mobileOrderCount > 0 ? `${shift.mobileOrderCount} from mobile` : `${shift.itemsSold} item${shift.itemsSold === 1 ? "" : "s"} sold`}</em></div>
          <div><span>Avg. order</span><strong>{shift.orderCount > 0 ? peso(shift.grossSales / shift.orderCount) : "—"}</strong><em>per receipt</em></div>
          <div><span>Voids & refunds</span><strong>{reversals}</strong><em>{shift.reversedAmount > 0 ? `−${peso(shift.reversedAmount)}` : "None"}</em></div>
          <div><span>{shift.isOpen ? "On duty" : "Staff"}</span><strong>{shift.isOpen ? onDuty.length : staff.filter((entry) => entry.logs.length > 0).length}</strong><em>{shift.isOpen ? (queueWaiting ? `${queueWaiting} order${queueWaiting === 1 ? "" : "s"} preparing` : "queue is clear") : "clocked in this shift"}</em></div>
        </div>
        {shiftDiscountTotal(shift.discounts) > 0 && shift.discounts && <p className="shiftm-discounts">
          <strong>Discounts this shift</strong>
          {[shift.discounts.scPwd > 0 ? `Senior & PWD ${peso(shift.discounts.scPwd)} (${shift.discounts.scPwdCount})` : "", shift.discounts.vatExempt > 0 ? `VAT exempted ${peso(shift.discounts.vatExempt)}` : "", shift.discounts.otherId > 0 ? `Other ID ${peso(shift.discounts.otherId)}` : "", shift.discounts.rewards > 0 ? `Rewards ${peso(shift.discounts.rewards)}` : ""].filter(Boolean).join(" · ")}
          <em>already off the sales</em>
        </p>}
        {shift.delivery && (shift.delivery.orders > 0 || shift.delivery.failed > 0) && <p className="shiftm-discounts is-delivery">
          <strong>🛵 Deliveries this shift</strong>
          {[`${shift.delivery.orders} order${shift.delivery.orders === 1 ? "" : "s"}`, `${shift.delivery.delivered} delivered`, shift.delivery.failed ? `${shift.delivery.failed} not delivered` : "", shift.delivery.fees > 0 ? `${peso(shift.delivery.fees)} in fees` : "", shift.delivery.codSales > 0 ? `COD ${peso(shift.delivery.codSales)}` : "", shift.delivery.codWithRiders > 0 ? `${peso(shift.delivery.codWithRiders)} still with riders` : ""].filter(Boolean).join(" · ")}
        </p>}
        <div className="dash-drawer shiftm-drawer">
          {shift.isHistorical ? <p className="dash-shift-meta" style={{ margin: 0 }}>Cash drawer not tracked: this day was recorded before shifts and cash counts were introduced.</p> : <>
            <div className="dash-drawer-row"><span>{shift.isOpen ? "Expected in cash drawer" : "Expected in drawer"}</span><strong>{peso(shift.expectedCash)}</strong></div>
            {!shift.isOpen && <div className="dash-drawer-row" style={{ marginTop: 4 }}><span>Counted{shift.countedCash === null ? "" : ` ${peso(shift.countedCash)}`}</span><strong style={{ fontSize: 14, color: darkCashDifference(shift.cashDifference).color }}>{darkCashDifference(shift.cashDifference).text}</strong></div>}
            <div className="dash-split" aria-hidden="true"><span style={{ width: `${cashShare}%` }} /></div>
            <div className="dash-drawer-legend">
              <span><i className="is-cash" />Cash {peso(shift.cashSales)}</span>
              <span><i className="is-online" />Online {peso(shift.onlineSales)}</span>
              {codReceived > 0 && <span><i className="is-cash" />Delivery cash {peso(codReceived)}</span>}
              <span>Started with {peso(shift.startingCash)}{shift.cashReversed > 0 ? ` · −${peso(shift.cashReversed)} given back` : ""}{(shift.cashAdded ?? 0) > 0 ? ` · +${peso(shift.cashAdded ?? 0)} added` : ""}{(shift.cashRemoved ?? 0) > 0 ? ` · −${peso(shift.cashRemoved ?? 0)} taken out` : ""}{(shift.gcashReturned ?? 0) > 0 ? ` · ${peso(shift.gcashReturned ?? 0)} returned by GCash` : ""}</span>
            </div>
          </>}
          {shift.closingNotes && <p className="dash-shift-meta">“{shift.closingNotes}”</p>}
        </div>
        {longOpen && <p className="dash-shift-warning shiftm-wide">This shift has been open for over {LONG_OPEN_SHIFT_HOURS} hours. Close it when the café closes so the day is recorded correctly.</p>}
        {counted && !shift.isOpen && shift.countedCash === null && !shift.isHistorical && <p className="dash-shift-warning shiftm-wide">The cash in the drawer was not counted when this shift closed.</p>}
      </section>}

      {paymentsNeedingAttention.length > 0 && <div className="dash-error" role="alert"><span>{paymentsNeedingAttention.length} GCash payment{paymentsNeedingAttention.length === 1 ? " was" : "s were"} paid but could not become an order. Check the PayMongo dashboard and refund the customer if needed.</span></div>}

      {shift && <section className="dash-card shiftm-details">
        <div className="shiftm-tabs-row">
          <div className="inv-tabs" role="tablist" aria-label="Shift details">
            {tabs.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}>{entry.label}<span className="shiftm-count">{entry.count}</span></button>)}
          </div>
        </div>

        {tab === "activity" && <div className="shiftm-activity">
          <div className="shiftm-feed-col">
            <div className="shiftm-chips" role="group" aria-label="Show">
              {shiftFeedFilters.filter((entry) => entry.id === "all" || (eventCounts[entry.id] ?? 0) > 0).map((entry) => <button key={entry.id} type="button" aria-pressed={feedFilter === entry.id} onClick={() => { setFeedFilter(entry.id); setFeedLimit(60); }}>{entry.label} <b>{eventCounts[entry.id] ?? 0}</b></button>)}
            </div>
            {shownEvents.length === 0 ? <p className="dash-empty">Nothing recorded yet.</p> : <ol className="shiftm-feed">
              {shownEvents.slice(0, feedLimit).map((event) => <li key={event.key} className={`shiftm-event is-${event.kind}`}>
                <time dateTime={event.at}>{timeWithDay(event.at)}</time>
                <span className="shiftm-dot" aria-hidden="true" />
                <div className="shiftm-event-main"><strong>{event.title}</strong>{event.detail && <span>{event.detail}</span>}</div>
                {event.amount && <b className={`shiftm-amount is-${event.amount.tone}`}>{event.amount.text}</b>}
              </li>)}
            </ol>}
            {shownEvents.length > feedLimit && <button type="button" className="shiftm-more" onClick={() => setFeedLimit((limit) => limit + 100)}>Show {Math.min(100, shownEvents.length - feedLimit)} more</button>}
          </div>
          <div className="shiftm-rail">
            <div className="shiftm-panel">
              <h3>Sales by hour</h3>
              <p>{peakHour ? <>Busiest {hourLabel(peakHour.hour)}–{hourLabel((peakHour.hour + 1) % 24)} · {peso(peakHour.revenue)}</> : "No sales yet"}</p>
              <DashBars bars={hourBars} emptyLabel="No orders yet." />
            </div>
            {shift.isOpen && <div className="shiftm-panel">
              <h3>Queue now</h3>
              <div className="shiftm-queue">
                <div className={queueWaiting ? "is-busy" : ""}><strong>{queueWaiting}</strong><span>preparing</span></div>
                <div><strong>{queueReady}</strong><span>ready for pickup</span></div>
              </div>
            </div>}
            {riders.length > 0 && <div className="shiftm-panel">
              <h3>Riders</h3>
              <p>{shift.delivery ? `${shift.delivery.delivered} of ${shift.delivery.orders} delivered${shift.delivery.codWithRiders > 0 ? ` · ${peso(shift.delivery.codWithRiders)} cash not handed in` : ""}` : ""}</p>
              <ul className="shiftm-people">
                {riders.map((rider) => <li key={rider.name}>
                  <UserAvatar name={rider.name} size={28} />
                  <div><strong>{rider.name}</strong><span>{rider.delivered} delivered{rider.failed ? ` · ${rider.failed} failed` : ""}{rider.active ? ` · ${rider.active} on the way` : ""}</span>{rider.collected > rider.handedIn && <span style={{ color: "#B45309" }}>{peso(rider.collected - rider.handedIn)} cash to hand in</span>}</div>
                </li>)}
              </ul>
            </div>}
            <div className="shiftm-panel">
              <h3>{shift.isOpen ? "On duty" : "Worked this shift"}</h3>
              {(shift.isOpen ? onDuty : staff.filter((entry) => entry.logs.length > 0)).length === 0
                ? <p>{shift.isOpen ? "Nobody is clocked in." : "No clock-ins recorded."}</p>
                : <ul className="shiftm-people">
                  {(shift.isOpen ? onDuty : staff.filter((entry) => entry.logs.length > 0)).map((entry) => {
                    // First clock-in of the shift and the time actually worked (signed-out gaps excluded).
                    const first = entry.logs[0];
                    const open = entry.logs.find((log) => !log.timeOut);
                    const workedMinutes = entry.logs.reduce((sum, log) => sum + Math.max(0, ((log.timeOut ? new Date(log.timeOut).getTime() : now) - new Date(log.timeIn).getTime()) / 60_000), 0);
                    const detail = !first ? ""
                      : open ? `First in ${clockTime(first.timeIn)} · ${workedLabel(workedMinutes)} worked${open !== first ? ` · back since ${clockTime(open.timeIn)}` : ""}`
                        : `${clockTime(first.timeIn)} – ${clockTime(entry.logs[entry.logs.length - 1].timeOut ?? first.timeIn)} · ${workedLabel(workedMinutes)} worked`;
                    return <li key={entry.name}>
                      <UserAvatar name={entry.name} size={28} />
                      <div><strong>{entry.name}</strong><span>{detail}</span>{entry.logs.length > 1 && <span>{entry.logs.length} sign-ins this shift</span>}</div>
                    </li>;
                  })}
                </ul>}
            </div>
          </div>
        </div>}

        {tab === "orders" && <div className="flex flex-col gap-3">
          <div className="inv-toolbar">
            <label className="inv-search"><IconSearch size={15} /><input value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Queue #, order ref or item" aria-label="Search orders" />{orderSearch && <button type="button" onClick={() => setOrderSearch("")} aria-label="Clear search"><IconX size={12} /></button>}</label>
            <div className="inv-range" role="group" aria-label="Status">
              {([["all", "All"], ["completed", "Completed"], ["voided", "Voided"], ["refunded", "Refunded"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={orderStatus === id} onClick={() => setOrderStatus(id)}>{label}</button>)}
            </div>
            <label className="inv-filter"><span>Payment</span>
              <select value={orderChannelFilter} onChange={(event) => setOrderChannelFilter(event.target.value as typeof orderChannelFilter)} className={`inv-select${orderChannelFilter !== "all" ? " is-active" : ""}`}>
                <option value="all">Any</option><option value="Cash">Cash</option><option value="Online">GCash at counter</option><option value="Split">Split (cash + GCash)</option><option value="Mobile">Mobile menu</option>
              </select>
            </label>
            <label className="inv-filter"><span>Punched by</span>
              <select value={orderCashier} onChange={(event) => setOrderCashier(event.target.value)} className={`inv-select${orderCashier !== "all" ? " is-active" : ""}`}>
                <option value="all">Anyone</option>{cashierNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          <p className="inv-hint">{shownOrders.length} of {orders.length} order{orders.length === 1 ? "" : "s"} · {peso(shownOrders.filter((order) => order.soldInShift && !isReversedStatus(order.status)).reduce((sum, order) => sum + order.total, 0))} completed in this view. Orders sold in an earlier shift show here when they were voided or refunded during this one.</p>
          {shownOrders.length === 0 ? <p className="dash-empty">{orders.length === 0 ? "No orders in this shift yet." : "No orders match these filters."}</p> : <ul className="dash-orders shiftm-orders">
            {shownOrders.map((order) => {
              const reversed = isReversedStatus(order.status);
              const channel = shiftOrderChannel(order);
              return <li key={order.orderId} className={!order.soldInShift ? "is-earlier" : ""}>
                <span className="dash-order-queue">{order.queueNumber === null ? "—" : `#${order.queueNumber}`}</span>
                <div className="dash-order-main">
                  <strong>{order.items || "Order"}</strong>
                  <span>{timeWithDay(order.createdAt)} · {order.punchedBy} · <b className={`dash-channel is-${channel.toLowerCase()}`}>{channel}</b>{order.serviceType === "delivery" && <b className="order-discount-tag is-delivery">🛵 {order.paymentMethod === "cod" ? "Delivery · COD" : "Delivery"}</b>}{order.discountLabel && (order.discountTotal ?? 0) > 0 && <b className="order-discount-tag" title={order.discountLabel}>−{peso(order.discountTotal ?? 0)} {shortDiscountLabel(order.discountLabel)}</b>} · ref {order.orderId}{reversed && order.reversedAt ? ` · ${order.status.startsWith("void") ? "voided" : "refunded"} ${timeWithDay(order.reversedAt)}${order.reversedBy ? ` by ${order.reversedBy}` : ""}` : ""}</span>
                  {reversed && describeReturn(order) && <span className={order.returnMethod === "gcash" ? "shiftm-return is-gcash" : "shiftm-return"}>{describeReturn(order)}</span>}
                </div>
                <div className="dash-order-total">
                  <strong className={reversed ? "is-reversed" : ""}>{peso(order.total)}</strong>
                  {reversed ? <span className="dash-tag is-out">{order.status.startsWith("void") ? "Voided" : "Refunded"}{order.soldInShift ? "" : " · earlier sale"}</span>
                    : order.queueStatus === "waiting" && shift.isOpen ? <span className="dash-tag is-low">Preparing</span>
                      : order.serviceType === "delivery" && order.deliveryStatus && order.deliveryStatus !== "preparing" ? <span className={`dash-tag ${order.deliveryStatus === "failed" ? "is-out" : order.deliveryStatus === "delivered" ? "shiftm-ready" : "is-low"}`}>{order.deliveryStatus === "ready" ? "Packed" : deliveryStatusLabels[order.deliveryStatus] ?? order.deliveryStatus}</span>
                        : order.queueStatus === "served" && shift.isOpen ? <span className="dash-tag shiftm-ready">Ready</span> : null}
                </div>
              </li>;
            })}
          </ul>}
        </div>}

        {tab === "staff" && (staff.length === 0 ? <p className="dash-empty">Nobody has clocked in or punched an order in this shift.</p> : <div className="shiftm-staff">
          {staff.map((entry) => {
            const open = entry.logs.find((log) => !log.timeOut);
            return <article key={entry.name} className={`shiftm-person${open ? " is-on" : ""}`}>
              <div className="shiftm-person-head">
                <UserAvatar name={entry.name} size={36} />
                <div><strong>{entry.name}</strong><span>{entry.role || "Staff"}</span></div>
                <span className={`shiftm-status${open ? " is-on" : ""}`}>{open ? "On duty" : entry.logs.length ? "Clocked out" : "Not clocked in"}</span>
              </div>
              <div className="shiftm-person-stats">
                <div><span>Orders</span><strong>{entry.orders}</strong></div>
                <div><span>Sales</span><strong>{peso(entry.sales)}</strong></div>
                <div><span>Voided/refunded</span><strong>{entry.reversals}</strong></div>
              </div>
              {entry.logs.length > 0 && <ul className="shiftm-times">
                {entry.logs.map((log) => <li key={log.id}><span>{timeWithDay(log.timeIn)} → {log.timeOut ? timeWithDay(log.timeOut) : <b>now</b>}</span><em>{durationLabel(log.timeIn, log.timeOut, now)}</em></li>)}
              </ul>}
            </article>;
          })}
        </div>)}

        {tab === "stock" && <div className="shiftm-stock">
          <div>
            <h3 className="shiftm-subhead">Items sold</h3>
            {data.products.length === 0 ? <p className="dash-empty">Nothing sold yet.</p> : <ol className="dash-rank">
              {data.products.map((product, index) => <li key={`${product.name}-${index}`}>
                <span className={`dash-rank-num${index === 0 ? " is-first" : ""}`}>{index + 1}</span>
                <div className="dash-rank-main">
                  <div className="dash-rank-line"><strong>{product.name}</strong><span>{product.quantity} sold</span></div>
                  <div className="dash-meter"><span style={{ width: `${(product.quantity / Math.max(1, data.products[0].quantity)) * 100}%` }} /></div>
                  <div className="dash-rank-sub"><span>{product.category || "Uncategorized"}</span><span>{peso(product.revenue)}</span></div>
                </div>
              </li>)}
            </ol>}
          </div>
          <div>
            <h3 className="shiftm-subhead">Stock used by orders</h3>
            {stockUse.length === 0 ? <p className="dash-empty">No stock used yet.</p> : <ul className="dash-stock">
              {stockUse.map((entry) => <li key={entry.name}>
                <div className="dash-stock-main"><strong>{entry.name}</strong><span>{entry.orders.size} order{entry.orders.size === 1 ? "" : "s"}</span></div>
                <div className="dash-stock-qty"><strong style={{ color: entry.used < 0 ? "#15803D" : "#3D2B1F" }}>{entry.used < 0 ? "+" : ""}{unitAmount(Math.abs(entry.used), entry.unit)}</strong></div>
              </li>)}
            </ul>}
            <h3 className="shiftm-subhead" style={{ marginTop: 18 }}>Restocks & corrections</h3>
            {stockChanges.length === 0 ? <p className="dash-empty">No restocks or stock corrections in this shift.</p> : <ul className="dash-stock">
              {stockChanges.map((log) => <li key={log.logId}>
                <div className="dash-stock-main"><strong>{log.itemName}</strong><span>{inventoryChangeLabels[log.changeType] ?? log.changeType} · {timeWithDay(log.createdAt)}{log.adminName ? ` · ${log.adminName}` : ""}</span></div>
                <div className="dash-stock-qty"><strong style={{ color: (log.delta ?? 0) < 0 ? "#B91C1C" : "#15803D" }}>{log.delta === null || log.delta === 0 ? "—" : `${log.delta > 0 ? "+" : "−"}${unitAmount(Math.abs(log.delta), log.unit)}`}</strong></div>
              </li>)}
            </ul>}
            <button type="button" className="dash-link" style={{ marginTop: 10 }} onClick={() => onNavigate("inventory")}>Full inventory history <IconChevron size={13} /></button>
          </div>
        </div>}
      </section>}

      {action === "open" && <AdminOpenShiftDialog onClose={() => setAction(null)} onOpened={() => { setAction(null); if (selectedId === null) void load(); else viewShift(null); }} />}
      {action === "close" && shift?.isOpen && <AdminCloseShiftDialog shift={shift} onClose={() => setAction(null)} onClosed={() => { setAction(null); void load(); }} />}
      {action === "drawer" && shift?.isOpen && <AdminCashDrawerDialog expectedCash={shift.expectedCash} onClose={() => setAction(null)} onSaved={() => void load()} />}
    </div>
  </div>;
}

// ─── Shift reports ────────────────────────────────────────────────────────────
// A shift is the café's business day, opened and closed from the staff app. It can run past
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
  // Cash the last closing left in the drawer (the rest of the starting cash came from the safe),
  // and cash this closing left for the next shift (the rest went to the safe). Null before the safe.
  carriedFloat?: number | null;
  floatKept?: number | null;
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
  gcashReturned?: number;
  cashAdded?: number;
  cashRemoved?: number;
  netSales: number;
  costOfGoods: number;
  uncostedItems: number;
  // Fees PayMongo kept on the shift's GCash orders.
  paymentFees?: number;
  // Stock written off in the shift (made orders voided or refunded in it included).
  writtenOff?: number;
  // Discounts in the shift's sales, already taken off the sales figures above.
  discounts?: ShiftDiscounts;
  // Delivery orders sold in the shift. codReceived: riders' cash handed in during the shift
  // (already in the expected cash); codWithRiders: collected but not handed in yet.
  delivery?: ShiftDeliveryTotals;
};
type ShiftDeliveryTotals = { orders: number; fees: number; codSales: number; codReceived: number; codWithRiders: number; delivered: number; failed: number };
// A delivery of a shift: sold in it, or its cash on delivery handed in during it.
type ShiftDelivery = {
  id: number; orderId: number; queueNumber: number | null; status: string; payment: string; fee: number; zone: string; codAmount: number | null; codCollected: number | null;
  failureReason: string | null; soldInShift: boolean; orderStatus: string; remittedInShift: boolean; rider: string | null; remittedTo: string | null;
  pickedUpAt: string | null; deliveredAt: string | null; failedAt: string | null; remittedAt: string | null;
};
const deliveryStatusLabels: Record<string, string> = { preparing: "Being prepared", ready: "Packed, waiting for a rider", out: "On the way", delivered: "Delivered", failed: "Not delivered", cancelled: "Cancelled (voided)" };
function minutesLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
// Each rider's deliveries in a shift: delivered, failed, still going, cash collected and handed in.
function shiftRiders(deliveries: ShiftDelivery[]) {
  const riders = new Map<string, { name: string; delivered: number; failed: number; active: number; fees: number; collected: number; handedIn: number }>();
  for (const delivery of deliveries) {
    if (!delivery.soldInShift || !delivery.rider) continue;
    const entry = riders.get(delivery.rider) ?? { name: delivery.rider, delivered: 0, failed: 0, active: 0, fees: 0, collected: 0, handedIn: 0 };
    if (delivery.status === "delivered") { entry.delivered += 1; entry.fees += delivery.fee; }
    else if (delivery.status === "failed") entry.failed += 1;
    else if (delivery.status === "out" || delivery.status === "ready") entry.active += 1;
    entry.collected += delivery.codCollected ?? 0;
    if (delivery.remittedAt) entry.handedIn += delivery.codCollected ?? 0;
    riders.set(delivery.rider, entry);
  }
  return Array.from(riders.values()).sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name));
}
// How an order was paid, short: for order rows.
const paymentShort = (order: { paymentMethod: string }) => order.paymentMethod === "cod" ? "COD" : order.paymentMethod === "split" ? "Split" : order.paymentMethod === "online" ? "Online" : "Cash";
type ShiftDiscounts = { scPwd: number; scPwdCount: number; vatExempt: number; otherId: number; rewards: number };
const shiftDiscountTotal = (discounts?: ShiftDiscounts) => discounts ? discounts.scPwd + discounts.vatExempt + discounts.otherId + discounts.rewards : 0;
// "Senior Citizen (Juan Dela Cruz)" → "Senior Citizen" for small tags (the full label is the tooltip).
const shortDiscountLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");
// Cash put into or taken out of the drawer during a shift (see cash-movements-migration.sql).
type DrawerKind = "cash_in" | "cash_out" | "cash_drop";
type DrawerMovement = { id: number; kind: string; amount: number; reason: string; note: string | null; by: string | null; source: string; createdAt: string };
const drawerKindLabels: Record<string, string> = { cash_in: "Cash in", cash_out: "Cash out", cash_drop: "Cash drop" };
const drawerSigned = (entry: DrawerMovement) => entry.kind === "cash_in" ? entry.amount : -entry.amount;
type ShiftOrder = { orderId: number; queueNumber: number | null; status: string; total: number; discountLabel?: string | null; discountTotal?: number; paymentMethod: string; orderSource: string; serviceType?: string | null; soldInShift: boolean; reversedInShift: boolean; createdAt: string; reversedAt: string | null; punchedBy: string; items: string };
type ShiftAttendance = { id: number; name: string; role: string; timeIn: string; timeOut: string | null };
type SafeMove = { id: number; kind: string; amount: number; balanceAfter: number; reason: string; by: string | null; createdAt: string };
type ShiftDetail = { summary: ShiftReport; orders: ShiftOrder[]; attendance: ShiftAttendance[]; movements?: DrawerMovement[]; deliveries?: ShiftDelivery[]; safeMoves?: SafeMove[] };

const LONG_OPEN_SHIFT_HOURS = 16;

// What each kind of order discount is called in Finance.
const discountSourceLabels: Record<string, string> = { reward: "reward", birthday: "birthday", senior: "senior", pwd: "PWD", student: "student", employee: "employee meal", custom: "custom discount", mixed: "mixed ID discount", promo: "promo", other: "other" };

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

const shiftDrawerState = (shift: ShiftReport) => shift.closedAt === null ? "Open" : shift.isHistorical || shift.cashDifference === null ? "Not counted" : Math.abs(shift.cashDifference) < 0.005 ? "Balanced" : shift.cashDifference > 0 ? "Over" : "Short";

function shiftListColumns(): ExcelColumn<ShiftReport>[] {
  return [
    { header: "Shift", value: (shift) => `#${shift.shiftId}` },
    { header: "Business date", value: (shift) => shift.businessDate },
    { header: "Opened", value: (shift) => excelDateTime(shift.openedAt) },
    { header: "Opened by", value: (shift) => shift.openedByName ?? "" },
    { header: "Closed", value: (shift) => shift.closedAt ? excelDateTime(shift.closedAt) : "Still open" },
    { header: "Closed by", value: (shift) => shift.closedByName ?? "" },
    { header: "Hours open", value: (shift) => Math.round(shift.hoursOpen * 100) / 100, kind: "hours" },
    { header: "Orders", value: (shift) => shift.orderCount, kind: "count" },
    { header: "Gross sales", value: (shift) => shift.grossSales, kind: "money" },
    { header: "Voids and refunds", value: (shift) => shift.voidCount + shift.refundCount, kind: "count" },
    { header: "Voided or refunded", value: (shift) => shift.reversedAmount, kind: "money" },
    { header: "Net sales", value: (shift) => shift.netSales, kind: "money" },
    { header: "Senior & PWD discount", value: (shift) => shift.discounts?.scPwd || null, kind: "money" },
    { header: "VAT exempted", value: (shift) => shift.discounts?.vatExempt || null, kind: "money" },
    { header: "Other ID discounts", value: (shift) => shift.discounts?.otherId || null, kind: "money" },
    { header: "Loyalty rewards", value: (shift) => shift.discounts?.rewards || null, kind: "money" },
    { header: "Cash sales", value: (shift) => shift.cashSales, kind: "money" },
    { header: "GCash and online", value: (shift) => shift.onlineSales, kind: "money" },
    { header: "Delivery orders", value: (shift) => shift.delivery?.orders || null, kind: "count" },
    { header: "Delivery fees", value: (shift) => shift.delivery?.fees || null, kind: "money" },
    { header: "Failed deliveries", value: (shift) => shift.delivery?.failed || null, kind: "count" },
    { header: "Cash on delivery received", value: (shift) => shift.delivery?.codReceived || null, kind: "money" },
    { header: "Starting cash", value: (shift) => shift.isHistorical ? null : shift.startingCash, kind: "money" },
    { header: "Cash added", value: (shift) => shift.cashAdded ?? 0, kind: "money" },
    { header: "Cash taken out", value: (shift) => shift.cashRemoved ?? 0, kind: "money" },
    { header: "Expected in drawer", value: (shift) => shift.isHistorical ? null : shift.expectedCash, kind: "money" },
    { header: "Counted", value: (shift) => shift.countedCash, kind: "money" },
    { header: "Difference", value: (shift) => shift.cashDifference, kind: "money" },
    { header: "Left in drawer", value: (shift) => shift.floatKept ?? null, kind: "money" },
    { header: "Taken out at closing", value: (shift) => shift.floatKept === null || shift.floatKept === undefined || shift.countedCash === null ? null : shift.countedCash - shift.floatKept, kind: "money" },
    { header: "Drawer", value: shiftDrawerState },
    { header: "Closing notes", value: (shift) => shift.closingNotes ?? "" },
  ];
}

function exportShiftList(shifts: ShiftReport[], label: string, fileStamp: string) {
  const counted = shifts.filter((shift) => shift.cashDifference !== null && !shift.isHistorical);
  saveWorkbook([
    ["Summary", excelInfo([
      ["Brew Houze shift reports"],
      ["Showing", label],
      ["Generated", excelNow()],
      ["Shifts", shifts.length],
      ["Net sales", shifts.reduce((sum, shift) => sum + shift.netSales, 0)],
      ["Cash over or short (counted shifts)", counted.reduce((sum, shift) => sum + (shift.cashDifference ?? 0), 0)],
      ["Short", counted.filter((shift) => (shift.cashDifference ?? 0) < -0.005).length],
      ["Over", counted.filter((shift) => (shift.cashDifference ?? 0) > 0.005).length],
    ], ["Shifts", "Short", "Over"])],
    ["Shifts", excelTable(shifts, shiftListColumns())],
  ], `brew-houze-shifts-${fileStamp}.xlsx`);
}

// One shift in full: totals and cash drawer, every order, and attendance.
function exportShiftReport(shift: ShiftDetail) {
  const { summary } = shift;
  saveWorkbook([
    ["Summary", excelInfo([
      [`Brew Houze shift #${summary.shiftId}${summary.isHistorical ? " (recorded before shifts, grouped by calendar day)" : ""}`],
      ["Business date", summary.businessDate],
      ["Opened", excelDateTime(summary.openedAt), summary.openedByName ?? ""],
      ["Closed", summary.closedAt ? excelDateTime(summary.closedAt) : "Still open", summary.closedByName ?? ""],
      ["Generated", excelNow()],
      [],
      ["Sales"],
      ["Orders", summary.orderCount],
      ["Items sold", summary.itemsSold],
      ["Gross sales", summary.grossSales],
      ["Voids", summary.voidCount],
      ["Refunds", summary.refundCount],
      ["Voided or refunded amount", summary.reversedAmount],
      ["Net sales", summary.netSales],
      ...(shiftDiscountTotal(summary.discounts) > 0 && summary.discounts ? [
        ["Senior and PWD discount", summary.discounts.scPwd],
        ["Senior and PWD sales with a discount", summary.discounts.scPwdCount],
        ["VAT exempted (senior and PWD)", summary.discounts.vatExempt],
        ["Other ID discounts", summary.discounts.otherId],
        ["Loyalty reward discounts", summary.discounts.rewards],
      ] as ExcelInfoRow[] : []),
      ["Cost of goods", summary.costOfGoods],
      ["Items sold without a cost", summary.uncostedItems],
      ["Gross profit", summary.uncostedItems > 0 ? "Incomplete: some items have no cost" : summary.netSales - summary.costOfGoods],
      ["PayMongo fees (GCash)", summary.paymentFees ?? 0],
      ["Stock written off", summary.writtenOff ?? 0],
      ["Profit after PayMongo fees", summary.uncostedItems > 0 ? "Incomplete: some items have no cost" : summary.netSales - summary.costOfGoods - (summary.paymentFees ?? 0)],
      [],
      ["Cash drawer"],
      ...(summary.isHistorical ? [["Not tracked for this day"] as ExcelInfoRow] : [
        ["Starting cash", summary.startingCash] as ExcelInfoRow,
        ["Cash sales", summary.cashSales] as ExcelInfoRow,
        ...((summary.delivery?.codReceived ?? 0) > 0 ? [["Cash on delivery received from riders", summary.delivery?.codReceived ?? 0] as ExcelInfoRow] : []),
        ["Cash given back", summary.cashReversed] as ExcelInfoRow,
        ["Returned through GCash (not from the drawer)", summary.gcashReturned ?? 0] as ExcelInfoRow,
        ["Cash added (cash in)", summary.cashAdded ?? 0] as ExcelInfoRow,
        ["Cash taken out (cash out and drops)", summary.cashRemoved ?? 0] as ExcelInfoRow,
        ["Expected in drawer", summary.expectedCash] as ExcelInfoRow,
        ["Counted", summary.countedCash ?? "Not counted"] as ExcelInfoRow,
        ["Difference", summary.cashDifference ?? "Not counted"] as ExcelInfoRow,
        ...(summary.floatKept !== null && summary.floatKept !== undefined && summary.countedCash !== null ? [["Left in the drawer for the next shift", summary.floatKept] as ExcelInfoRow, ["Taken out at closing", summary.countedCash - summary.floatKept] as ExcelInfoRow] : []),
      ]),
      ["GCash and online", summary.onlineSales],
      ["Closing notes", summary.closingNotes ?? ""],
      ...(summary.delivery && (summary.delivery.orders > 0 || summary.delivery.failed > 0) ? [
        [] as ExcelInfoRow,
        ["Deliveries"] as ExcelInfoRow,
        ["Delivery orders", summary.delivery.orders] as ExcelInfoRow,
        ["Delivered", summary.delivery.delivered] as ExcelInfoRow,
        ["Could not be delivered", summary.delivery.failed] as ExcelInfoRow,
        ["Delivery fees", summary.delivery.fees] as ExcelInfoRow,
        ["Cash on delivery sales", summary.delivery.codSales] as ExcelInfoRow,
        ["Cash on delivery received from riders", summary.delivery.codReceived] as ExcelInfoRow,
        ["Cash on delivery still with riders", summary.delivery.codWithRiders] as ExcelInfoRow,
      ] : []),
    ], ["Orders", "Items sold", "Voids", "Refunds", "Items sold without a cost", "Delivery orders", "Delivered", "Could not be delivered"])],
    ["Orders", shift.orders.length ? excelTable(shift.orders, [
      { header: "Queue #", value: (order) => order.queueNumber ?? null },
      { header: "Order #", value: (order) => order.orderId },
      { header: "Time", value: (order) => excelDateTime(order.createdAt) },
      { header: "Items", value: (order) => order.items },
      { header: "Discount", value: (order) => order.discountTotal || null, kind: "money" },
      { header: "Discount for", value: (order) => order.discountLabel ?? "" },
      { header: "Total", value: (order) => order.total, kind: "money" },
      { header: "Payment", value: (order) => excelPayment(order) },
      { header: "Order type", value: (order) => order.serviceType ? serviceTypeLabels[order.serviceType] ?? order.serviceType : "" },
      { header: "Punched by", value: (order) => order.punchedBy },
      { header: "Status", value: (order) => excelStatus(order.status) },
      { header: "In this shift", value: (order) => order.soldInShift && order.reversedInShift ? "Sold and reversed" : order.soldInShift ? "Sold" : "Reversed (sold in an earlier shift)" },
      { header: "Reversed at", value: (order) => excelDateTime(order.reversedAt) },
    ]) : null],
    ["Cash drawer", (shift.movements ?? []).length ? excelTable(shift.movements ?? [], [
      { header: "Time", value: (entry) => excelDateTime(entry.createdAt) },
      { header: "Entry", value: (entry) => drawerKindLabels[entry.kind] ?? entry.kind },
      { header: "Reason", value: (entry) => entry.reason },
      { header: "Amount", value: drawerSigned, kind: "money" },
      { header: "By", value: (entry) => entry.by ?? "" },
      { header: "From", value: (entry) => entry.source === "admin" ? "Admin app" : "Staff app" },
      { header: "Note", value: (entry) => entry.note ?? "" },
    ]) : null],
    ["Deliveries", (shift.deliveries ?? []).length ? excelTable(shift.deliveries ?? [], [
      { header: "Queue #", value: (delivery) => delivery.queueNumber ?? null },
      { header: "Order #", value: (delivery) => delivery.orderId },
      { header: "Zone", value: (delivery) => delivery.zone },
      { header: "Rider", value: (delivery) => delivery.rider ?? "" },
      { header: "Status", value: (delivery) => deliveryStatusLabels[delivery.status] ?? delivery.status },
      { header: "Payment", value: (delivery) => delivery.payment === "cod" ? "Cash on delivery" : delivery.payment === "cash" ? "Cash (paid at the counter)" : "GCash" },
      { header: "Delivery fee", value: (delivery) => delivery.fee, kind: "money" },
      { header: "Picked up", value: (delivery) => excelDateTime(delivery.pickedUpAt) },
      { header: "Delivered", value: (delivery) => excelDateTime(delivery.deliveredAt) },
      { header: "Cash collected", value: (delivery) => delivery.codCollected, kind: "money" },
      { header: "Cash handed in", value: (delivery) => excelDateTime(delivery.remittedAt) },
      { header: "Received by", value: (delivery) => delivery.remittedTo ?? "" },
      { header: "Not delivered because", value: (delivery) => delivery.failureReason ?? "" },
      { header: "In this shift", value: (delivery) => delivery.soldInShift ? "Sold" : "Cash handed in (sold in an earlier shift)" },
    ]) : null],
    ["Attendance", shift.attendance.length ? excelTable(shift.attendance, [
      { header: "Employee", value: (log) => log.name },
      { header: "Role", value: (log) => log.role.charAt(0).toUpperCase() + log.role.slice(1) },
      { header: "Time in", value: (log) => excelDateTime(log.timeIn) },
      { header: "Time out", value: (log) => log.timeOut ? excelDateTime(log.timeOut) : "Still on duty" },
      { header: "Hours", value: (log) => Math.round(((log.timeOut ? new Date(log.timeOut).getTime() : Date.now()) - new Date(log.timeIn).getTime()) / 36_000) / 100, kind: "hours" },
    ]) : null],
  ], `brew-houze-shift-${summary.shiftId}-${summary.businessDate}.xlsx`);
}

function ShiftReports({ start, end }: { start: string; end: string }) {
  const [shifts, setShifts] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/shifts?start=${start}&end=${end}`, { cache: "no-store" });
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
  }, [start, end]);

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

  const [drawerFilter, setDrawerFilter] = useState<"all" | "open" | "balanced" | "short" | "over" | "uncounted">("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const drawerState = (shift: ShiftReport) => shift.closedAt === null ? "open" as const : shift.isHistorical || shift.cashDifference === null ? "uncounted" as const : Math.abs(shift.cashDifference) < 0.005 ? "balanced" as const : shift.cashDifference > 0 ? "over" as const : "short" as const;
  const staffNames = Array.from(new Set(shifts.flatMap((shift) => [shift.openedByName, shift.closedByName]).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b));
  const shownShifts = shifts.filter((shift) => (drawerFilter === "all" || drawerState(shift) === drawerFilter) && (staffFilter === "all" || shift.openedByName === staffFilter || shift.closedByName === staffFilter));
  const counted = shownShifts.filter((shift) => drawerState(shift) !== "open" && drawerState(shift) !== "uncounted");
  const netDifference = counted.reduce((sum, shift) => sum + (shift.cashDifference ?? 0), 0);
  const shortCount = counted.filter((shift) => drawerState(shift) === "short").length;
  const overCount = counted.filter((shift) => drawerState(shift) === "over").length;
  const totalNet = shownShifts.reduce((sum, shift) => sum + shift.netSales, 0);
  const differenceLabel = cashDifferenceLabel(counted.length ? netDifference : null);

  return <section className="flex flex-col gap-4">
    <div className="inv-summary">
      <div className="inv-stat is-static"><span>Shifts</span><strong>{shownShifts.length}</strong><em>{shownShifts.filter((shift) => shift.closedAt === null).length} open now</em></div>
      <div className="inv-stat is-static"><span>Net sales</span><strong>{peso(totalNet)}</strong><em>{shownShifts.length ? `${peso(totalNet / shownShifts.length)} per shift` : "—"}</em></div>
      <button type="button" className="inv-stat is-low" aria-pressed={drawerFilter === "short"} onClick={() => setDrawerFilter(drawerFilter === "short" ? "all" : "short")}><span>Cash over / short</span><strong style={{ color: differenceLabel.color }}>{counted.length ? differenceLabel.text : "—"}</strong><em>{shortCount} short · {overCount} over · {counted.length} counted</em></button>
      <div className="inv-stat is-static"><span>Voids & refunds</span><strong>{shownShifts.reduce((sum, shift) => sum + shift.voidCount + shift.refundCount, 0)}</strong><em>−{peso(shownShifts.reduce((sum, shift) => sum + shift.reversedAmount, 0))}</em></div>
    </div>
    <div className="inv-toolbar">
      <div className="inv-range" role="group" aria-label="Cash drawer">
        {([["all", "All"], ["open", "Open"], ["balanced", "Balanced"], ["short", "Short"], ["over", "Over"], ["uncounted", "Not counted"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={drawerFilter === id} onClick={() => setDrawerFilter(id)}>{label}</button>)}
      </div>
      <label className="inv-filter"><span>Opened or closed by</span>
        <select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} className={`inv-select${staffFilter !== "all" ? " is-active" : ""}`}>
          <option value="all">Anyone</option>{staffNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    {shownShifts.length > 0 && <div className="flex justify-end"><button type="button" className="inv-secondary" onClick={() => exportShiftList(shownShifts, `${start === end ? start : `${start} to ${end}`}${drawerFilter !== "all" ? ` · ${drawerFilter}` : ""}${staffFilter !== "all" ? ` · ${staffFilter}` : ""}`, start === end ? start : `${start}-to-${end}`)}><IconDownload size={14} />Export {shownShifts.length} shift{shownShifts.length === 1 ? "" : "s"}</button></div>}
    <p className="inv-hint">Each shift is one business day, opened and closed from the staff app, even past midnight. Voids and refunds count in the shift they happened in. Tap a shift for its full report and Excel export.</p>
    {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
    {loading && shifts.length === 0 ? <div className="inv-empty">Loading shifts…</div>
      : shownShifts.length === 0 ? <div className="inv-empty">{shifts.length === 0 ? "No shifts in this period." : "No shifts match these filters."}</div>
        : <div className="fin-shift-list">
          {shownShifts.map((shift) => {
            const state = drawerState(shift);
            const longOpen = state === "open" && shift.hoursOpen >= LONG_OPEN_SHIFT_HOURS;
            const difference = cashDifferenceLabel(shift.cashDifference);
            const reversals = shift.voidCount + shift.refundCount;
            return <button key={shift.shiftId} type="button" className={`fin-shift is-${state}${longOpen ? " is-long" : ""}`} onClick={() => void openDetail(shift.shiftId)} disabled={detailLoadingId !== null}>
              <span className="fin-shift-date"><strong>{shiftBusinessDate(shift.businessDate)}</strong><span>Shift #{shift.shiftId}{shift.isHistorical ? " · historical" : ""}</span></span>
              <span className="fin-shift-time"><strong>{clockTime(shift.openedAt)} → {shift.closedAt ? clockTime(shift.closedAt) : "now"}</strong><span>{shift.openedByName ?? "—"}{shift.closedByName ? ` → ${shift.closedByName}` : ""} · {shift.hoursOpen < 1 ? `${Math.round(shift.hoursOpen * 60)}m` : `${shift.hoursOpen.toFixed(1)}h`}</span></span>
              <span className="fin-cell"><strong>{peso(shift.netSales)}</strong><span>{shift.orderCount} order{shift.orderCount === 1 ? "" : "s"}{reversals ? ` · ${reversals} void/refund` : ""}</span></span>
              <span className="fin-cell"><strong>{shift.isHistorical ? "—" : peso(shift.expectedCash)}</strong><span>{shift.countedCash === null ? "expected in drawer" : `counted ${peso(shift.countedCash)}`}</span></span>
              <span className={`fin-drawer is-${state}`}>{detailLoadingId === shift.shiftId ? "Opening…" : state === "open" ? (longOpen ? `Open ${Math.floor(shift.hoursOpen)}h` : "Open now") : state === "uncounted" ? "Not counted" : difference.text}</span>
            </button>;
          })}
        </div>}

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
              <button type="button" onClick={() => exportShiftReport(detail)} className="flex items-center gap-2" style={{ border: "1px solid #E8DDD5", background: "#FFFFFF", color: "#3D2B1F", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}><IconDownload size={13} />Export .xlsx</button>
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
              {summary.discounts && shiftDiscountTotal(summary.discounts) > 0 && <>
                {summary.discounts.scPwd > 0 && row(`Senior & PWD discount (${summary.discounts.scPwdCount})`, `−${peso(summary.discounts.scPwd)}`, false, "#1D4ED8")}
                {summary.discounts.vatExempt > 0 && row("VAT exempted (senior & PWD)", `−${peso(summary.discounts.vatExempt)}`, false, "#1D4ED8")}
                {summary.discounts.otherId > 0 && row("Other ID discounts", `−${peso(summary.discounts.otherId)}`, false, "#1D4ED8")}
                {summary.discounts.rewards > 0 && row("Loyalty rewards", `−${peso(summary.discounts.rewards)}`, false, "#B45309")}
                <p style={{ margin: "2px 0 6px", color: "#9C8278", fontSize: 11 }}>Discounts are already taken off the sales above.</p>
              </>}
              {row("Cost of goods", summary.uncostedItems > 0 ? `${peso(summary.costOfGoods)}*` : peso(summary.costOfGoods))}
              {row("Gross profit", summary.uncostedItems > 0 ? "Incomplete*" : peso(summary.netSales - summary.costOfGoods), true, "#2E7D32")}
              {(summary.paymentFees ?? 0) > 0 && <>
                {row("PayMongo fees (GCash)", `−${peso(summary.paymentFees ?? 0)}`, false, "#B45309")}
                {row("Profit after PayMongo fees", summary.uncostedItems > 0 ? "Incomplete*" : peso(summary.netSales - summary.costOfGoods - (summary.paymentFees ?? 0)), true, "#2E7D32")}
              </>}
              {(summary.writtenOff ?? 0) > 0 && row("Stock written off", `−${peso(summary.writtenOff ?? 0)}`, false, "#B91C1C")}
              {summary.uncostedItems > 0 && <p style={{ margin: "4px 0 0", color: "#9C8278", fontSize: 11 }}>* {summary.uncostedItems} item{summary.uncostedItems === 1 ? "" : "s"} sold without a complete inventory cost.</p>}
            </div>
            <div>
              <p style={{ margin: "0 0 4px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Cash drawer</p>
              {summary.isHistorical ? <p style={{ color: "#9C8278", fontSize: 12.5 }}>Not tracked: this day was recorded before shifts and cash counts were introduced.</p> : <>
                {row("Starting cash", peso(summary.startingCash))}
                {row("+ Cash sales", peso(summary.cashSales))}
                {(summary.delivery?.codReceived ?? 0) > 0 && row("+ Cash on delivery from riders", peso(summary.delivery?.codReceived ?? 0))}
                {row("− Cash given back", peso(summary.cashReversed))}
                {(summary.gcashReturned ?? 0) > 0 && row("Returned through GCash (not from the drawer)", peso(summary.gcashReturned ?? 0))}
                {(summary.cashAdded ?? 0) > 0 && row("+ Cash added (cash in)", peso(summary.cashAdded ?? 0))}
                {(summary.cashRemoved ?? 0) > 0 && row("− Cash taken out (cash out and drops)", peso(summary.cashRemoved ?? 0))}
                <div style={{ borderTop: "1px solid #E8DDD5" }}>{row("Expected in drawer", peso(summary.expectedCash), true)}</div>
                {row("Counted", summary.countedCash === null ? "Not counted yet" : peso(summary.countedCash))}
                {row("Difference", summary.closedAt ? difference.text : "—", true, difference.color)}
                {summary.closedAt && summary.floatKept !== null && summary.floatKept !== undefined && summary.countedCash !== null && <>
                  {row("Left in the drawer for the next shift", peso(summary.floatKept))}
                  {row("Taken out at closing", peso(summary.countedCash - summary.floatKept))}
                </>}
                {row("Paid online", peso(summary.onlineSales))}
                {summary.closingNotes && <p style={{ margin: "8px 0 0", padding: "8px 10px", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", fontSize: 12 }}>“{summary.closingNotes}”</p>}
              </>}
            </div>
          </div>
          {(detail.safeMoves ?? []).length > 0 && <div style={{ padding: "0 22px 16px" }}>
            <p style={{ margin: "0 0 6px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Safe ({(detail.safeMoves ?? []).length})</p>
            <ul className="fin-simple-list">
              {(detail.safeMoves ?? []).map((move) => <li key={move.id}><span><strong>{safeKindLabels[move.kind] ?? move.kind}</strong><em>{shiftTime(move.createdAt)}{move.by ? ` · ${move.by}` : ""} · {move.reason} · safe then {peso(move.balanceAfter)}</em></span><strong style={{ color: move.amount >= 0 ? "#15803D" : "#B91C1C" }}>{move.amount >= 0 ? "+" : "−"}{peso(Math.abs(move.amount))}</strong></li>)}
            </ul>
          </div>}
          <div style={{ padding: "0 22px 16px" }}>
            <p style={{ margin: "0 0 6px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Orders ({detail.orders.length})</p>
            {detail.orders.length === 0 ? <p style={{ color: "#9C8278", fontSize: 12.5 }}>No orders in this shift.</p> : <div style={{ border: "1px solid #E8DDD5", borderRadius: 12, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
              {detail.orders.map((order, index) => {
                const reversed = order.status !== "completed";
                return <div key={order.orderId} className="flex items-center gap-3" style={{ padding: "8px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", fontSize: 12.5, background: order.reversedInShift && !order.soldInShift ? "#FEF2F2" : undefined }}>
                  <strong style={{ minWidth: 42, color: reversed ? "#9C8278" : "#D97706" }}>#{order.queueNumber ?? "—"}</strong>
                  <span style={{ minWidth: 70, color: "#9C8278" }}>{new Date(order.createdAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}</span>
                  <span style={{ flex: 1, minWidth: 0, color: reversed ? "#9C8278" : "#3D2B1F", textDecoration: reversed ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.items}</span>
                  <span style={{ color: "#9C8278", fontSize: 11 }}>{order.serviceType === "delivery" ? "🛵 " : ""}{paymentShort(order)} · {order.punchedBy}{order.discountLabel && (order.discountTotal ?? 0) > 0 ? ` · −${peso(order.discountTotal ?? 0)} ${shortDiscountLabel(order.discountLabel)}` : ""}</span>
                  {reversed && <span style={{ padding: "1px 7px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C", fontSize: 10.5, fontWeight: 800, textTransform: "capitalize" }}>{order.status}{order.reversedInShift && !order.soldInShift ? " (earlier sale)" : ""}</span>}
                  <strong style={{ minWidth: 72, textAlign: "right", color: reversed ? "#9C8278" : "#3D2B1F" }}>{peso(order.total)}</strong>
                </div>;
              })}
            </div>}
          </div>
          {summary.delivery && (summary.delivery.orders > 0 || summary.delivery.failed > 0 || (detail.deliveries ?? []).length > 0) && <div style={{ padding: "0 22px 16px" }}>
            <p style={{ margin: "0 0 6px", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>Deliveries ({summary.delivery.orders})</p>
            <div className="acc-stats fin-dlv-stats">
              <div><span>Delivered</span><strong>{summary.delivery.delivered}</strong><em className="fin-loy-sub">{summary.delivery.failed ? `${summary.delivery.failed} not delivered` : "none failed"}</em></div>
              <div><span>Delivery fees</span><strong>{peso(summary.delivery.fees)}</strong></div>
              <div><span>Cash on delivery</span><strong>{peso(summary.delivery.codSales)}</strong><em className="fin-loy-sub">{peso(summary.delivery.codReceived)} handed in</em></div>
              <div><span>Still with riders</span><strong style={{ color: summary.delivery.codWithRiders > 0 ? "#B45309" : undefined }}>{peso(summary.delivery.codWithRiders)}</strong></div>
            </div>
            {shiftRiders(detail.deliveries ?? []).length > 0 && <ul className="fin-simple-list" style={{ marginTop: 8 }}>
              {shiftRiders(detail.deliveries ?? []).map((rider) => <li key={rider.name}><span><strong>🛵 {rider.name}</strong><em>{rider.delivered} delivered{rider.failed ? ` · ${rider.failed} not delivered` : ""}{rider.active ? ` · ${rider.active} still going` : ""}{rider.collected ? ` · collected ${peso(rider.collected)}, handed in ${peso(rider.handedIn)}` : ""}</em></span><strong>{peso(rider.fees)} fees</strong></li>)}
            </ul>}
            {(detail.deliveries ?? []).filter((delivery) => delivery.status === "failed").map((delivery) => <p key={delivery.id} style={{ margin: "6px 0 0", padding: "6px 10px", borderRadius: 8, background: "#FEF2F2", color: "#991B1B", fontSize: 12 }}>#{delivery.queueNumber ?? delivery.orderId} not delivered{delivery.rider ? ` by ${delivery.rider}` : ""}: {delivery.failureReason ?? "no reason given"}{delivery.orderStatus === "completed" ? " · not voided yet" : " · voided"}</p>)}
          </div>}
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

// ─── Finance ─────────────────────────────────────────────────────────────────
// One date bar drives three views: Overview (how the café did, against the period before),
// Shifts (did each cash drawer balance) and Orders (find any transaction). Everything uses
// business dates, so a night that runs past midnight stays one day.

type FinanceTotals = {
  orders: number; netSales: number; grossSales: number; voids: number; refunds: number; reversedAmount: number;
  cashSales: number; counterOnlineSales: number; mobileSales: number; mobileOrders: number; itemsSold: number;
  costOfGoods: number; costedRevenue: number; grossProfit: number; uncostedItems: number;
  // Fees PayMongo kept on the period's GCash orders, and GCash orders whose fee is not known yet.
  paymentFees?: number; unknownFees?: number;
  // What the café spent to run (expenses), and gross profit minus PayMongo fees minus expenses.
  expenses?: number; netProfit?: number;
  // Stock written off (waste, in-house use, made orders voided or refunded) and those without a cost.
  writtenOff?: number; uncostedWriteOffs?: number;
};
type FinanceOverviewData = {
  // Stock written off in the range, by reason (made_order: made, then voided or refunded).
  writeOffs?: { reason: string; entries: number; cost: number }[];
  range: { start: string; end: string; days: number };
  previousRange: { start: string; end: string };
  current: FinanceTotals;
  previous: FinanceTotals;
  daily: { day: string; orders: number; netSales: number; reversedAmount: number }[];
  categories: { name: string; quantity: number; revenue: number }[];
  products: { productId: number; name: string; category: string; quantity: number; revenue: number; cost: number | null }[];
  addons: { name: string; quantity: number; revenue: number }[];
  hours: { hour: number; orders: number; revenue: number }[];
  staff: { name: string; role: string; orders: number; revenue: number; reversedOrders: number; reversedAmount: number }[];
  // Loyalty in the range (null when it could not be read).
  loyalty?: FinanceLoyalty | null;
  // Dine in vs take out ("unknown": orders from before it was recorded).
  serviceTypes?: { type: string; orders: number; sales: number }[];
  // Deliveries in the range (null when they could not be read).
  deliveries?: FinanceDeliveries | null;
};
type FinanceDeliveries = {
  orders: number; sales: number; fees: number; freeDeliveries: number; codOrders: number; codSales: number; codCollected: number; codReceived: number; codWithRiders: number;
  delivered: number; failed: number; cancelled: number; active: number; avgTotalMinutes: number | null; avgRoadMinutes: number | null;
  riders: { name: string; delivered: number; failed: number; fees: number; codCollected: number; codWithRider: number; avgRoadMinutes: number | null }[];
  zones: { name: string; orders: number; fees: number; sales: number }[];
  failures: { orderId: number; queueNumber: number | null; zone: string; reason: string | null; payment: string; total: number; voided: boolean; rider: string | null; at: string | null }[];
};
type FinanceLoyalty = {
  memberOrders: number; memberSales: number; members: number; starsEarned: number; starsSpent: number; starsAdjusted: number;
  rewardsClaimed: number; rewardValue: number; rewardCost: number | null; rewards: { name: string; claimed: number; value: number; cost: number | null }[];
  discounts?: { source: string; orders: number; amount: number; vatExempt?: number }[]; discountTotal?: number; vatExemptTotal?: number;
};
// rewardName: a loyalty reward line (sold at ₱0); rewardValue: its normal price.
type FinanceOrderItem = { productName: string; category: string; size: string | null; temperature: string | null; quantity: number; custom?: string | null; unitPrice: number; rewardName?: string | null; rewardValue?: number | null; additions: { name: string; quantity: number; unitPrice: number }[] };
type FinanceOrder = {
  orderId: number; queueNumber: number | null; status: string; reversed: boolean; total: number; paymentMethod: string; orderSource: string;
  received: number | null; change: number | null; shiftId: number | null; reversedShiftId: number | null; reversalType: string | null;
  businessDate: string; createdAt: string; reversedAt: string | null; punchedBy: string; reversedBy: string | null; cost: number | null; items: FinanceOrderItem[];
  customerName?: string | null;
  // A discount taken off the order (a loyalty reward, or ID discounts such as senior and PWD, whose
  // VAT is also removed: vatExemptAmount).
  subtotal?: number | null; discountAmount?: number; discountLabel?: string | null; vatExemptAmount?: number; deliveryFee?: number;
  // Dine in, take out or delivery (null: before it was recorded).
  serviceType?: "dine_in" | "take_out" | "delivery" | null;
  // Delivery orders: where it went, who took it, and its cash on delivery.
  delivery?: { recipient: string; phone: string; street: string; landmark: string | null; zone: string; status: string; rider: string | null; failureReason: string | null; codCollected: number | null; receivedBy: string | null; deliveredAt: string | null; remittedAt: string | null } | null;
  paymentProvider?: string | null;
  // Split ticket: the part paid in cash (the rest was GCash).
  cashPortion?: number | null;
} & ReturnDetails;
type FinanceTab = "overview" | "shifts" | "orders" | "expenses";
type OrdersPreset = { status?: OrderStatusFilter; cashier?: string; category?: string; channel?: OrderChannelFilter; service?: "dine_in" | "take_out" | "delivery" };
type OrderStatusFilter = "all" | "completed" | "voided" | "refunded" | "reversed";
type OrderChannelFilter = "all" | "cash" | "online" | "split" | "mobile";

function financePresets(today: string) {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return [
    { id: "today", label: "Today", start: today, end: today },
    { id: "yesterday", label: "Yesterday", start: addDays(today, -1), end: addDays(today, -1) },
    { id: "week", label: "This week", start: addDays(today, -weekday), end: today },
    { id: "7", label: "Last 7 days", start: addDays(today, -6), end: today },
    { id: "month", label: "This month", start: `${today.slice(0, 8)}01`, end: today },
    { id: "30", label: "Last 30 days", start: addDays(today, -29), end: today },
    { id: "90", label: "Last 90 days", start: addDays(today, -89), end: today },
  ];
}

function formatRange(start: string, end: string): string {
  const date = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...options });
  if (start === end) return date(start, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${date(start, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${date(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

function orderChannel(order: Pick<FinanceOrder, "orderSource" | "paymentMethod">): "mobile" | "online" | "cash" | "split" {
  if (order.orderSource === "online") return "mobile";
  if (order.paymentMethod === "split") return "split";
  return order.paymentMethod === "cash" ? "cash" : "online";
}
const channelLabels = { cash: "Cash", online: "Online at counter", split: "Split (cash + GCash)", mobile: "Mobile menu" } as const;

const serviceTypeLabels: Record<string, string> = { dine_in: "Dine in", take_out: "Take Out/Pick Up", delivery: "Delivery", unknown: "Not recorded" };

function orderStatusOf(order: Pick<FinanceOrder, "status">): "completed" | "voided" | "refunded" {
  const status = order.status.toLowerCase();
  if (status.startsWith("void")) return "voided";
  if (status.startsWith("refund")) return "refunded";
  return "completed";
}

function describeItems(items: FinanceOrderItem[]): string {
  return items.map((item) => `${item.productName}${item.size && item.size !== "Regular" ? ` ${item.size}` : ""}${item.temperature === "hot" ? " Hot" : item.temperature === "cold" ? " Cold" : ""}${item.quantity > 1 ? ` ×${item.quantity}` : ""}${item.additions.length ? ` + ${item.additions.map((addition) => addition.name).join(", ")}` : ""}`).join(", ") || "Order";
}

function FinanceDelta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) return <span className="fin-delta">{current > 0 ? "No sales in the period before" : "Same as the period before"}</span>;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(change) < 0.5) return <span className="fin-delta">About the same as before</span>;
  const good = invert ? change < 0 : change > 0;
  return <span className="fin-delta"><b className={good ? "dash-up" : "dash-down"}>{change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}%</b> vs the period before</span>;
}

function FinanceKpi({ label, value, note, onClick, accent }: { label: string; value: React.ReactNode; note: React.ReactNode; onClick?: () => void; accent?: string }) {
  const content = <>
    <span className="fin-kpi-label">{label}</span>
    <strong className="fin-kpi-value" style={accent ? { color: accent } : undefined}>{value}</strong>
    <span className="fin-kpi-note">{note}</span>
  </>;
  return onClick ? <button type="button" className="fin-kpi is-link" onClick={onClick}>{content}</button> : <div className="fin-kpi">{content}</div>;
}

function FinanceOverview({ data, today, onOpenOrders, onOpenExpenses }: { data: FinanceOverviewData; today: string; onOpenOrders: (preset: OrdersPreset) => void; onOpenExpenses: () => void }) {
  const [productSort, setProductSort] = useState<"revenue" | "quantity">("revenue");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const { current, previous } = data;
  const average = current.orders ? current.netSales / current.orders : 0;
  const previousAverage = previous.orders ? previous.netSales / previous.orders : 0;
  const margin = current.costedRevenue > 0 ? (current.grossProfit / current.costedRevenue) * 100 : null;
  const reversedCount = current.voids + current.refunds;
  const paid = current.cashSales + current.counterOnlineSales + current.mobileSales;
  const share = (value: number, total: number) => total > 0 ? (value / total) * 100 : 0;

  // Daily bars up to a month, weekly bars beyond that.
  const trendBars: DashBar[] = data.daily.length <= 31
    ? data.daily.map((day) => {
      const date = new Date(`${day.day}T00:00:00+08:00`);
      return {
        key: day.day,
        label: day.day === today ? "Today" : data.daily.length <= 8 ? date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short" }) : String(Number(day.day.slice(8))),
        sub: data.daily.length <= 8 ? date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }) : undefined,
        value: day.netSales,
        highlight: day.day === today,
        title: `${formatRange(day.day, day.day)}: ${peso(day.netSales)} from ${day.orders} order${day.orders === 1 ? "" : "s"}${day.reversedAmount > 0 ? ` · ${peso(day.reversedAmount)} voided or refunded` : ""}`,
      };
    })
    : Array.from({ length: Math.ceil(data.daily.length / 7) }, (_, index) => data.daily.slice(index * 7, index * 7 + 7)).map((week) => {
      const total = week.reduce((sum, day) => sum + day.netSales, 0);
      const orders = week.reduce((sum, day) => sum + day.orders, 0);
      return {
        key: week[0].day,
        label: new Date(`${week[0].day}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }),
        value: total,
        highlight: week.some((day) => day.day === today),
        title: `${formatRange(week[0].day, week[week.length - 1].day)}: ${peso(total)} from ${orders} orders`,
      };
    });
  const bestDay = data.daily.reduce<(typeof data.daily)[number] | null>((top, day) => day.netSales > (top?.netSales ?? 0) ? day : top, null);

  const hoursWithSales = data.hours.filter((entry) => entry.orders > 0);
  const hourBars: DashBar[] = hoursWithSales.length === 0 ? [] : (() => {
    const byHour = new Map(data.hours.map((entry) => [entry.hour, entry]));
    const busy = new Set(hoursWithSales.map((entry) => entry.hour));
    let first = hoursWithSales[0].hour;
    let longestGap = -1;
    for (let hour = 0; hour < 24; hour += 1) {
      if (!busy.has(hour) || busy.has((hour + 1) % 24)) continue;
      let gap = 0;
      while (gap < 24 && !busy.has((hour + 1 + gap) % 24)) gap += 1;
      if (gap > longestGap) { longestGap = gap; first = (hour + 1 + gap) % 24; }
    }
    const span = 24 - Math.max(0, longestGap);
    return Array.from({ length: span }, (_, index) => {
      const hour = (first + index) % 24;
      const entry = byHour.get(hour);
      return { key: String(hour), label: hourLabel(hour), value: entry?.revenue ?? 0, title: `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}: ${peso(entry?.revenue ?? 0)} from ${entry?.orders ?? 0} orders` };
    });
  })();
  const peakHour = hoursWithSales.reduce<(typeof hoursWithSales)[number] | null>((top, entry) => entry.revenue > (top?.revenue ?? 0) ? entry : top, null);

  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayStats = weekdayNames.map((name, index) => {
    const days = data.daily.filter((day) => (new Date(`${day.day}T00:00:00Z`).getUTCDay() + 6) % 7 === index);
    const total = days.reduce((sum, day) => sum + day.netSales, 0);
    return { name, days: days.length, average: days.length ? total / days.length : 0 };
  });
  const weekdayBars: DashBar[] = weekdayStats.map((entry) => ({ key: entry.name, label: entry.name, value: entry.average, title: `${entry.name}: ${peso(entry.average)} on average over ${entry.days} day${entry.days === 1 ? "" : "s"}` }));
  const bestWeekday = weekdayStats.reduce<(typeof weekdayStats)[number] | null>((top, entry) => entry.average > (top?.average ?? 0) ? entry : top, null);

  const products = [...data.products].sort((a, b) => productSort === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity);
  const productTop = Math.max(1, ...products.map((product) => productSort === "revenue" ? product.revenue : product.quantity));
  const categoryTotal = data.categories.reduce((sum, category) => sum + category.revenue, 0);

  return <div className="flex flex-col gap-4">
    <div className="fin-kpis">
      <FinanceKpi label="Net sales" value={peso(current.netSales)} note={<><FinanceDelta current={current.netSales} previous={previous.netSales} /><span className="fin-kpi-hint">Paid orders, after voids and refunds</span></>} />
      <FinanceKpi label="Orders" value={current.orders} note={<><FinanceDelta current={current.orders} previous={previous.orders} /><span className="fin-kpi-hint">{current.itemsSold} items sold{current.mobileOrders ? ` · ${current.mobileOrders} from mobile` : ""}</span></>} />
      <FinanceKpi label="Average order" value={peso(average)} note={<><FinanceDelta current={average} previous={previousAverage} /><span className="fin-kpi-hint">Net sales ÷ orders</span></>} />
      <FinanceKpi label="Gross profit" value={margin === null ? "—" : peso(current.grossProfit)} accent={current.grossProfit < 0 ? "#B91C1C" : "#15803D"} note={margin === null
        ? <span className="fin-kpi-hint">{current.orders ? "Set item costs in Inventory to see profit" : "No sales yet"}</span>
        : <><span className="fin-delta"><b>{margin.toFixed(0)}% margin</b> · cost {peso(current.costOfGoods)}</span>{(current.paymentFees ?? 0) > 0 && <span className="fin-kpi-hint">{peso(current.grossProfit - (current.paymentFees ?? 0))} after {peso(current.paymentFees ?? 0)} PayMongo fees</span>}{current.uncostedItems > 0 && <span className="fin-kpi-hint is-warn">{current.uncostedItems} item{current.uncostedItems === 1 ? "" : "s"} without a cost not counted</span>}</>} />
      <FinanceKpi label="Net profit" value={margin === null ? "—" : peso(current.netProfit ?? current.grossProfit)} accent={(current.netProfit ?? 0) < 0 ? "#B91C1C" : "#15803D"} onClick={onOpenExpenses} note={margin === null
        ? <span className="fin-kpi-hint">Needs item costs, like gross profit</span>
        : <><FinanceDelta current={current.netProfit ?? 0} previous={previous.netProfit ?? 0} /><span className="fin-kpi-hint">Gross profit − {peso(current.paymentFees ?? 0)} PayMongo fees − {peso(current.expenses ?? 0)} expenses − {peso(current.writtenOff ?? 0)} written off</span></>} />
      <FinanceKpi label="Voids & refunds" value={reversedCount} accent={reversedCount ? "#B91C1C" : undefined} onClick={reversedCount ? () => onOpenOrders({ status: "reversed" }) : undefined} note={<><span className="fin-delta">{reversedCount ? <>−{peso(current.reversedAmount)} · {current.voids} void{current.voids === 1 ? "" : "s"}, {current.refunds} refund{current.refunds === 1 ? "" : "s"}</> : "None in this period"}</span>{reversedCount > 0 && <span className="fin-kpi-hint">Tap to see them</span>}</>} />
    </div>

    <div className="fin-row">
      <DashCard title={data.daily.length <= 31 ? "Sales by day" : "Sales by week"} sub={<>{peso(current.netSales)} over {data.range.days} business day{data.range.days === 1 ? "" : "s"}{bestDay && bestDay.netSales > 0 && data.daily.length > 1 ? <> · best day {formatRange(bestDay.day, bestDay.day)} ({peso(bestDay.netSales)})</> : null}</>}>
        <DashBars bars={trendBars} emptyLabel="No sales in this period." />
      </DashCard>
      <DashCard title="How customers paid" sub="Share of net sales by payment">
        {paid === 0 ? <p className="dash-empty">No paid orders in this period.</p> : <>
          <div className="fin-mix" aria-hidden="true">
            <span className="is-cash" style={{ width: `${share(current.cashSales, paid)}%` }} />
            <span className="is-online" style={{ width: `${share(current.counterOnlineSales, paid)}%` }} />
            <span className="is-mobile" style={{ width: `${share(current.mobileSales, paid)}%` }} />
          </div>
          <ul className="fin-mix-list">
            {([["cash", current.cashSales, "Paid in cash at the counter, incl. the cash part of split tickets"], ["online", current.counterOnlineSales, "Paid with GCash at the counter, incl. split tickets"], ["mobile", current.mobileSales, `${current.mobileOrders} order${current.mobileOrders === 1 ? "" : "s"} from the mobile menu`]] as const).map(([key, value, hint]) => <li key={key}>
              <button type="button" onClick={() => onOpenOrders({ status: "completed", channel: key })}>
                <i className={`is-${key}`} />
                <span><strong>{channelLabels[key]}</strong><em>{hint}</em></span>
                <span className="fin-mix-value"><strong>{peso(value)}</strong><em>{share(value, paid).toFixed(0)}%</em></span>
              </button>
            </li>)}
          </ul>
        </>}
      </DashCard>
    </div>

    <div className="fin-row is-flipped">
      <DashCard title="Sales by category" sub="Includes add-ons on those drinks">
        {data.categories.length === 0 ? <p className="dash-empty">No sales in this period.</p> : <ul className="fin-bars">
          {data.categories.map((category) => <li key={category.name}>
            <button type="button" onClick={() => onOpenOrders({ status: "completed", category: category.name })} title="Show these orders">
              <span className="fin-bars-line"><strong>{category.name}</strong><span>{peso(category.revenue)}</span></span>
              <span className="dash-meter"><span style={{ width: `${share(category.revenue, categoryTotal)}%` }} /></span>
              <span className="fin-bars-sub"><span>{category.quantity} sold</span><span>{share(category.revenue, categoryTotal).toFixed(0)}%</span></span>
            </button>
          </li>)}
        </ul>}
      </DashCard>
      <DashCard title="Products" sub="What sold, and what it earned" action={data.products.length > 0 ? <div className="fin-toggle" role="group" aria-label="Rank products by">
        <button type="button" aria-pressed={productSort === "revenue"} onClick={() => setProductSort("revenue")}>Sales</button>
        <button type="button" aria-pressed={productSort === "quantity"} onClick={() => setProductSort("quantity")}>Quantity</button>
      </div> : undefined}>
        {products.length === 0 ? <p className="dash-empty">No sales in this period.</p> : <>
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead><tr><th>#</th><th>Product</th><th className="is-num">Sold</th><th className="is-num">Sales</th><th className="is-num">Margin</th></tr></thead>
              <tbody>
                {(showAllProducts ? products : products.slice(0, 8)).map((product, index) => <tr key={product.productId}>
                  <td><span className={`dash-rank-num${index === 0 ? " is-first" : ""}`}>{index + 1}</span></td>
                  <td>
                    <strong>{product.name}</strong>
                    <span className="fin-table-sub">{product.category}</span>
                    <span className="dash-meter is-small" style={{ marginLeft: 0, width: "100%", maxWidth: 180 }}><span style={{ width: `${((productSort === "revenue" ? product.revenue : product.quantity) / productTop) * 100}%` }} /></span>
                  </td>
                  <td className="is-num">{product.quantity}</td>
                  <td className="is-num"><strong>{peso(product.revenue)}</strong></td>
                  <td className="is-num">{product.cost === null || product.revenue <= 0 ? <span className="menu-muted">—</span> : <span className={(product.revenue - product.cost) / product.revenue < 0.3 ? "dash-warn" : "dash-up"}>{Math.round(((product.revenue - product.cost) / product.revenue) * 100)}%</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {products.length > 8 && <button type="button" className="inv-link" style={{ alignSelf: "center", marginTop: 10 }} onClick={() => setShowAllProducts((value) => !value)}>{showAllProducts ? "Show top 8" : `Show all ${products.length}`}</button>}
        </>}
      </DashCard>
    </div>

    <div className="fin-row-3">
      <DashCard title="Busiest hours" sub={peakHour ? <>Peak {hourLabel(peakHour.hour)}–{hourLabel((peakHour.hour + 1) % 24)} · {peso(peakHour.revenue)}</> : "When orders come in"}>
        {hourBars.length ? <DashBars bars={hourBars} emptyLabel="No orders." /> : <p className="dash-empty">No orders in this period.</p>}
      </DashCard>
      <DashCard title="Average by weekday" sub={data.range.days >= 7 && bestWeekday && bestWeekday.average > 0 ? <>{bestWeekday.name} sells the most ({peso(bestWeekday.average)} a day)</> : "Net sales per business day"}>
        {data.range.days >= 7 ? <DashBars bars={weekdayBars} emptyLabel="No sales in this period." /> : <p className="dash-empty">Pick 7 days or more to compare weekdays.</p>}
      </DashCard>
      <DashCard title="Add-ons" sub="Extras attached to drinks">
        {data.addons.length === 0 ? <p className="dash-empty">No add-ons sold in this period.</p> : <ul className="fin-simple-list">
          {data.addons.map((addon) => <li key={addon.name}><span><strong>{addon.name}</strong><em>{formatAmount(addon.quantity)} sold</em></span><strong>{peso(addon.revenue)}</strong></li>)}
        </ul>}
      </DashCard>
    </div>

    {(data.serviceTypes ?? []).some((row) => row.type !== "unknown") && <DashCard title={(data.serviceTypes ?? []).some((row) => row.type === "delivery") ? "Dine in, take out/pick up and delivery" : "Dine in vs take out/pick up"} sub="Completed orders in this period.">
      <ul className="fin-simple-list">
        {(data.serviceTypes ?? []).map((row) => {
          const totalOrders = (data.serviceTypes ?? []).reduce((sum, item) => sum + item.orders, 0);
          return <li key={row.type}><span><strong>{serviceTypeLabels[row.type] ?? row.type}</strong><em>{row.orders} order{row.orders === 1 ? "" : "s"} · {totalOrders ? Math.round((row.orders / totalOrders) * 100) : 0}%</em></span><strong>{peso(row.sales)}</strong></li>;
        })}
      </ul>
    </DashCard>}

    {(data.writeOffs ?? []).length > 0 && <DashCard title="Stock written off" sub={<>{peso(current.writtenOff ?? 0)} of stock that left without being sold, at its cost. Taken off net profit.{(current.uncostedWriteOffs ?? 0) > 0 ? ` ${current.uncostedWriteOffs} without a cost counted as ₱0.` : ""}</>}>
      <ul className="fin-simple-list">
        {(data.writeOffs ?? []).map((entry) => <li key={entry.reason}><span><strong>{writeOffReasonLabel(entry.reason)}</strong><em>{entry.entries} {entry.reason === "made_order" ? `order${entry.entries === 1 ? "" : "s"}` : `item${entry.entries === 1 ? "" : "s"} written off`}</em></span><strong style={{ color: "#B91C1C" }}>−{peso(entry.cost)}</strong></li>)}
      </ul>
    </DashCard>}
    {data.deliveries && (data.deliveries.orders > 0 || data.deliveries.failed > 0 || data.deliveries.cancelled > 0) && <FinanceDeliveriesCard deliveries={data.deliveries} onOpenOrders={onOpenOrders} />}

    {data.loyalty && (data.loyalty.memberOrders > 0 || data.loyalty.rewardsClaimed > 0 || data.loyalty.starsEarned !== 0 || (data.loyalty.discountTotal ?? 0) > 0) && <DashCard title="Loyalty" sub="Orders linked to customers, stars, and the rewards given away. Reward items are sold at ₱0, and their cost is already in the cost of goods above.">
      <div className="acc-stats">
        <div><span>Member sales</span><strong>{peso(data.loyalty.memberSales)}</strong><em className="fin-loy-sub">{data.loyalty.memberOrders} order{data.loyalty.memberOrders === 1 ? "" : "s"} · {data.current.netSales > 0 ? `${Math.round((data.loyalty.memberSales / data.current.netSales) * 100)}% of net sales` : "—"}</em></div>
        <div><span>Members who ordered</span><strong>{data.loyalty.members}</strong></div>
        <div><span>Stars earned / spent</span><strong>★ {data.loyalty.starsEarned} / {data.loyalty.starsSpent}</strong></div>
        <div><span>Rewards given</span><strong>{data.loyalty.rewardsClaimed}</strong><em className="fin-loy-sub">worth {peso(data.loyalty.rewardValue)} · cost {data.loyalty.rewardCost === null ? "not recorded" : peso(data.loyalty.rewardCost)}</em></div>
        {((data.loyalty.discountTotal ?? 0) > 0 || (data.loyalty.vatExemptTotal ?? 0) > 0) && <div><span>Discounts given</span><strong>{peso(data.loyalty.discountTotal ?? 0)}</strong><em className="fin-loy-sub">{[...(data.loyalty.discounts ?? []).map((row) => `${row.orders} ${discountSourceLabels[row.source] ?? row.source} order${row.orders === 1 ? "" : "s"}`), (data.loyalty.vatExemptTotal ?? 0) > 0 ? `${peso(data.loyalty.vatExemptTotal ?? 0)} VAT exempted (senior/PWD)` : ""].filter(Boolean).join(" · ")}</em></div>}
      </div>
      {data.loyalty.rewards.length > 0 && <ul className="fin-simple-list" style={{ marginTop: 12 }}>
        {data.loyalty.rewards.map((reward) => <li key={reward.name}><span><strong>{reward.name}</strong><em>{reward.claimed} given · cost {reward.cost === null ? "not recorded" : peso(reward.cost)}</em></span><strong>{peso(reward.value)}</strong></li>)}
      </ul>}
    </DashCard>}

    <DashCard title="Sales by staff" sub="Orders each person punched in, and voids or refunds on those orders. Tap a row to see the orders.">
      {data.staff.length === 0 ? <p className="dash-empty">No orders in this period.</p> : <div className="fin-table-wrap">
        <table className="fin-table is-clickable">
          <thead><tr><th>Punched by</th><th className="is-num">Orders</th><th className="is-num">Net sales</th><th className="is-num">Average</th><th className="is-num">Voids &amp; refunds</th></tr></thead>
          <tbody>
            {data.staff.map((person) => <tr key={person.name} onClick={() => onOpenOrders({ cashier: person.name })} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpenOrders({ cashier: person.name }); }}>
              <td><span className="fin-person">{person.role === "online" ? <span className="menu-addon-icon" style={{ width: 28, height: 28 }}><IconCoffee size={14} /></span> : <UserAvatar name={person.name} size={28} />}<span><strong>{person.name}</strong><span className="fin-table-sub">{person.role === "online" ? "Customers ordering ahead" : person.role ? person.role[0].toUpperCase() + person.role.slice(1) : ""}</span></span></span></td>
              <td className="is-num">{person.orders}</td>
              <td className="is-num"><strong>{peso(person.revenue)}</strong></td>
              <td className="is-num">{person.orders ? peso(person.revenue / person.orders) : "—"}</td>
              <td className="is-num">{person.reversedOrders ? <span className="dash-down">{person.reversedOrders} · −{peso(person.reversedAmount)}</span> : <span className="menu-muted">None</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </DashCard>
  </div>;
}

// Deliveries in the range: what they brought in, cash on delivery, the ones that failed, how long
// they took, and each rider and zone.
function FinanceDeliveriesCard({ deliveries, onOpenOrders }: { deliveries: FinanceDeliveries; onOpenOrders: (preset: OrdersPreset) => void }) {
  const attempted = deliveries.delivered + deliveries.failed;
  return <DashCard title="Deliveries" sub="Delivery orders in this period. The fee is part of the sales and is never discounted." action={<button type="button" className="inv-link" onClick={() => onOpenOrders({ status: "completed", service: "delivery" })}>See the orders</button>}>
    <div className="acc-stats fin-dlv-stats">
      <div><span>Delivery orders</span><strong>{deliveries.orders}</strong><em className="fin-loy-sub">{peso(deliveries.sales)} in sales{deliveries.active ? ` · ${deliveries.active} still going` : ""}</em></div>
      <div><span>Delivery fees</span><strong>{peso(deliveries.fees)}</strong><em className="fin-loy-sub">{deliveries.orders ? `${peso(deliveries.fees / deliveries.orders)} per order` : "—"}{deliveries.freeDeliveries ? ` · ${deliveries.freeDeliveries} free` : ""}</em></div>
      <div><span>Cash on delivery</span><strong>{peso(deliveries.codSales)}</strong><em className="fin-loy-sub">{deliveries.codOrders} order{deliveries.codOrders === 1 ? "" : "s"} · {peso(deliveries.codReceived)} handed in{deliveries.codWithRiders > 0 ? ` · ${peso(deliveries.codWithRiders)} still with riders` : ""}</em></div>
      <div><span>Delivered</span><strong style={{ color: deliveries.failed ? "#B45309" : undefined }}>{attempted ? `${Math.round((deliveries.delivered / attempted) * 100)}%` : "—"}</strong><em className="fin-loy-sub">{deliveries.delivered} delivered · {deliveries.failed} not delivered{deliveries.cancelled ? ` · ${deliveries.cancelled} cancelled` : ""}</em></div>
      <div><span>Average time</span><strong>{minutesLabel(deliveries.avgTotalMinutes)}</strong><em className="fin-loy-sub">order to door · {minutesLabel(deliveries.avgRoadMinutes)} on the road</em></div>
    </div>
    <div className="fin-dlv-grid">
      <div>
        <h4 className="fin-dlv-head">By rider</h4>
        {deliveries.riders.length === 0 ? <p className="dash-empty">No rider has taken a delivery yet.</p> : <div className="fin-table-wrap">
          <table className="fin-table">
            <thead><tr><th>Rider</th><th className="is-num">Delivered</th><th className="is-num">Failed</th><th className="is-num">Fees</th><th className="is-num">Cash collected</th><th className="is-num">Avg. on road</th></tr></thead>
            <tbody>
              {deliveries.riders.map((rider) => <tr key={rider.name}>
                <td><span className="fin-person"><UserAvatar name={rider.name} size={26} /><strong>{rider.name}</strong></span></td>
                <td className="is-num">{rider.delivered}</td>
                <td className="is-num">{rider.failed ? <span className="dash-down">{rider.failed}</span> : <span className="menu-muted">0</span>}</td>
                <td className="is-num">{peso(rider.fees)}</td>
                <td className="is-num">{rider.codCollected ? <>{peso(rider.codCollected)}{rider.codWithRider > 0 && <span className="fin-table-sub dash-warn">{peso(rider.codWithRider)} not handed in</span>}</> : <span className="menu-muted">—</span>}</td>
                <td className="is-num">{minutesLabel(rider.avgRoadMinutes)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </div>
      <div>
        <h4 className="fin-dlv-head">By zone</h4>
        {deliveries.zones.length === 0 ? <p className="dash-empty">No completed deliveries.</p> : <ul className="fin-simple-list">
          {deliveries.zones.map((zone) => <li key={zone.name}><span><strong>{zone.name}</strong><em>{zone.orders} order{zone.orders === 1 ? "" : "s"} · {peso(zone.fees)} in fees</em></span><strong>{peso(zone.sales)}</strong></li>)}
        </ul>}
      </div>
    </div>
    {deliveries.failures.length > 0 && <div style={{ marginTop: 14 }}>
      <h4 className="fin-dlv-head">Not delivered</h4>
      <ul className="fin-simple-list">
        {deliveries.failures.map((failure) => <li key={failure.orderId}><span><strong>#{failure.queueNumber ?? failure.orderId} · {failure.zone}</strong><em>{failure.reason ?? "No reason given"}{failure.rider ? ` · ${failure.rider}` : ""}{failure.at ? ` · ${shiftTime(failure.at)}` : ""}</em></span><span className={`fin-status is-${failure.voided ? "voided" : "refunded"}`}>{failure.voided ? "Voided" : "Not voided yet"}</span></li>)}
      </ul>
    </div>}
  </DashCard>;
}

// ─── Orders: every transaction in the range, with detailed filters ────────────
const ORDERS_PAGE_SIZE = 50;

function FinanceOrderDialog({ order, onClose }: { order: FinanceOrder; onClose: () => void }) {
  const status = orderStatusOf(order);
  const channel = orderChannel(order);
  const profit = order.cost === null || order.reversed ? null : order.total - order.cost;

  const fact = (label: string, value: React.ReactNode) => <div><span>{label}</span><strong>{value}</strong></div>;
  return <Modal onClose={onClose} label={`Order ${order.orderId}`}>
    <section className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 620, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={`Order #${order.orderId}${order.queueNumber !== null ? ` · queue #${order.queueNumber}` : ""}`} sub={`${shiftTime(order.createdAt)} · ${order.punchedBy}`} onClose={onClose} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`fin-status is-${status}`}>{status === "completed" ? "Completed" : status === "voided" ? "Voided" : "Refunded"}</span>
          <span className={`fin-chip is-${channel}`}>{channelLabels[channel]}</span>
        </div>
        {order.reversed && <p className="inv-focus" style={{ margin: 0 }}>{status === "voided" ? "Voided" : "Refunded"}{order.reversedAt ? ` ${shiftTime(order.reversedAt)}` : ""}{order.reversedBy ? ` by ${order.reversedBy}` : ""}{order.reversedShiftId && order.reversedShiftId !== order.shiftId ? ` during shift #${order.reversedShiftId}` : ""}. It is not counted in net sales.</p>}
        {order.reversed && describeReturn(order) && <p className="inv-focus" style={{ margin: 0, background: order.returnMethod === "gcash" ? "#EFF6FF" : undefined, borderColor: order.returnMethod === "gcash" ? "#BFDBFE" : undefined, color: order.returnMethod === "gcash" ? "#1E40AF" : undefined }}>{describeReturn(order)}</p>}
        <div className="fin-facts">
          {fact("Business date", formatRange(order.businessDate, order.businessDate))}
          {fact("Shift", order.shiftId ? `#${order.shiftId}` : "—")}
          {fact("Punched by", order.punchedBy)}
          {fact("Order type", serviceTypeLabels[order.serviceType ?? "unknown"])}
          {order.customerName && fact("Customer", order.customerName)}
          {Boolean(order.discountAmount) && fact("Discount", `−${peso(order.discountAmount ?? 0)}${order.discountLabel ? ` · ${order.discountLabel}` : ""}`)}
          {Boolean(order.vatExemptAmount) && fact("VAT exempted", `−${peso(order.vatExemptAmount ?? 0)} (senior/PWD)`)}
          {Boolean(order.deliveryFee) && fact("Delivery fee", peso(order.deliveryFee ?? 0))}
          {fact("Payment", order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod === "cash" ? "Cash" : order.paymentMethod === "split" ? `${peso(order.cashPortion ?? 0)} cash + ${peso(order.total - (order.cashPortion ?? 0))} GCash` : "Online")}
          {(order.paymentMethod === "cash" || order.paymentMethod === "split") && order.received !== null && fact("Cash received", peso(order.received))}
          {(order.paymentMethod === "cash" || order.paymentMethod === "split") && order.change !== null && fact("Change", peso(order.change))}
        </div>
        {order.delivery && <div className="fin-facts fin-dlv-facts">
          {fact("Deliver to", `${order.delivery.recipient} · ${order.delivery.phone}`)}
          {fact("Address", `${order.delivery.street}${order.delivery.landmark ? `, near ${order.delivery.landmark}` : ""} (${order.delivery.zone})`)}
          {fact("Delivery", `${deliveryStatusLabels[order.delivery.status] ?? order.delivery.status}${order.delivery.deliveredAt ? ` ${shiftTime(order.delivery.deliveredAt)}` : ""}${order.delivery.failureReason ? `: ${order.delivery.failureReason}` : ""}`)}
          {fact("Rider", order.delivery.rider ?? "Not picked up")}
          {order.paymentMethod === "cod" && fact("Cash collected", order.delivery.codCollected === null ? "Not yet" : peso(order.delivery.codCollected))}
          {order.paymentMethod === "cod" && order.delivery.codCollected !== null && fact("Handed in", order.delivery.remittedAt ? `${shiftTime(order.delivery.remittedAt)}${order.delivery.receivedBy ? ` to ${order.delivery.receivedBy}` : ""}` : "Not yet")}
        </div>}
        <ul className="fin-items">
          {order.items.map((item, index) => {
            const addonTotal = item.additions.reduce((sum, addition) => sum + addition.quantity * addition.unitPrice, 0);
            return <li key={index}>
              <div>
                <strong>{item.productName}{item.size && item.size !== "Regular" ? ` · ${item.size}` : ""}{item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}</strong>
                <span>{item.rewardName ? `🎁 Reward: ${item.rewardName} · normally ${peso(item.rewardValue ?? 0)}` : `${item.quantity} × ${peso(item.unitPrice)}`} · {item.category}</span>
                {item.custom && <span className="fin-item-custom">✎ {item.custom}</span>}
                {item.additions.map((addition) => <span key={addition.name} className="fin-item-addon">+ {addition.name}{addition.quantity !== 1 ? ` ×${formatAmount(addition.quantity)}` : ""} · {peso(addition.quantity * addition.unitPrice)}</span>)}
              </div>
              <strong>{peso(item.quantity * item.unitPrice + addonTotal)}</strong>
            </li>;
          })}
        </ul>
        <div className="fin-order-totals">
          <div><span>Total</span><strong>{peso(order.total)}</strong></div>
          <div><span>Cost of goods</span><span>{order.cost === null ? "Not recorded" : peso(order.cost)}</span></div>
          <div><span>Gross profit</span><span className={profit !== null && profit < 0 ? "dash-down" : "dash-up"}>{profit === null ? (order.reversed ? "Not counted" : "—") : peso(profit)}</span></div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        <p className="inv-hint" style={{ margin: 0 }}>Sales records are kept permanently. {order.reversed ? "This one was already reversed." : "To correct it, void or refund it in the staff app during its shift."}</p>
        <button type="button" className="ui-button ui-button-primary" onClick={onClose}>Done</button>
      </div>
    </section>
  </Modal>;
}

function financeOrderColumns(): ExcelColumn<FinanceOrder>[] {
  return [
    { header: "Order #", value: (order) => order.orderId },
    { header: "Queue #", value: (order) => order.queueNumber ?? null },
    { header: "Business date", value: (order) => order.businessDate },
    { header: "Time", value: (order) => excelDateTime(order.createdAt) },
    { header: "Shift", value: (order) => order.shiftId ? `#${order.shiftId}` : "" },
    { header: "Punched by", value: (order) => order.punchedBy },
    { header: "Customer", value: (order) => order.customerName ?? "" },
    { header: "Order type", value: (order) => order.serviceType ? serviceTypeLabels[order.serviceType] : "" },
    { header: "Payment", value: (order) => excelPayment(order) },
    { header: "Delivery fee", value: (order) => order.deliveryFee || null, kind: "money" },
    { header: "Delivery zone", value: (order) => order.delivery?.zone ?? "" },
    { header: "Delivery status", value: (order) => order.delivery ? deliveryStatusLabels[order.delivery.status] ?? order.delivery.status : "" },
    { header: "Rider", value: (order) => order.delivery?.rider ?? "" },
    { header: "Status", value: (order) => excelStatus(orderStatusOf(order)) },
    { header: "Items", value: (order) => describeItems(order.items) },
    { header: "Subtotal", value: (order) => order.subtotal ?? order.total + (order.discountAmount ?? 0) + (order.vatExemptAmount ?? 0), kind: "money" },
    { header: "Discount", value: (order) => order.discountAmount || null, kind: "money" },
    { header: "VAT exempted", value: (order) => order.vatExemptAmount || null, kind: "money" },
    { header: "Discount for", value: (order) => order.discountLabel ?? "" },
    { header: "Total", value: (order) => order.total, kind: "money" },
    { header: "Cash part", value: (order) => order.paymentMethod === "split" ? order.cashPortion ?? null : order.paymentMethod === "cash" ? order.total : null, kind: "money" },
    { header: "Cash received", value: (order) => order.paymentMethod === "cash" || order.paymentMethod === "split" ? order.received : null, kind: "money" },
    { header: "Change", value: (order) => order.paymentMethod === "cash" || order.paymentMethod === "split" ? order.change : null, kind: "money" },
    { header: "Cost of goods", value: (order) => order.cost, kind: "money" },
    { header: "Gross profit", value: (order) => order.cost === null || order.reversed ? null : order.total - order.cost, kind: "money" },
    { header: "Reversed at", value: (order) => excelDateTime(order.reversedAt) },
    { header: "Reversed by", value: (order) => order.reversedBy ?? "" },
    { header: "Returned via", value: (order) => excelReturnMethod(order.returnMethod) },
    { header: "Return GCash name", value: (order) => order.returnGcashName ?? "" },
    { header: "Return GCash number", value: (order) => order.returnGcashNumber ?? "" },
    { header: "Return reference", value: (order) => order.returnReference ?? "" },
  ];
}

type FinanceOrderLine = { order: FinanceOrder; item: FinanceOrderItem };
function financeItemColumns(): ExcelColumn<FinanceOrderLine>[] {
  const addonsTotal = (line: FinanceOrderLine) => line.item.additions.reduce((sum, addition) => sum + addition.quantity * addition.unitPrice, 0);
  return [
    { header: "Order #", value: (line) => line.order.orderId },
    { header: "Business date", value: (line) => line.order.businessDate },
    { header: "Status", value: (line) => excelStatus(orderStatusOf(line.order)) },
    { header: "Product", value: (line) => line.item.productName },
    { header: "Category", value: (line) => line.item.category },
    { header: "Size", value: (line) => line.item.size ?? "" },
    { header: "Temperature", value: (line) => line.item.temperature === "hot" ? "Hot" : line.item.temperature === "cold" ? "Cold" : "" },
    { header: "Quantity", value: (line) => line.item.quantity, kind: "count" },
    { header: "Unit price", value: (line) => line.item.unitPrice, kind: "money" },
    { header: "Reward", value: (line) => line.item.rewardName ?? "" },
    { header: "Normal price (rewards)", value: (line) => line.item.rewardName ? line.item.rewardValue ?? null : null, kind: "money" },
    { header: "Add-ons", value: (line) => line.item.additions.map((addition) => `${addition.name} x${formatAmount(addition.quantity)}`).join(", ") },
    { header: "Requests", value: (line) => line.item.custom ?? "" },
    { header: "Add-ons total", value: addonsTotal, kind: "money" },
    { header: "Line total", value: (line) => line.item.quantity * line.item.unitPrice + addonsTotal(line), kind: "money" },
  ];
}

const financeOrderLines = (orders: FinanceOrder[]): FinanceOrderLine[] => orders.flatMap((order) => order.items.map((item) => ({ order, item })));

function exportFinanceOrders(orders: FinanceOrder[], label: string, fileStamp: string) {
  const paid = orders.filter((order) => !order.reversed);
  const reversed = orders.filter((order) => order.reversed);
  saveWorkbook([
    ["Summary", excelInfo([
      ["Brew Houze orders"],
      ["Showing", label],
      ["Generated", excelNow()],
      ["Orders", orders.length],
      ["Completed", paid.length],
      ["Paid total", paid.reduce((sum, order) => sum + order.total, 0)],
      ["Voided or refunded", reversed.length],
      ["Voided or refunded amount", reversed.reduce((sum, order) => sum + order.total, 0)],
    ], ["Orders", "Completed", "Voided or refunded"])],
    ["Orders", excelTable(orders, financeOrderColumns())],
    ["Order items", excelTable(financeOrderLines(orders), financeItemColumns())],
  ], `brew-houze-orders-${fileStamp}.xlsx`);
}

function FinanceOrders({ start, end, preset }: { start: string; end: string; preset: OrdersPreset }) {
  const [orders, setOrders] = useState<FinanceOrder[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatusFilter>(preset.status ?? "all");
  const [channel, setChannel] = useState<OrderChannelFilter>(preset.channel ?? "all");
  const [serviceFilter, setServiceFilter] = useState<"all" | "dine_in" | "take_out" | "delivery">(preset.service ?? "all");
  const [cashier, setCashier] = useState(preset.cashier ?? "all");
  const [category, setCategory] = useState(preset.category ?? "all");
  const [shift, setShift] = useState("all");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [moreFilters, setMoreFilters] = useState(Boolean(preset.cashier || preset.category));
  const [visible, setVisible] = useState(ORDERS_PAGE_SIZE);
  const [selected, setSelected] = useState<FinanceOrder | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/finance?start=${start}&end=${end}&view=orders`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load orders.");
        if (active) { setOrders(payload.data ?? []); setTruncated(Boolean(payload.truncated)); }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load orders.");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [start, end]);

  const cashiers = useMemo(() => Array.from(new Set(orders.map((order) => order.punchedBy))).sort((a, b) => a.localeCompare(b)), [orders]);
  const categories = useMemo(() => Array.from(new Set(orders.flatMap((order) => order.items.map((item) => item.category)))).sort((a, b) => a.localeCompare(b)), [orders]);
  const shifts = useMemo(() => Array.from(new Set(orders.map((order) => order.shiftId).filter((id): id is number => id !== null))).sort((a, b) => b - a), [orders]);

  const query = search.trim().toLowerCase().replace(/^#/, "");
  const min = minTotal === "" ? null : Number(minTotal);
  const max = maxTotal === "" ? null : Number(maxTotal);
  const shown = orders.filter((order) => {
    const orderStatus = orderStatusOf(order);
    if (status === "reversed" ? orderStatus === "completed" : status !== "all" && orderStatus !== status) return false;
    if (channel !== "all" && orderChannel(order) !== channel) return false;
    if (serviceFilter !== "all" && order.serviceType !== serviceFilter) return false;
    if (cashier !== "all" && order.punchedBy !== cashier) return false;
    if (category !== "all" && !order.items.some((item) => item.category === category)) return false;
    if (shift !== "all" && String(order.shiftId) !== shift) return false;
    if (min !== null && order.total < min) return false;
    if (max !== null && order.total > max) return false;
    if (query && !(String(order.orderId) === query || String(order.queueNumber ?? "") === query || order.punchedBy.toLowerCase().includes(query) || order.items.some((item) => item.productName.toLowerCase().includes(query) || item.additions.some((addition) => addition.name.toLowerCase().includes(query))))) return false;
    return true;
  }).sort((a, b) => sort === "highest" ? b.total - a.total : sort === "lowest" ? a.total - b.total : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const paidShown = shown.filter((order) => !order.reversed);
  const reversedShown = shown.filter((order) => order.reversed);
  const moreCount = [cashier !== "all", category !== "all", shift !== "all", min !== null, max !== null].filter(Boolean).length;
  const anyFilter = status !== "all" || channel !== "all" || serviceFilter !== "all" || moreCount > 0 || query !== "";

  function resetFilters() {
    setSearch(""); setStatus("all"); setChannel("all"); setServiceFilter("all"); setCashier("all"); setCategory("all"); setShift("all"); setMinTotal(""); setMaxTotal(""); setVisible(ORDERS_PAGE_SIZE);
  }

  function filterLabel(): string {
    const parts = [formatRange(start, end)];
    if (status !== "all") parts.push(status === "reversed" ? "voided or refunded" : status);
    if (channel !== "all") parts.push(channelLabels[channel]);
    if (serviceFilter !== "all") parts.push(serviceTypeLabels[serviceFilter].toLowerCase());
    if (cashier !== "all") parts.push(`punched by ${cashier}`);
    if (category !== "all") parts.push(category);
    if (shift !== "all") parts.push(`shift #${shift}`);
    if (min !== null || max !== null) parts.push(`total ${min ?? 0}–${max ?? "any"}`);
    if (query) parts.push(`search "${search.trim()}"`);
    return parts.join(" · ");
  }

  const days: { day: string; orders: FinanceOrder[] }[] = [];
  for (const order of shown.slice(0, visible)) {
    if (sort === "newest" || sort === "oldest") {
      if (days.length === 0 || days[days.length - 1].day !== order.businessDate) days.push({ day: order.businessDate, orders: [] });
    } else if (days.length === 0) days.push({ day: "", orders: [] });
    days[days.length - 1].orders.push(order);
  }

  return <div className="flex flex-col gap-4">
    <div className="inv-summary">
      <div className="inv-stat is-static"><span>Orders shown</span><strong>{shown.length}</strong><em>of {orders.length} in this period</em></div>
      <div className="inv-stat is-static"><span>Paid total</span><strong style={{ color: "#15803D" }}>{peso(paidShown.reduce((sum, order) => sum + order.total, 0))}</strong><em>{paidShown.length} completed</em></div>
      <button type="button" className="inv-stat is-low" aria-pressed={status === "reversed"} onClick={() => setStatus(status === "reversed" ? "all" : "reversed")}><span>Voided or refunded</span><strong>{reversedShown.length}</strong><em>−{peso(reversedShown.reduce((sum, order) => sum + order.total, 0))}</em></button>
      <div className="inv-stat is-static"><span>Average order</span><strong>{paidShown.length ? peso(paidShown.reduce((sum, order) => sum + order.total, 0) / paidShown.length) : "—"}</strong><em>completed orders shown</em></div>
    </div>

    <div className="inv-toolbar">
      <div className="inv-search is-wide">
        <IconSearch size={14} />
        <input value={search} onChange={(event) => { setSearch(event.target.value); setVisible(ORDERS_PAGE_SIZE); }} placeholder="Order #, queue #, product, add-on or cashier" />
        {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
      </div>
      <label className="inv-filter"><span>Sort</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="inv-select">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest total</option><option value="lowest">Lowest total</option>
        </select>
      </label>
      <button type="button" className={`inv-secondary${moreCount ? " is-active" : ""}`} aria-expanded={moreFilters} onClick={() => setMoreFilters((open) => !open)}>More filters{moreCount ? ` (${moreCount})` : ""}</button>
      <button type="button" className="inv-secondary" onClick={() => exportFinanceOrders(shown, filterLabel(), start === end ? start : `${start}-to-${end}`)} disabled={shown.length === 0}><IconDownload size={14} />Export {shown.length}</button>
    </div>

    <div className="fin-filter-rows">
      <div className="inv-range" role="group" aria-label="Status">
        {([["all", "All"], ["completed", "Completed"], ["voided", "Voided"], ["refunded", "Refunded"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}>{label}</button>)}
      </div>
      <div className="inv-range" role="group" aria-label="Payment">
        {([["all", "Any payment"], ["cash", "Cash"], ["online", "Online"], ["split", "Split"], ["mobile", "Mobile"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={channel === id} onClick={() => setChannel(id)}>{label}</button>)}
      </div>
      <div className="inv-range" role="group" aria-label="Dine in or take out/pick up">
        {([["all", "Any type"], ["dine_in", "Dine in"], ["take_out", "Take Out/Pick Up"], ...(serviceFilter === "delivery" || orders.some((order) => order.serviceType === "delivery") ? [["delivery", "Delivery"] as const] : [])] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={serviceFilter === id} onClick={() => setServiceFilter(id)}>{label}</button>)}
      </div>
    </div>

    {moreFilters && <div className="fin-more">
      <label className="inv-filter"><span>Punched by</span><select value={cashier} onChange={(event) => setCashier(event.target.value)} className={`inv-select${cashier !== "all" ? " is-active" : ""}`}><option value="all">Anyone</option>{cashiers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="inv-filter"><span>Contains category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={`inv-select${category !== "all" ? " is-active" : ""}`}><option value="all">Any category</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="inv-filter"><span>Shift</span><select value={shift} onChange={(event) => setShift(event.target.value)} className={`inv-select${shift !== "all" ? " is-active" : ""}`}><option value="all">Any shift</option>{shifts.map((id) => <option key={id} value={String(id)}>Shift #{id}</option>)}</select></label>
      <label className="inv-filter"><span>Total from (₱)</span><MoneyField value={minTotal} onChange={(typed) => setMinTotal(typed)} placeholder="0" className="inv-select" style={{ width: 110 }} /></label>
      <label className="inv-filter"><span>Total up to (₱)</span><MoneyField value={maxTotal} onChange={(typed) => setMaxTotal(typed)} placeholder="Any" className="inv-select" style={{ width: 110 }} /></label>
    </div>}

    {anyFilter && <div className="inv-focus"><span>Showing: {filterLabel()}</span><button type="button" onClick={resetFilters}>Clear filters <IconX size={12} /></button></div>}

    {loading ? <div className="inv-empty">Loading orders…</div>
      : loadError ? <div className="inv-empty is-error">{loadError}</div>
        : orders.length === 0 ? <div className="inv-empty">No orders in {formatRange(start, end)}.</div>
          : shown.length === 0 ? <div className="inv-empty">No orders match these filters. <button type="button" className="inv-link" onClick={resetFilters}>Clear filters</button></div>
            : <div className="flex flex-col gap-4">
              {days.map((group) => {
                const paid = group.orders.filter((order) => !order.reversed);
                return <section key={group.day || "all"} className="invh-day">
                  {group.day && <p className="invh-day-label">{formatRange(group.day, group.day)}<span>{group.orders.length} order{group.orders.length === 1 ? "" : "s"} · {peso(paid.reduce((sum, order) => sum + order.total, 0))} paid</span></p>}
                  <ul>
                    {group.orders.map((order) => {
                      const orderStatus = orderStatusOf(order);
                      const orderChannelKey = orderChannel(order);
                      return <li key={order.orderId}>
                        <button type="button" className="fin-order" onClick={() => setSelected(order)}>
                          <span className="fin-order-queue">{order.queueNumber === null ? "—" : `#${order.queueNumber}`}</span>
                          <span className="fin-order-main">
                            <strong>{describeItems(order.items)}</strong>
                            <span>{clockTime(order.createdAt)} · Order {order.orderId} · {order.punchedBy}{order.shiftId ? ` · Shift #${order.shiftId}` : ""}</span>
                          </span>
                          <span className="fin-order-tags">
                            <span className={`fin-chip is-${orderChannelKey}`}>{orderChannelKey === "online" ? "Online" : orderChannelKey === "split" ? "Split" : channelLabels[orderChannelKey].replace(" menu", "")}</span>
                            {order.serviceType === "delivery" && <span className="fin-chip is-delivery">🛵 {order.paymentMethod === "cod" ? "COD" : "Delivery"}</span>}
                            {orderStatus !== "completed" && <span className={`fin-status is-${orderStatus}`}>{orderStatus === "voided" ? "Voided" : "Refunded"}</span>}
                          </span>
                          <strong className={`fin-order-total${order.reversed ? " is-reversed" : ""}`}>{peso(order.total)}</strong>
                        </button>
                      </li>;
                    })}
                  </ul>
                </section>;
              })}
              {shown.length > visible && <button type="button" className="inv-secondary" style={{ alignSelf: "center" }} onClick={() => setVisible((count) => count + ORDERS_PAGE_SIZE)}>Show {Math.min(ORDERS_PAGE_SIZE, shown.length - visible)} more of {shown.length - visible}</button>}
              {truncated && <p className="inv-hint" style={{ textAlign: "center" }}>Only the latest 5,000 orders in this period are loaded. Pick a shorter range to see older ones.</p>}
            </div>}

    {selected && <FinanceOrderDialog order={selected} onClose={() => setSelected(null)} />}
  </div>;
}

// ─── Export: one workbook for the chosen range ────────────────────────────────
type FinanceExportSections = { summary: boolean; daily: boolean; products: boolean; categories: boolean; addons: boolean; staff: boolean; loyalty: boolean; deliveries: boolean; shifts: boolean; orders: boolean };

function FinanceExportDialog({ data, onClose }: { data: FinanceOverviewData; onClose: () => void }) {
  const [sections, setSections] = useState<FinanceExportSections>({ summary: true, daily: true, products: true, categories: true, addons: true, staff: true, loyalty: true, deliveries: true, shifts: true, orders: true });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const { start, end } = data.range;
  const labels: Record<keyof FinanceExportSections, [string, string]> = {
    summary: ["Summary", "Net sales, orders, profit, payments"],
    daily: ["Sales by day", "One row per business day"],
    products: ["Products", "Quantity, sales and margin per product"],
    categories: ["Categories", "Sales per category"],
    addons: ["Add-ons", "Quantity and sales per add-on"],
    staff: ["Staff", "Orders and sales per person"],
    loyalty: ["Loyalty", "Member sales, stars and rewards given"],
    deliveries: ["Deliveries", "Fees, cash on delivery, riders, zones and failed deliveries"],
    shifts: ["Shifts", "Each shift with its cash drawer count"],
    orders: ["Orders and items", "Every order in the range, with its items"],
  };

  async function download() {
    if (!Object.values(sections).some(Boolean)) { setError("Choose at least one section."); return; }
    setExporting(true);
    setError("");
    try {
      const { current, previous } = data;
      const change = (now: number, before: number) => before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
      const summaryRow = (label: string, now: number, before: number): ExcelInfoRow => [label, now, before, change(now, before) === null ? "" : `${change(now, before)! > 0 ? "+" : ""}${change(now, before)}%`];
      const sheets: [string, XLSX.WorkSheet | null][] = [];
      if (sections.summary) {
        sheets.push(["Summary", excelInfo([
          ["Brew Houze finance report"],
          ["Period", formatRange(start, end)],
          ["Compared with", formatRange(data.previousRange.start, data.previousRange.end)],
          ["Generated", excelNow()],
          [],
          ["", "This period", "Period before", "Change"],
          summaryRow("Net sales", current.netSales, previous.netSales),
          summaryRow("Gross sales (before voids and refunds)", current.grossSales, previous.grossSales),
          summaryRow("Voided or refunded amount", current.reversedAmount, previous.reversedAmount),
          summaryRow("Voids", current.voids, previous.voids),
          summaryRow("Refunds", current.refunds, previous.refunds),
          summaryRow("Orders", current.orders, previous.orders),
          summaryRow("Items sold", current.itemsSold, previous.itemsSold),
          summaryRow("Average order", current.orders ? current.netSales / current.orders : 0, previous.orders ? previous.netSales / previous.orders : 0),
          summaryRow("Cost of goods", current.costOfGoods, previous.costOfGoods),
          summaryRow("Gross profit", current.grossProfit, previous.grossProfit),
          summaryRow("PayMongo fees (GCash)", current.paymentFees ?? 0, previous.paymentFees ?? 0),
          summaryRow("Profit after PayMongo fees", current.grossProfit - (current.paymentFees ?? 0), previous.grossProfit - (previous.paymentFees ?? 0)),
          summaryRow("Expenses", current.expenses ?? 0, previous.expenses ?? 0),
          summaryRow("Stock written off", current.writtenOff ?? 0, previous.writtenOff ?? 0),
          summaryRow("Net profit", current.netProfit ?? 0, previous.netProfit ?? 0),
          summaryRow("Items sold without a cost (not in profit)", current.uncostedItems, previous.uncostedItems),
          [],
          ["Payments", "This period", "Period before", "Change"],
          summaryRow("Cash at the counter", current.cashSales, previous.cashSales),
          summaryRow("GCash at the counter", current.counterOnlineSales, previous.counterOnlineSales),
          summaryRow("Mobile menu", current.mobileSales, previous.mobileSales),
        ], ["Voids", "Refunds", "Orders", "Items sold", "Items sold without a cost (not in profit)"])]);
      }
      if (sections.daily) sheets.push(["Sales by day", data.daily.length ? excelTable(data.daily, [
        { header: "Business date", value: (day) => day.day },
        { header: "Orders", value: (day) => day.orders, kind: "count" },
        { header: "Net sales", value: (day) => day.netSales, kind: "money" },
        { header: "Voided or refunded", value: (day) => day.reversedAmount, kind: "money" },
      ]) : null]);
      if (sections.products) sheets.push(["Products", data.products.length ? excelTable(data.products, [
        { header: "Product", value: (product) => product.name },
        { header: "Category", value: (product) => product.category },
        { header: "Sold", value: (product) => product.quantity, kind: "count" },
        { header: "Sales", value: (product) => product.revenue, kind: "money" },
        { header: "Cost of goods", value: (product) => product.cost, kind: "money" },
        { header: "Gross profit", value: (product) => product.cost === null ? null : product.revenue - product.cost, kind: "money" },
        { header: "Margin %", value: (product) => product.cost === null || product.revenue <= 0 ? null : Math.round(((product.revenue - product.cost) / product.revenue) * 1000) / 10, kind: "number" },
      ]) : null]);
      if (sections.categories) sheets.push(["Categories", data.categories.length ? excelTable(data.categories, [
        { header: "Category", value: (category) => category.name },
        { header: "Sold", value: (category) => category.quantity, kind: "count" },
        { header: "Sales", value: (category) => category.revenue, kind: "money" },
      ]) : null]);
      if (sections.addons) sheets.push(["Add-ons", data.addons.length ? excelTable(data.addons, [
        { header: "Add-on", value: (addon) => addon.name },
        { header: "Sold", value: (addon) => addon.quantity, kind: "count" },
        { header: "Sales", value: (addon) => addon.revenue, kind: "money" },
      ]) : null]);
      if (sections.staff) sheets.push(["Staff", data.staff.length ? excelTable(data.staff, [
        { header: "Punched by", value: (person) => person.name },
        { header: "Orders", value: (person) => person.orders, kind: "count" },
        { header: "Net sales", value: (person) => person.revenue, kind: "money" },
        { header: "Voided or refunded orders", value: (person) => person.reversedOrders, kind: "count" },
        { header: "Voided or refunded amount", value: (person) => person.reversedAmount, kind: "money" },
      ]) : null]);
      if (sections.summary && (data.serviceTypes ?? []).length > 0) sheets.push(["Dine in vs take out", excelTable(data.serviceTypes ?? [], [
        { header: "Order type", value: (row) => serviceTypeLabels[row.type] ?? row.type },
        { header: "Orders", value: (row) => row.orders, kind: "count" },
        { header: "Sales", value: (row) => row.sales, kind: "money" },
      ])]);
      if (sections.loyalty && data.loyalty) {
        const loyalty = data.loyalty;
        sheets.push(["Loyalty", excelInfo([
          ["Brew Houze loyalty", formatRange(start, end)],
          ["Member orders", loyalty.memberOrders],
          ["Member sales", loyalty.memberSales],
          ["Share of net sales (%)", data.current.netSales > 0 ? Math.round((loyalty.memberSales / data.current.netSales) * 1000) / 10 : 0],
          ["Members who ordered", loyalty.members],
          ["Stars earned (after voids and refunds)", loyalty.starsEarned],
          ["Stars spent on rewards", loyalty.starsSpent],
          ["Stars adjusted by admin (net)", loyalty.starsAdjusted],
          ["Rewards given", loyalty.rewardsClaimed],
          ["Normal price of rewards given", loyalty.rewardValue],
          ["Cost of rewards given", loyalty.rewardCost],
          ["Discounts given", loyalty.discountTotal ?? 0],
          [],
          ["Reward", "Given", "Normal price", "Cost"],
          ...loyalty.rewards.map((reward): ExcelInfoRow => [reward.name, reward.claimed, reward.value, reward.cost]),
        ], ["Member orders", "Members who ordered", "Stars earned (after voids and refunds)", "Stars spent on rewards", "Stars adjusted by admin (net)", "Rewards given", "Share of net sales (%)"])]);
      }
      if (sections.deliveries && data.deliveries && (data.deliveries.orders > 0 || data.deliveries.failed > 0)) {
        const dlv = data.deliveries;
        sheets.push(["Deliveries", excelInfo([
          ["Brew Houze deliveries", formatRange(start, end)],
          ["Delivery orders", dlv.orders],
          ["Delivery sales", dlv.sales],
          ["Delivery fees", dlv.fees],
          ["Free deliveries", dlv.freeDeliveries],
          ["Delivered", dlv.delivered],
          ["Could not be delivered", dlv.failed],
          ["Cancelled (voided before delivery)", dlv.cancelled],
          ["Cash on delivery orders", dlv.codOrders],
          ["Cash on delivery sales", dlv.codSales],
          ["Cash collected by riders", dlv.codCollected],
          ["Handed in at the counter", dlv.codReceived],
          ["Still with riders", dlv.codWithRiders],
          ["Average minutes, order to door", dlv.avgTotalMinutes],
          ["Average minutes on the road", dlv.avgRoadMinutes],
          [],
          ["Rider", "Delivered", "Not delivered", "Fees", "Cash collected", "Not handed in", "Avg. minutes on the road"],
          ...dlv.riders.map((rider): ExcelInfoRow => [rider.name, rider.delivered, rider.failed, rider.fees, rider.codCollected, rider.codWithRider, rider.avgRoadMinutes]),
          [],
          ["Zone", "Orders", "Fees", "Sales"],
          ...dlv.zones.map((zone): ExcelInfoRow => [zone.name, zone.orders, zone.fees, zone.sales]),
          ...(dlv.failures.length ? [[] as ExcelInfoRow, ["Not delivered", "Zone", "Reason", "Rider", "Voided"] as ExcelInfoRow, ...dlv.failures.map((failure): ExcelInfoRow => [`#${failure.queueNumber ?? failure.orderId}`, failure.zone, failure.reason ?? "", failure.rider ?? "", failure.voided ? "Yes" : "No"])] : []),
        ], ["Delivery orders", "Free deliveries", "Delivered", "Could not be delivered", "Cancelled (voided before delivery)", "Cash on delivery orders", "Average minutes, order to door", "Average minutes on the road"])]);
      }
      if (sections.shifts) {
        const response = await fetch(`/api/shifts?start=${start}&end=${end}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the shifts.");
        const shifts: ShiftReport[] = payload.data ?? [];
        sheets.push(["Shifts", shifts.length ? excelTable(shifts, shiftListColumns()) : null]);
      }
      if (sections.orders) {
        const response = await fetch(`/api/finance?start=${start}&end=${end}&view=orders`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the orders.");
        const orders: FinanceOrder[] = payload.data ?? [];
        sheets.push(["Orders", orders.length ? excelTable(orders, financeOrderColumns()) : null]);
        sheets.push(["Order items", orders.length ? excelTable(financeOrderLines(orders), financeItemColumns()) : null]);
      }
      if (sheets.every(([, sheet]) => sheet === null)) throw new Error("There is nothing to export for this period.");
      saveWorkbook(sheets, `brew-houze-finance-${start === end ? start : `${start}-to-${end}`}.xlsx`);
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not create the report.");
    } finally {
      setExporting(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={exporting} label="Export finance report">
    <section className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 520, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title="Export to Excel" sub={`${formatRange(start, end)} · change the dates in the date bar`} onClose={onClose} disabled={exporting} />
      <div className="flex flex-col gap-2 px-6 py-5" style={{ overflowY: "auto" }}>
        {(Object.keys(labels) as (keyof FinanceExportSections)[]).map((key) => <label key={key} className="fin-check">
          <input type="checkbox" checked={sections[key]} onChange={(event) => setSections((current) => ({ ...current, [key]: event.target.checked }))} />
          <span><strong>{labels[key][0]}</strong><em>{labels[key][1]}</em></span>
        </label>)}
        {error && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={exporting}>Cancel</button>
        <button type="button" className="ui-button ui-button-primary" onClick={() => void download()} disabled={exporting}>{exporting ? "Preparing…" : "Download .xlsx"}</button>
      </div>
    </section>
  </Modal>;
}

function Finance() {
  const [today] = useState(() => getFinanceDateStamp());
  const presets = useMemo(() => financePresets(today), [today]);
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [presetId, setPresetId] = useState("7");
  const [custom, setCustom] = useState({ start: addDays(today, -6), end: today });
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [ordersPreset, setOrdersPreset] = useState<OrdersPreset>({});
  const [ordersKey, setOrdersKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const preset = presets.find((entry) => entry.id === presetId);
  const start = preset ? preset.start : custom.start;
  const end = preset ? preset.end : custom.end;
  const rangeValid = Boolean(start && end && start <= end);

  useEffect(() => {
    if (!rangeValid) return;
    let active = true;
    const load = async (quiet: boolean) => {
      if (!quiet) { setLoading(true); setLoadError(""); }
      try {
        const response = await fetch(`/api/finance?start=${start}&end=${end}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load finance figures.");
        if (active) { setOverview(payload.data); setLoadError(""); }
      } catch (error) {
        if (active && !quiet) setLoadError(error instanceof Error ? error.message : "Could not load finance figures.");
      } finally {
        if (active && !quiet) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void load(false), 0);
    // Keep today's figures current while the page is open.
    const interval = window.setInterval(() => { if (document.visibilityState === "visible" && end >= today) void load(true); }, 30_000);
    return () => { active = false; window.clearTimeout(timer); window.clearInterval(interval); };
  }, [start, end, rangeValid, today, reloadKey]);

  function openOrders(presetFilters: OrdersPreset) {
    setOrdersPreset(presetFilters);
    setOrdersKey((key) => key + 1);
    setTab("orders");
  }

  const tabs: { id: FinanceTab; label: string; Icon: React.FC<{ size?: number }> }[] = [
    { id: "overview", label: "Overview", Icon: IconGrid },
    { id: "shifts", label: "Shifts", Icon: IconRotateCcw },
    { id: "orders", label: "Orders", Icon: IconDollar },
    { id: "expenses", label: "Expenses", Icon: IconTag },
  ];

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-head">
        <div className="inv-tabs" role="tablist" aria-label="Finance views">
          {tabs.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={15} />{label}</button>)}
        </div>
        <button type="button" className="inv-secondary" onClick={() => setExportOpen(true)} disabled={!overview || loading}><IconDownload size={14} />Export</button>
      </div>

      <div className="fin-datebar">
        <div className="menu-chips" role="group" aria-label="Period">
          {presets.map((entry) => <button key={entry.id} type="button" aria-pressed={presetId === entry.id} onClick={() => setPresetId(entry.id)}>{entry.label}</button>)}
          <button type="button" aria-pressed={presetId === "custom"} onClick={() => { setCustom({ start, end }); setPresetId("custom"); }}>Custom</button>
        </div>
        {presetId === "custom" && <div className="inv-dates">
          <input type="date" value={custom.start} max={custom.end || today} onChange={(event) => setCustom((current) => ({ ...current, start: event.target.value }))} aria-label="From" />
          <span>to</span>
          <input type="date" value={custom.end} min={custom.start} max={today} onChange={(event) => setCustom((current) => ({ ...current, end: event.target.value }))} aria-label="To" />
        </div>}
        <p className="fin-range-label"><strong>{rangeValid ? formatRange(start, end) : "Choose a valid date range"}</strong>{overview && rangeValid && <span>compared with {formatRange(overview.previousRange.start, overview.previousRange.end)} · business days, so after-midnight sales count toward their night</span>}</p>
      </div>

      {!rangeValid ? <div className="inv-empty is-error">The start date must be on or before the end date.</div>
        : tab === "overview" ? (loading && !overview ? <div className="inv-empty">Loading finance figures…</div>
          : loadError ? <div className="inv-empty is-error">{loadError} <button type="button" className="inv-link" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div>
            : overview ? <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 160ms ease" }}><FinanceOverview data={overview} today={today} onOpenOrders={openOrders} onOpenExpenses={() => setTab("expenses")} /></div> : null)
          : tab === "shifts" ? <ShiftReports start={start} end={end} />
          : tab === "expenses" ? <FinanceExpenses start={start} end={end} />
            : <FinanceOrders key={`${start}-${end}-${ordersKey}`} start={start} end={end} preset={ordersPreset} />}
    </div>
    {exportOpen && overview && <FinanceExportDialog data={overview} onClose={() => setExportOpen(false)} />}
  </div>;
}

// ─── Expenses (Finance) ───────────────────────────────────────────────────────
// What the café spends to run, apart from the ingredients it sells (see expenses-migration.sql).
// Restocking is never an expense here: its cost is already in the cost of goods as stock sells.
// Each expense says where the money came from: the safe, the drawer (a cash out in the open
// shift) or the owner's own money. Mistakes are voided, never deleted.
type Expense = {
  id: number; spentOn: string; category: string; description: string; amount: number; paidFrom: string; shiftId: number | null;
  reference: string | null; note: string | null; by: string | null; source: string; createdAt: string;
  voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
};
type ExpensesData = {
  expenses: Expense[]; total: number; byCategory: { category: string; amount: number; count: number }[]; byPaidFrom: Record<string, number>;
  categories: string[]; openShift: { shiftId: number; expectedCash: number; businessDate: string } | null; truncated: boolean;
};
const paidFromLabels: Record<string, string> = { safe: "From the safe", drawer: "From the drawer", owner: "Paid by the owner" };

function exportExpenses(data: ExpensesData, rangeLabel: string, fileStamp: string) {
  saveWorkbook([
    ["Summary", excelInfo([
      ["Brew Houze expenses"],
      ["Showing", rangeLabel],
      ["Generated", excelNow()],
      [],
      ["Total expenses", data.total],
      ["From the safe", data.byPaidFrom.safe ?? 0],
      ["From the drawer", data.byPaidFrom.drawer ?? 0],
      ["Paid by the owner", data.byPaidFrom.owner ?? 0],
      [],
      ["Category", "Amount"],
      ...data.byCategory.map((entry) => [entry.category, entry.amount] as ExcelInfoRow),
    ])],
    ["Expenses", excelTable([...data.expenses].reverse(), [
      { header: "Date", value: (expense) => expense.spentOn },
      { header: "Category", value: (expense) => expense.category },
      { header: "What for", value: (expense) => expense.description },
      { header: "Amount", value: (expense) => expense.voidedAt ? null : expense.amount, kind: "money" },
      { header: "Paid from", value: (expense) => paidFromLabels[expense.paidFrom] ?? expense.paidFrom },
      { header: "Shift", value: (expense) => expense.shiftId ? `#${expense.shiftId}` : "" },
      { header: "Receipt or reference", value: (expense) => expense.reference ?? "" },
      { header: "Note", value: (expense) => expense.note ?? "" },
      { header: "Recorded by", value: (expense) => expense.by ?? "" },
      { header: "Recorded", value: (expense) => excelDateTime(expense.createdAt) },
      { header: "Voided", value: (expense) => expense.voidedAt ? `${excelDateTime(expense.voidedAt)}${expense.voidedBy ? ` by ${expense.voidedBy}` : ""}: ${expense.voidReason ?? ""}` : "" },
      { header: "Voided amount", value: (expense) => expense.voidedAt ? expense.amount : null, kind: "money" },
    ])],
  ], `brew-houze-expenses-${fileStamp}.xlsx`);
}

function ExpenseDialog({ data, today, onClose, onSaved }: { data: ExpensesData; today: string; onClose: () => void; onSaved: (message: string) => void }) {
  const [paidFrom, setPaidFrom] = useState<"safe" | "drawer" | "owner">("safe");
  const [spentOn, setSpentOn] = useState(today);
  const [category, setCategory] = useState(data.categories[0] ?? "Supplies");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const value = Number(amount);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(value > 0)) { setError("Enter the amount."); return; }
    if (!description.trim()) { setError("Say what it was for."); return; }
    if (paidFrom === "drawer" && !data.openShift) { setError("No shift is open, so nothing can be paid from the drawer."); return; }
    if (paidFrom === "drawer" && data.openShift && value > data.openShift.expectedCash + 0.004) { setError(`The drawer should only have ${peso(data.openShift.expectedCash)}.`); return; }
    if (!password) { setError("Enter your password to confirm."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", spent_on: spentOn, category, description, amount: value, paid_from: paidFrom, reference, note, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") setPassword("");
      if (!response.ok) throw new Error(payload?.error || "Could not save the expense.");
      onSaved(`Expense of ${peso(value)} recorded (${category}: ${description.trim()}).`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the expense.");
    } finally {
      setSaving(false);
    }
  }

  const sources: { id: "safe" | "drawer" | "owner"; label: string; hint: string; disabled?: boolean }[] = [
    { id: "safe", label: "From the safe", hint: "It comes off the safe in Treasury" },
    { id: "drawer", label: "From the drawer", hint: data.openShift ? `A cash out in shift #${data.openShift.shiftId} (the drawer should have ${peso(data.openShift.expectedCash)})` : "Only while a shift is open", disabled: !data.openShift },
    { id: "owner", label: "Paid by the owner", hint: "The owner’s own money. Nothing in Treasury moves" },
  ];
  return <Modal onClose={onClose} closeDisabled={saving} label="Add an expense">
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 500px)", textAlign: "left" }}>
      <h2>Add an expense</h2>
      <div className="ui-confirm-message">Money spent to run the café. Not for restocking ingredients: that is already in the cost of goods as the stock sells.</div>
      <label className="acc-money">
        <span>Amount</span>
        <span className="acc-money-field"><b>₱</b><MoneyField data-autofocus value={amount} onChange={(typed) => { setAmount(typed); setError(""); }} placeholder="0.00" /></span>
      </label>
      <p className="exp-label">Category</p>
      <div className="menu-chips" role="group" aria-label="Category" style={{ flexWrap: "wrap" }}>
        {data.categories.map((option) => <button key={option} type="button" aria-pressed={category === option} onClick={() => setCategory(option)}>{option}</button>)}
      </div>
      <label className="acc-money">
        <span>What it was for</span>
        <input value={description} onChange={(event) => { setDescription(event.target.value); setError(""); }} maxLength={120} placeholder={category === "Wages" ? "e.g. Juan, week of Oct 1" : category === "Utilities" ? "e.g. Electricity, September" : "e.g. Cups and straws"} style={packagingInput} />
      </label>
      <p className="exp-label">Paid from</p>
      <div className="exp-sources" role="radiogroup" aria-label="Paid from">
        {sources.map((source) => <button key={source.id} type="button" role="radio" aria-checked={paidFrom === source.id} disabled={source.disabled} onClick={() => { setPaidFrom(source.id); setError(""); }}>
          <strong>{source.label}</strong><span>{source.hint}</span>
        </button>)}
      </div>
      {paidFrom !== "drawer" ? <label className="acc-money">
        <span>Date</span>
        <input type="date" value={spentOn} max={today} onChange={(event) => setSpentOn(event.target.value)} style={packagingInput} />
      </label> : <p className="inv-hint" style={{ marginTop: 10 }}>Dated by the open shift ({data.openShift ? formatRange(data.openShift.businessDate, data.openShift.businessDate) : "—"}).</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label className="acc-money">
          <span>Receipt or reference <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
          <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} placeholder="e.g. OR #1234" style={packagingInput} />
        </label>
        <label className="acc-money">
          <span>Note <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} style={packagingInput} />
        </label>
      </div>
      <label className="acc-money">
        <span>Your password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={packagingInput} />
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="ui-button ui-button-primary" disabled={saving}>{saving ? "Saving…" : `Record${value > 0 ? ` ${peso(value)}` : ""}`}</button>
      </div>
    </form>
  </Modal>;
}

function VoidExpenseDialog({ expense, onClose, onSaved }: { expense: Expense; onClose: () => void; onSaved: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) { setError("Say why it is voided."); return; }
    if (!password) { setError("Enter your password to confirm."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "void", expense_id: expense.id, reason, password }) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") setPassword("");
      if (!response.ok) throw new Error(payload?.error || "Could not void the expense.");
      onSaved(`Voided: ${expense.category}, ${expense.description} (${peso(expense.amount)}).${expense.paidFrom === "safe" ? " The money went back into the safe." : ""}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not void the expense.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label="Void an expense">
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 440px)" }}>
      <div className="ui-confirm-icon" data-tone="danger" aria-hidden="true"><IconX size={18} /></div>
      <h2>Void this expense?</h2>
      <div className="ui-confirm-message">
        <b>{expense.category}: {expense.description}</b>, {peso(expense.amount)} {paidFromLabels[expense.paidFrom]?.toLowerCase() ?? ""}. It stays in the list, crossed out, and no longer counts.{" "}
        {expense.paidFrom === "safe" ? "The money goes back into the safe." : expense.paidFrom === "drawer" ? "The drawer is not changed: if the cash never left it, record a cash in for it." : ""}
      </div>
      <label className="acc-money">
        <span>Why</span>
        <input data-autofocus value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} maxLength={120} placeholder="e.g. Recorded twice" style={packagingInput} />
      </label>
      <label className="acc-money">
        <span>Your password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={packagingInput} />
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="ui-button ui-button-danger" disabled={saving}>{saving ? "Voiding…" : "Void it"}</button>
      </div>
    </form>
  </Modal>;
}

function FinanceExpenses({ start, end }: { start: string; end: string }) {
  const [today] = useState(() => getFinanceDateStamp());
  const [data, setData] = useState<ExpensesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [category, setCategory] = useState("all");
  const [paidFrom, setPaidFrom] = useState("all");
  const [search, setSearch] = useState("");
  const [showVoided, setShowVoided] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/expenses?start=${start}&end=${end}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the expenses.");
        if (active) { setData(payload.data); setLoadError(""); }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load the expenses.");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [start, end, reloadKey]);

  function saved(message: string) {
    setAdding(false);
    setVoiding(null);
    setNotice(message);
    setReloadKey((key) => key + 1);
  }

  if (loading && !data) return <div className="inv-empty">Loading expenses…</div>;
  if (loadError && !data) return <div className="inv-empty is-error">{loadError} <button type="button" className="inv-link" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div>;
  if (!data) return null;

  const query = search.trim().toLowerCase();
  const shown = data.expenses.filter((expense) => (showVoided || !expense.voidedAt)
    && (category === "all" || expense.category === category)
    && (paidFrom === "all" || expense.paidFrom === paidFrom)
    && (!query || [expense.description, expense.category, expense.reference ?? "", expense.note ?? "", expense.by ?? ""].some((text) => text.toLowerCase().includes(query))));
  const voidedCount = data.expenses.filter((expense) => expense.voidedAt).length;
  const categoriesShown = [...new Set([...data.categories, ...data.expenses.map((expense) => expense.category)])];
  const top = Math.max(1, ...data.byCategory.map((entry) => entry.amount));
  const rangeText = formatRange(start, end);

  return <div className="flex flex-col gap-4" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 160ms ease" }}>
    <div className="inv-summary">
      <div className="inv-stat is-static tre-balance"><span>Expenses</span><strong>{peso(data.total)}</strong><em>{rangeText}</em></div>
      <button type="button" className="inv-stat" aria-pressed={paidFrom === "safe"} onClick={() => setPaidFrom(paidFrom === "safe" ? "all" : "safe")}><span>From the safe</span><strong>{peso(data.byPaidFrom.safe ?? 0)}</strong><em>taken from the safe</em></button>
      <button type="button" className="inv-stat" aria-pressed={paidFrom === "drawer"} onClick={() => setPaidFrom(paidFrom === "drawer" ? "all" : "drawer")}><span>From the drawer</span><strong>{peso(data.byPaidFrom.drawer ?? 0)}</strong><em>cash outs in the shifts</em></button>
      <button type="button" className="inv-stat" aria-pressed={paidFrom === "owner"} onClick={() => setPaidFrom(paidFrom === "owner" ? "all" : "owner")}><span>Paid by the owner</span><strong>{peso(data.byPaidFrom.owner ?? 0)}</strong><em>the owner’s own money</em></button>
    </div>

    <div className="inv-head">
      <button type="button" className="inv-primary" onClick={() => { setNotice(""); setAdding(true); }}><IconPlus size={14} />Add an expense</button>
      <button type="button" className="inv-secondary" onClick={() => exportExpenses(data, rangeText, start === end ? start : `${start}-to-${end}`)} disabled={data.expenses.length === 0}><IconDownload size={14} />Export</button>
    </div>
    {notice && <div className="acc-notice" role="status">{notice}</div>}

    {data.byCategory.length > 0 && <DashCard title="By category" sub={`${peso(data.total)} in ${rangeText}`}>
      <ul className="exp-cats">
        {data.byCategory.map((entry) => <li key={entry.category}>
          <button type="button" aria-pressed={category === entry.category} onClick={() => setCategory(category === entry.category ? "all" : entry.category)}>
            <span className="exp-cat-name"><strong>{entry.category}</strong><em>{entry.count} expense{entry.count === 1 ? "" : "s"} · {((entry.amount / Math.max(data.total, 0.01)) * 100).toFixed(0)}%</em></span>
            <span className="exp-cat-bar" aria-hidden="true"><i style={{ width: `${(entry.amount / top) * 100}%` }} /></span>
            <strong>{peso(entry.amount)}</strong>
          </button>
        </li>)}
      </ul>
    </DashCard>}

    <div className="inv-toolbar">
      <div className="inv-search is-wide">
        <IconSearch size={14} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search what for, receipt, note or employee" />
        {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
      </div>
      <label className="inv-filter"><span>Category</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className={`inv-select${category !== "all" ? " is-active" : ""}`}>
          <option value="all">All</option>{categoriesShown.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label className="inv-filter"><span>Paid from</span>
        <select value={paidFrom} onChange={(event) => setPaidFrom(event.target.value)} className={`inv-select${paidFrom !== "all" ? " is-active" : ""}`}>
          <option value="all">Anywhere</option>{Object.entries(paidFromLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {voidedCount > 0 && <label className="inv-filter" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="checkbox" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} />Show {voidedCount} voided</label>}
    </div>
    <p className="inv-hint">Newest first, by business date. Cash outs recorded in the staff app show here by themselves. Restocking ingredients is not an expense: it is already in the cost of goods as the stock sells. Expenses cannot be edited or deleted; void a mistake and record it again.</p>
    {loadError && <div className="inv-alert" role="alert"><span>{loadError}</span><button type="button" onClick={() => setLoadError("")} title="Dismiss"><IconX size={14} /></button></div>}

    {shown.length === 0 ? <div className="inv-empty">{data.expenses.length === 0 ? "No expenses in this period." : "Nothing matches these filters."}</div>
      : <ul className="tre-list">
        {shown.map((expense) => <li key={expense.id} className={expense.voidedAt ? "is-void" : "is-out"}>
          <span className="tre-when"><strong>{formatRange(expense.spentOn, expense.spentOn)}</strong><em>{expense.shiftId ? `shift #${expense.shiftId}` : `#${expense.id}`}</em></span>
          <span className="tre-what">
            <strong>{expense.category}<span>{expense.description}</span></strong>
            <em>{paidFromLabels[expense.paidFrom] ?? expense.paidFrom} · {expense.by ?? "—"}{expense.source === "cashier" ? " (staff app)" : ""}{expense.reference ? ` · ${expense.reference}` : ""}{expense.note ? ` · ${expense.note}` : ""}</em>
            {expense.voidedAt && <i className="tre-tag is-void">Voided {shiftTime(expense.voidedAt)}{expense.voidedBy ? ` by ${expense.voidedBy}` : ""}: {expense.voidReason}</i>}
          </span>
          <span className="tre-amount"><strong>−{peso(expense.amount)}</strong></span>
          <span className="tre-act">{!expense.voidedAt && <button type="button" className="inv-mini" onClick={() => { setNotice(""); setVoiding(expense); }}><IconX size={11} />Void</button>}</span>
        </li>)}
      </ul>}
    {data.truncated && <p className="inv-hint">Showing the newest {data.expenses.length} expenses. Choose a shorter period to see older ones.</p>}
    {adding && <ExpenseDialog data={data} today={today} onClose={() => setAdding(false)} onSaved={saved} />}
    {voiding && <VoidExpenseDialog expense={voiding} onClose={() => setVoiding(null)} onSaved={saved} />}
  </div>;
}

// ─── Insights ─────────────────────────────────────────────────────────────────
// Short predictive warnings and advice written by Claude from the café's numbers (see
// app/api/insights). Claude is asked only when an admin presses the button, and only while the
// switch is on; every result is saved, so reading it again costs nothing.
type InsightCard = { tone: "warning" | "good" | "tip"; title: string; message: string; page: "inventory" | "finance" | "treasury" | "products" | "shift" };
type InsightResult = { id: number; start: string; end: string; headline: string; cards: InsightCard[]; model: string; inputTokens: number | null; outputTokens: number | null; requestedBy: string | null; createdAt: string };
type InsightsData = { enabled: boolean; configured: boolean; cooldownSeconds: number; model: string; insights: InsightResult[] };

const insightTone: Record<InsightCard["tone"], { label: string; icon: string }> = {
  warning: { label: "Heads up", icon: "⚠" },
  good: { label: "Good news", icon: "✓" },
  tip: { label: "Tip", icon: "💡" },
};
const insightPageLabels: Record<InsightCard["page"], string> = { inventory: "Inventory", finance: "Finance", treasury: "Treasury", products: "Menu", shift: "Shift" };

// What one request cost, from its tokens at Claude Opus 5.5's prices ($4 in, $20 out per million).
function insightCost(result: InsightResult): string | null {
  if (result.inputTokens === null || result.outputTokens === null) return null;
  const dollars = (result.inputTokens * 4 + result.outputTokens * 20) / 1_000_000;
  return `${(result.inputTokens + result.outputTokens).toLocaleString("en-PH")} tokens · about $${dollars < 0.01 ? dollars.toFixed(3) : dollars.toFixed(2)}`;
}

function InsightsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [today] = useState(() => getFinanceDateStamp());
  const presets = useMemo(() => financePresets(today).filter((entry) => ["week", "7", "month", "30"].includes(entry.id)), [today]);
  const [presetId, setPresetId] = useState("7");
  const [data, setData] = useState<InsightsData | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/insights", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the insights.");
        if (!active) return;
        setData(payload.data);
        setCooldown(payload.data.cooldownSeconds);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load the insights.");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [reloadKey]);

  // The cooldown counts down on screen.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const preset = presets.find((entry) => entry.id === presetId) ?? presets[0];

  async function ask() {
    if (!preset || asking) return;
    setAsking(true);
    setError("");
    try {
      const response = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", start: preset.start, end: preset.end }) });
      const payload = await response.json();
      if (typeof payload?.cooldownSeconds === "number") setCooldown(payload.cooldownSeconds);
      if (!response.ok) throw new Error(payload?.error || "Could not get insights.");
      setData((current) => current ? { ...current, insights: [payload.data, ...current.insights] } : current);
      setSelectedId(payload.data.id);
      setCooldown(5 * 60);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Could not get insights.");
    } finally {
      setAsking(false);
    }
  }

  async function setEnabled(enabled: boolean) {
    setSwitching(true);
    setError("");
    try {
      const response = await fetch("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_enabled", enabled }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not change the setting.");
      setData((current) => current ? { ...current, enabled } : current);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Could not change the setting.");
    } finally {
      setSwitching(false);
    }
  }

  if (loading && !data) return <div className="inv-wrap"><div className="inv"><div className="inv-empty">Loading insights…</div></div></div>;
  if (!data) return <div className="inv-wrap"><div className="inv"><div className="inv-empty is-error">{error || "Could not load the insights."} <button type="button" className="inv-link" onClick={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }}>Try again</button></div></div></div>;

  const shown = data.insights.find((entry) => entry.id === selectedId) ?? data.insights[0] ?? null;
  const blocked = !data.enabled ? "Turn AI insights on to ask Claude." : !data.configured ? "Not set up yet: the ANTHROPIC_API_KEY setting is missing on the server." : cooldown > 0 ? `You can ask again in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, "0")}.` : null;

  return <div className="inv-wrap">
    <div className="inv">
      <section className="ins-top">
        <div>
          <p className="ins-kicker"><IconSparkle size={14} />AI insights by Claude</p>
          <h2>Predictive warnings and advice</h2>
          <p className="inv-hint">Claude reads this period’s numbers (sales, profit, stock pace, waste, fees, expenses, the cash drawer) and points out what needs attention next. Only numbers are sent, never customer or staff details. Nothing runs until someone presses the button.</p>
        </div>
        <label className={`ins-switch${data.enabled ? " is-on" : ""}`}>
          <input type="checkbox" role="switch" checked={data.enabled} disabled={switching} onChange={(event) => void setEnabled(event.target.checked)} />
          <span className="ins-switch-track" aria-hidden="true"><span /></span>
          <span>{data.enabled ? "On" : "Off"}</span>
        </label>
      </section>

      {!data.enabled && <div className="ins-setup is-off"><strong>AI insights are off.</strong> Turn them on with the switch above to ask Claude or read saved insights. While they are off, nothing is sent to Claude.</div>}

      {/* Everything below is disabled while the switch is off. */}
      <div className={`ins-body${data.enabled ? "" : " is-off"}`} inert={!data.enabled} aria-disabled={!data.enabled}>
      {!data.configured && <div className="ins-setup"><strong>Not set up yet.</strong> Add the Claude API key to the admin app as <code>ANTHROPIC_API_KEY</code> (in <code>.env.local</code> and in the Vercel project settings), then reload this page. Saved insights stay readable.</div>}

      <div className="fin-datebar">
        <div className="menu-chips" role="group" aria-label="Period">
          {presets.map((entry) => <button key={entry.id} type="button" aria-pressed={presetId === entry.id} onClick={() => setPresetId(entry.id)}>{entry.label}</button>)}
        </div>
        <div className="ins-ask">
          <button type="button" className="inv-primary" onClick={() => void ask()} disabled={asking || blocked !== null}><IconSparkle size={15} />{asking ? "Claude is reading the numbers…" : "Ask Claude for insights"}</button>
          <span className="inv-hint">{blocked ?? `${preset ? formatRange(preset.start, preset.end) : ""} · Claude Opus 5.5 · about $0.02 per request`}</span>
        </div>
      </div>

      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}

      {!shown ? <div className="inv-empty">{data.enabled ? "No insights yet. Choose a period and ask Claude." : "No insights yet. Turn AI insights on, then ask Claude."}</div> : <>
        <div className="ins-result">
          <div className="ins-result-head">
            <h3>{shown.headline || "Insights"}</h3>
            <p>{formatRange(shown.start, shown.end)} · asked {shiftTime(shown.createdAt)}{shown.requestedBy ? ` by ${shown.requestedBy}` : ""}{insightCost(shown) ? ` · ${insightCost(shown)}` : ""}</p>
          </div>
          <ul className="ins-cards">
            {shown.cards.map((card, index) => <li key={index} className={`is-${card.tone}`}>
              <span className="ins-card-icon" aria-hidden="true">{insightTone[card.tone]?.icon ?? "•"}</span>
              <div>
                <strong>{card.title}</strong>
                <p>{card.message}</p>
                {insightPageLabels[card.page] && <button type="button" className="inv-link" onClick={() => onNavigate(card.page)}>Open {insightPageLabels[card.page]} <IconChevron size={12} /></button>}
              </div>
            </li>)}
          </ul>
          <p className="inv-hint">Written by AI from the numbers above. Check the figures on the linked page before acting on them.</p>
        </div>
        {data.insights.length > 1 && <DashCard title="Earlier insights" sub="Saved results. Opening one costs nothing.">
          <ul className="fin-simple-list">
            {data.insights.map((entry) => <li key={entry.id}>
              <span><strong>{entry.headline || `${entry.cards.length} insights`}</strong><em>{formatRange(entry.start, entry.end)} · {shiftTime(entry.createdAt)}{entry.requestedBy ? ` · ${entry.requestedBy}` : ""}</em></span>
              {entry.id === shown.id ? <span className="inv-hint">Showing</span> : <button type="button" className="inv-mini" onClick={() => setSelectedId(entry.id)}>Open</button>}
            </li>)}
          </ul>
        </DashCard>}
      </>}
      </div>
    </div>
  </div>;
}

// ─── Treasury ─────────────────────────────────────────────────────────────────
// The owner's logbook of where the business money is (see treasury-migration.sql and
// treasury-paymongo-migration.sql). Two accounts, each with a history that reads like a ledger:
//   Safe      the cash box. Shifts move cash in and out of it by themselves (the float, cash drops
//             and cash ins, the closing deposit); the admin deposits, withdraws or counts it.
//   PayMongo  the money PayMongo holds for the café. Each closing adds the shift's GCash and takes
//             off PayMongo's fees; the admin records the weekly payouts or checks it against the
//             PayMongo dashboard.
// A hand-made entry with a wrong amount is fixed with a correction linked to it.
type TreasuryKey = "safe" | "paymongo";
type SafeInfo = { key: TreasuryKey; accountId: number; name: string; balance: number; live: boolean; openedAt: string | null };
type SafeEntry = {
  id: number; kind: string; amount: number; balanceAfter: number; shiftId: number | null; movementId: number | null; correctsEntryId: number | null;
  correctedBy: number; reason: string; note: string | null; by: string | null; source: string; createdAt: string;
};
type TreasuryData = {
  safe: SafeInfo; paymongo: SafeInfo; lastFloat: number; account: TreasuryKey;
  range: { opening: number; moneyIn: number; moneyOut: number; closing: number; fees: number; entries: number }; entries: SafeEntry[]; truncated: boolean;
};
type SafeAction = { type: "open" | "deposit" | "withdraw" | "payout" | "count" } | { type: "correct"; entry: SafeEntry };

const safeKindLabels: Record<string, string> = {
  opening_balance: "Opening balance", deposit: "Deposit", withdrawal: "Withdrawal", float_out: "Float to the drawer", float_return: "Float back from the drawer",
  shift_deposit: "Shift closing", cash_drop: "Cash drop", cash_top_up: "Cash in to the drawer", correction: "Correction",
  gcash_sales: "GCash sales", gateway_fee: "PayMongo fees", payout: "Payout", expense: "Expense",
};
const treasuryKindGroups: Record<TreasuryKey, { id: string; label: string; kinds: string[] }[]> = {
  safe: [
    { id: "owner", label: "Deposits & withdrawals", kinds: ["opening_balance", "deposit", "withdrawal"] },
    { id: "expenses", label: "Expenses", kinds: ["expense"] },
    { id: "shifts", label: "Shifts", kinds: ["float_out", "float_return", "shift_deposit", "cash_drop", "cash_top_up"] },
    { id: "corrections", label: "Corrections", kinds: ["correction"] },
  ],
  paymongo: [
    { id: "shifts", label: "GCash & fees", kinds: ["gcash_sales", "gateway_fee"] },
    { id: "payouts", label: "Payouts", kinds: ["opening_balance", "payout"] },
    { id: "corrections", label: "Corrections", kinds: ["correction"] },
  ],
};
// Entries an admin made by hand, which a correction may fix.
const treasuryCorrectable: Record<TreasuryKey, string[]> = { safe: ["opening_balance", "deposit", "withdrawal"], paymongo: ["opening_balance", "payout"] };
const safeReasons: Record<"deposit" | "withdraw" | "payout" | "correct", string[]> = {
  deposit: ["Owner added cash", "Change fund"],
  withdraw: ["Owner took cash", "Paid a supplier", "Wages", "Rent or bills"],
  payout: ["Weekly payout", "Payout on request"],
  correct: ["Wrong amount typed", "Recorded twice", "Should not have been recorded"],
};

function IconSafe({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="15" rx="2" /><circle cx="12" cy="11.5" r="3.2" /><path d="M12 8.3v1M12 13.7v1M8.8 11.5h1M14.2 11.5h1M6 19v2M18 19v2" /></svg>;
}

function IconWallet({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M16 13.5h2" /></svg>;
}

function exportSafeEntries(data: TreasuryData, rangeLabel: string, fileStamp: string) {
  const account = data.account === "safe" ? data.safe : data.paymongo;
  const title = data.account === "safe" ? "safe" : "PayMongo";
  saveWorkbook([
    ["Summary", excelInfo([
      [`Brew Houze ${title}`],
      ["Showing", rangeLabel],
      ["Generated", excelNow()],
      [],
      ["Balance at the start", data.range.opening],
      ["Money in", data.range.moneyIn],
      ["Money out", data.range.moneyOut],
      ...(data.account === "paymongo" ? [["Of which PayMongo fees", data.range.fees] as ExcelInfoRow] : []),
      ["Balance at the end", data.range.closing],
      ["Balance now", account.balance],
      ["Entries", data.range.entries],
    ], ["Entries"])],
    [`${data.account === "safe" ? "Safe" : "PayMongo"} history`, excelTable([...data.entries].reverse(), [
      { header: "Date and time", value: (entry) => excelDateTime(entry.createdAt) },
      { header: "Type", value: (entry) => safeKindLabels[entry.kind] ?? entry.kind },
      { header: "Reason", value: (entry) => entry.reason },
      { header: "In", value: (entry) => entry.amount > 0 ? entry.amount : null, kind: "money" },
      { header: "Out", value: (entry) => entry.amount < 0 ? -entry.amount : null, kind: "money" },
      { header: "Balance after", value: (entry) => entry.balanceAfter, kind: "money" },
      { header: "Shift", value: (entry) => entry.shiftId ? `#${entry.shiftId}` : "" },
      { header: "Corrects entry", value: (entry) => entry.correctsEntryId ? `#${entry.correctsEntryId}` : "" },
      { header: "Note", value: (entry) => entry.note ?? "" },
      { header: "By", value: (entry) => entry.by ?? "" },
      { header: "From", value: (entry) => entry.source === "cashier" ? "Staff app" : "Admin app" },
      { header: "Entry #", value: (entry) => entry.id },
    ])],
  ], `brew-houze-${data.account === "safe" ? "safe" : "paymongo"}-${fileStamp}.xlsx`);
}

function SafeActionDialog({ account, action, balance, onClose, onSaved }: { account: TreasuryKey; action: SafeAction; balance: number; onClose: () => void; onSaved: (message: string) => void }) {
  const isSafe = account === "safe";
  const place = isSafe ? "the safe" : "PayMongo";
  const reasons = action.type === "deposit" || action.type === "withdraw" || action.type === "payout" || action.type === "correct" ? safeReasons[action.type] : [];
  // A correction starts from what the entry is now (after any earlier corrections).
  const current = action.type === "correct" ? Math.abs(action.entry.amount + action.entry.correctedBy) : null;
  const [amount, setAmount] = useState(current === null ? "" : current.toFixed(2));
  const [reason, setReason] = useState(reasons[0] ?? "");
  const [otherReason, setOtherReason] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const value = amount.trim() === "" ? null : Number(amount);
  const finalReason = reason === "__other__" ? otherReason.trim() : reason;

  // What the balance becomes, shown before saving.
  let change: number | null = null;
  if (value !== null && Number.isFinite(value)) {
    if (action.type === "deposit") change = value;
    if (action.type === "withdraw" || action.type === "payout") change = -value;
    if (action.type === "open") change = value;
    if (action.type === "count") change = value - balance;
    if (action.type === "correct") change = (action.entry.amount < 0 ? -value : value) - (action.entry.amount + action.entry.correctedBy);
  }
  const after = change === null ? null : (action.type === "open" ? change : balance + change);

  const titles = {
    open: isSafe ? "Count the safe to start" : "Start the PayMongo account", deposit: "Deposit to the safe", withdraw: "Withdraw from the safe",
    payout: "Record a PayMongo payout", count: isSafe ? "Count the safe" : "Check against PayMongo", correct: "Correct an entry",
  };
  const messages = {
    open: isSafe
      ? <>Count the cash in the safe now and enter the total. From then on every shift takes its float from the safe and puts its closing cash back, and the history starts here. Include any cash left in the drawer from the last closing, as the next shift starts by taking its whole float from the safe.</>
      : <>Open the PayMongo dashboard, go to <b>Payouts</b>, and enter the <b>Upcoming payout balance</b>. From then on every closing adds the shift’s GCash payments here and takes off PayMongo’s fees.</>,
    deposit: <>Cash put into the safe from outside the shifts, for example the owner’s own money or extra change. The safe has <b>{peso(balance)}</b> now.</>,
    withdraw: <>Cash taken out of the safe, for example the owner taking cash or paying a supplier. The safe has <b>{peso(balance)}</b> now and cannot go below ₱0.</>,
    payout: <>The amount PayMongo paid out to the owner, as shown in the PayMongo dashboard’s payout history. PayMongo has <b>{peso(balance)}</b> recorded now.</>,
    count: isSafe
      ? <>Count the cash in the safe and enter the total. If it differs from the <b>{peso(balance)}</b> recorded, the difference is saved as a correction, so the safe matches what is really there.</>
      : <>Enter the <b>Upcoming payout balance</b> from the PayMongo dashboard. If it differs from the <b>{peso(balance)}</b> recorded, the difference is saved as a correction (for example a fee that was not known at closing).</>,
    correct: action.type === "correct" ? <>Enter what this {safeKindLabels[action.entry.kind]?.toLowerCase() ?? "entry"} should have been. It stays in the history as it was; the difference is saved as a correction linked to it.</> : null,
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value === null || !Number.isFinite(value) || value < 0 || ((action.type === "deposit" || action.type === "withdraw" || action.type === "payout") && value === 0)) { setError(action.type === "open" || action.type === "count" ? "Enter the balance (0 or more)." : "Enter the amount."); return; }
    if (reasons.length && !finalReason) { setError("Choose or type a reason."); return; }
    if (after !== null && after < -0.004) { setError(`${isSafe ? "The safe" : "PayMongo"} only has ${peso(balance)} recorded. It cannot go below ₱0.`); return; }
    if (!password) { setError("Enter your password to confirm."); return; }
    setSaving(true);
    setError("");
    try {
      const body = { account, action: action.type, amount: value, reason: finalReason, note, password, entry_id: action.type === "correct" ? action.entry.id : undefined };
      const response = await fetch("/api/treasury", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (payload?.code === "wrong_password") setPassword("");
      if (!response.ok) throw new Error(payload?.error || "Could not update the treasury.");
      onSaved(payload?.data?.message ?? `${titles[action.type]}: saved. ${isSafe ? "The safe" : "PayMongo"} now has ${peso(Number(payload?.data?.balance ?? 0))}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update the treasury.");
    } finally {
      setSaving(false);
    }
  }

  const outgoing = action.type === "withdraw" || action.type === "payout";
  const amountLabel = action.type === "open" || action.type === "count" ? (isSafe ? "Cash counted in the safe" : "Upcoming payout balance") : action.type === "correct" ? "It should have been" : action.type === "payout" ? "Amount paid out" : "Amount";
  return <Modal onClose={onClose} closeDisabled={saving} label={titles[action.type]}>
    <form onSubmit={submit} className="ui-confirm" style={{ width: "min(100%, 460px)" }}>
      <div className="ui-confirm-icon" data-tone="default" aria-hidden="true" style={{ background: outgoing ? "#FEE2E2" : "#DCFCE7", color: outgoing ? "#B91C1C" : "#15803D" }}>{isSafe ? <IconSafe size={22} /> : <IconWallet size={22} />}</div>
      <h2>{titles[action.type]}</h2>
      <div className="ui-confirm-message">{messages[action.type]}</div>
      {action.type === "correct" && <p className="tre-fixing">Entry #{action.entry.id} · {safeKindLabels[action.entry.kind]} · {action.entry.reason} · {shiftTime(action.entry.createdAt)} · now {peso(current ?? 0)}</p>}
      <label className="acc-money">
        <span>{amountLabel}</span>
        <span className="acc-money-field"><b>₱</b><MoneyField data-autofocus value={amount} onChange={(typed) => { setAmount(typed); setError(""); }} placeholder="0.00" /></span>
        {after !== null && change !== null && Math.abs(change) >= 0.005 && action.type !== "open" && <em style={{ color: after < 0 ? "#B91C1C" : "#6B4C3B" }}>{change > 0 ? "+" : "−"}{peso(Math.abs(change))} · {place} will have {peso(after)}</em>}
        {action.type === "count" && change !== null && Math.abs(change) < 0.005 && <em style={{ color: "#15803D" }}>Matches the record</em>}
      </label>
      {reasons.length > 0 && <>
        <div className="menu-chips" role="group" aria-label="Reason" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {[...reasons, "__other__"].map((option) => <button key={option} type="button" aria-pressed={reason === option} onClick={() => { setReason(option); setError(""); }}>{option === "__other__" ? "Other…" : option}</button>)}
        </div>
        {reason === "__other__" && <input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} maxLength={80} placeholder="Type the reason" aria-label="Reason" style={{ ...packagingInput, marginTop: 8 }} />}
      </>}
      <label className="acc-money">
        <span>Note <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder={action.type === "payout" ? "e.g. the payout reference from PayMongo" : action.type === "withdraw" ? "e.g. what it was for" : "e.g. who counted it"} style={packagingInput} />
      </label>
      <label className="acc-money">
        <span>Your password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={packagingInput} />
      </label>
      {error && <p role="alert" className="acc-error" style={{ marginTop: 10 }}>{error}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button ui-button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className={`ui-button ${outgoing ? "ui-button-danger" : "ui-button-primary"}`} disabled={saving}>{saving ? "Saving…" : action.type === "open" ? (isSafe ? "Start the safe" : "Start PayMongo") : action.type === "count" ? (isSafe ? "Save the count" : "Save the check") : action.type === "correct" ? "Save the correction" : action.type === "deposit" ? "Deposit" : action.type === "payout" ? "Record payout" : "Withdraw"}</button>
      </div>
    </form>
  </Modal>;
}

function Treasury() {
  const [today] = useState(() => getFinanceDateStamp());
  const presets = useMemo(() => financePresets(today), [today]);
  const [accountKey, setAccountKey] = useState<TreasuryKey>("safe");
  const [presetId, setPresetId] = useState("30");
  const [custom, setCustom] = useState({ start: addDays(today, -29), end: today });
  const [data, setData] = useState<TreasuryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<SafeAction | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const preset = presets.find((entry) => entry.id === presetId);
  const start = preset ? preset.start : custom.start;
  const end = preset ? preset.end : custom.end;
  const rangeValid = Boolean(start && end && start <= end);

  useEffect(() => {
    if (!rangeValid) return;
    let active = true;
    const load = async (quiet: boolean) => {
      if (!quiet) { setLoading(true); setLoadError(""); }
      try {
        const response = await fetch(`/api/treasury?account=${accountKey}&start=${start}&end=${end}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the treasury.");
        if (active) { setData(payload.data); setLoadError(""); }
      } catch (error) {
        if (active && !quiet) setLoadError(error instanceof Error ? error.message : "Could not load the treasury.");
      } finally {
        if (active && !quiet) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void load(false), 0);
    // Shifts move the accounts too, so keep them current while the page is open.
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 30_000);
    return () => { active = false; window.clearTimeout(timer); window.clearInterval(interval); };
  }, [accountKey, start, end, rangeValid, reloadKey]);

  function chooseAccount(next: TreasuryKey) {
    setAccountKey(next);
    setGroup("all");
    setNotice("");
  }

  function saved(message: string) {
    setAction(null);
    setNotice(message);
    setReloadKey((key) => key + 1);
  }

  if (loading && !data) return <div className="inv-wrap"><div className="inv"><div className="inv-empty">Loading the treasury…</div></div></div>;
  if (loadError && !data) return <div className="inv-wrap"><div className="inv"><div className="inv-empty is-error">{loadError} <button type="button" className="inv-link" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div></div></div>;
  if (!data) return null;

  const isSafe = accountKey === "safe";
  // While switching, the data on screen may still be the other account's.
  const current = data.account === accountKey;
  const account = isSafe ? data.safe : data.paymongo;
  const groups = treasuryKindGroups[accountKey];
  const query = search.trim().toLowerCase();
  const entries = current ? data.entries : [];
  const kinds = groups.find((entry) => entry.id === group)?.kinds;
  const shown = entries.filter((entry) => (!kinds || kinds.includes(entry.kind))
    && (!query || [entry.reason, entry.note ?? "", entry.by ?? "", safeKindLabels[entry.kind] ?? "", entry.shiftId ? `#${entry.shiftId}` : "", `#${entry.id}`].some((text) => text.toLowerCase().includes(query))));
  const counts = Object.fromEntries(groups.map((entry) => [entry.id, entries.filter((item) => groups.find((g) => g.id === entry.id)!.kinds.includes(item.kind)).length]));
  const total = (data.safe.live ? data.safe.balance : 0) + (data.paymongo.live ? data.paymongo.balance : 0);
  const rangeText = rangeValid ? formatRange(start, end) : "";

  const accountTabs = <div className="tre-top">
    <div className="inv-tabs" role="tablist" aria-label="Accounts">
      <button type="button" role="tab" aria-selected={isSafe} onClick={() => chooseAccount("safe")}><IconSafe size={15} />Safe<span className="tre-tab-amount">{data.safe.live ? peso(data.safe.balance) : "not started"}</span></button>
      <button type="button" role="tab" aria-selected={!isSafe} onClick={() => chooseAccount("paymongo")}><IconWallet size={15} />PayMongo<span className="tre-tab-amount">{data.paymongo.live ? peso(data.paymongo.balance) : "not started"}</span></button>
    </div>
    {(data.safe.live || data.paymongo.live) && <p className="tre-total"><span>Brew Houze has</span><strong>{peso(total)}</strong><em>{[data.safe.live && "safe", data.paymongo.live && "PayMongo"].filter(Boolean).join(" + ")}</em></p>}
  </div>;

  // Before go live: one step, counting the safe or reading the PayMongo dashboard.
  if (!account.live) return <div className="inv-wrap"><div className="inv">
    {accountTabs}
    {notice && <div className="acc-notice" role="status">{notice}</div>}
    {isSafe ? <section className="tre-start">
      <span className="tre-start-icon"><IconSafe size={30} /></span>
      <h2>Start the safe</h2>
      <p>The safe is where Brew Houze’s cash lives between shifts. Once it is started, every opening takes its float from the safe, every closing puts its cash back (keeping what you leave in the drawer for the next shift), and cash drops go into it. Deposits and withdrawals are recorded here, so you always know how much the business has.</p>
      <ol>
        <li>Count all the cash in the safe, plus any left in the drawer from the last closing.</li>
        <li>Enter the total. That is the safe’s opening balance; its history starts there.</li>
      </ol>
      <button type="button" className="inv-primary" onClick={() => setAction({ type: "open" })}><IconSafe size={16} />Count the safe</button>
      <p className="inv-hint">Until then, shifts open and close as they do now and nothing moves in or out of the safe.</p>
    </section> : <section className="tre-start">
      <span className="tre-start-icon"><IconWallet size={30} /></span>
      <h2>Start the PayMongo account</h2>
      <p>GCash payments go through PayMongo, which keeps a fee on each one and pays the rest out to the owner once a week. This page keeps track of the money PayMongo is holding: every closing adds the shift’s GCash payments and takes off PayMongo’s fees, and you record each payout when it arrives.</p>
      <ol>
        <li>Open the PayMongo dashboard and go to Payouts.</li>
        <li>Enter the Upcoming payout balance. That is this account’s opening balance; its history starts there.</li>
      </ol>
      <button type="button" className="inv-primary" onClick={() => setAction({ type: "open" })}><IconWallet size={16} />Start PayMongo</button>
      <p className="inv-hint">Until then, GCash payments are recorded with their fees as usual, but nothing is added here.</p>
    </section>}
    {action && <SafeActionDialog account={accountKey} action={action} balance={account.balance} onClose={() => setAction(null)} onSaved={saved} />}
  </div></div>;

  return <div className="inv-wrap">
    <div className="inv">
      {accountTabs}
      <div className="inv-summary">
        <div className="inv-stat is-static tre-balance"><span>{isSafe ? "In the safe now" : "With PayMongo now"}</span><strong>{peso(account.balance)}</strong><em>since {account.openedAt ? shiftTime(account.openedAt) : "—"}</em></div>
        {isSafe ? <>
          <div className="inv-stat is-static"><span>Money in</span><strong style={{ color: "#15803D" }}>+{peso(current ? data.range.moneyIn : 0)}</strong><em>{rangeText}</em></div>
          <div className="inv-stat is-static"><span>Money out</span><strong style={{ color: "#B91C1C" }}>−{peso(current ? data.range.moneyOut : 0)}</strong><em>{rangeText}</em></div>
          <div className="inv-stat is-static"><span>Left in the drawer</span><strong>{peso(data.lastFloat)}</strong><em>by the last closing, for the next shift</em></div>
        </> : <>
          <div className="inv-stat is-static"><span>GCash in</span><strong style={{ color: "#15803D" }}>+{peso(current ? data.range.moneyIn : 0)}</strong><em>{rangeText}</em></div>
          <div className="inv-stat is-static"><span>PayMongo fees</span><strong style={{ color: "#B45309" }}>−{peso(current ? data.range.fees : 0)}</strong><em>{current && data.range.moneyIn > 0 ? `${((data.range.fees / data.range.moneyIn) * 100).toFixed(1)}% of the GCash in` : rangeText}</em></div>
          <div className="inv-stat is-static"><span>Paid out</span><strong style={{ color: "#B91C1C" }}>−{peso(current ? Math.max(0, data.range.moneyOut - data.range.fees) : 0)}</strong><em>to the owner, {rangeText}</em></div>
        </>}
      </div>

      <div className="inv-head">
        <div className="flex flex-wrap gap-2">
          {isSafe ? <>
            <button type="button" className="inv-primary" onClick={() => { setNotice(""); setAction({ type: "deposit" }); }}><IconPlus size={14} />Deposit</button>
            <button type="button" className="inv-secondary" onClick={() => { setNotice(""); setAction({ type: "withdraw" }); }}>Withdraw</button>
            <button type="button" className="inv-secondary" onClick={() => { setNotice(""); setAction({ type: "count" }); }}><IconSafe size={15} />Count the safe</button>
          </> : <>
            <button type="button" className="inv-primary" onClick={() => { setNotice(""); setAction({ type: "payout" }); }}>Record a payout</button>
            <button type="button" className="inv-secondary" onClick={() => { setNotice(""); setAction({ type: "count" }); }}><IconWallet size={15} />Check against PayMongo</button>
          </>}
        </div>
        <button type="button" className="inv-secondary" onClick={() => exportSafeEntries(data, rangeText, start === end ? start : `${start}-to-${end}`)} disabled={!current || data.entries.length === 0}><IconDownload size={14} />Export</button>
      </div>

      {notice && <div className="acc-notice" role="status">{notice}</div>}

      <div className="fin-datebar">
        <div className="menu-chips" role="group" aria-label="Period">
          {presets.map((entry) => <button key={entry.id} type="button" aria-pressed={presetId === entry.id} onClick={() => setPresetId(entry.id)}>{entry.label}</button>)}
          <button type="button" aria-pressed={presetId === "custom"} onClick={() => { setCustom({ start, end }); setPresetId("custom"); }}>Custom</button>
        </div>
        {presetId === "custom" && <div className="inv-dates">
          <input type="date" value={custom.start} max={custom.end || today} onChange={(event) => setCustom((value) => ({ ...value, start: event.target.value }))} aria-label="From" />
          <span>to</span>
          <input type="date" value={custom.end} min={custom.start} max={today} onChange={(event) => setCustom((value) => ({ ...value, end: event.target.value }))} aria-label="To" />
        </div>}
        {rangeValid && current && <p className="tre-flow">
          <span>Start <b>{peso(data.range.opening)}</b></span><span className="is-in">+ in <b>{peso(data.range.moneyIn)}</b></span><span className="is-out">− out <b>{peso(data.range.moneyOut)}</b></span><span>= end <b>{peso(data.range.closing)}</b></span>
        </p>}
      </div>

      <div className="menu-chips" role="group" aria-label="Kind of entry">
        <button type="button" aria-pressed={group === "all"} onClick={() => setGroup("all")}>All<b>{entries.length}</b></button>
        {groups.map((entry) => <button key={entry.id} type="button" aria-pressed={group === entry.id} onClick={() => setGroup(entry.id)}>{entry.label}<b>{counts[entry.id] ?? 0}</b></button>)}
      </div>
      <div className="inv-toolbar">
        <div className="inv-search is-wide">
          <IconSearch size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reason, note, employee or shift #" />
          {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
        </div>
      </div>
      <p className="inv-hint">{isSafe
        ? "Newest first. Shift moves are made by the shifts themselves: the float taken at opening, cash drops and cash ins, and the cash put back at closing. Nothing here can be edited or deleted; a deposit or withdrawal with a wrong amount is fixed with a correction, anything else by counting the safe."
        : "Newest first. Each closing adds the GCash its customers paid through PayMongo and takes off the fees PayMongo kept, read from PayMongo itself. A voided or refunded GCash order stays in, because PayMongo still holds that payment (the money goes back to the customer by hand). Record each payout when it arrives, and check against the PayMongo dashboard now and then."}</p>
      {loadError && <div className="inv-alert" role="alert"><span>{loadError}</span><button type="button" onClick={() => setLoadError("")} title="Dismiss"><IconX size={14} /></button></div>}

      {!rangeValid ? <div className="inv-empty is-error">The start date must be on or before the end date.</div>
        : !current ? <div className="inv-empty">Loading…</div>
          : shown.length === 0 ? <div className="inv-empty">{entries.length === 0 ? `No ${isSafe ? "safe" : "PayMongo"} moves in this period.` : "Nothing matches these filters."}</div>
            : <ul className="tre-list" style={{ opacity: loading ? 0.6 : 1 }}>
              {shown.map((entry) => {
                const correctable = treasuryCorrectable[accountKey].includes(entry.kind);
                return <li key={entry.id} className={entry.amount >= 0 ? "is-in" : "is-out"}>
                  <span className="tre-when"><strong>{shiftTime(entry.createdAt)}</strong><em>#{entry.id}</em></span>
                  <span className="tre-what">
                    <strong>{safeKindLabels[entry.kind] ?? entry.kind}<span>{entry.reason}</span></strong>
                    <em>
                      {entry.by ? `${entry.by}${entry.source === "cashier" ? " (staff app)" : ""}` : "Recorded automatically"}
                      {entry.shiftId && ` · shift #${entry.shiftId}`}
                      {entry.correctsEntryId && ` · fixes #${entry.correctsEntryId}`}
                      {entry.note && ` · ${entry.note}`}
                    </em>
                    {Math.abs(entry.correctedBy) >= 0.005 && <i className="tre-tag">Corrected to {peso(Math.abs(entry.amount + entry.correctedBy))}</i>}
                  </span>
                  <span className="tre-amount"><strong>{entry.amount >= 0 ? "+" : "−"}{peso(Math.abs(entry.amount))}</strong><em>balance {peso(entry.balanceAfter)}</em></span>
                  <span className="tre-act">{correctable && <button type="button" className="inv-mini" onClick={() => { setNotice(""); setAction({ type: "correct", entry }); }}><IconPencil size={12} />Correct</button>}</span>
                </li>;
              })}
            </ul>}
      {current && data.truncated && <p className="inv-hint">Showing the newest {data.entries.length} entries. Choose a shorter period to see older ones.</p>}
    </div>
    {action && <SafeActionDialog account={accountKey} action={action} balance={account.balance} onClose={() => setAction(null)} onSaved={saved} />}
  </div>;
}

type EmployeeTimeLog = { id: number; timeIn: string; timeOut: string | null; shiftId?: number | null };
type EmployeeTransaction = { id: number; amount: number; status: string; createdAt: string; reversalType: string | null; reversedAt: string | null; queueNumber?: number | null; shiftId?: number | null };
type EmployeeReversal = { id: number; amount: number; status: string; reversedAt: string | null };
type ArchivingLogEntry = { kind: string; name: string; archivedAt: string };
type EmployeeStats = { hoursThisWeek: number; hours30d: number; shifts30d: number; orders30d: number; sales30d: number; reversals30d: number };
type CashierAccount = {
  id: number; fullName: string; email: string; role: string; isActive: boolean;
  canVoidOrders: boolean; canRefundOrders: boolean; canOpenShift: boolean; canCloseShift: boolean;
  createdAt?: string; onDutySince: string | null; lastSeenAt: string | null; stats: EmployeeStats;
  timeLogs: EmployeeTimeLog[]; transactions: EmployeeTransaction[]; reversals: EmployeeReversal[]; sessions?: AccountDevice[];
};
type MyActivity = { fullName: string; email: string; timeLogs: EmployeeTimeLog[]; transactions: EmployeeTransaction[]; reversals: EmployeeReversal[]; archives: ArchivingLogEntry[] };

type AccountDevice = { id: number; app: string; device: string; signedInAt: string; lastSeenAt: string };

function attendanceColumns(): ExcelColumn<EmployeeTimeLog>[] {
  return [
    { header: "Shift", value: (log) => log.shiftId ? `#${log.shiftId}` : "" },
    { header: "Time in", value: (log) => excelDateTime(log.timeIn) },
    { header: "Time out", value: (log) => log.timeOut ? excelDateTime(log.timeOut) : "Still on duty" },
    { header: "Hours", value: (log) => Math.round(logDuration(log, Date.now()) * 100) / 100, kind: "hours" },
  ];
}

type EmployeePeriod = "today" | "week" | "7" | "30" | "all";
const employeePeriodLabels: Record<EmployeePeriod, string> = { today: "Today", week: "This week", "7": "7 days", "30": "30 days", all: "All" };

function EmployeePeriodPicker({ value, onChange, options }: { value: EmployeePeriod; onChange: (value: EmployeePeriod) => void; options: EmployeePeriod[] }) {
  return <div className="inv-range" role="group" aria-label="Period">
    {options.map((option) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>{employeePeriodLabels[option]}</button>)}
  </div>;
}

function formatHours(hours: number): string {
  if (hours <= 0) return "0h";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)}h`;
}

function logDuration(log: EmployeeTimeLog, now: number): number {
  return Math.max(0, ((log.timeOut ? new Date(log.timeOut).getTime() : now) - new Date(log.timeIn).getTime()) / 3_600_000);
}

// A readable temporary password: no look-alike characters (0/O, 1/l/I).
function generateTemporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function PermissionSwitch({ checked, title, description, onChange, disabled = false }: { checked: boolean; title: string; description: string; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className={`acc-switch${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}`}>
    <span className="acc-switch-text"><strong>{title}</strong><em>{description}</em></span>
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span className="acc-switch-track" aria-hidden="true"><span /></span>
  </label>;
}

// Cashiers run the register; baristas only see and manage the bar queue in the staff app,
// kitchen staff the kitchen queue, and riders only the deliveries.
type StaffRole = "cashier" | "barista" | "kitchen" | "rider";
const STAFF_ROLE_OPTIONS: { id: StaffRole; title: string; description: string }[] = [
  { id: "cashier", title: "Cashier", description: "Takes orders and payments, and manages the queue." },
  { id: "barista", title: "Barista", description: "Makes the drinks: sees the bar queue and hands orders over. No register, cash or refunds." },
  { id: "kitchen", title: "Kitchen staff", description: "Makes the food: sees only the kitchen queue. No register, cash or refunds." },
  { id: "rider", title: "Rider", description: "Only sees the deliveries: picks up, delivers, collects cash on delivery." },
];
function staffRoleOf(role: string): StaffRole {
  const value = role.toLowerCase();
  return value === "barista" ? "barista" : value === "kitchen" ? "kitchen" : value === "rider" ? "rider" : "cashier";
}
const staffRoleLabel = (role: string) => ({ cashier: "Cashier", barista: "Barista", kitchen: "Kitchen staff", rider: "Rider" })[staffRoleOf(role)];
function RolePicker({ value, disabled = false, onChange }: { value: StaffRole; disabled?: boolean; onChange: (role: StaffRole) => void }) {
  return <div className="acc-role-picker" role="radiogroup" aria-label="Role">
    {STAFF_ROLE_OPTIONS.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} disabled={disabled} onClick={() => onChange(option.id)}>
      <strong>{option.title}</strong><em>{option.description}</em>
    </button>)}
  </div>;
}

// Devices the employee is signed in on right now, with a way to end all of them (lost phone,
// employee leaving). Their cashier attendance ends too, since they are no longer signed in anywhere.
function AccountDevicesPanel({ account, onSignedOut }: { account: CashierAccount; onSignedOut: () => void }) {
  const confirmAction = useConfirm();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const devices = account.sessions ?? [];

  async function signOutEverywhere() {
    if (!(await confirmAction({ title: `Sign ${account.fullName} out everywhere?`, message: `They are signed out of ${devices.length} device${devices.length === 1 ? "" : "s"}, and any open attendance ends now. They can sign in again with their password.`, confirmLabel: "Sign out everywhere" }))) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/cashier-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, action: "sign_out_everywhere" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not sign the account out.");
      onSignedOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign the account out.");
    } finally {
      setWorking(false);
    }
  }

  return <section className="acc-block">
    <header className="acc-block-head">
      <div><h3>Signed-in devices <span>({devices.length})</span></h3><p>Where this account is signed in right now.</p></div>
      {devices.length > 0 && <button type="button" className="inv-mini is-danger" onClick={() => void signOutEverywhere()} disabled={working}>{working ? "Signing out…" : "Sign out everywhere"}</button>}
    </header>
    {devices.length === 0
      ? <p className="inv-hint">Not signed in anywhere right now.</p>
      : <ul className="acc-list">
        {devices.map((device) => <li key={device.id}>
          <span><strong>{device.device}</strong><span className={`acc-app is-${device.app}`}>{device.app === "cashier" ? "Staff app" : "Admin app"}</span></span>
          <em>active {shiftTime(device.lastSeenAt)}</em>
        </li>)}
      </ul>}
    {error && <p role="alert" className="acc-error">{error}</p>}
  </section>;
}

function AddEmployeeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState({ fullName: "", email: "", password: "", role: "cashier" as StaffRole, canOpenShift: false, canCloseShift: false, canVoidOrders: false, canRefundOrders: false });
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const problem = !draft.fullName.trim() ? "Enter their full name." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) ? "Enter a valid email address." : draft.password.length < 8 ? "Give a temporary password of at least 8 characters." : "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem || saving) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/cashier-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, fullName: draft.fullName.trim(), email: draft.email.trim(), ...(draft.role !== "cashier" ? { canOpenShift: false, canCloseShift: false, canVoidOrders: false, canRefundOrders: false } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not add the employee.");
      setCreated({ name: draft.fullName.trim(), email: draft.email.trim().toLowerCase(), password: draft.password });
      await onCreated();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add the employee.");
    } finally {
      setSaving(false);
    }
  }

  if (created) return <Modal onClose={onClose} label="Employee added">
    <section className="ui-confirm" style={{ width: "min(100%, 460px)" }}>
      <div className="ui-confirm-icon" data-tone="default" aria-hidden="true" style={{ background: "#DCFCE7", color: "#15803D" }}>✓</div>
      <h2>{created.name} can now sign in</h2>
      <div className="ui-confirm-message">Give them these details for the staff app. They can change the password in My Account after signing in.</div>
      <div className="acc-credentials">
        <div><span>Email</span><strong>{created.email}</strong></div>
        <div><span>Temporary password</span><strong className="is-mono">{created.password}</strong></div>
      </div>
      <div className="ui-confirm-actions"><button type="button" className="ui-button ui-button-primary" data-autofocus onClick={onClose}>Done</button></div>
    </section>
  </Modal>;

  return <Modal onClose={onClose} closeDisabled={saving} label="Add employee">
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title="Add an employee" sub="An account for the staff app on the counter tablet." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        <div className="inv-step-grid">
          <WizardField label="Full name"><input data-autofocus value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="e.g. Maria Santos" style={packagingInput} autoComplete="off" /></WizardField>
          <WizardField label="Email" hint="Used to sign in and to reset a forgotten password."><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@gmail.com" style={packagingInput} autoComplete="off" /></WizardField>
        </div>
        <WizardField label="Temporary password" hint="At least 8 characters. Share it with them in person.">
          <div className="flex gap-2">
            <input type={showPassword ? "text" : "password"} value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Type or generate one" style={{ ...packagingInput, fontFamily: "JetBrains Mono, monospace" }} autoComplete="new-password" />
            <button type="button" className="inv-mini" style={{ height: 42 }} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
            <button type="button" className="inv-mini" style={{ height: 42 }} onClick={() => { setDraft((current) => ({ ...current, password: generateTemporaryPassword() })); setShowPassword(true); }}>Generate</button>
          </div>
        </WizardField>
        <WizardField label="Role"><RolePicker value={draft.role} onChange={(role) => setDraft((current) => ({ ...current, role }))} /></WizardField>
        {draft.role === "cashier" && <div className="acc-switches">
          <PermissionSwitch checked={draft.canOpenShift} title="Open the store" description="Start the shift and enter the starting cash. Otherwise an admin opens it." onChange={(checked) => setDraft((current) => ({ ...current, canOpenShift: checked }))} />
          <PermissionSwitch checked={draft.canCloseShift} title="Close the shift" description="Count the drawer, end the business day and sign everyone out. Otherwise an admin closes it." onChange={(checked) => setDraft((current) => ({ ...current, canCloseShift: checked }))} />
          <PermissionSwitch checked={draft.canVoidOrders} title="Void orders" description="Cancel an order and return its stock." onChange={(checked) => setDraft((current) => ({ ...current, canVoidOrders: checked }))} />
          <PermissionSwitch checked={draft.canRefundOrders} title="Refund orders" description="Give money back for a completed order." onChange={(checked) => setDraft((current) => ({ ...current, canRefundOrders: checked }))} />
        </div>}
        {error && <p role="alert" className="acc-error">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        {problem && <span className="inv-footer-note">{problem}</span>}
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Cancel</button>
        <button type="submit" disabled={saving || Boolean(problem)} className="ui-button ui-button-primary" style={{ opacity: saving || problem ? 0.55 : 1 }}>{saving ? "Adding…" : "Add employee"}</button>
      </div>
    </form>
  </Modal>;
}

function EmployeeDialog({ account, now, exporting, onClose, onChanged, onReload, onExport }: { account: CashierAccount; now: number; exporting: boolean; onClose: () => void; onChanged: (account: CashierAccount) => void; onReload: () => Promise<void>; onExport: () => void }) {
  const confirmAction = useConfirm();
  const [tab, setTab] = useState<"access" | "activity" | "attendance">("access");
  // Filters for the Sales activity and Attendance tabs (on the records loaded for this person).
  const [salesPeriod, setSalesPeriod] = useState<EmployeePeriod>("30");
  const [salesStatus, setSalesStatus] = useState<"all" | "completed" | "voided" | "refunded">("all");
  const [salesShift, setSalesShift] = useState("all");
  const [salesSearch, setSalesSearch] = useState("");
  const [attendancePeriod, setAttendancePeriod] = useState<EmployeePeriod>("30");
  const [attendanceShift, setAttendanceShift] = useState("all");
  const today = getFinanceDateStamp();
  const inPeriod = (value: string | null, period: EmployeePeriod) => {
    if (!value) return period === "all";
    const day = manilaDay(value);
    if (period === "all") return true;
    if (period === "today") return day === today;
    if (period === "week") return day >= addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    return day >= addDays(today, 1 - Number(period));
  };
  const salesQuery = salesSearch.trim().replace(/^#/, "");
  const shownTransactions = account.transactions.filter((transaction) => inPeriod(transaction.createdAt, salesPeriod)
    && (salesStatus === "all" || orderStatusOf(transaction) === salesStatus)
    && (salesShift === "all" || String(transaction.shiftId ?? "") === salesShift)
    && (!salesQuery || String(transaction.id) === salesQuery || String(transaction.queueNumber ?? "") === salesQuery));
  const shownReversals = account.reversals.filter((reversal) => inPeriod(reversal.reversedAt, salesPeriod) && (!salesQuery || String(reversal.id) === salesQuery));
  const shownPaid = shownTransactions.filter((transaction) => orderStatusOf(transaction) === "completed");
  const salesShifts = Array.from(new Set(account.transactions.map((transaction) => transaction.shiftId).filter((id): id is number => id !== null && id !== undefined))).sort((a, b) => b - a);
  const shownLogs = account.timeLogs.filter((log) => inPeriod(log.timeIn, attendancePeriod) && (attendanceShift === "all" || String(log.shiftId ?? "") === attendanceShift));
  const attendanceShifts = Array.from(new Set(account.timeLogs.map((log) => log.shiftId).filter((id): id is number => id !== null && id !== undefined))).sort((a, b) => b - a);
  const shownHours = shownLogs.reduce((sum, log) => sum + logDuration(log, now), 0);
  const salesFiltered = salesPeriod !== "all" || salesStatus !== "all" || salesShift !== "all" || salesQuery !== "";
  const attendanceFiltered = attendancePeriod !== "all" || attendanceShift !== "all";
  const [profile, setProfile] = useState({ fullName: account.fullName, email: account.email });
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const profileChanged = profile.fullName.trim() !== account.fullName || profile.email.trim().toLowerCase() !== account.email.toLowerCase();

  async function patch(body: Record<string, unknown>, key: string, fallback: string) {
    setWorking(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cashier-accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, ...body }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || fallback);
      return payload.data;
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : fallback);
      return null;
    } finally {
      setWorking(null);
    }
  }

  async function setPermission(key: "canOpenShift" | "canCloseShift" | "canVoidOrders" | "canRefundOrders", value: boolean) {
    const previous = account;
    onChanged({ ...account, [key]: value });
    const saved = await patch({ [key]: value }, key, "Could not change the permission.");
    if (!saved) onChanged(previous);
  }

  async function setRole(role: StaffRole) {
    if (role === staffRoleOf(account.role)) return;
    if (role !== "cashier" && !(await confirmAction({ title: `Make ${account.fullName} a ${role}?`, message: role === "rider" ? "They will only see the deliveries. Their cashier permissions are turned off, and the register closes for them on their next tap." : role === "kitchen" ? "They will only see the kitchen queue. Their cashier permissions are turned off, and the register closes for them on their next tap." : "They will only see and manage the queue. Their cashier permissions are turned off, and the register closes for them on their next tap.", confirmLabel: `Make ${role}`, tone: "default" }))) return;
    const saved = await patch({ action: "set_role", role }, "role", "Could not change the role.");
    if (saved) { onChanged({ ...account, role: saved.role, canOpenShift: saved.canOpenShift, canCloseShift: saved.canCloseShift, canVoidOrders: saved.canVoidOrders, canRefundOrders: saved.canRefundOrders }); setNotice(role === "barista" ? "Now a barista. They only see the queue." : role === "kitchen" ? "Now kitchen staff. They only see the kitchen queue." : role === "rider" ? "Now a rider. They only see the deliveries." : "Now a cashier. Turn on any permissions they need."); }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileChanged) return;
    const saved = await patch({ action: "update_profile", fullName: profile.fullName.trim(), email: profile.email.trim() }, "profile", "Could not save the details.");
    if (saved) { onChanged({ ...account, fullName: saved.fullName, email: saved.email }); setNotice("Details saved."); }
  }

  async function savePassword() {
    if (password.length < 8) { setError("Use at least 8 characters for the password."); return; }
    if (!(await confirmAction({ title: `Set a new password for ${account.fullName}?`, message: "Their old password stops working, and they are signed out of every device. Give them the new password in person.", confirmLabel: "Set password", tone: "default" }))) return;
    const saved = await patch({ action: "set_password", password }, "password", "Could not set the password.");
    if (saved) { setNotice(`New password set: ${password}. They were signed out of ${saved.signedOutDevices} device${saved.signedOutDevices === 1 ? "" : "s"}.`); setPassword(""); await onReload(); }
  }

  async function setActive(isActive: boolean) {
    if (!isActive && !(await confirmAction({ title: `Deactivate ${account.fullName}?`, message: "They are signed out of every device and cannot sign in until the account is reactivated. Their sales and attendance records are kept.", confirmLabel: "Deactivate account" }))) return;
    const saved = await patch({ action: "set_active", isActive }, "active", "Could not change the account status.");
    if (saved) { onChanged({ ...account, isActive, sessions: isActive ? account.sessions : [], onDutySince: isActive ? account.onDutySince : null }); setNotice(isActive ? "Account reactivated. They can sign in again." : "Account deactivated."); await onReload(); }
  }

  const statusText = !account.isActive ? "Deactivated" : account.onDutySince ? `On duty since ${clockTime(account.onDutySince)}` : "Off duty";
  return <Modal onClose={onClose} closeDisabled={working !== null} labelledBy="employee-dialog-title">
    <section className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 680, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <header className="acc-dialog-head">
        <UserAvatar name={account.fullName} size={52} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 id="employee-dialog-title">{account.fullName}</h2>
          <p>{account.email}</p>
          <span className={`acc-role is-${staffRoleOf(account.role)}`}>{staffRoleLabel(account.role)}</span>{" "}
          <span className={`acc-status ${!account.isActive ? "is-off" : account.onDutySince ? "is-on" : ""}`}><i />{statusText}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inv-mini" onClick={onExport} disabled={exporting}><IconDownload size={13} />{exporting ? "Exporting…" : "Export"}</button>
          <button type="button" onClick={onClose} disabled={working !== null} title="Close" className="inv-mini" style={{ width: 34, padding: 0, justifyContent: "center" }}><IconX size={14} /></button>
        </div>
      </header>
      <div className="acc-tabs" role="tablist" aria-label="Employee sections">
        {([["access", "Access"], ["activity", "Sales activity"], ["attendance", "Attendance"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        {notice && <div className="acc-notice" role="status">{notice}</div>}
        {error && <p role="alert" className="acc-error">{error}</p>}

        {tab === "access" && <>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Role</h3><p>Changes apply right away, even on a signed-in tablet.</p></div></header>
            <RolePicker value={staffRoleOf(account.role)} disabled={working === "role" || !account.isActive} onChange={(role) => void setRole(role)} />
          </section>

          {staffRoleOf(account.role) === "cashier" && <section className="acc-block">
            <header className="acc-block-head"><div><h3>Permissions</h3><p>Changes apply right away, even on a signed-in tablet.</p></div></header>
            <div className="acc-switches">
              <PermissionSwitch checked={account.canOpenShift} disabled={working === "canOpenShift" || !account.isActive} title="Open the store" description="Start the shift and enter the starting cash. Without this, an admin opens the store." onChange={(checked) => void setPermission("canOpenShift", checked)} />
              <PermissionSwitch checked={account.canCloseShift} disabled={working === "canCloseShift" || !account.isActive} title="Close the shift" description="Count the drawer, end the business day and sign everyone out. Without this, an admin (or a cashier allowed) closes it." onChange={(checked) => void setPermission("canCloseShift", checked)} />
              <PermissionSwitch checked={account.canVoidOrders} disabled={working === "canVoidOrders" || !account.isActive} title="Void orders" description="Cancel an order and return its stock." onChange={(checked) => void setPermission("canVoidOrders", checked)} />
              <PermissionSwitch checked={account.canRefundOrders} disabled={working === "canRefundOrders" || !account.isActive} title="Refund orders" description="Give money back for a completed order." onChange={(checked) => void setPermission("canRefundOrders", checked)} />
            </div>
          </section>}

          <form className="acc-block" onSubmit={saveProfile}>
            <header className="acc-block-head"><div><h3>Details</h3><p>The email is used to sign in and to reset a forgotten password.</p></div></header>
            <div className="inv-step-grid">
              <WizardField label="Full name"><input value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} style={packagingInput} /></WizardField>
              <WizardField label="Email"><input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} style={packagingInput} /></WizardField>
            </div>
            {profileChanged && <div className="flex justify-end gap-2" style={{ marginTop: 10 }}>
              <button type="button" className="inv-mini" onClick={() => setProfile({ fullName: account.fullName, email: account.email })}>Undo</button>
              <button type="submit" className="inv-mini" style={{ background: "#3D2B1F", color: "#FDF9F5", borderColor: "#3D2B1F" }} disabled={working === "profile"}>{working === "profile" ? "Saving…" : "Save details"}</button>
            </div>}
          </form>

          <AccountDevicesPanel account={account} onSignedOut={() => { onChanged({ ...account, sessions: [], onDutySince: null }); void onReload(); }} />

          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Password</h3><p>Forgot it? They can also use “Forgot password” on the sign-in screen.</p></div></header>
            <div className="flex flex-wrap gap-2">
              <input type="text" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New temporary password" style={{ ...packagingInput, flex: "1 1 200px", width: "auto", fontFamily: "JetBrains Mono, monospace" }} autoComplete="new-password" aria-label="New temporary password" />
              <button type="button" className="inv-mini" style={{ height: 42 }} onClick={() => setPassword(generateTemporaryPassword())}>Generate</button>
              <button type="button" className="inv-mini" style={{ height: 42, background: "#3D2B1F", color: "#FDF9F5", borderColor: "#3D2B1F" }} onClick={() => void savePassword()} disabled={working === "password" || password.length === 0}>{working === "password" ? "Saving…" : "Set password"}</button>
            </div>
          </section>

          <section className={`acc-block ${account.isActive ? "is-danger" : ""}`}>
            <header className="acc-block-head">
              <div><h3>{account.isActive ? "Deactivate account" : "Account deactivated"}</h3><p>{account.isActive ? "For someone who left or is on leave. Their records are kept, and you can reactivate the account later." : "They cannot sign in. Reactivate to let them sign in again with their password."}</p></div>
              {account.isActive
                ? <button type="button" className="inv-mini is-danger" onClick={() => void setActive(false)} disabled={working === "active"}>Deactivate</button>
                : <button type="button" className="inv-mini" style={{ background: "#15803D", color: "#FFFFFF", borderColor: "#15803D" }} onClick={() => void setActive(true)} disabled={working === "active"}>Reactivate</button>}
            </header>
          </section>
        </>}

        {tab === "activity" && <>
          <div className="acc-stats">
            <div><span>Orders · 30 days</span><strong>{account.stats.orders30d}</strong></div>
            <div><span>Sales · 30 days</span><strong>{peso(account.stats.sales30d)}</strong></div>
            <div><span>Average order</span><strong>{account.stats.orders30d ? peso(account.stats.sales30d / account.stats.orders30d) : "—"}</strong></div>
            <div><span>Voids & refunds done</span><strong className={account.stats.reversals30d ? "dash-down" : ""}>{account.stats.reversals30d}</strong></div>
          </div>
          <div className="acc-filters">
            <EmployeePeriodPicker value={salesPeriod} onChange={setSalesPeriod} options={["today", "7", "30", "all"]} />
            <div className="inv-range" role="group" aria-label="Status">
              {([["all", "Any status"], ["completed", "Completed"], ["voided", "Voided"], ["refunded", "Refunded"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={salesStatus === id} onClick={() => setSalesStatus(id)}>{label}</button>)}
            </div>
            {salesShifts.length > 1 && <label className="inv-filter"><span>Shift</span><select value={salesShift} onChange={(event) => setSalesShift(event.target.value)} className={`inv-select${salesShift !== "all" ? " is-active" : ""}`}><option value="all">Any shift</option>{salesShifts.map((id) => <option key={id} value={String(id)}>Shift #{id}</option>)}</select></label>}
            <div className="inv-search" style={{ flex: "1 1 160px" }}>
              <IconSearch size={14} />
              <input value={salesSearch} onChange={(event) => setSalesSearch(event.target.value)} placeholder="Order or queue #" aria-label="Find an order or queue number" inputMode="numeric" />
              {salesSearch && <button type="button" onClick={() => setSalesSearch("")} title="Clear search"><IconX size={12} /></button>}
            </div>
          </div>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Orders punched in</h3><p>{shownTransactions.length} order{shownTransactions.length === 1 ? "" : "s"} shown · {peso(shownPaid.reduce((sum, transaction) => sum + transaction.amount, 0))} completed{shownTransactions.length !== shownPaid.length ? ` · ${shownTransactions.length - shownPaid.length} voided or refunded` : ""}</p></div>
              {salesFiltered && <button type="button" className="inv-link" onClick={() => { setSalesPeriod("all"); setSalesStatus("all"); setSalesShift("all"); setSalesSearch(""); }}>Clear filters</button>}</header>
            {shownTransactions.length === 0 ? <p className="inv-hint">{account.transactions.length === 0 ? "No orders yet." : "No orders match these filters."}</p> : <ul className="acc-list">
              {shownTransactions.map((transaction) => {
                const status = orderStatusOf(transaction);
                return <li key={transaction.id}>
                  <span><strong>Order {transaction.id}{transaction.queueNumber ? ` · #${transaction.queueNumber}` : ""}</strong><em>{shiftTime(transaction.createdAt)}{transaction.shiftId ? ` · Shift #${transaction.shiftId}` : ""}</em></span>
                  <span className="acc-list-end">{status !== "completed" && <span className={`fin-status is-${status}`}>{status === "voided" ? "Voided" : "Refunded"}</span>}<strong className={status !== "completed" ? "fin-order-total is-reversed" : ""}>{peso(transaction.amount)}</strong></span>
                </li>;
              })}
            </ul>}
          </section>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Voids & refunds they did</h3><p>Orders this person voided or refunded, whoever sold them{salesPeriod !== "all" ? " (in the period above)" : ""}.</p></div></header>
            {shownReversals.length === 0 ? <p className="inv-hint">{account.reversals.length === 0 ? "None yet." : "None in this period."}</p> : <ul className="acc-list">
              {shownReversals.map((reversal) => <li key={reversal.id}>
                <span><strong>Order {reversal.id}</strong><em>{reversal.reversedAt ? shiftTime(reversal.reversedAt) : "Unknown time"}</em></span>
                <span className="acc-list-end"><span className="fin-status is-voided" style={{ textTransform: "capitalize" }}>{reversal.status}</span><strong>{peso(reversal.amount)}</strong></span>
              </li>)}
            </ul>}
          </section>
        </>}

        {tab === "attendance" && <>
          <div className="acc-stats">
            <div><span>This week</span><strong>{formatHours(account.stats.hoursThisWeek)}</strong></div>
            <div><span>Last 30 days</span><strong>{formatHours(account.stats.hours30d)}</strong></div>
            <div><span>Shifts · 30 days</span><strong>{account.stats.shifts30d}</strong></div>
            <div><span>Status</span><strong className={account.onDutySince ? "dash-up" : ""}>{account.onDutySince ? "On duty" : "Off duty"}</strong></div>
          </div>
          <div className="acc-filters">
            <EmployeePeriodPicker value={attendancePeriod} onChange={setAttendancePeriod} options={["week", "7", "30", "all"]} />
            {attendanceShifts.length > 1 && <label className="inv-filter"><span>Shift</span><select value={attendanceShift} onChange={(event) => setAttendanceShift(event.target.value)} className={`inv-select${attendanceShift !== "all" ? " is-active" : ""}`}><option value="all">Any shift</option>{attendanceShifts.map((id) => <option key={id} value={String(id)}>Shift #{id}</option>)}</select></label>}
          </div>
          <section className="acc-block">
            <header className="acc-block-head">
              <div><h3>Time in and out</h3><p>{shownLogs.length} sign-in{shownLogs.length === 1 ? "" : "s"} · {workedLabel(shownHours * 60)} worked · {new Set(shownLogs.map((log) => log.shiftId).filter(Boolean)).size} shift{new Set(shownLogs.map((log) => log.shiftId).filter(Boolean)).size === 1 ? "" : "s"}</p></div>
              {attendanceFiltered && <button type="button" className="inv-link" onClick={() => { setAttendancePeriod("all"); setAttendanceShift("all"); }}>Clear filters</button>}
            </header>
            {shownLogs.length === 0 ? <p className="inv-hint">{account.timeLogs.length === 0 ? "No attendance yet." : "No sign-ins in this period."}</p> : <ul className="acc-list">
              {shownLogs.map((log) => <li key={log.id}>
                <span><strong>{new Date(log.timeIn).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" })}</strong><em>{clockTime(log.timeIn)} → {log.timeOut ? clockTime(log.timeOut) : "now"}{log.shiftId ? ` · Shift #${log.shiftId}` : ""}</em></span>
                <span className="acc-list-end">{log.timeOut ? <strong>{formatHours(logDuration(log, now))}</strong> : <span className="fin-status is-completed">On duty · {formatHours(logDuration(log, now))}</span>}</span>
              </li>)}
            </ul>}
            <p className="inv-hint" style={{ marginTop: 10 }}>Recorded when they sign in and out of the staff app. Closing a shift clocks everyone out. Kept permanently as the record of hours worked.</p>
          </section>
        </>}
      </div>
    </section>
  </Modal>;
}

// ─── Customers ─────────────────────────────────────────────────────────────────────────────────
// The café's customer directory: customers who made an account on the mobile menu, and profiles
// the admin made for regulars without one. Purchases fill in by themselves; notes are the café's
// own (never shown to the customer). Customers are never deleted, since their orders are sales
// records: a customer who asks to be forgotten has their personal details erased instead.

type Customer = {
  id: number; username: string | null; fullName: string; email: string | null; birthday: string | null; notes: string;
  isActive: boolean; hasLogin: boolean; consented: boolean; createdAt: string; createdBy: string | null;
  visits: number; visits30d: number; spent: number; lastVisit: string | null; favourite: string | null; devices: number;
  // Delivery: mobile number, saved addresses, and whether cash on delivery is blocked.
  phone?: string | null; codBlocked?: boolean; codBlockReason?: string | null;
  addresses?: { id: number; label: string; recipientName: string; phone: string; street: string; landmark: string | null; riderNotes: string | null; zoneName: string | null; isDefault: boolean }[];
  // A senior, PWD or other ID the café checked and remembered for discounts (never a photo).
  savedId?: { typeName: string; holderName: string; idNumber: string | null; verifiedAt: string; verifiedBy: string | null } | null;
  // Stars in the running loyalty campaign (null when none is running).
  stars: number | null;
};
type CustomerOrder = { id: number; queueNumber: number | null; shiftId: number | null; status: string; total: number; discountLabel?: string | null; discountTotal?: number; paymentMethod: string; source: "mobile" | "counter"; createdAt: string; punchedBy: string; items: string };
type CustomerDetail = { orders: CustomerOrder[]; devices: { device: string; signedInAt: string; lastSeenAt: string }[]; starEntries: StarEntry[] };
type CustomerFilter = "active" | "app" | "profile" | "inactive";
type CustomerSort = "name" | "recent" | "visits" | "spent";

const CUSTOMERS_PAGE_SIZE = 48;

function IconHeart({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
}

function birthdayLabel(birthday: string | null): string {
  if (!birthday) return "";
  const date = new Date(`${birthday}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-PH", { timeZone: "UTC", month: "long", day: "numeric" });
}

function birthdayThisMonth(birthday: string | null): boolean {
  return Boolean(birthday) && birthday!.slice(5, 7) === getFinanceDateStamp().slice(5, 7);
}

async function patchCustomer(body: Record<string, unknown>, fallback: string) {
  const response = await fetch("/api/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || fallback);
  return payload.data;
}

function customerOrderColumns(): ExcelColumn<CustomerOrder>[] {
  return [
    { header: "Order", value: (order) => order.id, kind: "count" },
    { header: "Queue #", value: (order) => order.queueNumber ?? "" },
    { header: "Date and time", value: (order) => excelDateTime(order.createdAt) },
    { header: "Shift", value: (order) => order.shiftId ?? "" },
    { header: "Ordered at", value: (order) => order.source === "mobile" ? "Mobile menu" : "Counter" },
    { header: "Punched by", value: (order) => order.punchedBy },
    { header: "Items", value: (order) => order.items },
    { header: "Status", value: (order) => order.status === "voided" ? "Voided" : order.status === "refunded" ? "Refunded" : "Completed" },
    { header: "Discount", value: (order) => order.discountTotal || null, kind: "money" },
    { header: "Discount for", value: (order) => order.discountLabel ?? "" },
    { header: "Total", value: (order) => order.total, kind: "money" },
  ];
}

function customerListColumns(): ExcelColumn<Customer>[] {
  return [
    { header: "Customer", value: (customer) => customer.fullName },
    { header: "Username", value: (customer) => customer.username ? `@${customer.username}` : "No login" },
    { header: "Email", value: (customer) => customer.email ?? "" },
    { header: "Birthday", value: (customer) => birthdayLabel(customer.birthday) },
    { header: "Status", value: (customer) => customer.isActive ? "Active" : "Deactivated" },
    { header: "Visits", value: (customer) => customer.visits, kind: "count" },
    { header: "Visits, 30 days", value: (customer) => customer.visits30d, kind: "count" },
    { header: "Total spent", value: (customer) => customer.spent, kind: "money" },
    { header: "Favourite", value: (customer) => customer.favourite ?? "" },
    { header: "Stars now", value: (customer) => customer.stars ?? "" },
    { header: "Last visit", value: (customer) => excelDateTime(customer.lastVisit) },
    { header: "Notes", value: (customer) => customer.notes },
    { header: "Added", value: (customer) => excelDateTime(customer.createdAt) },
    { header: "Added by", value: (customer) => customer.createdBy ?? "Signed up on the mobile menu" },
  ];
}

function exportCustomerReport(customer: Customer, detail: CustomerDetail) {
  const paid = detail.orders.filter((order) => order.status === "completed");
  const fileNameSafeName = customer.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "customer";
  saveWorkbook([
    ["Summary", excelInfo([
      [`Brew Houze customer report: ${customer.fullName}`],
      ["Username", customer.username ? `@${customer.username}` : "No login"],
      ["Email", customer.email ?? ""],
      ["Birthday", birthdayLabel(customer.birthday)],
      ["Status", customer.isActive ? "Active" : "Deactivated"],
      ["Generated", excelNow()],
      [],
      ["Purchases"],
      ["Visits", paid.length],
      ["Total spent", paid.reduce((sum, order) => sum + order.total, 0)],
      ["Average order", paid.length ? paid.reduce((sum, order) => sum + order.total, 0) / paid.length : 0],
      ["Favourite", customer.favourite ?? ""],
      ["Last visit", excelDateTime(customer.lastVisit)],
      [],
      ["Notes", customer.notes],
    ], ["Visits"])],
    ["Orders", detail.orders.length ? excelTable(detail.orders, customerOrderColumns()) : null],
  ], `brew-houze-customer-${fileNameSafeName}-${getFinanceDateStamp()}.xlsx`);
}

function AddCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState({ fullName: "", email: "", birthday: "", notes: "", withLogin: false, username: "", password: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const problem = !draft.fullName.trim() ? "Enter their name."
    : draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) ? "Enter a valid email, or leave it empty."
    : draft.withLogin && !/^[A-Za-z0-9][A-Za-z0-9._]{2,29}$/.test(draft.username.trim()) ? "Usernames have 3 to 30 letters, numbers, dots or underscores."
    : draft.withLogin && draft.password.length < 8 ? "Give a temporary password of at least 8 characters." : "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem || saving) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        fullName: draft.fullName.trim(), email: draft.email.trim(), birthday: draft.birthday, notes: draft.notes.trim(), phone: draft.phone.trim(),
        ...(draft.withLogin ? { username: draft.username.trim(), password: draft.password } : {}),
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not add the customer.");
      await onCreated();
      if (draft.withLogin) setCreated({ name: draft.fullName.trim(), username: draft.username.trim(), password: draft.password });
      else onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add the customer.");
    } finally {
      setSaving(false);
    }
  }

  if (created) return <Modal onClose={onClose} label="Customer added">
    <section className="ui-confirm" style={{ width: "min(100%, 460px)" }}>
      <div className="ui-confirm-icon" data-tone="default" aria-hidden="true" style={{ background: "#DCFCE7", color: "#15803D" }}>✓</div>
      <h2>{created.name} can now sign in</h2>
      <div className="ui-confirm-message">Give them these details for the mobile menu (tap Sign in at the top). They can change the password in their account.</div>
      <div className="acc-credentials">
        <div><span>Username</span><strong>{created.username}</strong></div>
        <div><span>Temporary password</span><strong className="is-mono">{created.password}</strong></div>
      </div>
      <div className="ui-confirm-actions"><button type="button" className="ui-button ui-button-primary" data-autofocus onClick={onClose}>Done</button></div>
    </section>
  </Modal>;

  return <Modal onClose={onClose} closeDisabled={saving} label="Add customer">
    <form onSubmit={submit} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title="Add a customer" sub="A profile for a regular. The cashier can attach them to counter orders, so their purchases fill in." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        <div className="inv-step-grid">
          <WizardField label="Full name"><input data-autofocus value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="e.g. Maria Santos" style={packagingInput} autoComplete="off" maxLength={120} /></WizardField>
          <WizardField label="Birthday (optional)"><input type="date" value={draft.birthday} max={getFinanceDateStamp()} onChange={(event) => setDraft((current) => ({ ...current, birthday: event.target.value }))} style={packagingInput} /></WizardField>
        </div>
        <WizardField label="Mobile number (optional)" hint="Needed for delivery orders."><PhoneField value={draft.phone} onChange={(phone) => setDraft((current) => ({ ...current, phone }))} placeholder="0917 123 4567" style={packagingInput} maxLength={16} /></WizardField>
        <WizardField label="Email (optional)" hint="Lets them reset a forgotten password by themselves."><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@gmail.com" style={packagingInput} autoComplete="off" /></WizardField>
        <WizardField label="Notes (optional)" hint="Never shown to the customer. Cashiers and baristas see them on this customer's orders. For example: wants their hot drinks with a straw."><textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} maxLength={1000} style={{ ...packagingInput, resize: "vertical", lineHeight: 1.45 }} /></WizardField>
        <PermissionSwitch checked={draft.withLogin} title="Give them a login" description="A username and temporary password for the mobile menu. You can also do this later." onChange={(checked) => setDraft((current) => ({ ...current, withLogin: checked, password: checked && !current.password ? generateTemporaryPassword() : current.password }))} />
        {draft.withLogin && <div className="inv-step-grid">
          <WizardField label="Username"><input value={draft.username} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value.replace(/\s/g, "") }))} placeholder="mariasantos" style={packagingInput} autoComplete="off" maxLength={30} /></WizardField>
          <WizardField label="Temporary password"><div className="flex gap-2"><input value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} style={{ ...packagingInput, fontFamily: "JetBrains Mono, monospace" }} autoComplete="new-password" /><button type="button" className="inv-mini" style={{ height: 42 }} onClick={() => setDraft((current) => ({ ...current, password: generateTemporaryPassword() }))}>New</button></div></WizardField>
        </div>}
        {error && <p role="alert" className="acc-error">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
        {problem && <span className="inv-footer-note">{problem}</span>}
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Cancel</button>
        <button type="submit" disabled={saving || Boolean(problem)} className="ui-button ui-button-primary" style={{ opacity: saving || problem ? 0.55 : 1 }}>{saving ? "Adding…" : "Add customer"}</button>
      </div>
    </form>
  </Modal>;
}

function CustomerDialog({ customer, onClose, onChanged, onReload }: { customer: Customer; onClose: () => void; onChanged: (customer: Customer) => void; onReload: () => Promise<void> }) {
  const confirmAction = useConfirm();
  const [tab, setTab] = useState<"profile" | "purchases" | "stars">("profile");
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [adjust, setAdjust] = useState({ stars: "", reason: "" });
  const [detailError, setDetailError] = useState("");
  const [profile, setProfile] = useState({ fullName: customer.fullName, email: customer.email ?? "", birthday: customer.birthday ?? "", phone: customer.phone ?? "" });
  const [notes, setNotes] = useState(customer.notes);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const profileChanged = profile.fullName.trim() !== customer.fullName || profile.email.trim().toLowerCase() !== (customer.email ?? "") || profile.birthday !== (customer.birthday ?? "") || profile.phone.trim() !== (customer.phone ?? "");
  const notesChanged = notes.trim() !== customer.notes;

  useEffect(() => {
    let active = true;
    void fetch(`/api/customers/${customer.id}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Could not load the purchases.");
        if (active) setDetail(payload.data);
      })
      .catch((loadError) => { if (active) setDetailError(loadError instanceof Error ? loadError.message : "Could not load the purchases."); });
    return () => { active = false; };
  }, [customer.id, detailVersion]);

  async function act<T>(key: string, body: Record<string, unknown>, fallback: string, onDone: (data: T) => void) {
    setWorking(key);
    setError("");
    setNotice("");
    try {
      onDone(await patchCustomer({ id: customer.id, ...body }, fallback) as T);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : fallback);
    } finally {
      setWorking(null);
    }
  }

  async function setTemporaryPassword() {
    const password = generateTemporaryPassword();
    if (!(await confirmAction({ title: `Set a temporary password for ${customer.fullName}?`, message: "Their old password stops working and they are signed out of every phone. Tell them the new one in person.", confirmLabel: "Set password", tone: "default" }))) return;
    await act<{ username: string; signedOutDevices: number }>("password", { action: "set_login", password }, "Could not set the password.", (data) => { setNotice(`New temporary password for @${data.username}: ${password}`); void onReload(); });
  }

  async function erase() {
    if (!(await confirmAction({ title: `Erase ${customer.fullName}'s personal details?`, message: "Use this when a customer asks to be forgotten. Their name, username, email, birthday and notes are erased for good and they are signed out. Their past orders stay in the sales records without a name. This cannot be undone.", confirmLabel: "Erase details" }))) return;
    await act("erase", { action: "erase" }, "Could not erase the customer.", () => { void onReload(); onClose(); });
  }

  const paid = detail?.orders.filter((order) => order.status === "completed") ?? [];
  const paidTotal = paid.reduce((sum, order) => sum + order.total, 0);
  return <Modal onClose={onClose} closeDisabled={working !== null} labelledBy="customer-dialog-title">
    <section className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 680, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <header className="acc-dialog-head">
        <UserAvatar name={customer.fullName} size={52} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 id="customer-dialog-title">{customer.fullName}</h2>
          <p>{customer.username ? `@${customer.username}` : "No login"}{customer.email ? ` · ${customer.email}` : ""}</p>
          <span className={`acc-role ${customer.hasLogin ? "is-barista" : ""}`}>{customer.hasLogin ? "App account" : "Profile"}</span>{" "}
          {!customer.isActive && <span className="acc-status is-off"><i />Deactivated</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="inv-mini" onClick={() => detail && exportCustomerReport(customer, detail)} disabled={!detail}><IconDownload size={13} />Export</button>
          <button type="button" onClick={onClose} disabled={working !== null} title="Close" className="inv-mini" style={{ width: 34, padding: 0, justifyContent: "center" }}><IconX size={14} /></button>
        </div>
      </header>
      <div className="acc-tabs" role="tablist" aria-label="Customer sections">
        {([["profile", "Profile & notes"], ["purchases", `Purchases${detail ? ` (${detail.orders.length})` : ""}`], ["stars", customer.stars !== null ? `Stars (★ ${customer.stars})` : "Stars"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        {notice && <div className="acc-notice" role="status">{notice}</div>}
        {error && <p role="alert" className="acc-error">{error}</p>}

        {tab === "profile" && <>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Notes</h3><p>Never shown to the customer. The cashier sees them when attaching this customer to an order, and they appear on the barista&apos;s queue ticket.</p></div></header>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} placeholder="Preferences, allergies, how they like their drink…" style={{ ...packagingInput, resize: "vertical", lineHeight: 1.5 }} />
            <div className="flex justify-end" style={{ marginTop: 10 }}>
              <button type="button" className="ui-button ui-button-primary" disabled={!notesChanged || working !== null} onClick={() => void act<{ notes: string }>("notes", { action: "set_notes", notes }, "Could not save the notes.", (data) => { onChanged({ ...customer, notes: data.notes }); setNotes(data.notes); setNotice("Notes saved."); })}>{working === "notes" ? "Saving…" : "Save notes"}</button>
            </div>
          </section>

          <form className="acc-block" onSubmit={(event) => { event.preventDefault(); void act<{ fullName: string; email: string | null; birthday: string | null; phone: string | null }>("profile", { action: "update_profile", ...profile }, "Could not save the details.", (data) => { onChanged({ ...customer, ...data }); setNotice("Details saved."); }); }}>
            <header className="acc-block-head"><div><h3>Details</h3><p>{customer.createdBy ? `Added by ${customer.createdBy}` : "Signed up on the mobile menu"} on {shiftTime(customer.createdAt)}.{customer.hasLogin && !customer.consented ? " Has not seen the privacy notice yet (made by an admin)." : ""}</p></div></header>
            <div className="inv-step-grid">
              <WizardField label="Full name"><input value={profile.fullName} onChange={(event) => setProfile((current) => ({ ...current, fullName: event.target.value }))} style={packagingInput} maxLength={120} /></WizardField>
              <WizardField label="Birthday"><input type="date" value={profile.birthday} max={getFinanceDateStamp()} onChange={(event) => setProfile((current) => ({ ...current, birthday: event.target.value }))} style={packagingInput} /></WizardField>
            </div>
            <div className="inv-step-grid" style={{ marginTop: 12 }}>
              <WizardField label="Email"><input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} style={packagingInput} /></WizardField>
              <WizardField label="Mobile number"><PhoneField value={profile.phone} onChange={(phone) => setProfile((current) => ({ ...current, phone }))} placeholder="0917 123 4567" style={packagingInput} maxLength={16} /></WizardField>
            </div>
            <div className="flex justify-end" style={{ marginTop: 12 }}><button type="submit" className="ui-button ui-button-primary" disabled={!profileChanged || !profile.fullName.trim() || working !== null}>{working === "profile" ? "Saving…" : "Save details"}</button></div>
          </form>

          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Delivery</h3><p>{(customer.addresses ?? []).length === 0 ? "No saved addresses. Customers add them on the mobile menu." : `${customer.addresses?.length} saved address${customer.addresses?.length === 1 ? "" : "es"}.`}{customer.codBlocked ? ` Cash on delivery is blocked${customer.codBlockReason ? `: ${customer.codBlockReason}` : ""}.` : ""}</p></div>
              <button type="button" className="ui-button ui-button-secondary" disabled={working !== null} onClick={() => void act<{ codBlocked: boolean; codBlockReason: string | null }>("cod", { action: "set_cod", codBlocked: !customer.codBlocked, reason: "Blocked by the admin." }, "Could not change cash on delivery.", (data) => { onChanged({ ...customer, ...data }); setNotice(data.codBlocked ? "Cash on delivery blocked for this customer." : "Cash on delivery allowed again."); })}>{working === "cod" ? "Saving…" : customer.codBlocked ? "Allow COD again" : "Block COD"}</button>
            </header>
            {(customer.addresses ?? []).length > 0 && <ul className="acc-list">{customer.addresses?.map((address) => <li key={address.id}><span><strong>{address.label}{address.isDefault ? " · default" : ""}</strong><em>{address.street}{address.landmark ? `, near ${address.landmark}` : ""} · {address.zoneName ?? "no zone"} · {address.recipientName}, {address.phone}{address.riderNotes ? ` · “${address.riderNotes}”` : ""}</em></span></li>)}</ul>}
          </section>

          {customer.savedId && <section className="acc-block">
            <header className="acc-block-head"><div><h3>Saved discount ID</h3><p>{customer.savedId.typeName} · {customer.savedId.holderName}{customer.savedId.idNumber ? ` · ID ${customer.savedId.idNumber}` : ""}. Checked{customer.savedId.verifiedBy ? ` by ${customer.savedId.verifiedBy}` : ""} on {shiftTime(customer.savedId.verifiedAt)}. Their mobile orders get this discount without a photo; the barista checks the ID at pickup.</p></div>
              <button type="button" className="ui-button ui-button-secondary" disabled={working !== null} onClick={() => void act<{ savedId: null }>("forget_id", { action: "forget_id" }, "Could not remove the saved ID.", () => { onChanged({ ...customer, savedId: null }); setNotice("Saved ID removed. Their next discount needs a photo or the counter."); })}>{working === "forget_id" ? "Removing…" : "Remove"}</button>
            </header>
          </section>}

          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Mobile menu login</h3><p>{customer.hasLogin ? `@${customer.username} · ${customer.devices ? `signed in on ${customer.devices} phone${customer.devices === 1 ? "" : "s"}` : "not signed in anywhere"}` : "No login yet. Give them one so their mobile orders are saved to this profile."}</p></div></header>
            {customer.hasLogin
              ? <div className="flex flex-wrap gap-2">
                <button type="button" className="ui-button ui-button-secondary" disabled={working !== null || !customer.isActive} onClick={() => void setTemporaryPassword()}>{working === "password" ? "Setting…" : "Set a temporary password"}</button>
                {customer.devices > 0 && <button type="button" className="ui-button ui-button-secondary" disabled={working !== null} onClick={() => void act<{ signedOutDevices: number }>("signout", { action: "sign_out_everywhere" }, "Could not sign them out.", (data) => { setNotice(`Signed out of ${data.signedOutDevices} phone${data.signedOutDevices === 1 ? "" : "s"}.`); void onReload(); })}>Sign out everywhere</button>}
              </div>
              : <form className="inv-step-grid" onSubmit={(event) => { event.preventDefault(); const password = login.password || generateTemporaryPassword(); void act<{ username: string }>("login", { action: "set_login", username: login.username.trim(), password }, "Could not make the login.", (data) => { setNotice(`Login made. Username: ${data.username} · temporary password: ${password}`); setLogin({ username: "", password: "" }); void onReload(); }); }}>
                <WizardField label="Username"><input value={login.username} onChange={(event) => setLogin((current) => ({ ...current, username: event.target.value.replace(/\s/g, "") }))} style={packagingInput} maxLength={30} autoComplete="off" /></WizardField>
                <WizardField label="Temporary password" hint="Leave empty to generate one."><div className="flex gap-2"><input value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} style={{ ...packagingInput, fontFamily: "JetBrains Mono, monospace" }} autoComplete="new-password" /><button type="submit" className="ui-button ui-button-primary" disabled={!login.username.trim() || working !== null || !customer.isActive}>{working === "login" ? "…" : "Make login"}</button></div></WizardField>
              </form>}
          </section>

          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Profile status</h3><p>Deactivated customers cannot sign in. Their notes and purchases stay.</p></div></header>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-button ui-button-secondary" disabled={working !== null} onClick={() => void act<{ isActive: boolean }>("active", { action: "set_active", isActive: !customer.isActive }, "Could not change the status.", (data) => { onChanged({ ...customer, isActive: data.isActive, devices: data.isActive ? customer.devices : 0 }); setNotice(data.isActive ? "Reactivated." : "Deactivated and signed out."); })}>{customer.isActive ? "Deactivate" : "Reactivate"}</button>
              <button type="button" className="ui-button ui-button-secondary" style={{ color: "#B91C1C" }} disabled={working !== null} onClick={() => void erase()}>Erase personal details…</button>
            </div>
          </section>
        </>}

        {tab === "stars" && <>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>{customer.stars !== null ? `★ ${customer.stars} in the running campaign` : "No campaign is running"}</h3><p>{customer.stars !== null ? "Add stars (for example from their paper card) or remove them. Every change is kept with its reason." : "Start a campaign in Loyalty to give or adjust stars."}</p></div></header>
            {customer.stars !== null && <form className="loy-adjust" onSubmit={(event) => { event.preventDefault(); void act<{ stars: number }>("stars", { action: "adjust_stars", stars: Number(adjust.stars), reason: adjust.reason }, "Could not adjust the stars.", (data) => { onChanged({ ...customer, stars: data.stars }); setNotice(`Stars updated. ${customer.fullName.split(" ")[0]} now has ★ ${data.stars}.`); setAdjust({ stars: "", reason: "" }); setDetailVersion((version) => version + 1); }); }}>
              <label className="loy-stars-input"><IconStar size={13} /><input type="number" step={1} min={-1000} max={1000} value={adjust.stars} onChange={(event) => setAdjust((current) => ({ ...current, stars: event.target.value }))} placeholder="+5 or -2" aria-label="Stars to add or remove" /></label>
              <input value={adjust.reason} onChange={(event) => setAdjust((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason, e.g. stars from their paper card" maxLength={200} style={{ ...packagingInput, flex: 1, minWidth: 180 }} aria-label="Reason" />
              <button type="submit" className="ui-button ui-button-primary" disabled={working !== null || !Number.isInteger(Number(adjust.stars)) || Number(adjust.stars) === 0 || !adjust.reason.trim()}>{working === "stars" ? "Saving…" : "Save"}</button>
            </form>}
          </section>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Star history</h3><p>Every campaign, newest first.</p></div></header>
            {!detail ? <p className="inv-hint">Loading…</p> : detail.starEntries.length === 0 ? <p className="inv-hint">No stars yet.</p> : <ul className="acc-list">
              {detail.starEntries.map((entry) => <li key={entry.id}>
                <span><strong>{starEntryLabels[entry.kind] ?? entry.kind}</strong><em>{shiftTime(entry.createdAt)} · {entry.campaignName}{entry.orderId ? ` · Order ${entry.orderId}` : ""}{entry.reason ? ` · ${entry.reason}` : ""}{entry.adminName ? ` · by ${entry.adminName}` : ""}</em></span>
                <span className="acc-list-end"><strong className={entry.stars < 0 ? "dash-down" : "loy-plus"}>{entry.stars > 0 ? "+" : ""}{entry.stars}</strong></span>
              </li>)}
            </ul>}
          </section>
        </>}

        {tab === "purchases" && <>
          <div className="acc-stats">
            <div><span>Visits</span><strong>{paid.length}</strong></div>
            <div><span>Total spent</span><strong>{peso(paidTotal)}</strong></div>
            <div><span>Average order</span><strong>{paid.length ? peso(paidTotal / paid.length) : "—"}</strong></div>
            <div><span>Favourite</span><strong style={{ fontSize: 14 }}>{customer.favourite ?? "—"}</strong></div>
          </div>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Orders</h3><p>Orders placed while signed in on the mobile menu, and counter orders the cashier attached them to.</p></div></header>
            {detailError ? <p className="acc-error">{detailError}</p>
              : !detail ? <p className="inv-hint">Loading…</p>
                : detail.orders.length === 0 ? <p className="inv-hint">No orders yet.</p>
                  : <ul className="acc-list">
                    {detail.orders.map((order) => <li key={order.id}>
                      <span><strong>Order {order.id}{order.queueNumber ? ` · #${order.queueNumber}` : ""}</strong><em>{shiftTime(order.createdAt)} · {order.source === "mobile" ? "Mobile menu" : `Counter · ${order.punchedBy}`}{order.discountLabel && (order.discountTotal ?? 0) > 0 ? ` · −${peso(order.discountTotal ?? 0)} ${shortDiscountLabel(order.discountLabel)}` : ""}</em><em style={{ color: "#6B4C3B" }}>{order.items}</em></span>
                      <span className="acc-list-end">{order.status !== "completed" && <span className={`fin-status is-${order.status}`}>{order.status === "voided" ? "Voided" : "Refunded"}</span>}<strong className={order.status !== "completed" ? "fin-order-total is-reversed" : ""}>{peso(order.total)}</strong></span>
                    </li>)}
                  </ul>}
          </section>
        </>}
      </div>
    </section>
  </Modal>;
}

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("active");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [visible, setVisible] = useState(CUSTOMERS_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const response = await fetch("/api/customers", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load the customers.");
      setCustomers(payload.data ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load the customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCustomers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCustomers]);

  const query = search.trim().toLowerCase().replace(/^@/, "");
  const shown = customers.filter((customer) => {
    if (filter === "active" && !customer.isActive) return false;
    if (filter === "inactive" && customer.isActive) return false;
    if (filter === "app" && (!customer.hasLogin || !customer.isActive)) return false;
    if (filter === "profile" && (customer.hasLogin || !customer.isActive)) return false;
    return !query || [customer.fullName, customer.username ?? "", customer.email ?? "", customer.notes, customer.phone ?? ""].some((value) => value.toLowerCase().includes(query.replace(/^\+?63/, "0")) || value.toLowerCase().includes(query));
  }).sort((a, b) => sort === "name" ? a.fullName.localeCompare(b.fullName)
    : sort === "visits" ? b.visits - a.visits || a.fullName.localeCompare(b.fullName)
      : sort === "spent" ? b.spent - a.spent || a.fullName.localeCompare(b.fullName)
        : (b.lastVisit ?? b.createdAt).localeCompare(a.lastVisit ?? a.createdAt));
  const active = customers.filter((customer) => customer.isActive);
  const monthStart = `${getFinanceDateStamp().slice(0, 7)}-01`;
  const newThisMonth = active.filter((customer) => customer.createdAt.slice(0, 10) >= monthStart).length;
  const birthdays = active.filter((customer) => birthdayThisMonth(customer.birthday));
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  function exportAllCustomers() {
    try {
      const list = [...customers].sort((a, b) => a.fullName.localeCompare(b.fullName));
      saveWorkbook([
        ["Summary", excelInfo([
          ["Brew Houze customers"],
          ["Generated", excelNow()],
          ["Customers", list.length],
          ["Active", list.filter((customer) => customer.isActive).length],
          ["With a mobile menu login", list.filter((customer) => customer.hasLogin).length],
          ["Visited in the last 30 days", list.filter((customer) => customer.visits30d > 0).length],
          ["Total spent, all customers", list.reduce((sum, customer) => sum + customer.spent, 0)],
        ], ["Customers", "Active", "With a mobile menu login", "Visited in the last 30 days"])],
        ["Customers", list.length ? excelTable(list, customerListColumns()) : null],
      ], `brew-houze-customers-${getFinanceDateStamp()}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export the customers.");
    }
  }

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-summary">
        <button type="button" className="inv-stat" aria-pressed={filter === "active"} onClick={() => setFilter("active")}><span>Customers</span><strong>{active.length}</strong><em>{newThisMonth} new this month</em></button>
        <button type="button" className="inv-stat" aria-pressed={filter === "app"} onClick={() => setFilter(filter === "app" ? "active" : "app")}><span>With app login</span><strong>{active.filter((customer) => customer.hasLogin).length}</strong><em>{active.filter((customer) => !customer.hasLogin).length} profile{active.filter((customer) => !customer.hasLogin).length === 1 ? "" : "s"} only</em></button>
        <div className="inv-stat is-static"><span>Visited · 30 days</span><strong>{active.filter((customer) => customer.visits30d > 0).length}</strong><em>at least one order</em></div>
        <div className="inv-stat is-static"><span>Birthdays this month</span><strong>{birthdays.length}</strong><em>{birthdays.length ? birthdays.slice(0, 2).map((customer) => customer.fullName.split(" ")[0]).join(", ") + (birthdays.length > 2 ? "…" : "") : "none"}</em></div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search is-wide">
          <IconSearch size={14} />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setVisible(CUSTOMERS_PAGE_SIZE); }} placeholder="Search name, username, email or notes" />
          {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
        </div>
        <div className="inv-range" role="group" aria-label="Show">
          {([["active", "All active"], ["app", "App login"], ["profile", "Profile only"], ["inactive", "Deactivated"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setVisible(CUSTOMERS_PAGE_SIZE); }}>{label}</button>)}
        </div>
        <label className="inv-filter"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as CustomerSort)} className="inv-select"><option value="recent">Last visit</option><option value="name">Name</option><option value="visits">Most visits</option><option value="spent">Most spent</option></select></label>
        <button type="button" className="inv-secondary" onClick={exportAllCustomers} disabled={customers.length === 0}><IconDownload size={14} />Export all</button>
        <button type="button" className="inv-primary" onClick={() => setAdding(true)}><IconPlus size={15} />Add customer</button>
      </div>

      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}

      {loading ? <div className="inv-empty">Loading customers…</div>
        : customers.length === 0 ? <div className="inv-onboard">
          <span className="inv-kind-icon is-packaged" style={{ width: 52, height: 52 }}><IconHeart size={24} /></span>
          <h2>No customers yet</h2>
          <p>Customers appear here when they make an account on the mobile menu. You can also add your regulars yourself, with notes on how they like their order.</p>
          <button type="button" className="inv-primary" onClick={() => setAdding(true)}><IconPlus size={15} />Add customer</button>
        </div>
          : shown.length === 0 ? <div className="inv-empty">No customers match. <button type="button" className="inv-link" onClick={() => { setSearch(""); setFilter("active"); }}>Show everyone</button></div>
            : <>
              <div className="acc-grid">
                {shown.slice(0, visible).map((customer) => <button key={customer.id} type="button" className={`acc-card${customer.isActive ? "" : " is-inactive"}`} onClick={() => setSelectedId(customer.id)}>
                  <span className="acc-card-top">
                    <UserAvatar name={customer.fullName} size={44} />
                    <span className="acc-card-name"><strong>{customer.fullName}</strong><em>{customer.username ? `@${customer.username}` : customer.email ?? "No login"}</em><span className={`acc-role ${customer.hasLogin ? "is-barista" : ""}`}>{customer.hasLogin ? "App account" : "Profile"}</span></span>
                    {customer.stars !== null && customer.isActive && <span className="loy-cost" title="Stars in the running campaign">★ {customer.stars}</span>}
                    {!customer.isActive ? <span className="acc-status is-off"><i />Deactivated</span> : birthdayThisMonth(customer.birthday) ? <span className="acc-status is-on">🎂 {birthdayLabel(customer.birthday)}</span> : null}
                  </span>
                  {customer.notes && <span className="cust-note">{customer.notes}</span>}
                  <span className="acc-card-stats">
                    <span><em>Visits</em><strong>{customer.visits}</strong></span>
                    <span><em>Spent</em><strong>{peso(customer.spent)}</strong></span>
                    <span><em>Favourite</em><strong>{customer.favourite ?? "—"}</strong></span>
                  </span>
                  <span className="acc-card-foot">{customer.lastVisit ? `Last visit ${shiftTime(customer.lastVisit)}` : "No visits yet"}<span>Open <IconChevron size={13} /></span></span>
                </button>)}
              </div>
              {shown.length > visible && <div className="flex justify-center" style={{ marginTop: 16 }}><button type="button" className="inv-secondary" onClick={() => setVisible((count) => count + CUSTOMERS_PAGE_SIZE)}>Show more ({shown.length - visible} left)</button></div>}
            </>}
    </div>
    {adding && <AddCustomerDialog onClose={() => setAdding(false)} onCreated={loadCustomers} />}
    {selected && <CustomerDialog key={selected.id} customer={selected} onClose={() => setSelectedId(null)} onChanged={(changed) => setCustomers((current) => current.map((customer) => customer.id === changed.id ? changed : customer))} onReload={loadCustomers} />}
  </div>;
}

// ─── Loyalty campaigns ─────────────────────────────────────────────────────────────────────────
// Brew Houze runs its loyalty program in seasons. Each campaign sets how customers earn stars
// (per item or per amount spent, which categories count), limits per order and per day, what
// happens to stars when it ends, and the rewards. One campaign runs at a time. Stars are a
// ledger (see /api/loyalty): nothing is edited or deleted, the admin adds adjustments instead.

// A reward is a free item or a discount (percent or pesos off, optional cap and minimum order).
type LoyaltyReward = {
  id: number; name: string; starsCost: number; productId: number | null; productName: string | null; category: string | null; maxPrice: number | null;
  rewardType: "free_item" | "discount"; discountKind: "percent" | "fixed" | null; discountValue: number | null; maxDiscount: number | null; minOrderAmount: number | null;
};
type LoyaltyStatus = "draft" | "scheduled" | "running" | "paused" | "ended";
type BirthdayWindow = "day" | "week" | "month";
type LoyaltyCampaign = {
  id: number; name: string; description: string; startsOn: string; endsOn: string | null; status: LoyaltyStatus; isActive: boolean;
  // seasonal: stars; birthday: one treat a year around the customer's birthday, switched on and off.
  kind: "seasonal" | "birthday"; birthdayWindow: BirthdayWindow | null; birthdayClaims: number; minOrderAmount: number | null;
  earnMode: "per_item" | "per_amount" | "per_order"; starsPerUnit: number; amountStep: number | null; categories: string[]; maxPerOrder: number | null; maxPerDay: number | null;
  carryOver: boolean; activatedAt: string | null; endedAt: string | null; createdAt: string;
  stats: { members: number; earned: number; reversed: number; adjusted: number; carriedIn: number; redeemed: number; rewardsClaimed: number; outstanding: number; orders: number };
  rewards: LoyaltyReward[];
};
type CampaignMember = { customerId: number; fullName: string; username: string | null; erased: boolean; balance: number; earned: number; orders: number; rewards: number; lastActivity: string };
type StarEntry = { id: number; kind: string; stars: number; orderId: number | null; queueNumber: number | null; reason: string | null; customerName?: string; adminName: string | null; rewardName: string | null; createdAt: string; campaignId?: number; campaignName?: string };
type CampaignResults = {
  memberOrders: number; memberSales: number; buyers: number; rewards: { rewardId: number; name: string; claimed: number; value: number; cost: number | null }[]; rewardValue: number; rewardCost: number | null;
  discounts?: { rewardId: number; name: string; uses: number; amount: number }[]; birthdayTreats?: { year: number; treats: number }[];
};
type CampaignDetail = { members: CampaignMember[]; entries: StarEntry[]; results?: CampaignResults };
type CampaignRules = Pick<LoyaltyCampaign, "earnMode" | "starsPerUnit" | "amountStep" | "categories" | "maxPerOrder" | "maxPerDay" | "minOrderAmount">;

const loyaltyStatusLabels: Record<LoyaltyStatus, string> = { draft: "Draft", scheduled: "Scheduled", running: "Running", paused: "Switched off", ended: "Ended" };
const birthdayWindowLabels: Record<BirthdayWindow, [string, string]> = {
  day: ["On the day", "Only on their birthday itself."],
  week: ["Birthday week", "From 3 days before to 3 days after."],
  month: ["Birthday month", "Any day in their birthday month."],
};
const starEntryLabels: Record<string, string> = { earned: "Earned", reversed: "Taken back (void/refund)", adjusted: "Adjusted by admin", carried_out: "Moved to next campaign", carried_in: "Carried over", redeemed: "Reward claimed", restored: "Reward returned" };

function IconStar({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}

function starsText(count: number): string {
  return `${count.toLocaleString("en-PH")} star${Math.abs(count) === 1 ? "" : "s"}`;
}

function campaignRuleText(rules: CampaignRules): string {
  const from = rules.categories.length ? ` from ${rules.categories.join(" or ")}` : "";
  const rule = rules.earnMode === "per_order"
    ? `${starsText(rules.starsPerUnit)} for every order${from ? ` with items${from}` : ""}${rules.minOrderAmount ? ` of ${peso(rules.minOrderAmount)} or more` : ""}`
    : rules.earnMode === "per_amount"
      ? `${starsText(rules.starsPerUnit)} for every ${peso(rules.amountStep ?? 0)} spent${from ? ` on items${from}` : ""}`
      : `${starsText(rules.starsPerUnit)} for every item${from}`;
  const limits = [rules.maxPerOrder ? `${starsText(rules.maxPerOrder)} per order` : "", rules.maxPerDay ? `${starsText(rules.maxPerDay)} per day` : ""].filter(Boolean);
  return `${rule}${limits.length ? `, up to ${limits.join(" and ")}` : ""}.`;
}

function campaignDateText(campaign: Pick<LoyaltyCampaign, "startsOn" | "endsOn">): string {
  const format = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  return campaign.endsOn ? `${format(campaign.startsOn)} – ${format(campaign.endsOn)}` : `From ${format(campaign.startsOn)}, no end date`;
}

// "10% off (up to ₱50.00), orders from ₱200.00".
function rewardDiscountText(reward: Pick<LoyaltyReward, "discountKind" | "discountValue" | "maxDiscount" | "minOrderAmount">): string {
  if (!reward.discountKind || !reward.discountValue) return "";
  const off = reward.discountKind === "percent" ? `${reward.discountValue}% off` : `${peso(reward.discountValue)} off`;
  return [off + (reward.discountKind === "percent" && reward.maxDiscount ? ` (up to ${peso(reward.maxDiscount)})` : ""), reward.minOrderAmount ? `orders from ${peso(reward.minOrderAmount)}` : ""].filter(Boolean).join(", ");
}

function birthdayRuleText(campaign: Pick<LoyaltyCampaign, "birthdayWindow">): string {
  const window = campaign.birthdayWindow === "day" ? "on their birthday" : campaign.birthdayWindow === "month" ? "in their birthday month" : "within 3 days of their birthday";
  return `One free treat a year per customer, ${window}. No stars needed; the customer needs their birthday on their profile.`;
}

function rewardCoverage(reward: Pick<LoyaltyReward, "productName" | "category" | "maxPrice"> & Partial<Pick<LoyaltyReward, "rewardType" | "discountKind" | "discountValue" | "maxDiscount" | "minOrderAmount">>): string {
  if (reward.rewardType === "discount") return `${rewardDiscountText(reward as LoyaltyReward)} · on ${reward.productName ?? (reward.category ? `${reward.category} items` : "the whole order")}`;
  const parts = [reward.productName ?? (reward.category ? `any ${reward.category} item` : "any item"), reward.maxPrice !== null ? `up to ${peso(reward.maxPrice)}` : ""].filter(Boolean);
  return parts.join(", ");
}

function LoyaltyStatusChip({ status }: { status: LoyaltyStatus }) {
  return <span className={`loy-status is-${status}`}><i />{loyaltyStatusLabels[status]}</span>;
}

function exportCampaignReport(campaign: LoyaltyCampaign, detail: CampaignDetail) {
  const safeName = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "campaign";
  saveWorkbook([
    ["Summary", excelInfo([
      [`Brew Houze loyalty campaign: ${campaign.name}`],
      ["Status", loyaltyStatusLabels[campaign.status]],
      ["Dates", campaignDateText(campaign)],
      ["How stars are earned", campaignRuleText(campaign)],
      ["When it ends", campaign.carryOver ? "Stars carry over to the next campaign" : "Stars expire"],
      ["Generated", excelNow()],
      [],
      ["Results"],
      ["Members", campaign.stats.members],
      ["Orders that earned stars", campaign.stats.orders],
      ["Stars earned", campaign.stats.earned],
      ["Stars taken back (voids and refunds)", campaign.stats.reversed],
      ["Stars adjusted by admin (net)", campaign.stats.adjusted],
      ["Stars carried in", campaign.stats.carriedIn],
      ["Stars spent on rewards", campaign.stats.redeemed],
      ["Rewards claimed", campaign.stats.rewardsClaimed],
      ["Stars not yet spent", campaign.stats.outstanding],
    ], ["Members", "Orders that earned stars", "Stars earned", "Stars taken back (voids and refunds)", "Stars adjusted by admin (net)", "Stars carried in", "Stars spent on rewards", "Rewards claimed", "Stars not yet spent"])],
    ["Results", detail.results ? excelInfo([
      [`Results of ${campaign.name}`, campaignDateText(campaign)],
      ["Orders by members", detail.results.memberOrders],
      ["Sales from members", detail.results.memberSales],
      ["Members who ordered", detail.results.buyers],
      ["Rewards given", detail.results.rewards.reduce((sum, reward) => sum + reward.claimed, 0)],
      ["Normal price of rewards given", detail.results.rewardValue],
      ["Cost of rewards given", detail.results.rewardCost],
      ["Cost of rewards, % of member sales", detail.results.memberSales > 0 && detail.results.rewardCost !== null ? Math.round((detail.results.rewardCost / detail.results.memberSales) * 1000) / 10 : null],
      [],
      ["Reward", "Given", "Normal price", "Cost"],
      ...detail.results.rewards.map((reward): ExcelInfoRow => [reward.name, reward.claimed, reward.value, reward.cost]),
    ], ["Orders by members", "Members who ordered", "Rewards given", "Cost of rewards, % of member sales"]) : null],
    ["Rewards", campaign.rewards.length ? excelTable(campaign.rewards, [
      { header: "Reward", value: (reward) => reward.name },
      { header: "Stars", value: (reward) => reward.starsCost, kind: "count" },
      { header: "Covers", value: (reward) => rewardCoverage(reward) },
    ]) : null],
    ["Members", detail.members.length ? excelTable(detail.members, [
      { header: "Customer", value: (member) => member.erased ? "Erased customer" : member.fullName },
      { header: "Username", value: (member) => member.username ? `@${member.username}` : "" },
      { header: "Stars now", value: (member) => member.balance, kind: "count" },
      { header: "Stars earned", value: (member) => member.earned, kind: "count" },
      { header: "Orders", value: (member) => member.orders, kind: "count" },
      { header: "Rewards claimed", value: (member) => member.rewards, kind: "count" },
      { header: "Last activity", value: (member) => excelDateTime(member.lastActivity) },
    ]) : null],
    ["Star history", detail.entries.length ? excelTable(detail.entries, [
      { header: "Date and time", value: (entry) => excelDateTime(entry.createdAt) },
      { header: "Customer", value: (entry) => entry.customerName ?? "" },
      { header: "What happened", value: (entry) => starEntryLabels[entry.kind] ?? entry.kind },
      { header: "Stars", value: (entry) => entry.stars, kind: "count" },
      { header: "Order", value: (entry) => entry.orderId ?? "" },
      { header: "Reward", value: (entry) => entry.rewardName ?? "" },
      { header: "Reason", value: (entry) => entry.reason ?? "" },
      { header: "By", value: (entry) => entry.adminName ?? "" },
    ]) : null],
  ], `brew-houze-loyalty-${safeName}-${getFinanceDateStamp()}.xlsx`);
}

// Keys that tell the reward rows of the form apart (React list keys only).
let rewardKeySeed = 0;
const nextRewardKey = () => ++rewardKeySeed;

type RewardDraft = {
  key: number; id: number | null; name: string; starsCost: string; productId: string; category: string; maxPrice: string;
  rewardType: "free_item" | "discount"; discountKind: "percent" | "fixed"; discountValue: string; maxDiscount: string; minOrderAmount: string;
};
type CampaignDraft = {
  name: string; description: string; startsOn: string; endsOn: string; earnMode: "per_item" | "per_amount" | "per_order"; starsPerUnit: string; amountStep: string; minOrderAmount: string;
  categories: string[]; maxPerOrder: string; maxPerDay: string; carryOver: boolean; birthdayWindow: BirthdayWindow; rewards: RewardDraft[];
};
const blankReward = (name = "", starsCost = ""): RewardDraft => ({ key: nextRewardKey(), id: null, name, starsCost, productId: "", category: "", maxPrice: "", rewardType: "free_item", discountKind: "percent", discountValue: "", maxDiscount: "", minOrderAmount: "" });

function CampaignFormDialog({ campaign, kind: newKind = "seasonal", products, categories, onClose, onSaved }: { campaign: LoyaltyCampaign | null; kind?: "seasonal" | "birthday"; products: Product[]; categories: ProductCategory[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const birthday = (campaign?.kind ?? newKind) === "birthday";
  const [draft, setDraft] = useState<CampaignDraft>(() => campaign ? {
    name: campaign.name, description: campaign.description, startsOn: campaign.startsOn, endsOn: campaign.endsOn ?? "", earnMode: campaign.earnMode,
    starsPerUnit: String(campaign.starsPerUnit), amountStep: campaign.amountStep === null ? "" : String(campaign.amountStep), minOrderAmount: campaign.minOrderAmount === null ? "" : String(campaign.minOrderAmount), categories: campaign.categories,
    maxPerOrder: campaign.maxPerOrder === null ? "" : String(campaign.maxPerOrder), maxPerDay: campaign.maxPerDay === null ? "" : String(campaign.maxPerDay), carryOver: campaign.carryOver,
    birthdayWindow: campaign.birthdayWindow ?? "week",
    rewards: campaign.rewards.map((reward) => ({
      key: nextRewardKey(), id: reward.id, name: reward.name, starsCost: String(reward.starsCost), productId: reward.productId === null ? "" : String(reward.productId), category: reward.category ?? "", maxPrice: reward.maxPrice === null ? "" : String(reward.maxPrice),
      rewardType: reward.rewardType, discountKind: reward.discountKind ?? "percent", discountValue: reward.discountValue === null ? "" : String(reward.discountValue), maxDiscount: reward.maxDiscount === null ? "" : String(reward.maxDiscount), minOrderAmount: reward.minOrderAmount === null ? "" : String(reward.minOrderAmount),
    })),
  } : {
    name: birthday ? "Birthday treat" : "", description: "", startsOn: getFinanceDateStamp(), endsOn: "", earnMode: "per_item", starsPerUnit: "1", amountStep: "100", minOrderAmount: "", categories: [], maxPerOrder: "", maxPerDay: "", carryOver: false,
    birthdayWindow: "week",
    rewards: [birthday ? blankReward("Free birthday drink", "0") : blankReward("Free drink", "10")],
  });
  const [saving, setSaving] = useState<"draft" | "start" | "save" | null>(null);
  const [error, setError] = useState("");
  const categoryNames = Array.from(new Set([...categories.map((category) => category.name), ...products.map((product) => product.category).filter(Boolean)])).sort((a, b) => a.localeCompare(b));
  const set = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setReward = (key: number, patch: Partial<RewardDraft>) => setDraft((current) => ({ ...current, rewards: current.rewards.map((reward) => reward.key === key ? { ...reward, ...patch } : reward) }));
  const starsPerUnit = Number(draft.starsPerUnit);
  const amountStep = Number(draft.amountStep);
  const badDiscount = (reward: RewardDraft) => reward.rewardType === "discount" && (!(Number(reward.discountValue) > 0) || (reward.discountKind === "percent" && Number(reward.discountValue) > 100));
  const problem = !draft.name.trim() ? "Give the campaign a name."
    : birthday ? (draft.rewards.length === 0 ? "Add the birthday treat." : draft.rewards.some((reward) => !reward.name.trim()) ? "Every treat needs a name." : draft.rewards.some(badDiscount) ? "Set each discount (1 to 100% or a peso amount)." : "")
      : !draft.startsOn ? "Choose the start date."
        : draft.endsOn && draft.endsOn < draft.startsOn ? "The end date must be on or after the start date."
          : !Number.isInteger(starsPerUnit) || starsPerUnit < 1 || starsPerUnit > 100 ? "Stars earned must be a whole number from 1 to 100."
            : draft.earnMode === "per_amount" && !(amountStep > 0) ? "Enter how many pesos earn the stars."
              : draft.rewards.some((reward) => !reward.name.trim() || !(Number.isInteger(Number(reward.starsCost)) && Number(reward.starsCost) >= 1)) ? "Every reward needs a name and a star cost."
                : draft.rewards.some(badDiscount) ? "Set each discount (1 to 100% or a peso amount)."
                  : "";
  const previewRules: CampaignRules = { earnMode: draft.earnMode, starsPerUnit: Number.isFinite(starsPerUnit) && starsPerUnit > 0 ? starsPerUnit : 1, amountStep: amountStep > 0 ? amountStep : 0, minOrderAmount: Number(draft.minOrderAmount) > 0 ? Number(draft.minOrderAmount) : null, categories: draft.categories, maxPerOrder: Number(draft.maxPerOrder) > 0 ? Number(draft.maxPerOrder) : null, maxPerDay: Number(draft.maxPerDay) > 0 ? Number(draft.maxPerDay) : null };

  async function save(mode: "draft" | "start" | "save") {
    if (problem || saving) { setError(problem); return; }
    setSaving(mode);
    setError("");
    const payload = {
      kind: birthday ? "birthday" : "seasonal", birthdayWindow: draft.birthdayWindow,
      name: draft.name, description: draft.description, startsOn: draft.startsOn, endsOn: draft.endsOn || null, earnMode: draft.earnMode,
      starsPerUnit: starsPerUnit, amountStep: draft.earnMode === "per_amount" ? amountStep : null, minOrderAmount: draft.earnMode === "per_order" ? draft.minOrderAmount || null : null, categories: draft.categories,
      maxPerOrder: draft.maxPerOrder || null, maxPerDay: draft.maxPerDay || null, carryOver: draft.carryOver,
      rewards: draft.rewards.map((reward) => ({
        id: reward.id, name: reward.name, starsCost: birthday ? 0 : Number(reward.starsCost), productId: reward.productId || null, category: reward.category || null, maxPrice: reward.rewardType === "free_item" ? reward.maxPrice || null : null,
        rewardType: reward.rewardType, discountKind: reward.discountKind, discountValue: reward.discountValue || null, maxDiscount: reward.maxDiscount || null, minOrderAmount: reward.minOrderAmount || null,
      })),
    };
    try {
      const response = await fetch("/api/loyalty", {
        method: campaign ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign ? { id: campaign.id, action: "update", ...payload } : { ...payload, activate: mode === "start" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Could not save the campaign.");
      await onSaved(campaign ? "Campaign saved." : birthday ? (mode === "start" ? "Birthday treat switched on." : "Birthday treat saved. Switch it on when you are ready.") : mode === "start" ? `Campaign started.${result.data?.carried ? ` Stars of ${result.data.carried} customer${result.data.carried === 1 ? "" : "s"} were carried over.` : ""}` : "Draft saved. Start it when you are ready.");
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the campaign.");
    } finally {
      setSaving(null);
    }
  }

  const choice = (active: boolean) => ({ flex: 1, padding: "10px 12px", borderRadius: 11, border: active ? "1.5px solid #D97706" : "1.5px solid #E8DDD5", background: active ? "#FFF7ED" : "#FFFFFF", textAlign: "left" as const, cursor: "pointer" });
  const rewardEditor = <section className="acc-block">
    <header className="acc-block-head"><div><h3>{birthday ? "Birthday treat" : "Rewards"}</h3><p>{birthday ? "What each customer gets once a year: a free item or a discount. Add more than one to let them choose." : "What stars can buy: a free item, or a discount off the order. Customers claim them in their mobile menu cart, or at the counter by scanning the Stars sign (regulars without the app: the cashier confirms with their password)."}</p></div>
      <button type="button" className="inv-mini" onClick={() => setDraft((current) => ({ ...current, rewards: [...current.rewards, blankReward("", birthday ? "0" : "")] }))}><IconPlus size={13} />{birthday ? "Add treat" : "Add reward"}</button></header>
    {draft.rewards.length === 0 ? <p className="inv-hint">{birthday ? "Add the treat." : "No rewards yet. Customers can still collect stars."}</p> : <div className="flex flex-col gap-3">
      {draft.rewards.map((reward) => <div key={reward.key} className="loy-reward-row">
        <div className="loy-reward-top">
          <input value={reward.name} onChange={(event) => setReward(reward.key, { name: event.target.value })} placeholder={reward.rewardType === "discount" ? "e.g. 10% off your order" : "e.g. Free 12oz drink"} style={packagingInput} maxLength={80} aria-label="Reward name" />
          {!birthday && <label className="loy-stars-input"><IconStar size={13} /><input type="number" min={1} max={1000} step={1} value={reward.starsCost} onChange={(event) => setReward(reward.key, { starsCost: event.target.value })} placeholder="10" aria-label="Stars needed" /></label>}
          <button type="button" className="inv-mini" onClick={() => setDraft((current) => ({ ...current, rewards: current.rewards.filter((item) => item.key !== reward.key) }))} aria-label={`Remove ${reward.name || "reward"}`} style={{ width: 34, padding: 0, justifyContent: "center" }}><IconX size={13} /></button>
        </div>
        <div className="inv-range" role="group" aria-label="Reward type" style={{ alignSelf: "flex-start" }}>
          <button type="button" aria-pressed={reward.rewardType === "free_item"} onClick={() => setReward(reward.key, { rewardType: "free_item" })}>Free item</button>
          <button type="button" aria-pressed={reward.rewardType === "discount"} onClick={() => setReward(reward.key, { rewardType: "discount" })}>Discount</button>
        </div>
        {reward.rewardType === "discount" && <div className="loy-reward-covers">
          <label className="loy-price-input"><select value={reward.discountKind} onChange={(event) => setReward(reward.key, { discountKind: event.target.value as "percent" | "fixed" })} aria-label="Discount type" style={{ border: 0, background: "transparent", color: "#3D2B1F", fontWeight: 700 }}><option value="percent">% off</option><option value="fixed">₱ off</option></select><MoneyField value={reward.discountValue} onChange={(typed) => setReward(reward.key, { discountValue: typed })} placeholder={reward.discountKind === "percent" ? "10" : "30"} aria-label="Discount amount" /></label>
          {reward.discountKind === "percent" ? <label className="loy-price-input"><span>Cap ₱</span><MoneyField value={reward.maxDiscount} onChange={(typed) => setReward(reward.key, { maxDiscount: typed })} placeholder="no cap" aria-label="Most it can take off" /></label> : <span />}
          <label className="loy-price-input"><span>Min. order ₱</span><MoneyField value={reward.minOrderAmount} onChange={(typed) => setReward(reward.key, { minOrderAmount: typed })} placeholder="none" aria-label="Minimum order" /></label>
        </div>}
        <div className="loy-reward-covers">
          <select value={reward.productId} onChange={(event) => setReward(reward.key, { productId: event.target.value })} className="inv-select" aria-label="Product">
            <option value="">{reward.rewardType === "discount" ? "Whole order (any product)" : "Any product"}</option>
            {[...products].sort((a, b) => a.name.localeCompare(b.name)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <select value={reward.category} onChange={(event) => setReward(reward.key, { category: event.target.value })} className="inv-select" aria-label="Category" disabled={Boolean(reward.productId)}>
            <option value="">Any category</option>
            {categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {reward.rewardType === "free_item" ? <label className="loy-price-input"><span>Up to ₱</span><MoneyField value={reward.maxPrice} onChange={(typed) => setReward(reward.key, { maxPrice: typed })} placeholder="any price" aria-label="Price limit" /></label> : <span />}
        </div>
      </div>)}
    </div>}
  </section>;

  return <Modal onClose={onClose} closeDisabled={saving !== null} label={campaign ? "Edit campaign" : "New campaign"}>
    <form onSubmit={(event) => { event.preventDefault(); void save(campaign ? "save" : "draft"); }} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 680, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={campaign ? `Edit ${campaign.name}` : birthday ? "Birthday treat" : "New loyalty campaign"} sub={birthday ? "A free treat for each customer around their birthday, once a year. It has no end date: switch it off and on whenever you like." : campaign?.status === "running" ? "Changes apply to orders from now on. Stars already earned stay." : "A season of the loyalty program: how stars are earned and what they buy."} onClose={onClose} disabled={saving !== null} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        {birthday ? <>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Basics</h3></div></header>
            <div className="flex flex-col gap-3">
              <WizardField label="Name"><input data-autofocus value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Birthday treat" style={packagingInput} maxLength={80} /></WizardField>
              <WizardField label="Description (optional)" hint="Shown to customers on the mobile menu."><input value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Happy birthday from Brew Houze!" style={packagingInput} maxLength={400} /></WizardField>
            </div>
          </section>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>When customers can get it</h3><p>Once a year per customer. They need their birthday on their profile (they add it on the mobile menu, or you add it in Customers).</p></div></header>
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Birthday window">
              {(Object.keys(birthdayWindowLabels) as BirthdayWindow[]).map((window) => <button key={window} type="button" role="radio" aria-checked={draft.birthdayWindow === window} style={choice(draft.birthdayWindow === window)} onClick={() => set("birthdayWindow", window)}><strong style={{ display: "block", color: "#3D2B1F", fontSize: 13.5 }}>{birthdayWindowLabels[window][0]}</strong><span style={{ color: "#9C8278", fontSize: 12 }}>{birthdayWindowLabels[window][1]}</span></button>)}
            </div>
          </section>
          {rewardEditor}
        </> : <>
        <section className="acc-block">
          <header className="acc-block-head"><div><h3>Basics</h3></div></header>
          <div className="flex flex-col gap-3">
            <WizardField label="Name"><input data-autofocus value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. Holiday Stars 2026" style={packagingInput} maxLength={80} /></WizardField>
            <WizardField label="Description (optional)" hint="Shown to customers on the mobile menu."><input value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Collect stars on every drink and get a free one!" style={packagingInput} maxLength={400} /></WizardField>
            <div className="inv-step-grid">
              <WizardField label="Starts"><input type="date" value={draft.startsOn} onChange={(event) => set("startsOn", event.target.value)} style={packagingInput} /></WizardField>
              <WizardField label="Ends (optional)" hint="Empty: runs until you end it."><input type="date" value={draft.endsOn} min={draft.startsOn} onChange={(event) => set("endsOn", event.target.value)} style={packagingInput} /></WizardField>
            </div>
          </div>
        </section>

        <section className="acc-block">
          <header className="acc-block-head"><div><h3>How customers earn stars</h3><p>Only orders linked to a customer earn stars: mobile orders while signed in, and counter orders the cashier attaches them to.</p></div></header>
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Earning">
            <button type="button" role="radio" aria-checked={draft.earnMode === "per_item"} style={choice(draft.earnMode === "per_item")} onClick={() => set("earnMode", "per_item")}><strong style={{ display: "block", color: "#3D2B1F", fontSize: 13.5 }}>Per item</strong><span style={{ color: "#9C8278", fontSize: 12 }}>Like a stamp card: each drink or item counts.</span></button>
            <button type="button" role="radio" aria-checked={draft.earnMode === "per_amount"} style={choice(draft.earnMode === "per_amount")} onClick={() => set("earnMode", "per_amount")}><strong style={{ display: "block", color: "#3D2B1F", fontSize: 13.5 }}>Per amount spent</strong><span style={{ color: "#9C8278", fontSize: 12 }}>Stars for every set amount, like ₱100.</span></button>
            <button type="button" role="radio" aria-checked={draft.earnMode === "per_order"} style={choice(draft.earnMode === "per_order")} onClick={() => set("earnMode", "per_order")}><strong style={{ display: "block", color: "#3D2B1F", fontSize: 13.5 }}>Per order</strong><span style={{ color: "#9C8278", fontSize: 12 }}>Stars for each visit, however much they order.</span></button>
          </div>
          <div className="inv-step-grid" style={{ marginTop: 12 }}>
            <WizardField label="Stars earned"><input type="number" min={1} max={100} step={1} value={draft.starsPerUnit} onChange={(event) => set("starsPerUnit", event.target.value)} style={packagingInput} /></WizardField>
            {draft.earnMode === "per_amount"
              ? <WizardField label="For every (₱)"><MoneyField value={draft.amountStep} onChange={(typed) => set("amountStep", typed)} style={packagingInput} /></WizardField>
              : draft.earnMode === "per_order"
                ? <WizardField label="Minimum order (₱, optional)" hint="Empty: every order counts."><MoneyField value={draft.minOrderAmount} onChange={(typed) => set("minOrderAmount", typed)} placeholder="none" style={packagingInput} /></WizardField>
                : <WizardField label="For every"><input value="1 item" disabled style={{ ...packagingInput, color: "#9C8278" }} /></WizardField>}
          </div>
          <div style={{ marginTop: 12 }}>
            <WizardField label="Which items count" hint="None ticked: every item counts.">
              <div className="loy-cats">
                {categoryNames.map((name) => { const on = draft.categories.includes(name); return <button key={name} type="button" aria-pressed={on} onClick={() => set("categories", on ? draft.categories.filter((item) => item !== name) : [...draft.categories, name])}>{on ? "✓ " : ""}{name}</button>; })}
                {categoryNames.length === 0 && <span className="inv-hint">No categories yet.</span>}
              </div>
            </WizardField>
          </div>
          <div className="inv-step-grid" style={{ marginTop: 12 }}>
            <WizardField label="Most stars per order" hint="Empty: no limit."><input type="number" min={1} step={1} value={draft.maxPerOrder} onChange={(event) => set("maxPerOrder", event.target.value)} style={packagingInput} /></WizardField>
            <WizardField label="Most stars per day" hint="Per customer. Empty: no limit."><input type="number" min={1} step={1} value={draft.maxPerDay} onChange={(event) => set("maxPerDay", event.target.value)} style={packagingInput} /></WizardField>
          </div>
          <p className="loy-preview"><IconStar size={14} /> Customers earn {campaignRuleText(previewRules)}</p>
        </section>

        <section className="acc-block">
          <header className="acc-block-head"><div><h3>When the campaign ends</h3></div></header>
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="When the campaign ends">
            <button type="button" role="radio" aria-checked={!draft.carryOver} style={choice(!draft.carryOver)} onClick={() => set("carryOver", false)}><strong style={{ display: "block", color: "#3D2B1F", fontSize: 13.5 }}>Stars expire</strong><span style={{ color: "#9C8278", fontSize: 12 }}>The next campaign starts everyone at 0.</span></button>
            <button type="button" role="radio" aria-checked={draft.carryOver} style={choice(draft.carryOver)} onClick={() => set("carryOver", true)}><strong style={{ display: "block", color: "#3D2B1F", fontSize: 13.5 }}>Stars carry over</strong><span style={{ color: "#9C8278", fontSize: 12 }}>Unspent stars move into the next campaign you start.</span></button>
          </div>
        </section>

        {rewardEditor}
        </>}
        {error && <p role="alert" className="acc-error">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-wrap" style={{ borderColor: "#E8DDD5" }}>
        {problem && <span className="inv-footer-note">{problem}</span>}
        <button type="button" onClick={onClose} disabled={saving !== null} className="ui-button ui-button-secondary">Cancel</button>
        {campaign
          ? <button type="submit" disabled={saving !== null || Boolean(problem)} className="ui-button ui-button-primary">{saving ? "Saving…" : "Save changes"}</button>
          : <>
            <button type="submit" disabled={saving !== null || Boolean(problem)} className="ui-button ui-button-secondary">{saving === "draft" ? "Saving…" : "Save as draft"}</button>
            <button type="button" disabled={saving !== null || Boolean(problem)} onClick={() => void save("start")} className="ui-button ui-button-primary">{saving === "start" ? "Starting…" : birthday ? "Save and switch on" : "Save and start"}</button>
          </>}
      </div>
    </form>
  </Modal>;
}

function CampaignDialog({ campaign, onClose, onEdit, onChanged }: { campaign: LoyaltyCampaign; onClose: () => void; onEdit: () => void; onChanged: (message: string) => Promise<void> }) {
  const confirmAction = useConfirm();
  const [tab, setTab] = useState<"overview" | "members" | "history">("overview");
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/loyalty/${campaign.id}`, { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Could not load the campaign."); if (active) setDetail(payload.data); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load the campaign."); });
    return () => { active = false; };
  }, [campaign.id]);

  const birthday = campaign.kind === "birthday";
  async function act(action: "activate" | "end") {
    if (action === "end" && birthday && !(await confirmAction({ title: `Switch off ${campaign.name}?`, message: "Customers cannot get their birthday treat until you switch it on again. Treats already given stay recorded.", confirmLabel: "Switch off", tone: "default" }))) return;
    if (action === "end" && !birthday && !(await confirmAction({ title: `End ${campaign.name}?`, message: `Customers stop earning stars right away. ${campaign.carryOver ? "Their unspent stars carry over into the next campaign you start." : "Their unspent stars expire (they stay in the history)."} An ended campaign cannot be restarted.`, confirmLabel: "End campaign" }))) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/loyalty", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: campaign.id, action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not update the campaign.");
      await onChanged(birthday ? `${campaign.name} switched ${action === "end" ? "off" : "on"}.` : action === "end" ? `${campaign.name} ended.` : `${campaign.name} started.${payload.data?.carried ? ` Stars of ${payload.data.carried} customer${payload.data.carried === 1 ? "" : "s"} were carried over.` : ""}`);
      onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update the campaign.");
    } finally {
      setWorking(false);
    }
  }

  const stats = campaign.stats;
  return <Modal onClose={onClose} closeDisabled={working} labelledBy="campaign-dialog-title">
    <section className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 720, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <header className="acc-dialog-head">
        <span className="loy-badge">{birthday ? <span style={{ fontSize: 22 }}>🎂</span> : <IconStar size={24} />}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 id="campaign-dialog-title">{campaign.name}</h2>
          <p>{birthday ? "Birthday campaign · no end date" : campaignDateText(campaign)}</p>
          <LoyaltyStatusChip status={campaign.status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button type="button" className="inv-mini" onClick={() => detail && exportCampaignReport(campaign, detail)} disabled={!detail}><IconDownload size={13} />Export</button>
          <button type="button" onClick={onClose} disabled={working} title="Close" className="inv-mini" style={{ width: 34, padding: 0, justifyContent: "center" }}><IconX size={14} /></button>
        </div>
      </header>
      <div className="acc-tabs" role="tablist" aria-label="Campaign sections">
        {(birthday ? [["overview", "Overview"]] as const : [["overview", "Overview"], ["members", `Members${detail ? ` (${detail.members.length})` : ""}`], ["history", "Star history"]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        {error && <p role="alert" className="acc-error">{error}</p>}
        {tab === "overview" && birthday && <>
          <div className="acc-stats">
            <div><span>Treats this year</span><strong>{campaign.birthdayClaims}</strong></div>
            <div><span>Window</span><strong style={{ fontSize: 14 }}>{birthdayWindowLabels[campaign.birthdayWindow ?? "week"][0]}</strong></div>
            <div><span>Status</span><strong style={{ fontSize: 14 }}>{loyaltyStatusLabels[campaign.status]}</strong></div>
          </div>
          <p className="loy-preview"><span aria-hidden="true">🎂</span> {birthdayRuleText(campaign)}</p>
          {detail?.results && ((detail.results.birthdayTreats?.length ?? 0) > 0 || detail.results.rewards.length > 0 || (detail.results.discounts?.length ?? 0) > 0) && <section className="acc-block">
            <header className="acc-block-head"><div><h3>Treats given</h3></div></header>
            <ul className="acc-list">
              {detail.results.birthdayTreats?.map((row) => <li key={row.year}><span><strong>{row.year}</strong></span><span className="acc-list-end"><strong>{row.treats} treat{row.treats === 1 ? "" : "s"}</strong></span></li>)}
              {detail.results.rewards.map((reward) => <li key={`r${reward.rewardId}`}><span><strong>{reward.name}</strong><em>{reward.claimed} free item{reward.claimed === 1 ? "" : "s"} · normally {peso(reward.value)}</em></span><span className="acc-list-end"><strong>{reward.cost === null ? "cost not recorded" : `cost ${peso(reward.cost)}`}</strong></span></li>)}
              {detail.results.discounts?.map((discount) => <li key={`d${discount.rewardId}`}><span><strong>{discount.name}</strong><em>{discount.uses} order{discount.uses === 1 ? "" : "s"}</em></span><span className="acc-list-end"><strong>−{peso(discount.amount)}</strong></span></li>)}
            </ul>
          </section>}
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Treats</h3></div></header>
            {campaign.rewards.length === 0 ? <p className="inv-hint">No treat set.</p> : <ul className="acc-list">
              {campaign.rewards.map((reward) => <li key={reward.id}><span><strong>{reward.name}</strong><em>{rewardCoverage(reward)}</em></span><span className="acc-list-end"><strong className="loy-cost">Free</strong></span></li>)}
            </ul>}
          </section>
          <div className="flex gap-2 flex-wrap justify-end">
            <button type="button" className="ui-button ui-button-secondary" disabled={working} onClick={onEdit}>Edit</button>
            {campaign.isActive
              ? <button type="button" className="ui-button ui-button-secondary" disabled={working} onClick={() => void act("end")}>{working ? "Switching off…" : "Switch off"}</button>
              : <button type="button" className="ui-button ui-button-primary" disabled={working} onClick={() => void act("activate")}>{working ? "Switching on…" : "Switch on"}</button>}
          </div>
        </>}
        {tab === "overview" && !birthday && <>
          <div className="acc-stats">
            <div><span>Members</span><strong>{stats.members}</strong></div>
            <div><span>Stars earned</span><strong>{stats.earned.toLocaleString("en-PH")}</strong></div>
            <div><span>Taken back</span><strong className={stats.reversed ? "dash-down" : ""}>{stats.reversed.toLocaleString("en-PH")}</strong></div>
            <div><span>Unspent now</span><strong>{stats.outstanding.toLocaleString("en-PH")}</strong></div>
          </div>
          {detail?.results && <section className="acc-block">
            <header className="acc-block-head"><div><h3>Results</h3><p>What members bought while the campaign ran, and what the free rewards cost the café.</p></div></header>
            <div className="acc-stats">
              <div><span>Sales from members</span><strong>{peso(detail.results.memberSales)}</strong></div>
              <div><span>Member orders</span><strong>{detail.results.memberOrders}</strong></div>
              <div><span>Rewards given</span><strong>{detail.results.rewards.reduce((sum, reward) => sum + reward.claimed, 0)}</strong></div>
              <div><span>Cost of rewards</span><strong>{detail.results.rewardCost === null ? "—" : peso(detail.results.rewardCost)}</strong></div>
            </div>
            {detail.results.rewards.length > 0 && <ul className="acc-list" style={{ marginTop: 10 }}>
              {detail.results.rewards.map((reward) => <li key={reward.rewardId}><span><strong>{reward.name}</strong><em>{reward.claimed} given · normally {peso(reward.value)}</em></span><span className="acc-list-end"><strong>{reward.cost === null ? "cost not recorded" : `cost ${peso(reward.cost)}`}</strong></span></li>)}
            </ul>}
            {(detail.results.discounts?.length ?? 0) > 0 && <ul className="acc-list" style={{ marginTop: 10 }}>
              {detail.results.discounts?.map((discount) => <li key={discount.rewardId}><span><strong>{discount.name}</strong><em>{discount.uses} order{discount.uses === 1 ? "" : "s"} with this discount</em></span><span className="acc-list-end"><strong>−{peso(discount.amount)}</strong></span></li>)}
            </ul>}
            {detail.results.memberSales > 0 && detail.results.rewardCost !== null && <p className="loy-preview" style={{ marginTop: 10 }}><IconStar size={14} /> Rewards cost {Math.round((detail.results.rewardCost / detail.results.memberSales) * 1000) / 10}% of what members spent.</p>}
          </section>}
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Rules</h3></div></header>
            <ul className="loy-facts">
              <li><strong>Earning</strong><span>{campaignRuleText(campaign)}</span></li>
              <li><strong>When it ends</strong><span>{campaign.carryOver ? "Unspent stars carry over to the next campaign." : "Unspent stars expire."}</span></li>
              {campaign.description && <li><strong>Shown to customers</strong><span>{campaign.description}</span></li>}
              {(stats.adjusted !== 0 || stats.carriedIn > 0) && <li><strong>Other stars</strong><span>{stats.carriedIn ? `${starsText(stats.carriedIn)} carried over. ` : ""}{stats.adjusted ? `${stats.adjusted > 0 ? "+" : ""}${starsText(stats.adjusted)} adjusted by the admin.` : ""}</span></li>}
            </ul>
          </section>
          <section className="acc-block">
            <header className="acc-block-head"><div><h3>Rewards</h3></div></header>
            {campaign.rewards.length === 0 ? <p className="inv-hint">No rewards set.</p> : <ul className="acc-list">
              {campaign.rewards.map((reward) => <li key={reward.id}><span><strong>{reward.name}</strong><em>{rewardCoverage(reward)}</em></span><span className="acc-list-end"><strong className="loy-cost">★ {reward.starsCost}</strong></span></li>)}
            </ul>}
          </section>
          <div className="flex gap-2 flex-wrap justify-end">
            {campaign.status !== "ended" && <button type="button" className="ui-button ui-button-secondary" disabled={working} onClick={onEdit}>Edit</button>}
            {campaign.status === "draft" && <button type="button" className="ui-button ui-button-primary" disabled={working} onClick={() => void act("activate")}>{working ? "Starting…" : "Start campaign"}</button>}
            {(campaign.status === "running" || campaign.status === "scheduled" || (campaign.status === "ended" && campaign.isActive)) && <button type="button" className="ui-button ui-button-primary" style={{ background: "#B91C1C" }} disabled={working} onClick={() => void act("end")}>{working ? "Ending…" : "End campaign"}</button>}
          </div>
        </>}
        {tab === "members" && (!detail ? <p className="inv-hint">Loading…</p> : detail.members.length === 0 ? <p className="inv-hint">No one has stars in this campaign yet.</p> : <ul className="acc-list">
          {detail.members.map((member) => <li key={member.customerId}>
            <span><strong>{member.erased ? "Erased customer" : member.fullName}</strong><em>{member.username ? `@${member.username} · ` : ""}{member.orders} order{member.orders === 1 ? "" : "s"} · last {shiftTime(member.lastActivity)}</em></span>
            <span className="acc-list-end"><strong className="loy-cost">★ {member.balance}</strong></span>
          </li>)}
        </ul>)}
        {tab === "history" && (!detail ? <p className="inv-hint">Loading…</p> : detail.entries.length === 0 ? <p className="inv-hint">No stars given yet.</p> : <ul className="acc-list">
          {detail.entries.map((entry) => <li key={entry.id}>
            <span><strong>{entry.customerName} · {starEntryLabels[entry.kind] ?? entry.kind}</strong><em>{shiftTime(entry.createdAt)}{entry.orderId ? ` · Order ${entry.orderId}${entry.queueNumber ? ` (#${entry.queueNumber})` : ""}` : ""}{entry.reason ? ` · ${entry.reason}` : ""}{entry.adminName ? ` · by ${entry.adminName}` : ""}</em></span>
            <span className="acc-list-end"><strong className={entry.stars < 0 ? "dash-down" : "loy-plus"}>{entry.stars > 0 ? "+" : ""}{entry.stars}</strong></span>
          </li>)}
        </ul>)}
      </div>
    </section>
  </Modal>;
}

function Loyalty({ products, categories }: { products: Product[]; categories: ProductCategory[] }) {
  const confirmAction = useConfirm();
  const [campaigns, setCampaigns] = useState<LoyaltyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<LoyaltyCampaign | "new" | "new-birthday" | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/loyalty", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load the loyalty campaigns.");
      setCampaigns(payload.data ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the loyalty campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changed(message: string) {
    setNotice(message);
    await load();
  }

  async function deleteDraft(campaign: LoyaltyCampaign) {
    if (!(await confirmAction({ title: `Delete the draft ${campaign.name}?`, message: "It was never started, so nothing else is affected.", confirmLabel: "Delete draft" }))) return;
    try {
      const response = await fetch(`/api/loyalty?id=${campaign.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not delete the draft.");
      await changed("Draft deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the draft.");
    }
  }

  function exportAllCampaigns() {
    try {
      saveWorkbook([
        ["Summary", excelInfo([
          ["Brew Houze loyalty campaigns"],
          ["Generated", excelNow()],
          ["Campaigns", campaigns.length],
          ["Stars earned, all campaigns", campaigns.reduce((sum, campaign) => sum + campaign.stats.earned, 0)],
          ["Rewards claimed, all campaigns", campaigns.reduce((sum, campaign) => sum + campaign.stats.rewardsClaimed, 0)],
        ], ["Campaigns", "Stars earned, all campaigns", "Rewards claimed, all campaigns"])],
        ["Campaigns", excelTable(campaigns, [
          { header: "Campaign", value: (campaign) => campaign.name },
          { header: "Status", value: (campaign) => loyaltyStatusLabels[campaign.status] },
          { header: "Dates", value: (campaign) => campaignDateText(campaign) },
          { header: "How stars are earned", value: (campaign) => campaignRuleText(campaign) },
          { header: "When it ends", value: (campaign) => campaign.carryOver ? "Carry over" : "Expire" },
          { header: "Members", value: (campaign) => campaign.stats.members, kind: "count" },
          { header: "Orders with stars", value: (campaign) => campaign.stats.orders, kind: "count" },
          { header: "Stars earned", value: (campaign) => campaign.stats.earned, kind: "count" },
          { header: "Stars taken back", value: (campaign) => campaign.stats.reversed, kind: "count" },
          { header: "Stars adjusted (net)", value: (campaign) => campaign.stats.adjusted, kind: "count" },
          { header: "Stars spent", value: (campaign) => campaign.stats.redeemed, kind: "count" },
          { header: "Rewards claimed", value: (campaign) => campaign.stats.rewardsClaimed, kind: "count" },
          { header: "Stars unspent", value: (campaign) => campaign.stats.outstanding, kind: "count" },
          { header: "Rewards", value: (campaign) => campaign.rewards.map((reward) => `${reward.name} (${reward.starsCost})`).join(", ") },
        ])],
      ], `brew-houze-loyalty-campaigns-${getFinanceDateStamp()}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the campaigns.");
    }
  }

  const seasonal = campaigns.filter((campaign) => campaign.kind !== "birthday");
  const birthdayCampaign = campaigns.find((campaign) => campaign.kind === "birthday" && campaign.isActive) ?? campaigns.find((campaign) => campaign.kind === "birthday") ?? null;
  const live = seasonal.find((campaign) => campaign.status === "running") ?? seasonal.find((campaign) => campaign.status === "scheduled") ?? null;
  const others = seasonal.filter((campaign) => campaign !== live);

  async function toggleBirthday(campaign: LoyaltyCampaign) {
    try {
      const response = await fetch("/api/loyalty", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: campaign.id, action: campaign.isActive ? "end" : "activate" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not switch the birthday treat.");
      await changed(`${campaign.name} switched ${campaign.isActive ? "off" : "on"}.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not switch the birthday treat.");
    }
  }
  const open = campaigns.find((campaign) => campaign.id === openId) ?? null;

  return <div className="inv-wrap">
    <div className="inv">
      <p className="inv-hint" style={{ margin: 0 }}>Run the loyalty program in seasons. Customers earn stars on orders linked to them (signed in on the mobile menu, or attached by the cashier) while a campaign is running. One seasonal campaign runs at a time; the birthday treat runs alongside it.</p>
      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
      {notice && <div className="acc-notice" role="status">{notice}</div>}

      {loading ? <div className="inv-empty">Loading campaigns…</div> : <>
        {live ? <section className="loy-hero">
          <div className="loy-hero-top">
            <span className="loy-badge is-large"><IconStar size={28} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <LoyaltyStatusChip status={live.status} />
              <h2>{live.name}</h2>
              <p>{campaignDateText(live)} · {live.carryOver ? "stars carry over" : "stars expire at the end"}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="inv-secondary" onClick={() => setEditing(live)}>Edit</button>
              <button type="button" className="inv-primary" onClick={() => setOpenId(live.id)}>Open</button>
            </div>
          </div>
          <p className="loy-hero-rule"><IconStar size={14} /> Customers earn {campaignRuleText(live)}</p>
          <div className="loy-hero-stats">
            <div><span>Members</span><strong>{live.stats.members}</strong></div>
            <div><span>Orders with stars</span><strong>{live.stats.orders}</strong></div>
            <div><span>Stars earned</span><strong>{live.stats.earned.toLocaleString("en-PH")}</strong></div>
            <div><span>Unspent now</span><strong>{live.stats.outstanding.toLocaleString("en-PH")}</strong></div>
          </div>
          {live.rewards.length > 0 && <div className="loy-hero-rewards">{live.rewards.map((reward) => <span key={reward.id}><strong>★ {reward.starsCost}</strong>{reward.name}</span>)}</div>}
        </section> : <div className="inv-onboard">
          <span className="inv-kind-icon is-packaged" style={{ width: 52, height: 52 }}><IconStar size={24} /></span>
          <h2>No campaign is running</h2>
          <p>Start a campaign when the café runs its loyalty cards: choose how stars are earned, the limits, and the free rewards.</p>
          <button type="button" className="inv-primary" onClick={() => setEditing("new")}><IconPlus size={15} />New campaign</button>
        </div>}

        <section className={`loy-birthday${birthdayCampaign?.isActive ? " is-on" : ""}`}>
          <span className="loy-birthday-icon" aria-hidden="true">🎂</span>
          {birthdayCampaign ? <>
            <div className="loy-birthday-text">
              <strong>{birthdayCampaign.name} <LoyaltyStatusChip status={birthdayCampaign.status} /></strong>
              <span>{birthdayRuleText(birthdayCampaign)}</span>
              <em>{birthdayCampaign.rewards.map((reward) => reward.rewardType === "discount" ? `${reward.name} (${rewardDiscountText(reward)})` : reward.name).join(" or ") || "No treat set"} · {birthdayCampaign.birthdayClaims} given this year</em>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="inv-secondary" onClick={() => setOpenId(birthdayCampaign.id)}>Open</button>
              <button type="button" className={birthdayCampaign.isActive ? "inv-secondary" : "inv-primary"} onClick={() => void toggleBirthday(birthdayCampaign)}>{birthdayCampaign.isActive ? "Switch off" : "Switch on"}</button>
            </div>
          </> : <>
            <div className="loy-birthday-text"><strong>Birthday treat</strong><span>Give every customer a free treat around their birthday, once a year. It runs next to your seasonal campaign and has no end date.</span></div>
            <button type="button" className="inv-primary" onClick={() => setEditing("new-birthday")}><IconPlus size={14} />Set up</button>
          </>}
        </section>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="loy-section-title">All campaigns</h3>
          <div className="flex gap-2 flex-wrap">
            {campaigns.length > 0 && <button type="button" className="inv-secondary" onClick={exportAllCampaigns}><IconDownload size={14} />Export all</button>}
            {live && <button type="button" className="inv-secondary" onClick={() => setEditing("new")}><IconPlus size={14} />New campaign</button>}
          </div>
        </div>
        {others.length === 0 ? <p className="inv-hint">{live ? "Drafts and past campaigns appear here." : "No campaigns yet."}</p> : <div className="acc-grid">
          {others.map((campaign) => <div key={campaign.id} className={`acc-card loy-card${campaign.status === "ended" ? " is-inactive" : ""}`} role="button" tabIndex={0} onClick={() => setOpenId(campaign.id)} onKeyDown={(event) => { if (event.key === "Enter") setOpenId(campaign.id); }}>
            <span className="acc-card-top">
              <span className="loy-badge"><IconStar size={20} /></span>
              <span className="acc-card-name"><strong>{campaign.name}</strong><em>{campaignDateText(campaign)}</em></span>
              <LoyaltyStatusChip status={campaign.status} />
            </span>
            <span className="loy-card-rule">{campaignRuleText(campaign)}</span>
            <span className="acc-card-stats">
              <span><em>Members</em><strong>{campaign.stats.members}</strong></span>
              <span><em>Stars earned</em><strong>{campaign.stats.earned.toLocaleString("en-PH")}</strong></span>
              <span><em>Rewards</em><strong>{campaign.rewards.length}</strong></span>
            </span>
            {campaign.status === "draft" && <span className="flex gap-2" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="inv-mini" onClick={() => setEditing(campaign)}>Edit</button>
              <button type="button" className="inv-mini" onClick={() => void deleteDraft(campaign)}>Delete draft</button>
            </span>}
          </div>)}
        </div>}
      </>}
    </div>
    {open && <CampaignDialog key={open.id} campaign={open} onClose={() => setOpenId(null)} onEdit={() => { setOpenId(null); setEditing(open); }} onChanged={changed} />}
    {editing && <CampaignFormDialog campaign={editing === "new" || editing === "new-birthday" ? null : editing} kind={editing === "new-birthday" ? "birthday" : "seasonal"} products={products} categories={categories} onClose={() => setEditing(null)} onSaved={changed} />}
  </div>;
}

// ─── Discounts ────────────────────────────────────────────────────────────────
// Discounts the counter gives with an ID: Senior Citizen and PWD (set by law), Student, Employee
// meal and custom ones. The cashier enters the name and ID number, and ticks the items that are
// the person's own (or splits a shared bill).
type DiscountTypeAdmin = {
  id: number; code: "senior" | "pwd" | "student" | "employee" | "custom"; name: string; discountKind: "percent" | "fixed"; discountValue: number; maxDiscount: number | null;
  vatExempt: boolean; requiresId: boolean; idLabel: string | null; isActive: boolean; statutory: boolean;
  stats: { uses: number; usesThisMonth: number; discount: number; vatExempt: number; everUsed: boolean };
};
type VatSetting = { registered: boolean; rate: number };
const discountIcons: Record<DiscountTypeAdmin["code"], string> = { senior: "🧓", pwd: "♿", student: "🎓", employee: "☕", custom: "🏷️" };

function discountRuleText(type: Pick<DiscountTypeAdmin, "discountKind" | "discountValue" | "maxDiscount" | "vatExempt">, vat: VatSetting): string {
  const off = type.discountKind === "percent" ? `${type.discountValue}% off` : `${peso(type.discountValue)} off`;
  return `${off}${type.vatExempt ? vat.registered ? `, VAT removed first (${vat.rate}%)` : ", no VAT to remove (not VAT-registered)" : ""}${type.maxDiscount !== null ? `, up to ${peso(type.maxDiscount)}` : ""}`;
}

function Discounts() {
  const confirmAction = useConfirm();
  const [types, setTypes] = useState<DiscountTypeAdmin[]>([]);
  const [vat, setVat] = useState<VatSetting>({ registered: true, rate: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState<number | "vat" | null>(null);
  const [editing, setEditing] = useState<DiscountTypeAdmin | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/discounts", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load the discounts.");
      setTypes(payload.data.types ?? []);
      setVat(payload.data.vat ?? { registered: true, rate: 12 });
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the discounts.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function send(method: "PATCH" | "DELETE", body: Record<string, unknown> | null, url = "/api/discounts") {
    const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Could not save the change.");
  }

  async function toggle(type: DiscountTypeAdmin) {
    if (type.isActive && type.statutory && !(await confirmAction({ title: `Switch off ${type.name}?`, message: `The law requires cafés to give the ${type.name} discount. Switch it off only if you handle it another way.`, confirmLabel: "Switch off", tone: "danger" }))) return;
    setWorking(type.id);
    setError("");
    try {
      await send("PATCH", { id: type.id, isActive: !type.isActive });
      setNotice(`${type.name} switched ${type.isActive ? "off" : "on"}.`);
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not switch the discount.");
    } finally {
      setWorking(null);
    }
  }

  async function remove(type: DiscountTypeAdmin) {
    if (!(await confirmAction({ title: `Delete ${type.name}?`, message: "It has never been used, so nothing else is affected.", confirmLabel: "Delete", tone: "danger" }))) return;
    setWorking(type.id);
    setError("");
    try {
      await send("DELETE", null, `/api/discounts?id=${type.id}`);
      setNotice(`${type.name} deleted.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the discount.");
    } finally {
      setWorking(null);
    }
  }

  async function setVatRegistered(registered: boolean) {
    if (!registered && !(await confirmAction({ title: "Turn off VAT registration?", message: "Senior and PWD discounts will then be 20% off the full price, with no VAT removed. Only do this if the café is not VAT-registered.", confirmLabel: "Turn off", tone: "danger" }))) return;
    setWorking("vat");
    setError("");
    try {
      await send("PATCH", { action: "vat", registered, rate: vat.rate });
      setNotice(registered ? "VAT registration switched on." : "VAT registration switched off.");
      await load();
    } catch (vatError) {
      setError(vatError instanceof Error ? vatError.message : "Could not save the VAT setting.");
    } finally {
      setWorking(null);
    }
  }

  // Example for the VAT card: a ₱150 drink for a senior.
  const example = 150;
  const exampleBase = vat.registered ? example / (1 + vat.rate / 100) : example;
  const examplePays = exampleBase * 0.8;

  return <div className="inv-wrap">
    <div className="inv">
      <p className="inv-hint" style={{ margin: 0 }}>Discounts the counter gives when a customer shows an ID. The cashier types their name and ID number, checks the photo, and ticks the items that are theirs. On a shared bill they can split it by the number of people instead. An order has either ID discounts or a loyalty discount, never both.</p>
      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
      {notice && <div className="acc-notice" role="status">{notice}</div>}

      {loading ? <div className="inv-empty">Loading discounts…</div> : <>
        <section className={`dsc-vat${vat.registered ? " is-on" : ""}`}>
          <span className="dsc-vat-icon" aria-hidden="true">🧾</span>
          <div className="dsc-vat-text">
            <PermissionSwitch checked={vat.registered} disabled={working === "vat"} title={`VAT-registered (${vat.rate}% VAT)`} description="Senior and PWD customers do not pay VAT on their own food and drinks. When the café is VAT-registered, the VAT comes off before their 20% discount." onChange={(checked) => void setVatRegistered(checked)} />
            <p className="dsc-vat-example">Example, a {peso(example)} drink for a senior: {vat.registered ? <>without VAT {peso(exampleBase)}, then 20% off ({peso(exampleBase * 0.2)}), so they pay <strong>{peso(examplePays)}</strong>.</> : <>20% off ({peso(example * 0.2)}), so they pay <strong>{peso(examplePays)}</strong>.</>}</p>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="loy-section-title">Discounts</h3>
          <button type="button" className="inv-secondary" onClick={() => setEditing("new")}><IconPlus size={14} />New discount</button>
        </div>
        {types.length === 0 ? <p className="inv-hint">No discounts yet. Run the ID discounts migration first.</p> : <div className="acc-grid">
          {types.map((type) => <div key={type.id} className={`acc-card dsc-card${type.isActive ? "" : " is-inactive"}`} style={{ cursor: "default" }}>
            <span className="acc-card-top">
              <span className="loy-badge dsc-badge" aria-hidden="true">{discountIcons[type.code] ?? "🏷️"}</span>
              <span className="acc-card-name"><strong>{type.name}</strong><em>{discountRuleText(type, vat)}</em></span>
              <span className={`acc-status ${type.isActive ? "is-on" : "is-off"}`}><i />{type.isActive ? "On" : "Off"}</span>
            </span>
            <span className="acc-perms">
              {type.statutory && <span className="acc-perm is-on">Set by law</span>}
              {type.vatExempt && <span className="acc-perm is-on">VAT-exempt</span>}
              <span className={`acc-perm${type.requiresId ? " is-on" : ""}`}>{type.requiresId ? `Needs ${type.idLabel ?? "an ID number"}` : "No ID needed"}</span>
              {type.statutory && <span className="acc-perm is-on">Customer signs</span>}
            </span>
            <span className="acc-card-stats">
              <span><em>This month</em><strong>{type.stats.usesThisMonth}</strong></span>
              <span><em>All time</em><strong>{type.stats.uses}</strong></span>
              <span><em>Given</em><strong>{peso(type.stats.discount + type.stats.vatExempt)}</strong></span>
            </span>
            <span className="flex gap-2 flex-wrap">
              <button type="button" className="inv-mini" disabled={working === type.id} onClick={() => void toggle(type)}>{type.isActive ? "Switch off" : "Switch on"}</button>
              {!type.statutory && <button type="button" className="inv-mini" onClick={() => setEditing(type)}><IconPencil size={12} />Edit</button>}
              {type.code === "custom" && !type.stats.everUsed && <button type="button" className="inv-mini" disabled={working === type.id} onClick={() => void remove(type)}><IconTrash size={12} />Delete</button>}
            </span>
          </div>)}
        </div>}
        <DiscountRegister />
      </>}
    </div>
    {editing && <DiscountFormDialog discount={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); setNotice(message); await load(); }} />}
  </div>;
}

// The ID discount register: every senior, PWD and other ID discount given in a date range, with
// the name and ID number. The café keeps it for senior and PWD sales (the Excel export has every
// column the record needs). Voided and refunded orders are shown struck through and not counted.
type RegisterEntry = {
  id: number; at: string; businessDate: string; orderId: number; queueNumber: number | null; shiftId: number | null; reversed: boolean; status: string;
  code: string; typeName: string; holderName: string; idNumber: string | null; groupSize: number | null; coveredAmount: number; vatExempt: number; discount: number; cashierName: string | null;
};
const REGISTER_PREVIEW_ROWS = 60;

function DiscountRegister() {
  const today = getFinanceDateStamp();
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [scope, setScope] = useState<"all" | "statutory">("all");
  const [rows, setRows] = useState<RegisterEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!from || !to || from > to) { setError("Choose a start date on or before the end date."); return; }
      setError("");
      setRows(null);
      fetch(`/api/discounts/register?from=${from}&to=${to}`, { cache: "no-store" })
        .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload?.error || "Could not load the register."); if (active) setRows(payload.data ?? []); })
        .catch((loadError) => { if (active) { setRows([]); setError(loadError instanceof Error ? loadError.message : "Could not load the register."); } });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [from, to]);

  const shown = (rows ?? []).filter((row) => scope === "all" || row.code === "senior" || row.code === "pwd");
  const counted = shown.filter((row) => !row.reversed);
  const total = (pick: (row: RegisterEntry) => number) => counted.reduce((sum, row) => sum + pick(row), 0);
  const when = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const covers = (row: RegisterEntry) => row.groupSize ? `Share of bill (1 of ${row.groupSize})` : "Own items";

  function exportRegister() {
    try {
      const byType = Array.from(new Set(counted.map((row) => row.typeName))).map((name) => {
        const list = counted.filter((row) => row.typeName === name);
        return [name, list.length, list.reduce((sum, row) => sum + row.coveredAmount, 0), list.reduce((sum, row) => sum + row.vatExempt, 0), list.reduce((sum, row) => sum + row.discount, 0)] as [string, number, number, number, number];
      });
      saveWorkbook([
        ["Summary", excelInfo([
          [`Brew Houze ID discount register${scope === "statutory" ? " (senior citizen and PWD)" : ""}`],
          ["Business dates", `${from} to ${to}`],
          ["Generated", excelNow()],
          [],
          ["Discount", "Entries", "Gross amount", "VAT exempt", "Discount"],
          ...byType,
          ["Total", counted.length, total((row) => row.coveredAmount), total((row) => row.vatExempt), total((row) => row.discount)],
          [],
          ["Voided or refunded orders are listed in the register but not counted here."],
        ], ["Entries"])],
        ["Register", excelTable(shown, [
          { header: "Business date", value: (row) => row.businessDate },
          { header: "Time", value: (row) => when(row.at) },
          { header: "Order no.", value: (row) => row.orderId, kind: "count" },
          { header: "Queue no.", value: (row) => row.queueNumber, kind: "count" },
          { header: "Shift", value: (row) => row.shiftId, kind: "count" },
          { header: "Discount", value: (row) => row.typeName },
          { header: "Name", value: (row) => row.holderName },
          { header: "ID no.", value: (row) => row.idNumber ?? "" },
          { header: "Covers", value: (row) => covers(row) },
          { header: "Gross amount", value: (row) => row.coveredAmount, kind: "money" },
          { header: "VAT exempt", value: (row) => row.vatExempt || null, kind: "money" },
          { header: "Discount", value: (row) => row.discount, kind: "money" },
          { header: "Amount paid", value: (row) => Math.round((row.coveredAmount - row.vatExempt - row.discount) * 100) / 100, kind: "money" },
          { header: "Cashier", value: (row) => row.cashierName ?? "" },
          { header: "Status", value: (row) => row.reversed ? (row.status.toLowerCase().startsWith("void") ? "Voided" : "Refunded") : "Completed" },
        ])],
      ], `brew-houze-discount-register-${from}-to-${to}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export the register.");
    }
  }

  return <section className="acc-block dsc-register">
    <header className="acc-block-head">
      <div><h3>Discount register</h3><p>Every ID discount given, with the name and ID number. Keep the senior and PWD part for the café&apos;s records.</p></div>
    </header>
    <div className="dsc-register-tools">
      <label><span>From</span><input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} style={packagingInput} /></label>
      <label><span>To</span><input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} style={packagingInput} /></label>
      <div className="dsc-register-scope" role="radiogroup" aria-label="Which discounts">
        {([["all", "All discounts"], ["statutory", "Senior & PWD"]] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={scope === value} className={scope === value ? "is-on" : ""} onClick={() => setScope(value)}>{label}</button>)}
      </div>
      <button type="button" className="inv-secondary" disabled={!rows || shown.length === 0} onClick={exportRegister}><IconDownload size={14} />Export</button>
    </div>
    {error && <p role="alert" className="acc-error">{error}</p>}
    {rows === null ? <div className="inv-empty">Loading the register…</div> : shown.length === 0 ? <p className="inv-hint" style={{ margin: 0 }}>No ID discounts in these dates.</p> : <>
      <div className="dsc-register-totals">
        <span><em>Entries</em><strong>{counted.length}</strong></span>
        <span><em>Gross amount</em><strong>{peso(total((row) => row.coveredAmount))}</strong></span>
        <span><em>VAT exempt</em><strong>{peso(total((row) => row.vatExempt))}</strong></span>
        <span><em>Discount</em><strong>{peso(total((row) => row.discount))}</strong></span>
      </div>
      <div className="fin-table-wrap">
        <table className="fin-table dsc-register-table">
          <thead><tr><th>When</th><th>Order</th><th>Discount</th><th>Name · ID no.</th><th className="is-num">Gross</th><th className="is-num">VAT exempt</th><th className="is-num">Discount</th></tr></thead>
          <tbody>
            {shown.slice(0, REGISTER_PREVIEW_ROWS).map((row) => <tr key={row.id} className={row.reversed ? "is-reversed" : ""}>
              <td>{when(row.at)}<span className="fin-table-sub">{row.cashierName ?? ""}</span></td>
              <td>#{row.orderId}{row.queueNumber ? <span className="fin-table-sub">Queue {row.queueNumber}</span> : null}</td>
              <td>{row.typeName}<span className="fin-table-sub">{row.reversed ? (row.status.toLowerCase().startsWith("void") ? "Voided" : "Refunded") : covers(row)}</span></td>
              <td><strong>{row.holderName}</strong><span className="fin-table-sub">{row.idNumber ?? "No ID number"}</span></td>
              <td className="is-num">{peso(row.coveredAmount)}</td>
              <td className="is-num">{row.vatExempt ? peso(row.vatExempt) : "—"}</td>
              <td className="is-num">{peso(row.discount)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {shown.length > REGISTER_PREVIEW_ROWS && <p className="inv-hint" style={{ margin: 0 }}>Showing the latest {REGISTER_PREVIEW_ROWS} of {shown.length}. The export has them all.</p>}
    </>}
  </section>;
}

function DiscountFormDialog({ discount, onClose, onSaved }: { discount: DiscountTypeAdmin | null; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState(() => ({
    name: discount?.name ?? "",
    discountKind: discount?.discountKind ?? "percent" as "percent" | "fixed",
    discountValue: discount ? String(discount.discountValue) : "10",
    maxDiscount: discount?.maxDiscount === null || discount?.maxDiscount === undefined ? "" : String(discount.maxDiscount),
    requiresId: discount?.requiresId ?? true,
    idLabel: discount?.idLabel ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const value = Number(draft.discountValue);
  const problem = !draft.name.trim() ? "Enter a name."
    : !Number.isFinite(value) || value <= 0 ? "Enter how much it takes off."
      : draft.discountKind === "percent" && value > 100 ? "A percentage can be at most 100."
        : draft.maxDiscount.trim() !== "" && !(Number(draft.maxDiscount) > 0) ? "The most it takes off must be more than ₱0, or left empty."
          : "";
  const choice = (active: boolean) => ({ flex: 1, padding: "10px 12px", borderRadius: 11, border: active ? "1.5px solid #D97706" : "1.5px solid #E8DDD5", background: active ? "#FFF7ED" : "#FFFFFF", textAlign: "left" as const, cursor: "pointer" });

  async function save() {
    if (problem) return;
    setSaving(true);
    setError("");
    try {
      const body = { ...(discount ? { id: discount.id } : {}), name: draft.name, discountKind: draft.discountKind, discountValue: value, maxDiscount: draft.discountKind === "percent" && draft.maxDiscount.trim() ? Number(draft.maxDiscount) : null, requiresId: draft.requiresId, idLabel: draft.idLabel };
      const response = await fetch("/api/discounts", { method: discount ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the discount.");
      await onSaved(discount ? `${draft.name.trim()} saved.` : `${draft.name.trim()} added and switched on.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the discount.");
      setSaving(false);
    }
  }

  return <Modal onClose={onClose} closeDisabled={saving} label={discount ? "Edit discount" : "New discount"}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={discount ? `Edit ${discount.name}` : "New discount"} sub="Given at the counter to a customer who shows an ID. The discount comes off the price as it is (VAT included)." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        <WizardField label="Name" hint="Shown to the cashier and on the receipt."><input data-autofocus value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="e.g. National athlete" style={packagingInput} maxLength={60} /></WizardField>
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Kind of discount">
          <button type="button" role="radio" aria-checked={draft.discountKind === "percent"} style={choice(draft.discountKind === "percent")} onClick={() => set("discountKind", "percent")}><strong style={{ display: "block", color: "#3D2B1F" }}>Percentage</strong><span style={{ fontSize: 12, color: "#9C8278" }}>e.g. 10% off their items</span></button>
          <button type="button" role="radio" aria-checked={draft.discountKind === "fixed"} style={choice(draft.discountKind === "fixed")} onClick={() => set("discountKind", "fixed")}><strong style={{ display: "block", color: "#3D2B1F" }}>Fixed amount</strong><span style={{ fontSize: 12, color: "#9C8278" }}>e.g. ₱20 off per person</span></button>
        </div>
        <div className="inv-step-grid">
          <WizardField label={draft.discountKind === "percent" ? "Percent off" : "Amount off (₱)"}><MoneyField value={draft.discountValue} onChange={(typed) => set("discountValue", typed)} style={packagingInput} /></WizardField>
          {draft.discountKind === "percent" && <WizardField label="Most it takes off (₱, optional)" hint="Empty: no limit."><MoneyField value={draft.maxDiscount} onChange={(typed) => set("maxDiscount", typed)} style={packagingInput} /></WizardField>}
        </div>
        <PermissionSwitch checked={draft.requiresId} title="Needs an ID number" description="The cashier must type the ID number and confirm they checked the ID." onChange={(checked) => set("requiresId", checked)} />
        <WizardField label={draft.requiresId ? "What the ID is called" : "ID field (optional)"} hint="The label the cashier sees, e.g. School ID no."><input value={draft.idLabel} onChange={(event) => set("idLabel", event.target.value)} placeholder="ID no." style={packagingInput} maxLength={60} /></WizardField>
        {error && <p role="alert" className="acc-error">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-wrap" style={{ borderColor: "#E8DDD5" }}>
        {problem && <span className="inv-footer-note">{problem}</span>}
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Cancel</button>
        <button type="submit" disabled={saving || Boolean(problem)} className="ui-button ui-button-primary">{saving ? "Saving…" : discount ? "Save changes" : "Add discount"}</button>
      </div>
    </form>
  </Modal>;
}

// ─── Delivery ─────────────────────────────────────────────────────────────────
// The rules for delivery orders from the mobile menu (on/off, hours, how many at once, free
// delivery, cash on delivery) and the zones the café delivers to, each with its fee.
type DeliveryRules = { enabled: boolean; start: string; end: string; maxActive: string; freeAbove: string; codEnabled: boolean; codMaxAmount: string; codMinOrders: string };
type DeliveryZoneAdmin = { id: number; name: string; description: string; fee: number; minOrder: number | null; isActive: boolean; addresses: number };
// Deliveries open right now: in progress, failed and not voided, or cash still with a rider.
type LiveDelivery = { id: number; orderId: number; queueNumber: number | null; status: string; payment: string; zone: string; recipient: string; total: number; codCollected: number | null; failureReason: string | null; rider: string | null; since: string };

function IconTruck({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17h7M15 17l-2-6h-3M13 11l1-3h3M5 12h5v3" /></svg>;
}

// The delivery hours, read back while the admin types them: a 24-hour bar with the window (wrapping
// past midnight) and the time now, how long it runs, whether it is open right now, and the mistakes
// that would stop delivery (one time only, the same time twice) or look like an AM/PM slip.
const DAY_MINUTES = 24 * 60;
function manilaMinutes(): number {
  const [hour, minute] = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return (hour % 24) * 60 + minute;
}
const hhmmMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
function clockOfMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
function hoursLength(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return [hours ? `${hours} h` : "", minutes % 60 ? `${minutes % 60} min` : ""].filter(Boolean).join(" ");
}
function deliveryHoursProblem(start: string, end: string): string | null {
  if (!start && !end) return null;
  if (!start || !end) return "Set both delivery times, or clear both (delivery then runs whenever a shift is open).";
  if (start === end) return "The delivery start and end are the same time, so delivery would never open. Change one of them.";
  return null;
}
function DeliveryHoursPreview({ start, end }: { start: string; end: string }) {
  const [now, setNow] = useState(manilaMinutes);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(manilaMinutes()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const problem = deliveryHoursProblem(start, end);
  const allDay = !start && !end;
  const from = start ? hhmmMinutes(start) : 0;
  const to = end ? hhmmMinutes(end) : 0;
  const valid = !problem && !allDay;
  const length = valid ? (to - from + DAY_MINUTES) % DAY_MINUTES : 0;
  const overnight = valid && to < from;
  const openNow = allDay || (valid && (overnight ? now >= from || now < to : now >= from && now < to));
  // The window on the bar: one piece, or two when it runs past midnight.
  const pieces = allDay ? [[0, DAY_MINUTES]] : !valid ? [] : overnight ? [[from, DAY_MINUTES], [0, to]] : [[from, to]];
  const warning = !valid ? null
    : length < 60 ? `Only ${hoursLength(length)} of delivery a day. If you meant a longer window, check the times and AM/PM.`
    : length > 16 * 60 ? `That is ${hoursLength(length)} of delivery a day${overnight ? ", through the night" : ""}. If you meant a shorter window, check AM/PM.`
    : null;
  const state = problem ? "is-bad" : warning ? "is-warn" : "is-ok";
  return <div className={`dlv-hours ${state}`} role="status" aria-live="polite">
    <div className="dlv-hours-head">
      <strong>{problem ? "Delivery would not open" : allDay ? "Whenever a shift is open" : `${clockOfMinutes(from)} – ${clockOfMinutes(to)}`}</strong>
      {!problem && <span className={`dlv-hours-now ${openNow ? "is-open" : "is-closed"}`}>{openNow ? "Open now" : `Closed now · opens ${clockOfMinutes(from)}`}</span>}
    </div>
    <div className="dlv-hours-bar" aria-hidden="true">
      {pieces.map(([a, b]) => <i key={a} style={{ left: `${(a / DAY_MINUTES) * 100}%`, width: `max(3px, ${((b - a) / DAY_MINUTES) * 100}%)` }} />)}
      <b style={{ left: `${(now / DAY_MINUTES) * 100}%` }} title="Now" />
    </div>
    <div className="dlv-hours-scale" aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
    <p>{problem ?? (allDay ? "No set hours: delivery orders are taken whenever a shift is open (and delivery is on)."
      : `${hoursLength(length)} a day${overnight ? `, past midnight: it ends at ${clockOfMinutes(to)} the next day` : ""}. Delivery also needs an open shift.`)}</p>
    {warning && <p className="dlv-hours-warn">{warning}</p>}
  </div>;
}

function Delivery() {
  const confirmAction = useConfirm();
  const [rules, setRules] = useState<DeliveryRules | null>(null);
  const [saved, setSaved] = useState<DeliveryRules | null>(null);
  const [zones, setZones] = useState<DeliveryZoneAdmin[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<DeliveryZoneAdmin | "new" | null>(null);
  const [live, setLive] = useState<LiveDelivery[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/delivery", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load the delivery settings.");
      setRules(payload.data.rules);
      setSaved(payload.data.rules);
      setZones(payload.data.zones ?? []);
      setLive(payload.data.live ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the delivery settings.");
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const set = <K extends keyof DeliveryRules>(key: K, value: DeliveryRules[K]) => setRules((current) => current && { ...current, [key]: value });
  const changed = rules !== null && saved !== null && JSON.stringify(rules) !== JSON.stringify(saved);
  const activeZones = zones.filter((zone) => zone.isActive);
  const liveFailed = live.filter((delivery) => delivery.status === "failed");
  const liveCash = live.filter((delivery) => delivery.payment === "cod" && delivery.codCollected !== null);
  const liveGoing = live.filter((delivery) => ["preparing", "ready", "out"].includes(delivery.status));

  async function saveRules() {
    if (!rules) return;
    if (rules.enabled && activeZones.length === 0) { setError("Add at least one zone before switching delivery on."); return; }
    const hoursProblem = deliveryHoursProblem(rules.start, rules.end);
    if (hoursProblem) { setError(hoursProblem); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/delivery", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", ...rules }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the rules.");
      setNotice("Delivery rules saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the rules.");
    } finally {
      setSaving(false);
    }
  }

  async function zoneAction(zone: DeliveryZoneAdmin, action: "toggle" | "delete") {
    if (action === "delete" && !(await confirmAction({ title: `Delete ${zone.name}?`, message: "No customer address uses it, so nothing else is affected.", confirmLabel: "Delete", tone: "danger" }))) return;
    setError("");
    try {
      const response = await fetch(action === "delete" ? `/api/delivery?id=${zone.id}` : "/api/delivery", { method: action === "delete" ? "DELETE" : "PATCH", headers: action === "delete" ? undefined : { "Content-Type": "application/json" }, body: action === "delete" ? undefined : JSON.stringify({ id: zone.id, isActive: !zone.isActive }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not change the zone.");
      setNotice(action === "delete" ? `${zone.name} deleted.` : `${zone.name} switched ${zone.isActive ? "off" : "on"}.`);
      await load();
    } catch (zoneError) {
      setError(zoneError instanceof Error ? zoneError.message : "Could not change the zone.");
    }
  }

  return <div className="inv-wrap">
    <div className="inv">
      <p className="inv-hint" style={{ margin: 0 }}>Delivery orders come from the mobile menu, or from the counter for Messenger orders. Signed-in customers choose a saved address in one of your zones and pay with GCash (or cash on delivery, if you allow it); guests type their address and pay with GCash. The delivery fee is added to the order and is not discounted.</p>
      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
      {notice && <div className="acc-notice" role="status">{notice}</div>}
      {!rules ? <div className="inv-empty">Loading delivery settings…</div> : <>
        {live.length > 0 && <section className="acc-block dlv-now">
          <header className="acc-block-head"><div><h3>Right now</h3><p>Riders and cashiers handle these in the staff app (Deliveries). Failed deliveries are voided in Order history.</p></div><button type="button" className="inv-mini" onClick={() => void load()}><IconRotateCcw size={12} />Refresh</button></header>
          <div className="acc-stats">
            <div><span>In progress</span><strong>{liveGoing.length}</strong><em className="fin-loy-sub">{liveGoing.filter((delivery) => delivery.status === "out").length} on the way · {liveGoing.filter((delivery) => delivery.status === "ready").length} waiting for a rider</em></div>
            <div><span>Not delivered</span><strong style={{ color: liveFailed.length ? "#B91C1C" : undefined }}>{liveFailed.length}</strong><em className="fin-loy-sub">{liveFailed.length ? "to void in the staff app" : "none"}</em></div>
            <div><span>Cash with riders</span><strong style={{ color: liveCash.length ? "#B45309" : undefined }}>{peso(liveCash.reduce((sum, delivery) => sum + (delivery.codCollected ?? 0), 0))}</strong><em className="fin-loy-sub">{liveCash.length} order{liveCash.length === 1 ? "" : "s"} not handed in</em></div>
          </div>
          <ul className="fin-simple-list" style={{ marginTop: 10 }}>
            {live.map((delivery) => {
              const cashOut = delivery.payment === "cod" && delivery.codCollected !== null;
              return <li key={delivery.id}>
                <span><strong>#{delivery.queueNumber ?? delivery.orderId} · {delivery.recipient} · {delivery.zone}</strong><em>{cashOut ? `Delivered · ${peso(delivery.codCollected ?? 0)} cash with ${delivery.rider ?? "the rider"}` : delivery.status === "failed" ? `Not delivered: ${delivery.failureReason ?? "no reason given"}${delivery.rider ? ` · ${delivery.rider}` : ""}` : `${deliveryStatusLabels[delivery.status] ?? delivery.status}${delivery.rider ? ` · ${delivery.rider}` : ""}`} · since {clockTime(delivery.since)}</em></span>
                <span className={`dlv-now-tag is-${cashOut ? "cash" : delivery.status}`}>{cashOut ? "Cash to hand in" : delivery.status === "failed" ? "Void it" : delivery.status === "out" ? "On the way" : delivery.status === "ready" ? "Packed" : "Preparing"}</span>
              </li>;
            })}
          </ul>
        </section>}
        <section className="acc-block">
          <header className="acc-block-head"><div><h3>Delivery</h3><p>{rules.enabled ? `On${activeZones.length ? ` in ${activeZones.length} zone${activeZones.length === 1 ? "" : "s"}` : ""}.` : "Off. Customers do not see delivery until you switch it on."}</p></div></header>
          <div className="flex flex-col gap-3">
            <PermissionSwitch checked={rules.enabled} title="Take delivery orders" description="Delivery also needs an open shift. Ordering by delivery opens on the mobile menu with the next update." onChange={(checked) => set("enabled", checked)} />
            <div className="inv-step-grid">
              <WizardField label="Delivery starts (optional)" hint="Empty: whenever a shift is open."><input type="time" value={rules.start} onChange={(event) => set("start", event.target.value)} style={packagingInput} /></WizardField>
              <WizardField label="Delivery ends (optional)" hint="Can be after midnight."><input type="time" value={rules.end} onChange={(event) => set("end", event.target.value)} style={packagingInput} /></WizardField>
            </div>
            <DeliveryHoursPreview start={rules.start} end={rules.end} />
            <div className="inv-step-grid">
              <WizardField label="Deliveries at once (optional)" hint="New delivery orders wait when this many are in progress. Empty: no limit."><input type="number" min={1} max={100} step={1} value={rules.maxActive} onChange={(event) => set("maxActive", event.target.value)} style={packagingInput} /></WizardField>
              <WizardField label="Free delivery from (₱, optional)" hint="Orders at or above this amount pay no fee. Empty: never."><MoneyField value={rules.freeAbove} onChange={(typed) => set("freeAbove", typed)} style={packagingInput} /></WizardField>
            </div>
          </div>
        </section>

        <section className="acc-block">
          <header className="acc-block-head"><div><h3>Cash on delivery</h3><p>Only for signed-in customers. GCash stays the default. A customer whose cash order fails to deliver loses COD until you allow it again in Customers.</p></div></header>
          <div className="flex flex-col gap-3">
            <PermissionSwitch checked={rules.codEnabled} title="Allow cash on delivery" description="The rider collects the payment and hands it to the cashier." onChange={(checked) => set("codEnabled", checked)} />
            {rules.codEnabled && <div className="inv-step-grid">
              <WizardField label="Largest COD order (₱)"><MoneyField value={rules.codMaxAmount} onChange={(typed) => set("codMaxAmount", typed)} style={packagingInput} /></WizardField>
              <WizardField label="Completed orders first" hint="Orders the customer must have completed before they can use COD."><input type="number" min={0} max={50} step={1} value={rules.codMinOrders} onChange={(event) => set("codMinOrders", event.target.value)} style={packagingInput} /></WizardField>
            </div>}
          </div>
        </section>
        <div className="flex justify-end gap-2">
          {changed && <button type="button" className="inv-secondary" onClick={() => setRules(saved)} disabled={saving}>Undo changes</button>}
          <button type="button" className="inv-primary" onClick={() => void saveRules()} disabled={!changed || saving}>{saving ? "Saving…" : "Save rules"}</button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="loy-section-title">Zones</h3>
          <button type="button" className="inv-secondary" onClick={() => setEditing("new")}><IconPlus size={14} />Add zone</button>
        </div>
        {zones.length === 0 ? <p className="inv-hint" style={{ margin: 0 }}>No zones yet. Add the barangays or areas you deliver to, each with its fee.</p> : <div className="acc-grid">
          {zones.map((zone) => <div key={zone.id} className={`acc-card${zone.isActive ? "" : " is-inactive"}`} style={{ cursor: "default" }}>
            <span className="acc-card-top">
              <span className="loy-badge" style={{ background: "#E0F2FE", color: "#0369A1" }}><IconTruck size={20} /></span>
              <span className="acc-card-name"><strong>{zone.name}</strong><em style={{ whiteSpace: "normal" }}>{zone.description || "No description"}</em></span>
              <span className={`acc-status ${zone.isActive ? "is-on" : "is-off"}`}><i />{zone.isActive ? "On" : "Off"}</span>
            </span>
            <span className="acc-card-stats">
              <span><em>Fee</em><strong>{zone.fee > 0 ? peso(zone.fee) : "Free"}</strong></span>
              <span><em>Min. order</em><strong>{zone.minOrder ? peso(zone.minOrder) : "None"}</strong></span>
              <span><em>Addresses</em><strong>{zone.addresses}</strong></span>
            </span>
            <span className="flex gap-2 flex-wrap">
              <button type="button" className="inv-mini" onClick={() => setEditing(zone)}><IconPencil size={12} />Edit</button>
              <button type="button" className="inv-mini" onClick={() => void zoneAction(zone, "toggle")}>{zone.isActive ? "Switch off" : "Switch on"}</button>
              {zone.addresses === 0 && <button type="button" className="inv-mini" onClick={() => void zoneAction(zone, "delete")}><IconTrash size={12} />Delete</button>}
            </span>
          </div>)}
        </div>}
      </>}
    </div>
    {editing && <ZoneDialog zone={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); setNotice(message); await load(); }} />}
  </div>;
}

function ZoneDialog({ zone, onClose, onSaved }: { zone: DeliveryZoneAdmin | null; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState({ name: zone?.name ?? "", description: zone?.description ?? "", fee: zone ? String(zone.fee) : "", minOrder: zone?.minOrder ? String(zone.minOrder) : "", isActive: zone?.isActive ?? true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const problem = !draft.name.trim() ? "Enter the zone name." : draft.fee.trim() === "" || !(Number(draft.fee) >= 0) ? "Enter the delivery fee (0 for free)." : draft.minOrder.trim() !== "" && !(Number(draft.minOrder) > 0) ? "The minimum order must be more than ₱0, or empty." : "";
  async function save() {
    if (problem) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/delivery", { method: zone ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(zone ? { id: zone.id } : {}), ...draft, fee: Number(draft.fee), minOrder: draft.minOrder.trim() ? Number(draft.minOrder) : null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save the zone.");
      await onSaved(zone ? `${draft.name.trim()} saved.` : `${draft.name.trim()} added.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the zone.");
      setSaving(false);
    }
  }
  return <Modal onClose={onClose} closeDisabled={saving} label={zone ? "Edit zone" : "New zone"}>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 520, maxHeight: "92vh", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
      <DialogHeader title={zone ? `Edit ${zone.name}` : "New delivery zone"} sub="An area you deliver to, such as a barangay. Customers pick it when they add an address." onClose={onClose} disabled={saving} />
      <div className="flex flex-col gap-4 px-6 py-5" style={{ overflowY: "auto" }}>
        <WizardField label="Name"><input data-autofocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Poblacion" style={packagingInput} maxLength={60} /></WizardField>
        <WizardField label="Streets or areas included (optional)" hint="Shown to customers so they pick the right zone."><input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="e.g. Rizal St. to the plaza" style={packagingInput} maxLength={200} /></WizardField>
        <div className="inv-step-grid">
          <WizardField label="Delivery fee (₱)"><MoneyField value={draft.fee} onChange={(typed) => setDraft((current) => ({ ...current, fee: typed }))} style={packagingInput} /></WizardField>
          <WizardField label="Minimum order (₱, optional)"><MoneyField value={draft.minOrder} onChange={(typed) => setDraft((current) => ({ ...current, minOrder: typed }))} style={packagingInput} /></WizardField>
        </div>
        <PermissionSwitch checked={draft.isActive} title="Deliver to this zone" description="Switched off: customers cannot choose it for new addresses or orders." onChange={(checked) => setDraft((current) => ({ ...current, isActive: checked }))} />
        {error && <p role="alert" className="acc-error">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t flex-wrap" style={{ borderColor: "#E8DDD5" }}>
        {problem && <span className="inv-footer-note">{problem}</span>}
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button-secondary">Cancel</button>
        <button type="submit" disabled={saving || Boolean(problem)} className="ui-button ui-button-primary">{saving ? "Saving…" : zone ? "Save zone" : "Add zone"}</button>
      </div>
    </form>
  </Modal>;
}

function Accounts() {
  const [accounts, setAccounts] = useState<CashierAccount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "duty" | "inactive" | "all">("active");
  const [now, setNow] = useState(() => Date.now());
  const [myActivity, setMyActivity] = useState<MyActivity | null>(null);
  const [myActivityOpen, setMyActivityOpen] = useState(false);
  const [myActivityLoading, setMyActivityLoading] = useState(false);
  const [myActivityError, setMyActivityError] = useState("");
  const [exportingAccountId, setExportingAccountId] = useState<number | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/cashier-accounts", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load employee accounts.");
      setAccounts(payload.data ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load employee accounts.");
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, []);

  async function loadMyActivity() {
    setMyActivityLoading(true);
    try {
      const response = await fetch("/api/admin-activity", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load your activity.");
      setMyActivity(payload.data ?? null);
      setMyActivityError("");
    } catch (loadError) {
      setMyActivityError(loadError instanceof Error ? loadError.message : "Failed to load your activity.");
    } finally {
      setMyActivityLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadAccounts(); }, 0);
    const intervalId = window.setInterval(() => { if (document.visibilityState === "visible") void loadAccounts(); }, 20_000);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(intervalId); };
  }, [loadAccounts]);

  function exportEmployeeReport(account: CashierAccount) {
    setExportingAccountId(account.id);
    setError("");
    try {
      const fileNameSafeName = account.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      saveWorkbook([
        ["Summary", excelInfo([
          [`Brew Houze employee report: ${account.fullName}`],
          ["Email", account.email],
          ["Role", staffRoleOf(account.role) === "barista" ? "Barista (bar queue only)" : staffRoleOf(account.role) === "kitchen" ? "Kitchen staff (kitchen queue only)" : staffRoleOf(account.role) === "rider" ? "Rider (deliveries only)" : "Cashier"],
          ["Status", account.isActive ? "Active" : "Deactivated"],
          ["Generated", excelNow()],
          [],
          ["Permissions"],
          ["Can open the store", account.canOpenShift ? "Yes" : "No"],
          ["Can close the shift", account.canCloseShift ? "Yes" : "No"],
          ["Can void orders", account.canVoidOrders ? "Yes" : "No"],
          ["Can refund orders", account.canRefundOrders ? "Yes" : "No"],
          [],
          ["Work"],
          ["Hours this week", account.stats.hoursThisWeek],
          ["Hours, last 30 days", account.stats.hours30d],
          ["Shifts, last 30 days", account.stats.shifts30d],
          ["Orders, last 30 days", account.stats.orders30d],
          ["Sales, last 30 days", account.stats.sales30d],
          ["Voids and refunds done, last 30 days", account.stats.reversals30d],
        ], ["Hours this week", "Hours, last 30 days", "Shifts, last 30 days", "Orders, last 30 days", "Voids and refunds done, last 30 days"])],
        ["Attendance", account.timeLogs.length ? excelTable(account.timeLogs, attendanceColumns()) : null],
        ["Orders", account.transactions.length ? excelTable(account.transactions, [
          { header: "Order #", value: (order) => order.id },
          { header: "Queue #", value: (order) => order.queueNumber ?? null },
          { header: "Shift", value: (order) => order.shiftId ? `#${order.shiftId}` : "" },
          { header: "Time", value: (order) => excelDateTime(order.createdAt) },
          { header: "Amount", value: (order) => order.amount, kind: "money" },
          { header: "Status", value: (order) => excelStatus(order.status) },
          { header: "Reversed at", value: (order) => excelDateTime(order.reversedAt) },
        ]) : null],
        ["Voids and refunds done", account.reversals.length ? excelTable(account.reversals, [
          { header: "Order #", value: (reversal) => reversal.id },
          { header: "Reversed at", value: (reversal) => excelDateTime(reversal.reversedAt) || "Unknown" },
          { header: "Amount", value: (reversal) => reversal.amount, kind: "money" },
          { header: "Status", value: (reversal) => excelStatus(reversal.status) },
        ]) : null],
      ], `brew-houze-employee-${fileNameSafeName}-${getFinanceDateStamp()}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export the employee report.");
    } finally {
      setExportingAccountId(null);
    }
  }

  // Everyone at once: hours and sales per person, and all attendance, for payroll.
  function exportAllEmployees() {
    setError("");
    try {
      const people = [...accounts].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName));
      const logs = people.flatMap((account) => account.timeLogs.map((log) => ({ account, log }))).sort((a, b) => b.log.timeIn.localeCompare(a.log.timeIn));
      saveWorkbook([
        ["Summary", excelInfo([
          ["Brew Houze employees"],
          ["Generated", excelNow()],
          ["Employees", people.length],
          ["Active", people.filter((account) => account.isActive).length],
          ["Hours this week, everyone", people.reduce((sum, account) => sum + account.stats.hoursThisWeek, 0)],
          ["Hours, last 30 days, everyone", people.reduce((sum, account) => sum + account.stats.hours30d, 0)],
        ], ["Employees", "Active", "Hours this week, everyone", "Hours, last 30 days, everyone"])],
        ["Employees", excelTable(people, [
          { header: "Employee", value: (account) => account.fullName },
          { header: "Email", value: (account) => account.email },
          { header: "Role", value: (account) => staffRoleLabel(account.role) },
          { header: "Status", value: (account) => account.isActive ? "Active" : "Deactivated" },
          { header: "Can open the store", value: (account) => account.canOpenShift ? "Yes" : "No" },
          { header: "Can close the shift", value: (account) => account.canCloseShift ? "Yes" : "No" },
          { header: "Can void", value: (account) => account.canVoidOrders ? "Yes" : "No" },
          { header: "Can refund", value: (account) => account.canRefundOrders ? "Yes" : "No" },
          { header: "Hours this week", value: (account) => Math.round(account.stats.hoursThisWeek * 100) / 100, kind: "hours" },
          { header: "Hours, 30 days", value: (account) => Math.round(account.stats.hours30d * 100) / 100, kind: "hours" },
          { header: "Shifts, 30 days", value: (account) => account.stats.shifts30d, kind: "count" },
          { header: "Orders, 30 days", value: (account) => account.stats.orders30d, kind: "count" },
          { header: "Sales, 30 days", value: (account) => account.stats.sales30d, kind: "money" },
          { header: "Voids and refunds, 30 days", value: (account) => account.stats.reversals30d, kind: "count" },
          { header: "Last active", value: (account) => excelDateTime(account.onDutySince ?? account.lastSeenAt) },
        ])],
        ["Attendance", logs.length ? excelTable(logs, [
          { header: "Employee", value: (entry) => entry.account.fullName },
          ...attendanceColumns().map((column) => ({ ...column, value: (entry: { log: EmployeeTimeLog }) => column.value(entry.log) })),
        ]) : null],
      ], `brew-houze-employees-${getFinanceDateStamp()}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export the employees.");
    }
  }

  const query = search.trim().toLowerCase();
  const shown = accounts.filter((account) => {
    if (statusFilter === "active" && !account.isActive) return false;
    if (statusFilter === "inactive" && account.isActive) return false;
    if (statusFilter === "duty" && !account.onDutySince) return false;
    return !query || account.fullName.toLowerCase().includes(query) || account.email.toLowerCase().includes(query);
  });
  const active = accounts.filter((account) => account.isActive);
  const onDuty = accounts.filter((account) => account.onDutySince);
  const selected = accounts.find((account) => account.id === selectedId) ?? null;

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-summary">
        <button type="button" className="inv-stat" aria-pressed={statusFilter === "active"} onClick={() => setStatusFilter("active")}><span>Active staff</span><strong>{active.length}</strong><em>{accounts.length - active.length} deactivated</em></button>
        <button type="button" className="inv-stat" aria-pressed={statusFilter === "duty"} onClick={() => setStatusFilter(statusFilter === "duty" ? "active" : "duty")}><span>On duty now</span><strong style={{ color: onDuty.length ? "#15803D" : undefined }}>{onDuty.length}</strong><em>{onDuty.length ? onDuty.map((account) => account.fullName.split(/\s+/)[0]).join(", ") : "Nobody is clocked in"}</em></button>
        <div className="inv-stat is-static"><span>Hours this week</span><strong>{formatHours(active.reduce((sum, account) => sum + account.stats.hoursThisWeek, 0))}</strong><em>all staff, since Monday</em></div>
        <div className="inv-stat is-static"><span>Can open the store</span><strong>{active.filter((account) => account.canOpenShift).length}</strong><em>{active.filter((account) => account.canCloseShift).length} can close the shift · plus every admin</em></div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search is-wide">
          <IconSearch size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" />
          {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
        </div>
        <div className="inv-range" role="group" aria-label="Show">
          {([["active", "Active"], ["duty", "On duty"], ["inactive", "Deactivated"], ["all", "All"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={statusFilter === id} onClick={() => setStatusFilter(id)}>{label}</button>)}
        </div>
        <button type="button" className="inv-secondary" onClick={exportAllEmployees} disabled={accounts.length === 0}><IconDownload size={14} />Export all</button>
        <button type="button" className="inv-primary" onClick={() => setAdding(true)}><IconPlus size={15} />Add employee</button>
      </div>

      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}

      {loading ? <div className="inv-empty">Loading employees…</div>
        : accounts.length === 0 ? <div className="inv-onboard">
          <span className="inv-kind-icon is-packaged" style={{ width: 52, height: 52 }}><IconUsers size={24} /></span>
          <h2>No employees yet</h2>
          <p>Add the people who work the counter. They sign in to the staff app with their email and a password you give them.</p>
          <button type="button" className="inv-primary" onClick={() => setAdding(true)}><IconPlus size={15} />Add employee</button>
        </div>
          : shown.length === 0 ? <div className="inv-empty">No employees match. <button type="button" className="inv-link" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Show everyone</button></div>
            : <div className="acc-grid">
              {shown.map((account) => <button key={account.id} type="button" className={`acc-card${account.isActive ? "" : " is-inactive"}`} onClick={() => setSelectedId(account.id)}>
                <span className="acc-card-top">
                  <UserAvatar name={account.fullName} size={44} />
                  <span className="acc-card-name"><strong>{account.fullName}</strong><em>{account.email}</em><span className={`acc-role is-${staffRoleOf(account.role)}`}>{staffRoleLabel(account.role)}</span></span>
                  <span className={`acc-status ${!account.isActive ? "is-off" : account.onDutySince ? "is-on" : ""}`}><i />{!account.isActive ? "Deactivated" : account.onDutySince ? `On duty · ${clockTime(account.onDutySince)}` : "Off duty"}</span>
                </span>
                <span className="acc-perms">
                  {staffRoleOf(account.role) !== "cashier" ? <span className="acc-perm is-on">✓ {staffRoleOf(account.role) === "rider" ? "Deliveries only" : staffRoleOf(account.role) === "kitchen" ? "Kitchen queue only" : "Queue only"}</span> : ([["Open store", account.canOpenShift], ["Close shift", account.canCloseShift], ["Void", account.canVoidOrders], ["Refund", account.canRefundOrders]] as const).map(([label, allowed]) => <span key={label} className={`acc-perm${allowed ? " is-on" : ""}`}>{allowed ? "✓" : "✕"} {label}</span>)}
                </span>
                <span className="acc-card-stats">
                  <span><em>This week</em><strong>{formatHours(account.stats.hoursThisWeek)}</strong></span>
                  <span><em>Orders · 30d</em><strong>{account.stats.orders30d}</strong></span>
                  <span><em>Sales · 30d</em><strong>{peso(account.stats.sales30d)}</strong></span>
                </span>
                <span className="acc-card-foot">{account.sessions && account.sessions.length > 0 ? `Signed in on ${account.sessions.length} device${account.sessions.length === 1 ? "" : "s"}` : account.lastSeenAt ? `Last active ${shiftTime(account.lastSeenAt)}` : "Has not signed in yet"}<span>Manage <IconChevron size={13} /></span></span>
              </button>)}
            </div>}

      <section className="acc-block acc-mine">
        <button type="button" className="acc-mine-toggle" aria-expanded={myActivityOpen} onClick={() => { const next = !myActivityOpen; setMyActivityOpen(next); if (next && !myActivity) void loadMyActivity(); }}>
          <span><strong>Your own activity at the counter</strong><em>When you sign in to the staff app as admin: your orders, voids and refunds, attendance and archiving. Only you see this.</em></span>
          <span className="inv-chevron" style={{ transform: myActivityOpen ? "rotate(90deg)" : undefined }}><IconChevron size={16} /></span>
        </button>
        {myActivityOpen && (myActivityLoading && !myActivity ? <p className="inv-hint">Loading your activity…</p>
          : myActivityError ? <p className="acc-error">{myActivityError}</p>
            : !myActivity ? null
              : <div className="acc-mine-grid">
                <div><h4>Orders ({myActivity.transactions.length})</h4>{myActivity.transactions.length === 0 ? <p className="inv-hint">None yet.</p> : <ul className="acc-list">{myActivity.transactions.slice(0, 8).map((transaction) => <li key={transaction.id}><span><strong>Order {transaction.id}</strong><em>{shiftTime(transaction.createdAt)}</em></span><strong>{peso(transaction.amount)}</strong></li>)}</ul>}</div>
                <div><h4>Voids & refunds ({myActivity.reversals.length})</h4>{myActivity.reversals.length === 0 ? <p className="inv-hint">None yet.</p> : <ul className="acc-list">{myActivity.reversals.slice(0, 8).map((reversal) => <li key={reversal.id}><span><strong>Order {reversal.id}</strong><em>{reversal.reversedAt ? shiftTime(reversal.reversedAt) : "Unknown time"}</em></span><strong>{peso(reversal.amount)}</strong></li>)}</ul>}</div>
                <div><h4>Attendance ({myActivity.timeLogs.length})</h4>{myActivity.timeLogs.length === 0 ? <p className="inv-hint">None yet.</p> : <ul className="acc-list">{myActivity.timeLogs.slice(0, 8).map((log) => <li key={log.id}><span><strong>{shiftTime(log.timeIn)}</strong><em>{log.timeOut ? `out ${clockTime(log.timeOut)}` : "still signed in"}</em></span></li>)}</ul>}</div>
                <div><h4>Archived by you ({myActivity.archives.length})</h4>{myActivity.archives.length === 0 ? <p className="inv-hint">Nothing yet.</p> : <ul className="acc-list">{myActivity.archives.slice(0, 8).map((entry, index) => <li key={`${entry.kind}-${entry.name}-${index}`}><span><strong>{entry.name}</strong><em>{entry.kind} · {shiftTime(entry.archivedAt)}</em></span></li>)}</ul>}</div>
              </div>)}
      </section>
    </div>

    {adding && <AddEmployeeDialog onClose={() => setAdding(false)} onCreated={loadAccounts} />}
    {selected && <EmployeeDialog key={selected.id} account={selected} now={now} exporting={exportingAccountId === selected.id} onClose={() => setSelectedId(null)} onChanged={(updated) => setAccounts((current) => current.map((account) => account.id === updated.id ? updated : account))} onReload={loadAccounts} onExport={() => exportEmployeeReport(selected)} />}
  </div>;
}

type ArchivedProduct = { id: number; name: string; category: string | null; price: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedProductVariant = { id: number; productId: number; productName: string; size: string | null; temperature: string | null; price: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedInventoryItem = { id: number; itemName: string; category: string | null; unit: string | null; quantity: number; archivedAt: string | null; archivedBy: string | null };
type ArchivedPackaging = { id: number; name: string; brand: string | null; contentQuantity: number; lastPackPrice: number | null; itemName: string; unit: string; itemArchived: boolean; archivedAt: string | null; archivedBy: string | null };
type ArchivedCategory = { id: number; name: string; productCount: number };
type ArchivedAddition = { id: number; name: string; itemName: string; unit: string | null; quantity: number; price: number; itemArchived?: boolean; archivedAt: string | null; archivedBy: string | null };
type ArchivedSalesOrder = { id: number; totalAmount: number; status: string; createdAt: string; cashierName: string | null; queueNumber?: number | null; shiftId?: number | null; items?: string; archivedAt: string | null; archivedBy: string | null };
type ArchivedEmployeeTimeLog = { id: number; employeeName: string; timeIn: string; timeOut: string | null; archivedAt: string | null; archivedBy: string | null };
type ArchivesData = {
  products: ArchivedProduct[];
  productVariants: ArchivedProductVariant[];
  inventory: ArchivedInventoryItem[];
  packagings?: ArchivedPackaging[];
  categories?: ArchivedCategory[];
  additions: ArchivedAddition[];
  salesOrders: ArchivedSalesOrder[];
  employeeTimeLogs: ArchivedEmployeeTimeLog[];
};
type RestoreType = "product" | "product_variant" | "inventory" | "packaging" | "addition" | "category" | "sales_order" | "employee_time_log";
type ArchiveGroup = "products" | "inventory" | "addons" | "categories" | "sales" | "attendance";
type ArchiveEntry = { key: string; type: RestoreType; id: number; group: ArchiveGroup; kind: string; title: string; subtitle: string; blocked: string | null; archivedAt: string | null; archivedBy: string | null; search: string };

const archiveGroups: { id: ArchiveGroup; label: string; restoreNote: string }[] = [
  { id: "products", label: "Products", restoreNote: "Restored products and sizes return to the Menu, the staff app and the mobile menu." },
  { id: "inventory", label: "Inventory", restoreNote: "Restored items and packages return to Inventory with the stock they had when archived." },
  { id: "addons", label: "Add-ons", restoreNote: "Restored add-ons can be punched at the POS again." },
  { id: "categories", label: "Categories", restoreNote: "Restored categories can be picked when adding products again." },
  { id: "sales", label: "Sales records", restoreNote: "Sales can no longer be archived. These were archived before that rule: restore them so they count in Finance again, under their original business date and shift." },
  { id: "attendance", label: "Attendance", restoreNote: "Attendance can no longer be archived. These were archived before that rule: restore them so they count in the employee's hours again." },
];

function buildArchiveEntries(data: ArchivesData): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  const add = (entry: Omit<ArchiveEntry, "key" | "search">) => entries.push({ ...entry, key: `${entry.type}:${entry.id}`, search: `${entry.title} ${entry.subtitle} ${entry.kind} ${entry.archivedBy ?? ""}`.toLowerCase() });
  for (const product of data.products) add({ type: "product", id: product.id, group: "products", kind: "Product", title: product.name, subtitle: `${product.category || "Uncategorized"} · ${peso(product.price)}`, blocked: null, archivedAt: product.archivedAt, archivedBy: product.archivedBy });
  for (const variant of data.productVariants) add({ type: "product_variant", id: variant.id, group: "products", kind: "Size", title: `${variant.productName} · ${variant.size ?? "Regular"}${variant.temperature && variant.temperature !== "both" ? ` ${variant.temperature === "hot" ? "Hot" : "Cold"}` : ""}`, subtitle: `${peso(variant.price)} · the product itself is still on the menu`, blocked: null, archivedAt: variant.archivedAt, archivedBy: variant.archivedBy });
  for (const item of data.inventory) add({ type: "inventory", id: item.id, group: "inventory", kind: "Inventory item", title: item.itemName, subtitle: `${item.category || "Uncategorized"} · ${item.unit ? formatStock(item.quantity, item.unit) : formatAmount(item.quantity)} when archived`, blocked: null, archivedAt: item.archivedAt, archivedBy: item.archivedBy });
  for (const pack of data.packagings ?? []) add({ type: "packaging", id: pack.id, group: "inventory", kind: "Package", title: `${pack.name}${pack.brand ? ` (${pack.brand})` : ""}`, subtitle: `${formatStock(pack.contentQuantity, pack.unit)} of ${pack.itemName} per pack${pack.lastPackPrice !== null ? ` · ${peso(pack.lastPackPrice)}` : ""}`, blocked: pack.itemArchived ? `Restore the inventory item “${pack.itemName}” first.` : null, archivedAt: pack.archivedAt, archivedBy: pack.archivedBy });
  for (const addon of data.additions) add({ type: "addition", id: addon.id, group: "addons", kind: "Add-on", title: addon.name, subtitle: `+${peso(addon.price)} · uses ${addon.unit ? formatStock(addon.quantity, addon.unit) : formatAmount(addon.quantity)} of ${addon.itemName}`, blocked: addon.itemArchived ? `Restore the inventory item “${addon.itemName}” first.` : null, archivedAt: addon.archivedAt, archivedBy: addon.archivedBy });
  for (const category of data.categories ?? []) add({ type: "category", id: category.id, group: "categories", kind: "Category", title: category.name, subtitle: category.productCount ? `${category.productCount} active product${category.productCount === 1 ? "" : "s"} still use this name` : "No products use it", blocked: null, archivedAt: null, archivedBy: null });
  for (const order of data.salesOrders) add({ type: "sales_order", id: order.id, group: "sales", kind: "Sale", title: `Order ${order.id}${order.queueNumber ? ` · #${order.queueNumber}` : ""} · ${peso(order.totalAmount)}`, subtitle: `${order.items || "Order"} · ${shiftTime(order.createdAt)}${order.cashierName ? ` · ${order.cashierName}` : ""}${order.status !== "completed" ? ` · ${order.status}` : ""}`, blocked: null, archivedAt: order.archivedAt, archivedBy: order.archivedBy });
  for (const log of data.employeeTimeLogs) add({ type: "employee_time_log", id: log.id, group: "attendance", kind: "Attendance", title: log.employeeName, subtitle: `${shiftTime(log.timeIn)} → ${log.timeOut ? shiftTime(log.timeOut) : "no time out"}`, blocked: null, archivedAt: log.archivedAt, archivedBy: log.archivedBy });
  return entries;
}

// Sales and attendance are kept forever: restore only, never deleted.
const keptForeverGroups: ArchiveGroup[] = ["sales", "attendance"];
const canDeleteForever = (entry: ArchiveEntry) => !keptForeverGroups.includes(entry.group);

const archiveKindLabels: Record<RestoreType, string> = { product: "product", product_variant: "size", inventory: "inventory item", packaging: "package", addition: "add-on", category: "category", sales_order: "sales record", employee_time_log: "attendance log" };

function Archives() {
  const confirmAction = useConfirm();
  const [data, setData] = useState<ArchivesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<ArchiveGroup | "all">("all");
  const [search, setSearch] = useState("");
  const [archivedBy, setArchivedBy] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const loadArchives = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadArchives(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadArchives]);

  const entries = useMemo(() => (data ? buildArchiveEntries(data) : []), [data]);
  const archivers = useMemo(() => Array.from(new Set(entries.map((entry) => entry.archivedBy).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b)), [entries]);
  const counts = useMemo(() => Object.fromEntries(archiveGroups.map((group) => [group.id, entries.filter((entry) => entry.group === group.id).length])) as Record<ArchiveGroup, number>, [entries]);
  const query = search.trim().toLowerCase();
  const shown = entries
    .filter((entry) => (tab === "all" || entry.group === tab) && (archivedBy === "all" || entry.archivedBy === archivedBy) && (!query || entry.search.includes(query)))
    .sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : sort === "oldest" ? (a.archivedAt ?? "").localeCompare(b.archivedAt ?? "") : (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const selectedShown = shown.filter((entry) => selected.has(entry.key));
  const deletableSelected = selectedShown.filter(canDeleteForever);
  const allShownSelected = shown.length > 0 && selectedShown.length === shown.length;
  const salesTotal = (data?.salesOrders ?? []).reduce((sum, order) => sum + order.totalAmount, 0);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function send(method: "PATCH" | "DELETE", entry: ArchiveEntry): Promise<{ ok: boolean; message?: string; warning?: string }> {
    try {
      const response = await fetch("/api/archives", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: entry.type, id: entry.id }) });
      const payload = await response.json();
      if (!response.ok) return { ok: false, message: payload?.error || "Something went wrong." };
      return { ok: true, warning: payload?.data?.warning ?? undefined };
    } catch {
      return { ok: false, message: "Could not reach the server." };
    }
  }

  // Runs one action over several records, then reports how many worked and why any did not.
  async function run(action: "restore" | "delete", requested: ArchiveEntry[]) {
    const targets = action === "delete" ? requested.filter(canDeleteForever) : requested;
    if (targets.length === 0) return;
    if (action === "delete" && !(await confirmAction({
      title: targets.length === 1 ? `Delete this ${archiveKindLabels[targets[0].type]} forever?` : `Delete ${targets.length} records forever?`,
      message: <>This <strong>cannot be undone</strong>. {targets.length === 1 ? <>“{targets[0].title}” will be gone for good.</> : "They will be gone for good."} Anything still used by past sales or another record is kept.</>,
      confirmLabel: targets.length === 1 ? "Delete forever" : `Delete ${targets.length} forever`,
    }))) return;
    setBusy(targets.length === 1 ? targets[0].key : "bulk");
    setError("");
    setNotice("");
    let done = 0;
    const problems: string[] = [];
    const warnings: string[] = [];
    for (const target of targets) {
      const result = await send(action === "restore" ? "PATCH" : "DELETE", target);
      if (result.ok) {
        done += 1;
        if (result.warning) warnings.push(`${target.title}: ${result.warning}`);
      } else {
        problems.push(`${target.title}: ${result.message}`);
      }
    }
    setSelected((current) => {
      const next = new Set(current);
      targets.forEach((target) => next.delete(target.key));
      return next;
    });
    await loadArchives();
    setBusy(null);
    const verb = action === "restore" ? "Restored" : "Deleted forever";
    if (done > 0) setNotice([`${verb}: ${done} record${done === 1 ? "" : "s"}.`, ...warnings].join(" "));
    if (problems.length > 0) setError(`${problems.length} could not be ${action === "restore" ? "restored" : "deleted"}. ${problems.slice(0, 3).join(" ")}${problems.length > 3 ? ` And ${problems.length - 3} more.` : ""}`);
  }

  const tabNote = tab === "all" ? "Nothing here is shown in the apps. Restore puts a record back where it came from, and Delete forever removes it for good." : archiveGroups.find((group) => group.id === tab)?.restoreNote;

  return <div className="inv-wrap">
    <div className="inv">
      <div className="inv-summary">
        <button type="button" className="inv-stat" aria-pressed={tab === "all"} onClick={() => setTab("all")}><span>In Archives</span><strong>{entries.length}</strong><em>kept until you delete them</em></button>
        <button type="button" className="inv-stat" aria-pressed={tab === "products"} onClick={() => setTab("products")}><span>Products</span><strong>{counts.products}</strong><em>plus {counts.addons} add-on{counts.addons === 1 ? "" : "s"}, {counts.categories} categor{counts.categories === 1 ? "y" : "ies"}</em></button>
        <button type="button" className="inv-stat" aria-pressed={tab === "inventory"} onClick={() => setTab("inventory")}><span>Inventory</span><strong>{counts.inventory}</strong><em>items and packages</em></button>
        <button type="button" className="inv-stat" aria-pressed={tab === "sales"} onClick={() => setTab("sales")}><span>Sales records</span><strong>{counts.sales}</strong><em>{peso(salesTotal)} not in Finance</em></button>
      </div>

      <div className="menu-chips" role="group" aria-label="Archive type">
        <button type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")}>All<b>{entries.length}</b></button>
        {archiveGroups.map((group) => <button key={group.id} type="button" aria-pressed={tab === group.id} onClick={() => setTab(group.id)}>{group.label}<b>{counts[group.id] ?? 0}</b></button>)}
      </div>

      <div className="inv-toolbar">
        <div className="inv-search is-wide">
          <IconSearch size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, order, employee or category" />
          {search && <button type="button" onClick={() => setSearch("")} title="Clear search"><IconX size={12} /></button>}
        </div>
        <label className="inv-filter"><span>Archived by</span>
          <select value={archivedBy} onChange={(event) => setArchivedBy(event.target.value)} className={`inv-select${archivedBy !== "all" ? " is-active" : ""}`}>
            <option value="all">Anyone</option>{archivers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="inv-filter"><span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="inv-select">
            <option value="newest">Recently archived</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option>
          </select>
        </label>
      </div>

      <details className="arc-rules">
        <summary>What can be archived or deleted?</summary>
        <div className="arc-rules-grid">
          <div><strong>Archive and restore</strong><span>Products, sizes, add-ons, categories, inventory items and packages. Archiving hides them from the apps; restoring brings them back.</span></div>
          <div><strong>Delete forever</strong><span>The same setup data, once archived. Refused while a past sale or a recipe still uses it.</span></div>
          <div><strong>Kept forever</strong><span>Sales records, voids and refunds, shifts, attendance and stock history. They are the café’s financial record, so they cannot be archived or deleted. Correct a sale by voiding or refunding it.</span></div>
          <div><strong>Customers</strong><span>Deactivated in Customers instead of archived. A customer who asks to be forgotten has their personal details erased; their orders stay in the sales records without a name.</span></div>
        </div>
      </details>

      {tabNote && <p className="inv-hint">{tabNote}</p>}
      {error && <div className="inv-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} title="Dismiss"><IconX size={14} /></button></div>}
      {notice && <div className="acc-notice" role="status">{notice}</div>}

      {loading ? <div className="inv-empty">Loading archives…</div>
        : !data ? null
          : shown.length === 0 ? <div className="inv-empty">{entries.length === 0 ? "Archives are empty. Anything you archive shows up here." : query || archivedBy !== "all" ? "Nothing matches these filters." : "Nothing of this kind is archived."}</div>
            : <section className="arc-list">
              <div className={`arc-bulk${selectedShown.length ? " is-active" : ""}`}>
                <label className="arc-check">
                  <input type="checkbox" checked={allShownSelected} ref={(element) => { if (element) element.indeterminate = selectedShown.length > 0 && !allShownSelected; }} onChange={() => setSelected((current) => {
                    const next = new Set(current);
                    if (allShownSelected) shown.forEach((entry) => next.delete(entry.key)); else shown.forEach((entry) => next.add(entry.key));
                    return next;
                  })} aria-label="Select everything shown" />
                  <span>{selectedShown.length ? `${selectedShown.length} selected` : `Select all ${shown.length}`}</span>
                </label>
                {selectedShown.length > 0 && <div className="arc-bulk-actions">
                  <button type="button" className="arc-restore" onClick={() => void run("restore", selectedShown)} disabled={busy !== null}><IconRotateCcw size={13} />{busy === "bulk" ? "Working…" : "Restore"}</button>
                  {deletableSelected.length > 0 && <button type="button" className="inv-mini is-danger" style={{ height: 38 }} onClick={() => void run("delete", deletableSelected)} disabled={busy !== null} title={deletableSelected.length < selectedShown.length ? "Sales records and attendance in the selection are kept and skipped" : undefined}><IconTrash size={13} />Delete {deletableSelected.length < selectedShown.length ? `${deletableSelected.length} ` : ""}forever</button>}
                  <button type="button" className="inv-link" onClick={() => setSelected(new Set())}>Clear</button>
                </div>}
              </div>
              <ul>
                {shown.map((entry) => <li key={entry.key} className={`arc-row${selected.has(entry.key) ? " is-selected" : ""}`}>
                  <label className="arc-check"><input type="checkbox" checked={selected.has(entry.key)} onChange={() => toggle(entry.key)} aria-label={`Select ${entry.title}`} /></label>
                  <span className={`arc-kind is-${entry.group}`}>{entry.kind}</span>
                  <div className="arc-main">
                    <strong>{entry.title}</strong>
                    <span>{entry.subtitle}</span>
                    {entry.blocked && <em>{entry.blocked}</em>}
                  </div>
                  <div className="arc-when">
                    <strong>{entry.archivedAt ? shiftTime(entry.archivedAt) : "—"}</strong>
                    <span>{entry.archivedBy ? `by ${entry.archivedBy}` : entry.type === "category" ? "date not recorded" : ""}</span>
                  </div>
                  <div className="arc-actions">
                    <button type="button" className="arc-restore" onClick={() => void run("restore", [entry])} disabled={busy !== null} title={entry.blocked ?? "Put it back where it came from"}><IconRotateCcw size={13} />{busy === entry.key ? "…" : "Restore"}</button>
                    {canDeleteForever(entry)
                      ? <button type="button" className="menu-archive" onClick={() => void run("delete", [entry])} disabled={busy !== null} title="Delete forever" aria-label={`Delete ${entry.title} forever`}><IconTrash size={14} /></button>
                      : <span className="arc-kept" title="Sales records and attendance are kept permanently">Kept</span>}
                  </div>
                </li>)}
              </ul>
            </section>}
    </div>
  </div>;
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
          <Image src="/brand/badge.png" alt="" width={52} height={52} unoptimized style={{ flexShrink: 0, borderRadius: "50%", boxShadow: "0 10px 24px rgba(0,0,0,0.3)" }} />
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

const SAVED_ACCOUNTS_KEY = "brewhouze-admin-saved-accounts";
// Accounts that signed in on this device, newest first, so the next sign-in is a tap and a
// password. Only the email, name and role are kept (never the password), in this browser only.
type SavedAccount = { email: string; name: string; role: string; lastUsed: number };
const SAVED_ACCOUNTS_MAX = 8;

function readSavedAccounts(): SavedAccount[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(SAVED_ACCOUNTS_KEY) ?? "[]") as SavedAccount[];
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.email === "string" && entry.email).sort((a, b) => b.lastUsed - a.lastUsed) : [];
  } catch {
    return [];
  }
}

function writeSavedAccounts(list: SavedAccount[]) {
  try { window.localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(list.slice(0, SAVED_ACCOUNTS_MAX))); } catch { /* storage unavailable: nothing is remembered */ }
}

function rememberAccount(session: { email: string; fullName: string; role: string }) {
  const email = session.email.trim().toLowerCase();
  writeSavedAccounts([{ email, name: session.fullName, role: session.role, lastUsed: Date.now() }, ...readSavedAccounts().filter((entry) => entry.email !== email)]);
}

function accountInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length ? words.slice(0, 2).map((word) => word[0]) : [email[0] ?? "?"]).join("").toUpperCase();
}

function AdminLogin({ onLoggedIn, notice = "" }: { onLoggedIn: (session: AdminSession) => void; notice?: string }) {
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Saved accounts on this device: pick one, then only the password is typed.
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<SavedAccount | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const list = readSavedAccounts();
      setSaved(list);
      setPicking(list.length > 0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  function chooseAccount(account: SavedAccount) {
    setChosen(account);
    setEmail(account.email);
    setPassword("");
    setError("");
    setPicking(false);
  }
  function enterAnotherAccount() {
    setChosen(null);
    setEmail("");
    setPassword("");
    setError("");
    setPicking(false);
  }
  function forgetAccount(account: SavedAccount) {
    const next = saved.filter((entry) => entry.email !== account.email);
    writeSavedAccounts(next);
    setSaved(next);
    if (next.length === 0) setPicking(false);
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to sign in.");
      rememberAccount(payload.data as AdminSession);
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
    {mode === "login" && picking && <div className="login-card">
      <p style={authEyebrow}>Welcome back</p>
      <h1 style={authTitle}>Choose your account</h1>
      <p style={authLead}>Accounts that signed in on this device. You only need the password.</p>
      {notice && <AuthAlert tone="success">{notice}</AuthAlert>}
      <ul className="login-accounts">
        {saved.map((account) => <li key={account.email}>
          <button type="button" className="login-account" onClick={() => chooseAccount(account)}>
            <span className="login-account-avatar" aria-hidden="true">{accountInitials(account.name, account.email)}</span>
            <span className="login-account-text"><strong>{account.name || account.email}</strong><em>{account.email}{account.role ? ` · ${account.role.charAt(0).toUpperCase()}${account.role.slice(1).toLowerCase()}` : ""}</em></span>
          </button>
          <button type="button" className="login-account-forget" onClick={() => forgetAccount(account)} aria-label={`Remove ${account.email} from this device`} title="Remove from this device">×</button>
        </li>)}
      </ul>
      <button type="button" onClick={enterAnotherAccount} style={{ ...authLinkButton, marginTop: 18, alignSelf: "center" }}>Use another account</button>
    </div>}

    {mode === "login" && !picking && <form onSubmit={signIn} className="login-card">
      <p style={authEyebrow}>Welcome back</p>
      <h1 style={authTitle}>Sign in to the admin portal</h1>
      <p style={authLead}>Use the email and password of your Brew Houze account.</p>
      {notice && <AuthAlert tone="success">{notice}</AuthAlert>}
      {chosen && chosen.email === email ? <div className="login-chosen" style={{ marginTop: 26 }}>
        <span className="login-account-avatar" aria-hidden="true">{accountInitials(chosen.name, chosen.email)}</span>
        <span className="login-account-text"><strong>{chosen.name || chosen.email}</strong><em>{chosen.email}</em></span>
        <button type="button" onClick={() => { setPicking(saved.length > 0); if (saved.length === 0) enterAnotherAccount(); }} style={authLinkButton}>Switch</button>
        <input type="email" value={email} readOnly autoComplete="username" hidden />
      </div> : emailField}
      <AuthPasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Enter your password" autoFocus={Boolean(chosen && chosen.email === email)} />
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

  // Menu and stock data load once someone is signed in (and again after switching accounts).
  // Nothing is requested from the sign-in screen: these endpoints require a signed-in admin.
  const signedInId = authUser?.adminId ?? null;
  useEffect(() => {
    if (signedInId === null) return;
    const timer = window.setTimeout(() => { void refreshInventory(); void refreshProducts(); void refreshCategories(); }, 0);
    return () => window.clearTimeout(timer);
  }, [signedInId]);

  useEffect(() => {
    if (signedInId === null) return;
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
  }, [page, signedInId]);

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
        station: product.station ?? "bar",
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
        station: product.station ?? "bar",
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

  const pageTitles: Record<Page, string> = { dashboard: "Dashboard", shift: "Shift",inventory: "Inventory Management", products: "Menu", finance: "Finance", treasury: "Treasury", insights: "Insights", customers: "Customers", loyalty: "Loyalty Campaigns", discounts: "Discounts", delivery: "Delivery", accounts: "Accounts & Employees", account: "My Account", archives: "Archives" };

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
      <TopBar title={pageTitles[page]} page={page} user={authUser} onAccount={() => goTo("account")} onNavigate={goTo} onRequestLogout={() => setShowSignOut(true)} />
      <div className="app-content" style={{ flex: 1, overflowY: "auto", background: "#F8F9FA" }}>
        {page === "dashboard" && <Dashboard user={authUser} inventory={inventory} products={products} onNavigate={goTo} onRefreshStock={() => Promise.all([refreshInventory(), refreshProducts()])} />}
        {page === "shift" && <ShiftMonitor onNavigate={goTo} />}
        {page === "inventory" && <Inventory items={inventory} onAdd={handleInventoryAdd} onUpdate={handleInventoryUpdate} onDelete={handleInventoryDelete} />}
        {page === "products" && <MenuManagement products={products} inventory={inventory} categories={categories} onCategoriesChange={setCategories} onAdd={handleProductAdd} onEdit={handleProductEdit} onDelete={handleProductDelete} onRefreshProducts={refreshProducts} />}
        {page === "finance" && <Finance />}
        {page === "treasury" && <Treasury />}
        {page === "insights" && <InsightsPage onNavigate={goTo} />}
        {page === "customers" && <Customers />}
        {page === "loyalty" && <Loyalty products={products} categories={categories} />}
        {page === "discounts" && <Discounts />}
        {page === "delivery" && <Delivery />}
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