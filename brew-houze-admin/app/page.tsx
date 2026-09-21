"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";

type Page = "dashboard" | "inventory" | "additions" | "products" | "finance" | "accounts" | "account";

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

const inventoryUnits = ["mL", "grams", "Pieces"] as const;
const fixedLowStockThresholds: Record<(typeof inventoryUnits)[number], number> = {
  "mL": 500,
  grams: 500,
  Pieces: 10,
};

function normalizeInventoryUnit(value: string): (typeof inventoryUnits)[number] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ml") return "mL";
  if (normalized === "gram" || normalized === "grams" || normalized === "g") return "grams";
  if (normalized === "piece" || normalized === "pieces" || normalized === "pc" || normalized === "#") return "Pieces";
  return null;
}

function getFixedLowStockThreshold(unit: string): number {
  const normalized = normalizeInventoryUnit(unit);
  return normalized ? fixedLowStockThresholds[normalized] : 0;
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
function IconUser({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
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

const navItems: { id: Page; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard", label: "Dashboard", Icon: IconGrid },
  { id: "inventory", label: "Inventory", Icon: IconBox },
  { id: "products", label: "Product Management", Icon: IconTag },
  { id: "additions", label: "Additions Management", Icon: IconSparkle },
  { id: "finance", label: "Finance", Icon: IconDollar },
  { id: "accounts", label: "Accounts & Employees", Icon: IconUsers },
  { id: "account", label: "Account Management", Icon: IconUser },
];

function Sidebar({ current, collapsed, onChange, onToggle }: { current: Page; collapsed: boolean; onChange: (p: Page) => void; onToggle: () => void }) {
  return (
    <aside style={{ background: "#3D2B1F", minHeight: "100vh", width: collapsed ? 52 : 240, flexShrink: 0 }} className={`app-sidebar ${collapsed ? "is-collapsed" : "is-expanded"} flex flex-col`}>
      <div className="flex items-center gap-3 px-6 py-7 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: "#D97706" }}><IconCoffee size={20} /></div>
        <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 14, color: "#FDF9F5", lineHeight: 1.2 }}>Brew Houze</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>CAFE</p></div>
      </div>
      <div className="sidebar-toggle-row"><button onClick={onToggle} title={collapsed ? "Expand sidebar" : "Minimize sidebar"} aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #6B4C3B", borderRadius: 6, background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", boxShadow: "0 2px 6px rgba(61,43,31,0.2)", transform: collapsed ? "rotate(180deg)" : "none" }}><IconChevron size={14} /></button></div>
      <nav className="flex flex-col gap-1 px-3 pt-5 flex-1">
        {navItems.map(({ id, label, Icon }) => {
          const active = current === id;
          return <button key={id} onClick={() => onChange(id)} className="flex items-center gap-3 py-3 rounded-xl text-left transition-all duration-150 w-full" style={{ paddingLeft: collapsed ? 0 : id === "additions" ? 32 : 16, paddingRight: collapsed ? 0 : 16, background: active ? "#D97706" : "transparent", color: active ? "#FDF9F5" : "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif", fontSize: id === "additions" ? 12.5 : 13.5, fontWeight: active ? 600 : 400, cursor: "pointer", border: "none" }}><Icon size={id === "additions" ? 15 : 17} /><span>{label}</span></button>;
        })}
      </nav>
      <div className="px-6 py-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em" }}>v1.0.0 — Admin Panel</p></div>
    </aside>
  );
}

function TopBar({ page, user, onAccount, onRequestLogout }: { page: Page; user: AdminSession; onAccount: () => void; onRequestLogout: () => void }) {
  const titles: Record<Page, string> = { dashboard: "Dashboard", inventory: "Inventory Management", additions: "Additions Management", products: "Product Management", finance: "Finance", accounts: "Accounts & Employees", account: "Account Management" };
  return <header className="app-topbar flex items-center justify-between px-8 py-4 border-b" style={{ background: "#FDF9F5", borderColor: "#E8DDD5", flexShrink: 0 }}>
    <div className="flex items-center gap-2" style={{ color: "#9C8278" }}><IconChevron size={14} /><span style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}>{titles[page]}</span></div>
    <div className="flex items-center gap-5">
      <div className="text-right"><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15, color: "#3D2B1F" }}>Brew Houze Cafe</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#D97706", letterSpacing: "0.06em" }}>ADMIN DASHBOARD</p></div>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5" }}>
        <button type="button" onClick={onAccount} title="Open Account Management" aria-label="Open Account Management" className="flex items-center gap-3" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <div className="flex items-center justify-center rounded-full text-white font-bold text-sm" style={{ width: 34, height: 34, background: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif" }}>{user.fullName.charAt(0).toUpperCase()}</div>
          <div><p style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13, color: "#3D2B1F", lineHeight: 1.3, margin: 0 }}>{user.fullName}</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "capitalize", margin: "2px 0 0" }}>{user.role}</p></div>
          <span aria-hidden="true" style={{ color: "#9C8278", fontSize: 16 }}>›</span>
        </button>
        <button onClick={onRequestLogout} title="Sign out" style={{ border: "none", borderLeft: "1px solid #D8C8BE", background: "transparent", color: "#9C8278", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12, padding: "8px 0 8px 11px" }}>Sign out</button>
      </div>
    </div>
  </header>;
}

function Dashboard({ inventory }: { inventory: InventoryItem[] }) {
  const totalItems = inventory.length;
  const lowStockItems = inventory.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.low_stock_threshold)).length;
  const outOfStockItems = inventory.filter((item) => Number(item.quantity) === 0).length;
  const [weeklySales, setWeeklySales] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    async function loadWeeklySales() {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/sales-orders?period=week", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Failed to load weekly sales.");
        if (active) setWeeklySales(Number(payload.summary?.revenue ?? 0));
      } catch (error) {
        console.error("Dashboard: failed to load weekly sales", error);
      } finally {
        requestInFlight = false;
      }
    }
    void loadWeeklySales();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadWeeklySales();
    }, 15_000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, []);

  return <div className="flex flex-col gap-6 p-8" style={{ maxWidth: 1280 }}>
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      <div className="rounded-2xl p-6" style={{ background: "#3D2B1F", boxShadow: "0 4px 24px rgba(61,43,31,0.18)" }}><p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Total Sales This Week</p><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 34, color: "#FDF9F5", marginTop: 10 }}>{weeklySales === null ? "—" : `₱${weeklySales.toFixed(2)}`}</p></div>
      <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 2px 12px rgba(61,43,31,0.06)" }}><p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#9C8278", textTransform: "uppercase" }}>Inventory Summary</p><div className="grid grid-cols-3 gap-3 mt-5 text-center"><div><p className="text-2xl font-bold" style={{ color: "#3D2B1F" }}>{totalItems}</p><p className="text-xs" style={{ color: "#9C8278" }}>Total Items</p></div><div><p className="text-2xl font-bold" style={{ color: "#D97706" }}>{lowStockItems}</p><p className="text-xs" style={{ color: "#9C8278" }}>Low Stock</p></div><div><p className="text-2xl font-bold" style={{ color: "#C0392B" }}>{outOfStockItems}</p><p className="text-xs" style={{ color: "#9C8278" }}>Out of Stock</p></div></div></div>
    </div>
    <div className="rounded-2xl flex flex-col" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", overflow: "hidden" }}>
      <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5" }}><IconSparkle size={16} /><div><p style={{ fontWeight: 700, color: "#3D2B1F" }}>AI Insights</p><p style={{ fontSize: 11, color: "#9C8278" }}>No AI data configured yet</p></div></div>
      <div className="px-6 py-12 text-center" style={{ color: "#9C8278" }}>AI insights will appear here once the AI service is connected.</div>
              </div>
  </div>;
}

function getQtyColor(quantity: number, lowStock = false): string {
  if (quantity === 0) return "#C0392B";
  if (lowStock) return "#D97706";
  return "#3D2B1F";
}

function isLowStock(item: InventoryItem): boolean {
  return Number(item.quantity) > 0 && Number(item.quantity) <= Number(item.low_stock_threshold);
}

function DrinkCategoryManagement({ categories, onChange }: { categories: ProductCategory[]; onChange: (categories: ProductCategory[]) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_name: name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to create drink category.");
      onChange([...categories, payload.data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create drink category.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveCategory(id: number) {
    if (!window.confirm("Archive this drink category?")) return;
    setError("");
    try {
      const response = await fetch("/api/product-categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to archive drink category.");
      onChange(categories.filter((category) => category.id !== id));
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive drink category.");
    }
  }

  return <section className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 2px 12px rgba(61,43,31,0.06)" }}>
    <div className="flex items-center gap-3 mb-5"><div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: "#F3EDE5", color: "#D97706" }}><IconTag size={18} /></div><div><h2 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 19, color: "#3D2B1F", margin: 0 }}>Drink Categories</h2><p style={{ color: "#9C8278", fontSize: 13, marginTop: 3 }}>Organize products into categories shown in Product Management.</p></div></div>
    <form onSubmit={addCategory} className="flex flex-wrap gap-3" style={{ alignItems: "end" }}>
      <label className="flex flex-col gap-1.5" style={{ flex: "1 1 240px" }}><span style={{ fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Category Name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Non-Coffee Drinks" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none", width: "100%" }} /></label>
      <button type="submit" disabled={saving} style={{ border: "none", borderRadius: 10, padding: "11px 16px", background: saving ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Adding..." : "Add Category"}</button>
    </form>
    {error && <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 14 }}>{error}</p>}
    <div className="flex flex-wrap gap-2" style={{ marginTop: 18 }}>{categories.map((category) => <div key={category.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", color: "#6B4C3B", fontSize: 13 }}><span>{category.name}</span><button type="button" onClick={() => archiveCategory(category.id)} aria-label={`Archive ${category.name}`} style={{ border: "none", background: "transparent", color: "#B91C1C", cursor: "pointer", fontWeight: 700, lineHeight: 1 }}>×</button></div>)}</div>
  </section>;
}

function AdditionsManagement({ inventory, categories, onCategoriesChange }: { inventory: InventoryItem[]; categories: ProductCategory[]; onCategoriesChange: (categories: ProductCategory[]) => void }) {
  const [items, setItems] = useState<AdditionItem[]>([]);
  const [additionName, setAdditionName] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const selectedInventory = inventory.find((item) => String(item.inventory_id) === inventoryId);
  const additionInputBase = { border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none", width: "100%" };

  async function loadItems() {
    try {
      setLoading(true);
      const response = await fetch("/api/additions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load additions.");
      setItems((payload.data ?? []).map((item: { id: number; name: string; inventoryId: number; itemName: string; unit: string; quantity: number; price: number; }) => ({
        addition_id: Number(item.id),
        addition_name: item.name,
        inventory_id: Number(item.inventoryId),
        item_name: item.itemName,
        unit_of_measure: item.unit,
        quantity: Number(item.quantity),
        price: Number(item.price),
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load additions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadItems(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(price);
    if (!additionName.trim() || !selectedInventory || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("Addition name, inventory item, quantity, and a valid non-negative price are required.");
      return;
    }

    if (selectedInventory.is_whole_unit && !Number.isInteger(parsedQuantity)) {
      setError("Pieces quantity must be a whole number.");
      return;
    }
    try {
      setSaving(true);
      const response = await fetch("/api/additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addition_name: additionName, inventory_id: selectedInventory.inventory_id, quantity: parsedQuantity, price: parsedPrice }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to create addition.");
      setItems((current) => [...current, {
        ...payload.data,
        quantity: Number(payload.data.quantity),
        price: Number(payload.data.price),
      }]);
      setAdditionName("");
      setInventoryId("");
      setQuantity("");
      setPrice("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create addition.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveItem(id: number) {
    if (!window.confirm("Archive this addition item?")) return;
    try {
      setActionError("");
      const response = await fetch("/api/additions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addition_id: id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to archive addition.");
      setItems((current) => current.filter((item) => item.addition_id !== id));
    } catch (archiveError) {
      setActionError(archiveError instanceof Error ? archiveError.message : "Failed to archive addition.");
    }
  }

  return <div className="flex flex-col gap-6 p-8" style={{ maxWidth: 1280 }}>
    <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 2px 12px rgba(61,43,31,0.06)" }}>
      <div className="flex items-center gap-3 mb-5"><div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: "#F3EDE5", color: "#D97706" }}><IconSparkle size={18} /></div><div><h2 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 19, color: "#3D2B1F", margin: 0 }}>Add an Addition Item</h2><p style={{ color: "#9C8278", fontSize: 13, marginTop: 3 }}>Choose the inventory item consumed by this addition.</p></div></div>
      <form onSubmit={submit} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "end" }}>
        <label className="flex flex-col gap-1.5"><span style={{ fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Addition Name</span><input required value={additionName} onChange={(event) => setAdditionName(event.target.value)} placeholder="Extra Shot" style={additionInputBase} /></label>
        <label className="flex flex-col gap-1.5"><span style={{ fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Inventory Item</span><select required value={inventoryId} onChange={(event) => setInventoryId(event.target.value)} style={additionInputBase}><option value="">Choose inventory item</option>{inventory.map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name}</option>)}</select></label>
        <label className="flex flex-col gap-1.5"><span style={{ fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Unit of Measure</span><input readOnly value={selectedInventory?.unit_of_measure ?? ""} placeholder="Auto-filled" style={{ ...additionInputBase, background: "#F3EDE5" }} /></label>
        <label className="flex flex-col gap-1.5"><span style={{ fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Quantity</span><input required type="number" min="0.01" step={selectedInventory?.is_whole_unit ? "1" : "0.01"} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" style={additionInputBase} /></label>
        <label className="flex flex-col gap-1.5"><span style={{ fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Selling Price</span><input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" style={additionInputBase} /></label>
        <button type="submit" disabled={saving || loading} style={{ border: "none", borderRadius: 10, padding: "11px 16px", background: saving ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Adding..." : "Add Addition"}</button>
      </form>
      {error && <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 14 }}>{error}</p>}
      {actionError && <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 14 }}>{actionError}</p>}
    </div>
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: "#E8DDD5" }}><h3 style={{ margin: 0, color: "#3D2B1F", fontWeight: 700 }}>Addition Items</h3></div>
      {loading ? <p className="p-6" style={{ color: "#9C8278" }}>Loading additions...</p> : items.length === 0 ? <p className="p-6" style={{ color: "#9C8278" }}>No addition items yet.</p> : <div className="divide-y">{items.map((item) => <div key={item.addition_id} className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderColor: "#E8DDD5" }}><div><p style={{ margin: 0, color: "#3D2B1F", fontWeight: 700 }}>{item.addition_name}</p><p style={{ margin: "4px 0 0", color: "#9C8278", fontSize: 12 }}>Uses {item.item_name}</p></div><div className="flex items-center gap-4"><p style={{ margin: 0, color: "#6B4C3B", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{item.quantity} {item.unit_of_measure} · ₱{Number(item.price).toFixed(2)}</p><button type="button" onClick={() => archiveItem(item.addition_id)} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "6px 10px", background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Archive</button></div></div>)}</div>}
    </div>
    <DrinkCategoryManagement categories={categories} onChange={onCategoriesChange} />
  </div>;
}

// Strips anything from the decimal point onward so a whole-unit field can never hold a fraction.
function sanitizeWholeUnitValue(value: string): string {
  const dotIndex = value.indexOf(".");
  return dotIndex === -1 ? value : value.slice(0, dotIndex);
}

function Inventory({
  items: initialItems,
  onAdd,
}: {
  items: InventoryItem[];
  onAdd: (item: InventoryItem) => Promise<void>;
  onUpdate: (updated: InventoryItem) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<InventoryItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ ingredient_category: "", item_name: "", unit_of_measure: "grams", quantity: "" });
  const [adding, setAdding] = useState(false);
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [addingStock, setAddingStock] = useState(false);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => setItems(initialItems), 0);
    return () => window.clearTimeout(syncTimer);
  }, [initialItems]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/inventory", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Failed to load inventory.");
        if (active) setItems(payload.data ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load inventory.");
      } finally {
        if (active) setLoading(false);
      }

    })();

    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((item) => item.ingredient_category)))],
    [items]
  );

  const filtered = useMemo(() => items.filter((row) => {
    const matchesCategory = category === "All" || row.ingredient_category === category;
    const query = search.toLowerCase().trim();
    const matchesSearch = !query
      || row.item_name.toLowerCase().includes(query)
      || row.ingredient_category.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  }), [items, category, search]);
  const temporaryItems = useMemo(() => filtered.filter((item) => !item.is_permanent), [filtered]);
  const permanentItems = useMemo(() => filtered.filter((item) => item.is_permanent), [filtered]);

  function startEdit(row: InventoryItem) {
    setEditingId(row.inventory_id);
    setDraft({ ...row });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function addItem() {
    const quantity = Number(newItem.quantity);
    const normalizedUnit = normalizeInventoryUnit(newItem.unit_of_measure);
    if (!newItem.ingredient_category.trim() || !newItem.item_name.trim() || !normalizedUnit || !Number.isFinite(quantity) || quantity < 0) return;
    const finalQuantity = normalizedUnit === "Pieces" ? Math.round(quantity) : quantity;

    try {
      setAdding(true);
      setActionError("");
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newItem, unit_of_measure: normalizedUnit, quantity: finalQuantity }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to add inventory item.");
      const createdItem = payload.data as InventoryItem;
      setItems((prev) => [...prev, createdItem].sort((a, b) => a.ingredient_category.localeCompare(b.ingredient_category) || a.item_name.localeCompare(b.item_name)));
      await onAdd(createdItem);
      setNewItem({ ingredient_category: "", item_name: "", unit_of_measure: "grams", quantity: "" });
      setShowAddModal(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add inventory item.");
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit() {
    if (!draft) return;
    if (draft.is_permanent) return;
    const normalizedUnit = normalizeInventoryUnit(draft.unit_of_measure);
    if (!normalizedUnit) {
      setActionError("Unit of measure must be mL, grams, or Pieces.");
      return;
    }

    const finalQuantity = normalizedUnit === "Pieces" ? Math.round(Number(draft.quantity)) : Number(draft.quantity);

    try {
      setActionError("");
      const response = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_id: draft.inventory_id,
          ingredient_category: draft.ingredient_category,
          item_name: draft.item_name,
          unit_of_measure: normalizedUnit,
          quantity: finalQuantity,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update inventory.");
      }

      const updatedItem = payload.data as InventoryItem;
      setItems((prev) =>
        prev.map((item) =>
          item.inventory_id === updatedItem.inventory_id ? updatedItem : item
        )
      );
      setEditingId(null);
      setDraft(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update inventory.");
    }
  }

  async function addStock(item: InventoryItem) {
    setActionError("");
    setStockItem(item);
    setStockQuantity(item.is_whole_unit ? "1" : "100");
  }

  async function submitStockAddition() {
    if (!stockItem) return;
    const amount = Number(stockQuantity);
    if (!Number.isFinite(amount) || amount <= 0 || (stockItem.is_whole_unit && !Number.isInteger(amount))) {
      setActionError(`Enter a valid positive ${stockItem.is_whole_unit ? "whole " : ""}quantity.`);
      return;
    }
    try {
      setAddingStock(true);
      setActionError("");
      const response = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_id: stockItem.inventory_id, quantity_delta: amount }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to add stock.");
      setItems((prev) => prev.map((current) => current.inventory_id === stockItem.inventory_id ? payload.data : current));
      setStockItem(null);
      setStockQuantity("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add stock.");
    } finally {
      setAddingStock(false);
    }
  }

  async function deleteItem(id: number) {
    const confirmed = window.confirm("Archive this inventory item?");
    if (!confirmed) return;

    try {
      setActionError("");
      const response = await fetch("/api/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_id: id }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to archive inventory.");
      }

      setItems((prev) => prev.filter((item) => item.inventory_id !== id));

      if (editingId === id) {
        setEditingId(null);
        setDraft(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to archive inventory.");
    }
  }

  const editInputStyle: React.CSSProperties = {
    border: "1px solid #D97706",
    borderRadius: 8,
    padding: "6px 10px",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    color: "#3D2B1F",
    background: "#FFFBF5",
    outline: "none",
    width: "100%",
  };

  const thStyle: React.CSSProperties = {
    padding: "14px 16px",
    textAlign: "left",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
    fontWeight: 500,
    color: "#9C8278",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    borderBottom: "1px solid #E8DDD5",
    whiteSpace: "nowrap",
  };

  return <div className="flex flex-col gap-6 p-8" style={{ maxWidth: 1280 }}>
    <div className="flex flex-wrap items-center gap-3 justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
          <IconSearch size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…" style={{ border: "none", background: "transparent", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", outline: "none", width: 200 }} />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ border: "1px solid #E8DDD5", borderRadius: 12, padding: "10px 14px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <button onClick={() => { setActionError(""); setShowAddModal(true); }} className="flex items-center gap-2 rounded-xl px-5 py-2.5" style={{ background: "#3D2B1F", color: "#FDF9F5", border: "none", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}><IconPlus size={15} />Add Inventory</button>
    </div>

    {!loading && !error && actionError && (
      <div className="rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5 }}>{actionError}</span>
        <button onClick={() => setActionError("")} title="Dismiss" style={{ background: "none", border: "none", color: "#B91C1C", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconX size={14} /></button>
      </div>
    )}

    {loading && <div className="rounded-2xl p-12 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading inventory…</div>}
    {!loading && error && <div className="rounded-2xl p-6" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}>Unable to load inventory: {error}</div>}
    {!loading && !error && <>
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E8DDD5", boxShadow: "0 2px 12px rgba(61,43,31,0.05)" }}>
        <div className="inventory-table-wrap" style={{ overflowX: "auto" }}>
          <table className="inventory-table" style={{ width: "100%", borderCollapse: "collapse", background: "#FDF9F5" }}>
            <thead>
              <tr style={{ background: "#F3EDE5" }}>
                <th style={thStyle}>Ingredient Category</th>
                <th style={thStyle}>Item Name</th>
                <th style={thStyle}>Unit of Measure</th>
                <th style={thStyle}>Quantity</th>
                <th style={{ ...thStyle, textAlign: "center", width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...temporaryItems, ...permanentItems].map((row, index, visibleItems) => {
                const isEditing = editingId === row.inventory_id;
                const quantity = Number(row.quantity);
                return (
                  <Fragment key={row.inventory_id}>
                  {(index === 0 || visibleItems[index - 1].is_permanent !== row.is_permanent) && <tr><td colSpan={5} style={{ padding: "12px 16px", background: "#FFF7ED", color: "#9A3412", fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{row.is_permanent ? "Permanent inventory · used in a product recipe" : "Temporary inventory · not yet used in a product"}</td></tr>}
                  <tr
                    key={row.inventory_id}
                    style={{ borderBottom: "1px solid #E8DDD5", background: isEditing ? "#FFFBF5" : undefined }}
                    onMouseEnter={(e) => { if (!isEditing) e.currentTarget.style.background = "#F3EDE5"; }}
                    onMouseLeave={(e) => { if (!isEditing) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      {isEditing && !row.is_permanent ? (
                        <input
                          style={editInputStyle}
                          value={draft?.ingredient_category ?? ""}
                          onChange={(e) => setDraft((d) => d ? { ...d, ingredient_category: e.target.value } : d)}
                        />
                      ) : (
                        <span className="inline-block rounded-lg px-3 py-1" style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, background: "#F3EDE5", color: "#6B4C3B", border: "1px solid #E8DDD5" }}>{row.ingredient_category}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {isEditing && !row.is_permanent ? (
                        <input
                          style={editInputStyle}
                          value={draft?.item_name ?? ""}
                          onChange={(e) => setDraft((d) => d ? { ...d, item_name: e.target.value } : d)}
                        />
                      ) : (
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", fontWeight: 500 }}>{row.item_name}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#9C8278" }}>{row.unit_of_measure}</span>
                        {row.is_whole_unit && <span title="Whole units only" className="rounded-md px-1.5 py-0.5" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, background: "#F3EDE5", color: "#6B4C3B", border: "1px solid #E8DDD5" }}>#</span>}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {isEditing && !row.is_permanent ? (
                        <input
                          type="number"
                          min={0}
                          step={normalizeInventoryUnit(draft?.unit_of_measure ?? "") === "Pieces" ? 1 : "any"}
                          style={{ ...editInputStyle, width: 90 }}
                          value={draft?.quantity ?? 0}
                          onChange={(e) => setDraft((d) => d ? { ...d, quantity: Number(normalizeInventoryUnit(d.unit_of_measure) === "Pieces" ? sanitizeWholeUnitValue(e.target.value) : e.target.value) } : d)}
                        />
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15, color: getQtyColor(quantity, isLowStock(row)) }}>{row.is_whole_unit ? Math.round(quantity) : row.quantity}</span>
                          {quantity <= 0 && <span className="rounded-md px-2 py-0.5" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, background: "#FEE2E2", color: "#C0392B" }}>OUT</span>}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      {isEditing && !row.is_permanent ? (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={saveEdit} title="Save" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#3D2B1F", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconCheck size={14} /></button>
                          <button onClick={cancelEdit} title="Cancel" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          {row.is_permanent ? <button onClick={() => void addStock(row)} title="Add stock" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#15803D", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><IconPlus size={14} /></button> : <button onClick={() => startEdit(row)} title="Edit row" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8DDD5", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}>
                            <IconPencil size={14} />
                          </button>}
                          {!row.is_permanent && <button onClick={() => deleteItem(row.inventory_id)} title="Archive row" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#C0392B", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}>
                            <IconTrash size={14} />
                          </button>}
                        </div>
                      )}
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="flex items-center justify-center py-16" style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#9C8278" }}>{items.length === 0 ? "No inventory records found in the database." : "No ingredients match your search."}</div>}
      </div>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278" }}>Showing {filtered.length} of {items.length} items</p>
    </>}
    {stockItem && (
      <div className="fixed inset-0 flex items-center justify-center p-6" style={{ background: "rgba(61,43,31,0.45)", zIndex: 60 }} onClick={(event) => { if (event.target === event.currentTarget && !addingStock) setStockItem(null); }}>
        <form className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 420, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }} onSubmit={(event) => { event.preventDefault(); void submitStockAddition(); }}>
          <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5" }}>
            <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>Add Stock</p><p style={{ marginTop: 3, fontSize: 12, color: "#9C8278" }}>{stockItem.item_name} · {stockItem.unit_of_measure}</p></div>
            <button type="button" onClick={() => setStockItem(null)} disabled={addingStock} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: addingStock ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button>
          </div>
          <div className="flex flex-col gap-2 px-6 py-6">
            <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Quantity to add</label>
            <input autoFocus type="number" min={0} step={stockItem.is_whole_unit ? 1 : "any"} value={stockQuantity} onChange={(event) => setStockQuantity(stockItem.is_whole_unit ? sanitizeWholeUnitValue(event.target.value) : event.target.value)} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter, sans-serif", fontSize: 14, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }} />
            {actionError && <p style={{ fontSize: 12.5, color: "#B91C1C" }}>{actionError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}>
            <button type="button" onClick={() => setStockItem(null)} disabled={addingStock} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: addingStock ? "default" : "pointer" }}>Cancel</button>
            <button type="submit" disabled={addingStock || !stockQuantity} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: addingStock ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 600, cursor: addingStock ? "default" : "pointer" }}>{addingStock ? "Adding..." : "Add Stock"}</button>
          </div>
        </form>
      </div>
    )}
    {showAddModal && (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.45)", zIndex: 50 }} onClick={(event) => { if (event.target === event.currentTarget && !adding) setShowAddModal(false); }}>
        <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 520, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
          <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5" }}><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>Add Inventory Item</p><button onClick={() => setShowAddModal(false)} disabled={adding} title="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: adding ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button></div>
          <div className="grid gap-4 px-6 py-6">
            {(["ingredient_category", "item_name"] as const).map((field) => <div key={field} className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>{field.replaceAll("_", " ")}</label><input value={newItem[field]} onChange={(event) => setNewItem((current) => ({ ...current, [field]: event.target.value }))} placeholder={field === "item_name" ? "e.g. Matcha powder" : "e.g. Flavoring"} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }} /></div>)}
            <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Unit of measure</label><select value={newItem.unit_of_measure} onChange={(event) => setNewItem((current) => ({ ...current, unit_of_measure: event.target.value }))} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }}>{inventoryUnits.map((unit) => <option key={unit}>{unit}</option>)}</select><span style={{ fontSize: 11, color: "#9C8278" }}>Fixed low-stock threshold: {getFixedLowStockThreshold(newItem.unit_of_measure)} {newItem.unit_of_measure}</span></div>
            <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Quantity</label><input type="number" min={0} step={newItem.unit_of_measure === "Pieces" ? 1 : "any"} value={newItem.quantity} onChange={(event) => setNewItem((current) => ({ ...current, quantity: current.unit_of_measure === "Pieces" ? sanitizeWholeUnitValue(event.target.value) : event.target.value }))} placeholder="0" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none" }} /></div>
            {actionError && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#B91C1C" }}>{actionError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5" }}><button onClick={() => setShowAddModal(false)} disabled={adding} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#9C8278", cursor: adding ? "default" : "pointer" }}>Cancel</button><button onClick={addItem} disabled={adding || !newItem.ingredient_category.trim() || !newItem.item_name.trim() || !newItem.unit_of_measure.trim() || newItem.quantity === ""} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: adding ? "#C9B8AF" : "#3D2B1F", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, color: "#FDF9F5", cursor: adding ? "default" : "pointer" }}>{adding ? "Adding..." : "Add Inventory"}</button></div>
        </div>
      </div>
    )}
  </div>;
}
// ─── Products ─────────────────────────────────────────────────────────────────
type ProductIngredient = { inventoryId: number; label: string; qty: number; unit: string };
type ProductTemperature = "hot" | "cold" | "both";
type ProductVariant = { id?: number; size: string; price: number; temperature: ProductTemperature; hasSales?: boolean; ingredients: ProductIngredient[] };
type ProductAddition = { id: number; name: string; quantity: number; price: number; unit: string };
type Product = { id: number; name: string; description: string; category: string; imageUrl: string; imageData: string; price: number; hasSales?: boolean; ingredients: ProductIngredient[]; variants: ProductVariant[]; additions: ProductAddition[] };


type DraftIngredient = { inventoryId: number; qty: string };
type DraftVariant = { size: string; price: string; temperature: "hot" | "cold"; ingredients: DraftIngredient[]; active: boolean };

function areIngredientsAvailable(ingredients: ProductIngredient[], inventory: InventoryItem[]): boolean {
  return ingredients.length > 0 && ingredients.every((ingredient) => {
    const inv = inventory.find((item) => item.inventory_id === ingredient.inventoryId);
    return inv !== undefined && Number(inv.quantity) >= Number(ingredient.qty);
  });
}

function getIngredientChipStyle(inventoryId: number, inventory: InventoryItem[]): React.CSSProperties {
  const item = inventory.find((entry) => entry.inventory_id === inventoryId);
  const quantity = item ? Number(item.quantity) : 0;
  const threshold = item ? Number(item.low_stock_threshold) : 0;

  if (quantity <= 0) return { background: "#FEE2E2", color: "#C0392B", border: "1px solid #FECACA" };
  if (quantity <= threshold) return { background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A" };
  return { background: "#F3EDE5", color: "#6B4C3B", border: "1px solid #E8DDD5" };
}

function ProductCard({
  product,
  inventory,
  badge,
  onEdit,
  onDeleteClick,
}: {
  product: Product;
  inventory: InventoryItem[];
  badge: { bg: string; color: string };
  onEdit: () => void;
  onDeleteClick: () => void;
}) {
  const displayedVariants = product.variants.length
    ? product.variants.map((variant) => ({
        ...variant,
        ingredients: Array.from(
          new Map(variant.ingredients.map((ingredient) => [ingredient.inventoryId, ingredient])).values()
        ),
      }))
    : [
        {
          id: 0,
          size: "",
          price: product.price,
          temperature: "both",
          hasSales: false,
          ingredients: Array.from(
            new Map(product.ingredients.map((ingredient) => [ingredient.inventoryId, ingredient])).values()
          ),
        },
      ];

  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeVariant = displayedVariants[selectedIndex] ?? displayedVariants[0];
  const hasSizeTabs = displayedVariants.length > 1 && displayedVariants.some((variant) => variant.size);
  const variantAvailable = areIngredientsAvailable(activeVariant.ingredients, inventory);

  return (
    <div className="rounded-2xl flex flex-col overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 2px 12px rgba(61,43,31,0.06)" }}>
      <div style={{ width: "100%", aspectRatio: "4/3", background: "#F3EDE5", overflow: "hidden", position: "relative", flexShrink: 0 }}>
        {(product.imageData || product.imageUrl.trim()) ? <Image src={product.imageData || product.imageUrl.trim()} alt={product.name} fill unoptimized style={{ objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="flex items-center justify-center w-full h-full" style={{ color: "#D5C5BC" }}><IconImage size={36} /></div>}
        <button onClick={onEdit} title="Edit product" style={{ position: "absolute", top: 8, right: 46, width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.9)", color: "#6B4C3B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}><IconPencil size={13} /></button>
        <button onClick={onDeleteClick} title="Archive product" style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.9)", color: "#C0392B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}><IconTrash size={13} /></button>
      </div>
      <div className="flex flex-col gap-2 p-4" style={{ flex: 1 }}>
        {hasSizeTabs && (
          <label className="flex flex-col gap-1" style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: "#9C8278", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Size and temperature
            <select
              value={selectedIndex}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
              aria-label="Select size and temperature"
              style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "8px 10px", background: "#FDF9F5", color: "#3D2B1F", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer", width: "100%" }}
            >
              {displayedVariants.map((variant, index) => (
                <option key={`${product.id}-option-${variant.id ?? index}`} value={index}>
                  {variant.size} · {variant.temperature === "hot" ? "Hot" : variant.temperature === "cold" ? "Cold" : "Hot & Cold"}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-start justify-between gap-2">
          <p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15, color: "#3D2B1F", lineHeight: 1.3 }}>{product.name}</p>
          <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 14, color: "#D97706", whiteSpace: "nowrap" }}>₱{activeVariant.price}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-block rounded-md px-2 py-0.5" style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 500, background: badge.bg, color: badge.color }}>{product.category}</span>
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, background: variantAvailable ? "#DCFCE7" : "#FEE2E2", color: variantAvailable ? "#15803D" : "#C0392B" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: variantAvailable ? "#22c55e" : "#C0392B", display: "inline-block" }} />{variantAvailable ? "Available" : "Unavailable"}</span>
        </div>

        <div className="mt-1">
          {activeVariant.size && !hasSizeTabs && (
            <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>{activeVariant.size} · ₱{activeVariant.price}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {activeVariant.ingredients.map((ingredient) => (
              <span key={`${product.id}-${activeVariant.id}-${ingredient.inventoryId}`} className="rounded-lg px-2 py-0.5" style={{ ...getIngredientChipStyle(ingredient.inventoryId, inventory), fontFamily: "Inter, sans-serif", fontSize: 11 }}>
                {ingredient.label} · {ingredient.qty} {ingredient.unit}
              </span>
            ))}
          </div>
          {(product.additions?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1 mt-2">
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Additions</p>
              <div className="flex flex-wrap gap-1">
                {product.additions.map((addition) => (
                  <span key={`${product.id}-addition-${addition.id}`} className="rounded-lg px-2 py-0.5" style={{ background: "#F3E8FF", color: "#7E22CE", border: "1px solid #E9D5FF", fontFamily: "Inter, sans-serif", fontSize: 11 }}>{addition.name} · {addition.quantity} {addition.unit}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

function ProductManagement({
  products,
  inventory,
  additions,
  categories,
  onAdd,
  onEdit,
  onDelete,
}: {
  products: Product[];
  inventory: InventoryItem[];
  additions: ProductAddition[];
  categories: ProductCategory[];
  onAdd: (product: Product) => Promise<void>;
  onEdit: (product: Product) => Promise<void>;
  onDelete: (id: number, variantSize?: string) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [filterCat, setFilterCat] = useState("All");
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
  const [selectedAdditionIds, setSelectedAdditionIds] = useState<number[]>([]);
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
  // Fall back to the product being edited so bound additions still render if the global list is empty or mid-refresh.
  const knownAdditions = [...additions, ...(editingProduct?.additions ?? []).filter((bound) => !additions.some((item) => item.id === bound.id))];
  const selectedAdditions = selectedAdditionIds.map((id) => knownAdditions.find((addition) => addition.id === id)).filter((addition): addition is ProductAddition => Boolean(addition));
  const availableAdditions = additions.filter((addition) => !selectedAdditionIds.includes(addition.id));

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
    setSelectedAdditionIds(product?.additions?.map((addition) => addition.id) ?? []);
    setActionError("");
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

  function addProductAddition(value: string) {
    const additionId = Number(value);
    if (!Number.isInteger(additionId) || additionId <= 0) return;
    setSelectedAdditionIds((current) => current.includes(additionId) ? current : [...current, additionId]);
  }

  function removeProductAddition(additionId: number) {
    setSelectedAdditionIds((current) => current.filter((id) => id !== additionId));
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

  async function submitProduct() {
    if (!formName.trim() || inventory.length === 0) return;
    const variants = formVariants.filter((variant) => variant.active).map((variant) => ({
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
        price: variants[0].price,
        imageUrl: formImage.trim(),
        imageData: formImageData,
        ingredients: variants[0].ingredients,
        variants,
        additions: selectedAdditions,
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

  const filtered = filterCat === "All"
    ? uniqueProducts
    : uniqueProducts.filter((product) => product.category === filterCat);
  const hasValidVariant = formVariants.some((variant) => variant.price !== "" && Number(variant.price) >= 0 && variant.ingredients.some((ingredient) => ingredient.inventoryId > 0 && ingredient.qty !== "" && Number(ingredient.qty) > 0));
  const catBadgeColor: Record<string, { bg: string; color: string }> = {
    "Espresso Drinks": { bg: "#F3EDE5", color: "#6B4C3B" },
    "Cold Drinks": { bg: "#EFF6FF", color: "#1D4ED8" },
  };
  const inputBase: React.CSSProperties = { border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 12px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none", width: "100%" };

  return (
    <div className="flex flex-col gap-6 p-8" style={{ maxWidth: 1280 }}>
      <div className="flex flex-wrap items-center gap-4">
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#9C8278" }}>{products.length} product{products.length !== 1 ? "s" : ""} · availability based on current inventory</p>
        <div className="flex items-center gap-3">
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ border: "1px solid #E8DDD5", borderRadius: 12, padding: "9px 14px", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#3D2B1F", background: "#FDF9F5", outline: "none", cursor: "pointer" }}>
            <option>All</option>{categoryNames.map((category) => <option key={category}>{category}</option>)}
          </select>
          <button onClick={openModal} disabled={inventory.length === 0} className="flex items-center gap-2 rounded-xl px-5 py-2.5" style={{ background: inventory.length === 0 ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", border: "none", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, cursor: inventory.length === 0 ? "default" : "pointer" }}><IconPlus size={15} />Add Product</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl py-16 gap-3" style={{ border: "1px dashed #E8DDD5", background: "#FDF9F5" }}><IconImage size={32} /><p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#9C8278" }}>No products found in the database.</p></div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {filtered.map((product) => {
            const badge = catBadgeColor[product.category] ?? { bg: "#F3EDE5", color: "#6B4C3B" };
            return (
              <ProductCard
                key={product.id}
                product={product}
                inventory={inventory}
                badge={badge}
                onEdit={() => openEditModal(product)}
                onDeleteClick={() => setDeleteTarget(product)}
              />
            );
          })}
        </div>
      )}

      {actionError && <div className="rounded-xl px-4 py-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontFamily: "Inter, sans-serif", fontSize: 13 }}>{actionError}</div>}

      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center p-6" style={{ background: "rgba(61,43,31,.45)", zIndex: 50 }} onClick={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
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
                  <button onClick={async () => { if (!window.confirm(`Archive the entire ${deleteTarget.name} product?`)) return; try { setActionError(""); await onDelete(deleteTarget.id); setDeleteTarget(null); } catch (error) { setActionError(error instanceof Error ? error.message : "Failed to archive product."); } }} style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", textAlign: "left", cursor: "pointer" }}>Archive whole product</button>
                </>
              )}
            </div>
            <button onClick={() => setDeleteTarget(null)} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {pendingVariantIndex !== null && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.35)", zIndex: 70 }}>
          <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 420px)", background: "#FDF9F5", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Activate size</p>
            <h3 style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 19 }}>Activate {formVariants[pendingVariantIndex].size} · {formVariants[pendingVariantIndex].temperature === "hot" ? "Hot" : "Cold"}?</h3>
            <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>This size will be activated with its own price and ingredient recipe. You can use the arrows between Hot and Cold to copy a recipe when needed.</p>
            <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={() => setPendingVariantIndex(null)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => activateVariant(pendingVariantIndex)} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", fontWeight: 700 }}>Activate size</button></div>
          </div>
        </div>
      )}
      {ingredientDialogOpen && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.35)", zIndex: 70 }}>
          <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 420px)", background: "#FDF9F5", boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Add ingredient</p>
            <h3 style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 19 }}>Add to {activeVariant?.size ?? "selected size"}</h3>
            <div className="flex flex-col gap-3" style={{ marginTop: 18 }}>
              <label style={{ color: "#6B4C3B", fontSize: 12 }}>Inventory item<select value={ingredientInventoryId || ""} onChange={(event) => setIngredientInventoryId(Number(event.target.value))} style={{ ...inputBase, width: "100%", marginTop: 6 }}><option value="">Select inventory item</option>{inventory.map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name} · {item.unit_of_measure}</option>)}</select></label>
              <label style={{ color: "#6B4C3B", fontSize: 12 }}>Quantity<input type="number" min={0} step={inventory.find((item) => item.inventory_id === ingredientInventoryId)?.is_whole_unit ? 1 : "any"} value={ingredientQuantity} onChange={(event) => setIngredientQuantity(event.target.value)} placeholder="Enter quantity" style={{ ...inputBase, width: "100%", marginTop: 6 }} /></label>
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={() => setIngredientDialogOpen(false)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer" }}>Cancel</button><button type="button" onClick={confirmIngredientRow} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", fontWeight: 700 }}>Add ingredient</button></div>
          </div>
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.45)", zIndex: 50 }} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, height: "92vh", maxHeight: 760, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5", flexShrink: 0 }}><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>{editingProduct ? "Edit Product" : "Add New Product"}</p><button onClick={closeModal} disabled={saving} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button></div>
            <div className="flex flex-col gap-5 px-6 py-6" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Name</label><input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Vanilla Cold Brew" style={inputBase} /></div>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Short Description <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><textarea value={formDescription} maxLength={240} onChange={(e) => setFormDescription(e.target.value)} placeholder="e.g. Smooth espresso with steamed milk and caramel." rows={3} style={{ ...inputBase, resize: "vertical" }} /><span style={{ color: "#9C8278", fontSize: 11 }}>{formDescription.length}/240</span></div>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Category</label><select value={formCat || categoryNames[0] || ""} onChange={(e) => setFormCat(e.target.value)} style={{ ...inputBase, cursor: "pointer" }} disabled={categoryNames.length === 0}>{categoryNames.length === 0 ? <option value="">Add a category first</option> : formCategoryNames.map((category) => <option key={category}>{category}</option>)}</select></div>
              <div className="flex flex-col gap-3" aria-label="Product additions" style={{ flexShrink: 0 }}>
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Additions <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                {additions.length === 0
                  ? <p style={{ margin: 0, color: "#9C8278", fontSize: 12 }}>No additions available. Create one in Additions Management first.</p>
                  : <select value="" onChange={(event) => addProductAddition(event.target.value)} disabled={availableAdditions.length === 0 || saving} style={{ ...inputBase, cursor: availableAdditions.length === 0 ? "default" : "pointer" }}><option value="">{availableAdditions.length === 0 ? "All additions are already bound" : "Select an addition to bind"}</option>{availableAdditions.map((addition) => <option key={addition.id} value={addition.id}>{addition.name} · ₱{Number(addition.price).toFixed(2)} · {addition.quantity} {addition.unit}</option>)}</select>}
                {selectedAdditions.length === 0
                  ? <p style={{ margin: 0, color: "#9C8278", fontSize: 12 }}>No additions bound to this product.</p>
                  : <div className="flex flex-col gap-2">{selectedAdditions.map((addition) => <div key={addition.id} className="flex items-center justify-between gap-3 py-1" style={{ borderBottom: "1px solid #E8DDD5" }}><span><span style={{ display: "block", color: "#3D2B1F", fontSize: 13, fontWeight: 600 }}>{addition.name} · ₱{Number(addition.price).toFixed(2)}</span><span style={{ color: "#9C8278", fontSize: 11 }}>{addition.quantity} {addition.unit} consumed from inventory</span></span><button type="button" onClick={() => removeProductAddition(addition.id)} disabled={saving} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "5px 9px", background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>Remove</button></div>)}</div>}
              </div>
              <div className="flex flex-col gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Image <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><input value={formImage} onChange={(e) => { setFormImage(e.target.value); setFormImageData(""); }} placeholder="Paste an image URL" style={inputBase} /><div className="flex items-center gap-2" style={{ color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}><span style={{ flex: 1, height: 1, background: "#E8DDD5" }} />or<span style={{ flex: 1, height: 1, background: "#E8DDD5" }} /></div><div className="flex items-center gap-2 flex-wrap"><label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "fit-content", border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 13px", background: "#F3EDE5", color: "#6B4C3B", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><IconImage size={14} /> Choose image<input type="file" accept="image/*" onChange={importProductImage} style={{ display: "none" }} /></label>{(formImageData || formImage.trim()) && <button type="button" onClick={removeProductImage} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "9px 13px", background: "#FEF2F2", color: "#B91C1C", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Remove image</button>}</div>{(formImageData || formImage.trim()) && <div style={{ width: "100%", height: 120, borderRadius: 10, overflow: "hidden", background: "#F3EDE5", position: "relative" }}><Image src={formImageData || formImage.trim()} alt="preview" fill unoptimized style={{ objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>}</div>
              <div className="flex flex-col gap-3"><div className="flex flex-col gap-2 rounded-xl p-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", width: "100%" }}>{standardVariantSizes.map((size) => { const hotIndex = formVariants.findIndex((variant) => variant.size.toLowerCase() === size.toLowerCase() && variant.temperature === "hot"); const coldIndex = formVariants.findIndex((variant) => variant.size.toLowerCase() === size.toLowerCase() && variant.temperature === "cold"); const hot = formVariants[hotIndex]; const cold = formVariants[coldIndex]; if (!hot || !cold) return null; const variantCard = (variant: DraftVariant, index: number) => <button key={`${variant.size.trim().toLowerCase()}-${variant.temperature}`} type="button" onClick={() => selectVariant(index)} style={{ border: selectedVariantIndex === index ? "2px solid #3D2B1F" : "1px solid #E8DDD5", borderRadius: 10, padding: "9px 11px", minHeight: 52, background: selectedVariantIndex === index ? "#3D2B1F" : variant.active ? "#FDF9F5" : "#F8F3EE", color: selectedVariantIndex === index ? "#FDF9F5" : variant.active ? "#3D2B1F" : "#B8A59C", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left", opacity: variant.active ? 1 : 0.75 }}><span style={{ display: "block", fontSize: 13 }}>{variant.size} · {variant.temperature === "hot" ? "Hot" : "Cold"}</span><span style={{ display: "block", marginTop: 3, fontSize: 11, fontWeight: 600 }}>{variant.active ? "Configured" : "Activate +"}</span></button>; return <div key={size} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">{variantCard(hot, hotIndex)}<div className="flex flex-col items-center gap-1"><button type="button" title={`Copy Hot to Cold for ${size}`} aria-label={`Copy Hot to Cold for ${size}`} disabled={!hot.active} onClick={() => copyVariantTo(hotIndex, coldIndex)} style={{ width: 28, height: 24, border: "1px solid #E8DDD5", borderRadius: 7, background: "#FDF9F5", color: hot.active ? "#6B4C3B" : "#C9B8AF", cursor: hot.active ? "pointer" : "default", fontWeight: 800 }}>→</button><button type="button" title={`Copy Cold to Hot for ${size}`} aria-label={`Copy Cold to Hot for ${size}`} disabled={!cold.active} onClick={() => copyVariantTo(coldIndex, hotIndex)} style={{ width: 28, height: 24, border: "1px solid #E8DDD5", borderRadius: 7, background: "#FDF9F5", color: cold.active ? "#6B4C3B" : "#C9B8AF", cursor: cold.active ? "pointer" : "default", fontWeight: 800 }}>←</button></div>{variantCard(cold, coldIndex)}</div>; })}</div><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "uppercase" }}>Price</label><input type="number" min={0} value={activeVariant?.price ?? ""} disabled={!activeVariant} onChange={(event) => { if (selectedVariantIndex < 0) return; setCopiedVariantIndices((current) => current.filter((index) => index !== selectedVariantIndex)); setFormVariants((prev) => prev.map((variant, index) => index === selectedVariantIndex ? { ...variant, price: event.target.value } : variant)); }} placeholder="0" style={{ ...inputBase, width: 100, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }} /></div></div><div className="flex items-center justify-between"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>{activeVariant ? `${activeVariant.size} ${activeVariant.temperature === "hot" ? "Hot" : "Cold"} Ingredients` : "Select a size and temperature to configure ingredients"}</label><div className="flex items-center gap-2"><button type="button" onClick={() => copyActiveVariantRecipe()} title="Copy selected recipe" aria-label="Copy selected recipe" disabled={!activeVariant} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 30, background: "#F3EDE5", border: "1px solid #E8DDD5", color: activeVariant ? "#6B4C3B" : "#C9B8AF", cursor: activeVariant ? "pointer" : "default" }}><IconCopy size={12} /></button><button type="button" onClick={() => pasteToActiveVariantRecipe()} title="Paste copied recipe" aria-label="Paste copied recipe" disabled={!activeVariant || !variantClipboard} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 30, background: "#F3EDE5", border: "1px solid #E8DDD5", color: activeVariant && variantClipboard ? "#6B4C3B" : "#C9B8AF", cursor: activeVariant && variantClipboard ? "pointer" : "default" }}><IconPaste size={12} /></button><button type="button" onClick={() => addIngredientRow()} disabled={!activeVariant || inventory.length === 0} className="flex items-center gap-1 rounded-lg px-3 py-1" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", fontFamily: "Inter, sans-serif", fontSize: 12, color: "#6B4C3B", cursor: activeVariant && inventory.length ? "pointer" : "default" }}><IconPlus size={11} /> Add</button></div></div>
                <div className="flex flex-col gap-2">{formIngredients.map((row, index) => { const inv = inventory.find((item) => item.inventory_id === row.inventoryId); return <div key={index} draggable={!saving} onDragStart={() => setDraggedIngredientIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveIngredientRow(index)} onDragEnd={() => setDraggedIngredientIndex(null)} className="flex items-center gap-2" style={{ opacity: draggedIngredientIndex === index ? 0.45 : 1, border: draggedIngredientIndex !== null && draggedIngredientIndex !== index ? "1px dashed #D97706" : "1px solid transparent", borderRadius: 10, padding: 2 }}><span title="Drag to reorder" style={{ color: "#9C8278", cursor: saving ? "default" : "grab", fontSize: 18, lineHeight: 1, userSelect: "none" }}>:::</span><select value={row.inventoryId || ""} onChange={(e) => { setCopiedVariantIndices((current) => current.filter((variantIndex) => variantIndex !== selectedVariantIndex)); setFormIngredients((prev) => prev.map((r, i) => i === index ? { ...r, inventoryId: Number(e.target.value) } : r)); }} style={{ ...inputBase, flex: 1, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }}><option value="">Select inventory item</option>{inventory.map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name}</option>)}</select><input type="number" min={0} step={inv?.is_whole_unit ? 1 : "any"} placeholder="Qty" value={row.qty} onChange={(e) => { setCopiedVariantIndices((current) => current.filter((variantIndex) => variantIndex !== selectedVariantIndex)); setFormIngredients((prev) => prev.map((r, i) => i === index ? { ...r, qty: inv?.is_whole_unit ? sanitizeWholeUnitValue(e.target.value) : e.target.value } : r)); }} style={{ ...inputBase, width: 70, ...(copiedVariantIndices.includes(selectedVariantIndex) ? { background: "#FFF7D6", border: "1px solid #F2C94C" } : {}) }} /><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", width: 55, flexShrink: 0 }}>{inv?.unit_of_measure ?? ""}</span><button onClick={() => removeIngredientRow(index)} disabled={formIngredients.length === 1} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#C0392B", cursor: formIngredients.length === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: formIngredients.length === 1 ? 0.5 : 1 }}><IconX size={12} /></button></div>; })}</div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "#E8DDD5", flexShrink: 0, background: "#FDF9F5" }}><button onClick={closeModal} disabled={saving} style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", fontFamily: "Inter, sans-serif", fontSize: 13.5, color: "#9C8278", cursor: saving ? "default" : "pointer" }}>Cancel</button><button onClick={submitProduct} disabled={saving || !formName.trim() || !hasValidVariant || inventory.length === 0} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: saving || !formName.trim() || !hasValidVariant || inventory.length === 0 ? "#C9B8AF" : "#3D2B1F", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13.5, color: "#FDF9F5", cursor: saving ? "default" : "pointer" }}>{saving ? "Saving…" : editingProduct ? "Save Changes" : "Add Product"}</button></div>
          </div>
        </div>
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
type SalesSummary = { order_count: number; revenue: number; items_sold: number };
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

function Finance() {
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
    if (!window.confirm("Archive this completed sales record? This is intended for temporary test data cleanup.")) return;
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
    </div><div className="grid gap-5 mb-7" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, .85fr)" }}><section className="rounded-2xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 5px 18px rgba(61,43,31,.05)" }}><div className="flex items-center justify-between mb-4"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>Top Sellers</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>What customers are ordering most</p></div><span style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>TOP 5</span></div>{topProducts.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No product sales in this period.</p> : topProducts.map((product, index) => <div key={product.product_name} className="flex items-center gap-3 py-3" style={{ borderBottom: index === topProducts.length - 1 ? "none" : "1px solid #F0E8E2" }}><span style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: index === 0 ? "#D97706" : "#F3EDE5", color: index === 0 ? "#fff" : "#6B4C3B", fontWeight: 800, fontSize: 12 }}>{index + 1}</span><div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.product_name}</strong><div style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>{product.quantity} sold</div></div><span style={{ fontWeight: 700, fontSize: 13 }}>₱{Number(product.revenue).toFixed(2)}</span></div>)}</section><section className="rounded-2xl p-6" style={{ background: "linear-gradient(145deg, #3D2B1F, #674735)", color: "#FDF9F5", boxShadow: "0 8px 24px rgba(61,43,31,.16)", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", right: -35, bottom: -45, width: 150, height: 150, borderRadius: "50%", border: "22px solid rgba(253,249,245,.08)" }} /><div style={{ position: "relative" }}><span style={{ color: "#FDE68A", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }}>    Owner&apos;s note</span><h3 style={{ margin: "12px 0 10px", fontWeight: 800, fontSize: 20 }}>Keep an eye on your best cups.</h3><p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, lineHeight: 1.65 }}>Use top sellers to guide prep and purchasing. Inventory deductions happen automatically after every completed order.</p><div style={{ marginTop: 24, display: "inline-flex", padding: "6px 10px", borderRadius: 7, background: "rgba(255,255,255,.1)", color: "#FDE68A", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>{periodLabel}</div></div></section></div>
    <section className="mb-7"><div className="flex items-end justify-between mb-3"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Daily Sales</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>Overall sales grouped by date · {periodLabel}</p></div><div className="flex items-center gap-2"><label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 12 }}>Date<input type="date" value={dailySalesDate} onChange={(event) => setDailySalesDate(event.target.value)} style={{ border: "none", background: "transparent", color: "#6B4C3B", outline: "none" }} /></label>{dailySalesDate && <button onClick={() => setDailySalesDate("")} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontSize: 12 }}>Clear</button>}<span style={{ color: "#9C8278", fontSize: 11 }}>{dailySales.length} day{dailySales.length === 1 ? "" : "s"}</span></div></div>{dailySales.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>No dated sales records found.</div> : <div className="rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Date", "Orders", "Items sold", "Revenue", "Inspect"].map((heading) => <th key={heading} style={{ padding: "12px 16px", textAlign: heading === "Date" ? "left" : "right", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{dailySales.map((day) => <tr key={day.sale_date} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{formatSalesDate(day.sale_date)}</td><td style={{ padding: "14px 16px", textAlign: "right", color: "#6B4C3B" }}>{day.order_count}</td><td style={{ padding: "14px 16px", textAlign: "right", color: "#6B4C3B" }}>{day.items_sold}</td><td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800 }}>₱{Number(day.revenue).toFixed(2)}</td><td style={{ padding: "10px 16px", textAlign: "right" }}><button type="button" onClick={() => inspectSalesDate(day.sale_date)} aria-label={`Inspect sales for ${formatSalesDate(day.sale_date)}`} title="Inspect sales for this date" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E8DDD5", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer" }}><IconEye size={14} /></button></td></tr>)}</tbody></table></div></div>}</section>
    {exportOpen && <div role="dialog" aria-modal="true" onClick={() => !exporting && setExportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.35)" }}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 560px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Finance report</p><h3 style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>Export Excel report</h3></div><button type="button" onClick={() => setExportOpen(false)} disabled={exporting} aria-label="Close export dialog" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div><div style={{ marginTop: 22 }}><strong style={{ display: "block", marginBottom: 10 }}>Include sections</strong>{(["summary", "dailySales", "orderHistory", "productSales"] as const).map((section) => <label key={section} className="flex items-center gap-2" style={{ marginTop: 9, color: "#6B4C3B", fontSize: 13 }}><input type="checkbox" checked={exportSections[section]} onChange={(event) => setExportSections((current) => ({ ...current, [section]: event.target.checked }))} />{section === "summary" ? "Sales Summary" : section === "dailySales" ? "Daily Sales" : section === "orderHistory" ? "Order History" : "Product Sales"}</label>)}</div><div style={{ marginTop: 22 }}><strong style={{ display: "block", marginBottom: 10 }}>Date range</strong><div className="flex flex-col gap-2"><label className="flex items-center gap-2" style={{ color: "#6B4C3B", fontSize: 13 }}><input type="radio" name="export-date-mode" checked={exportMode === "period"} onChange={() => setExportMode("period")} />Use current period ({periodLabel})</label><label className="flex items-center gap-2" style={{ color: "#6B4C3B", fontSize: 13 }}><input type="radio" name="export-date-mode" checked={exportMode === "date"} onChange={() => setExportMode("date")} />Specific date<input type="date" value={exportDate} onChange={(event) => setExportDate(event.target.value)} disabled={exportMode !== "date"} style={{ marginLeft: 6, border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 8px", background: "#FFFDF9" }} /></label><label className="flex items-center gap-2" style={{ color: "#6B4C3B", fontSize: 13 }}><input type="radio" name="export-date-mode" checked={exportMode === "range"} onChange={() => setExportMode("range")} />Date range<input type="date" value={exportStart} onChange={(event) => setExportStart(event.target.value)} disabled={exportMode !== "range"} style={{ marginLeft: 6, border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 8px", background: "#FFFDF9" }} /><span>to</span><input type="date" value={exportEnd} onChange={(event) => setExportEnd(event.target.value)} disabled={exportMode !== "range"} style={{ border: "1px solid #E8DDD5", borderRadius: 8, padding: "6px 8px", background: "#FFFDF9" }} /></label></div></div>    {exportError && <p role="alert" style={{ marginTop: 18, marginBottom: 0, padding: "10px 12px", border: "1px solid #FECACA", borderRadius: 10, background: "#FEF2F2", color: "#B91C1C", fontSize: 13 }}>{exportError}</p>}<div className="flex justify-end gap-3" style={{ marginTop: 26 }}><button type="button" onClick={() => setExportOpen(false)} disabled={exporting} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 16px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer" }}>Cancel</button><button type="button" onClick={() => void exportFinanceReport()} disabled={exporting} style={{ border: "none", borderRadius: 10, padding: "9px 16px", background: exporting ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", cursor: exporting ? "default" : "pointer", fontWeight: 700 }}>{exporting ? "Generating..." : "Download Excel"}</button></div></section></div>}
    {selectedDailyDate && <div role="dialog" aria-modal="true" onClick={() => { setSelectedDailyDate(""); setDailyDetailOrders([]); }} style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.35)" }}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 620px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Daily sales record</p><h3 style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>{formatSalesDate(selectedDailyDate)}</h3></div><button type="button" onClick={() => { setSelectedDailyDate(""); setDailyDetailOrders([]); }} aria-label="Close daily sales details" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div>{dailyDetailLoading ? <p style={{ marginTop: 24, color: "#9C8278", fontSize: 13 }}>Loading purchases...</p> : <>{dailyDetailOrders.map((order) => <div key={order.order_id} style={{ marginTop: 22, borderTop: "1px solid #E8DDD5", paddingTop: 16 }}><div className="flex items-start justify-between gap-3"><div><strong style={{ fontSize: 17 }}>Order #{order.order_id}</strong><div style={{ marginTop: 5, color: "#6B4C3B", fontSize: 12 }}>Punched by: {order.punched_by} · {formatFinanceDateTime(order.created_at)}</div></div><strong>₱{Number(order.total_amount).toFixed(2)}</strong></div>{order.items.map((item, index) => <div key={`${order.order_id}-${item.product_id}-${index}`} className="flex items-start justify-between gap-3" style={{ marginTop: 14, paddingBottom: 12, borderBottom: "1px solid #F0E8E2" }}><div>    <strong>{item.product_name}{item.size_label ? ` · ${item.size_label}` : ""}{item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}</strong><div style={{ marginTop: 4, color: "#6B4C3B", fontSize: 12 }}>{item.quantity} × ₱{Number(item.unit_price).toFixed(2)}{item.additions?.length ? ` · Additions: ${item.additions.map((addition) => `${addition.addition_name} × ${addition.quantity}`).join(", ")}` : ""}</div></div><strong>₱{(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}</strong></div>)}</div>)}{!dailyDetailOrders.length && <p style={{ marginTop: 24, color: "#9C8278", fontSize: 13 }}>No purchases found for this date.</p>}<div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 14, borderTop: "2px solid #3D2B1F" }}><strong>Total for the day</strong><strong style={{ fontSize: 20 }}>₱{dailyDetailOrders.reduce((total, order) => total + Number(order.total_amount), 0).toFixed(2)}</strong></div></>}</section></div>}
    <section id="order-history"><div className="flex items-end justify-between mb-3"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Order History</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>{orderHistoryDate ? `Completed transactions on ${formatSalesDate(orderHistoryDate)}` : `Completed transactions in the selected period`}</p></div><div className="flex items-center gap-2"><label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 12 }}>Date<input type="date" value={orderHistoryDate} onChange={(event) => setOrderHistoryDate(event.target.value)} style={{ border: "none", background: "transparent", color: "#6B4C3B", outline: "none" }} /></label>{orderHistoryDate && <button onClick={() => setOrderHistoryDate("")} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontSize: 12 }}>Clear</button>}<span style={{ color: "#9C8278", fontSize: 11 }}>{orders.length} shown</span>    <button onClick={() => { setClearConfirmation(""); setClearConfirmOpen(true); }} disabled={clearingRecords} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "8px 10px", background: "#FEF2F2", color: "#B91C1C", cursor: clearingRecords ? "default" : "pointer", fontSize: 11, fontWeight: 700 }}>{clearingRecords ? "Clearing..." : "DEV: Clear all records"}</button></div></div>{orders.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>No completed sales records found.</div> : <div className="flex flex-col gap-3">{orders.map((order) =>     <div key={order.order_id} className="rounded-2xl p-4 flex items-center justify-between gap-4" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 3px 12px rgba(61,43,31,.04)" }}><div style={{ minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>    Order #{order.order_id}    <span style={{ color: ["void", "voided", "refund", "refunded"].includes(order.status.toLowerCase()) ? "#B91C1C" : "#2E7D32", background: ["void", "voided", "refund", "refunded"].includes(order.status.toLowerCase()) ? "#FEF2F2" : "#DCFCE7", borderRadius: 20, padding: "3px 8px", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase" }}>{order.status}</span><span style={{ color: "#6B4C3B", background: "#F3EDE5", borderRadius: 20, padding: "3px 8px", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase" }}>{getPaymentMethodLabel(order)}</span></div><div style={{ marginTop: 5, color: "#6B4C3B", fontSize: 11 }}>Punched by: {order.punched_by}</div><div style={{ marginTop: 4, color: "#9C8278", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{new Date(order.created_at).toLocaleString()} · {order.items.map((item) => `${item.product_name} (${item.size_label}) × ${item.quantity}${item.additions?.length ? ` + ${item.additions.map((addition) => addition.addition_name).join(", ")}` : ""}`).join(", ")}</div></div><div className="flex items-center gap-4"><strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 16, whiteSpace: "nowrap" }}>₱{Number(order.total_amount).toFixed(2)}</strong>    <button type="button" onClick={() => setSelectedOrder(order)} aria-label={`Inspect order #${order.order_id}`} title="Inspect order" style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E8DDD5", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer" }}><IconEye size={14} /></button><button type="button" onClick={() => void deleteOrder(order.order_id)} disabled={deletingId === order.order_id} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "8px 11px", background: "#FEF2F2", color: "#B91C1C", cursor: deletingId === order.order_id ? "default" : "pointer", fontSize: 11 }}>{deletingId === order.order_id ? "Archiving..." : "Archive test sale"}</button></div></div>)}</div>}</section></>}    {loading && orders.length > 0 && <div style={{ position: "sticky", bottom: 20, zIndex: 5, display: "flex", justifyContent: "center", pointerEvents: "none" }}><div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 14px", color: "#6B4C3B", background: "rgba(253,249,245,.96)", border: "1px solid #E8DDD5", borderRadius: 999, boxShadow: "0 5px 18px rgba(61,43,31,.12)", fontSize: 12 }}><span style={{ width: 13, height: 13, border: "2px solid #E8DDD5", borderTopColor: "#D97706", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Updating finance records...</div></div>}
    {clearConfirmOpen && <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.35)" }}><section style={{ width: "min(100%, 440px)", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><h3 style={{ margin: 0, color: "#3D2B1F", fontSize: 18 }}>Clear all finance records?</h3><p style={{ margin: "10px 0 16px", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>This permanently deletes every sales record and its order items. Type <strong>CLEAR_FINANCE_RECORDS</strong> to continue.</p><input autoFocus value={clearConfirmation} onChange={(event) => setClearConfirmation(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void clearAllFinanceRecords(); }} placeholder="CLEAR_FINANCE_RECORDS" style={{ width: "100%", padding: "10px 12px", border: "1px solid #E8DDD5", borderRadius: 8, color: "#3D2B1F", background: "#fff" }} /><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => { setClearConfirmOpen(false); setClearConfirmation(""); }} disabled={clearingRecords} style={{ padding: "9px 13px", border: "1px solid #E8DDD5", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", cursor: clearingRecords ? "default" : "pointer" }}>Cancel</button><button onClick={() => void clearAllFinanceRecords()} disabled={clearingRecords || clearConfirmation !== "CLEAR_FINANCE_RECORDS"} style={{ padding: "9px 13px", border: "1px solid #FECACA", borderRadius: 8, background: "#B91C1C", color: "#fff", cursor: clearingRecords || clearConfirmation !== "CLEAR_FINANCE_RECORDS" ? "default" : "pointer" }}>{clearingRecords ? "Clearing..." : "Clear records"}</button></div></section></div>}
   {selectedOrder && <div role="dialog" aria-modal="true" onClick={() => setSelectedOrder(null)} style={{ position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.35)" }}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 620px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Finance record</p><h3 style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>Order #{selectedOrder.order_id}</h3></div><button onClick={() => setSelectedOrder(null)} aria-label="Close order details" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div>   <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Punched by</span><strong style={{ display: "block", marginTop: 4 }}>{selectedOrder.punched_by}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Order source</span><strong style={{ display: "block", marginTop: 4 }}>{selectedOrder.order_source === "online" ? "Online" : "Cashier"}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Payment method</span><strong style={{ display: "block", marginTop: 4 }}>{getPaymentMethodLabel(selectedOrder)}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Queue number</span><strong style={{ display: "block", marginTop: 4 }}>{selectedOrder.queue_number ?? "—"}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Created</span><strong style={{ display: "block", marginTop: 4 }}>{new Date(selectedOrder.created_at).toLocaleString()}</strong></div>{selectedOrder.payment_method !== "online" && <><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Received</span><strong style={{ display: "block", marginTop: 4 }}>₱{Number(selectedOrder.received_amount ?? 0).toFixed(2)}</strong></div><div><span style={{ color: "#9C8278", fontSize: 10, textTransform: "uppercase" }}>Change</span><strong style={{ display: "block", marginTop: 4 }}>₱{Number(selectedOrder.change_amount ?? 0).toFixed(2)}</strong></div></>}</div><div style={{ marginTop: 22, borderTop: "1px solid #E8DDD5" }}>{selectedOrder.items.map((item, index) => <div key={`${item.product_id}-${index}`} style={{ padding: "14px 0", borderBottom: "1px solid #F0E8E2" }}><div className="flex items-start justify-between gap-3">   <strong>{item.product_name}{item.size_label ? ` · ${item.size_label}` : ""}{item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}</strong><strong>₱{(Number(item.unit_price) * item.quantity).toFixed(2)}</strong></div><div style={{ marginTop: 4, color: "#6B4C3B", fontSize: 12 }}>{item.quantity} × ₱{Number(item.unit_price).toFixed(2)}{item.additions?.length ? ` · Additions: ${item.additions.map((addition) => `${addition.addition_name} × ${addition.quantity}`).join(", ")}` : ""}</div></div>)}</div><div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 14, borderTop: "2px solid #3D2B1F" }}><strong>Total</strong><strong style={{ fontSize: 20 }}>₱{Number(selectedOrder.total_amount).toFixed(2)}</strong></div></section></div>}  </main>;
}
type EmployeeTimeLog = { id: number; timeIn: string; timeOut: string | null };
type EmployeeTransaction = { id: number; amount: number; status: string; createdAt: string; reversalType: string | null; reversedAt: string | null };
type EmployeeReversal = { id: number; amount: number; status: string; reversedAt: string | null };
type CashierAccount = { id: number; fullName: string; email: string; role: string; isActive: boolean; canVoidOrders: boolean; canRefundOrders: boolean; timeLogs: EmployeeTimeLog[]; transactions: EmployeeTransaction[]; reversals: EmployeeReversal[] };
type MyActivity = { fullName: string; email: string; timeLogs: EmployeeTimeLog[]; transactions: EmployeeTransaction[]; reversals: EmployeeReversal[] };

function Accounts() {
  const [accounts, setAccounts] = useState<CashierAccount[]>([]);
  const [permissionAccount, setPermissionAccount] = useState<CashierAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myActivity, setMyActivity] = useState<MyActivity | null>(null);
  const [myActivityLoading, setMyActivityLoading] = useState(true);
  const [myActivityError, setMyActivityError] = useState("");

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
    if (!window.confirm(`Clear all attendance history for ${account.fullName}? This development action cannot be undone.`)) return;
    try {
      const response = await fetch("/api/cashier-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, confirmation: "CLEAR_EMPLOYEE_LOGS" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to clear employee log history.");
      await loadAccounts();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear employee log history.");
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
    {loading ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading employees...</div> : accounts.length === 0 ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px dashed #D8C8BE", color: "#9C8278" }}>No cashier employees found.</div> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Employee", "Email", "Role", "Status", "Manage"].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{accounts.map((account) => <tr key={account.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "15px 16px", fontWeight: 700 }}>{account.fullName}</td><td style={{ padding: "15px 16px", color: "#6B4C3B", fontSize: 13 }}>{account.email}</td><td style={{ padding: "15px 16px", color: "#9C8278", fontSize: 12, textTransform: "capitalize" }}>{account.role}</td><td style={{ padding: "15px 16px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "5px 9px", background: account.isActive ? "#DCFCE7" : "#F3EDE5", color: account.isActive ? "#166534" : "#9C8278", fontSize: 11, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: account.isActive ? "#22C55E" : "#B9A398" }} />{account.isActive ? "Active" : "Inactive"}</span></td><td style={{ padding: "12px 16px" }}><button type="button" onClick={() => setPermissionAccount(account)} style={{ border: "1px solid #D97706", borderRadius: 8, padding: "8px 11px", background: "#FFF7ED", color: "#B45309", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Manage employee</button></td></tr>)}</tbody></table></div></div>}

    <section className="mt-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div><div style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Your own record</div><h2 style={{ marginTop: 7, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-.03em" }}>My Cashier Activity</h2><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13 }}>Your own attendance, transactions, and reversals when using the cashier app. Other admins cannot see this, and you cannot see theirs.</p></div>
        <button onClick={() => void loadMyActivity()} disabled={myActivityLoading} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: myActivityLoading ? "default" : "pointer", fontSize: 12, whiteSpace: "nowrap" }}>{myActivityLoading ? "Loading..." : "Refresh"}</button>
      </div>
      {myActivityError && <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13 }}>{myActivityError}</div>}
      {myActivityLoading ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading your activity...</div> : !myActivity ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px dashed #D8C8BE", color: "#9C8278" }}>No cashier activity found for your account yet.</div> : <div className="rounded-2xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
        <div style={{ marginTop: 4 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Transaction record</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{myActivity.transactions.length} recent</span></div>{myActivity.transactions.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No transactions yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.transactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{transaction.id} · {formatFinanceDateTime(transaction.createdAt)}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{transaction.amount.toFixed(2)}</strong><span style={{ color: transaction.status === "completed" ? "#2E7D32" : "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{transaction.status}</span>{transaction.reversalType && <span style={{ display: "block", color: "#B91C1C", fontSize: 10 }}>Reversed: {transaction.reversalType}</span>}</span></div>)}</div>}</div>
        <div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Void & refund activity</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{myActivity.reversals.length} recent</span></div>{myActivity.reversals.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No voids or refunds yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.reversals.map((reversal) => <div key={reversal.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{reversal.id} · {reversal.reversedAt ? formatFinanceDateTime(reversal.reversedAt) : "Unknown time"}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{reversal.amount.toFixed(2)}</strong><span style={{ color: "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{reversal.status}</span></span></div>)}</div>}</div>
        <div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Attendance history</strong></div>{myActivity.timeLogs.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No time logs yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{myActivity.timeLogs.map((log) => <div key={log.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>In: {formatFinanceDateTime(log.timeIn)}</span><span style={{ color: log.timeOut ? "#6B4C3B" : "#2E7D32", fontWeight: log.timeOut ? 400 : 700 }}>{log.timeOut ? `Out: ${formatFinanceDateTime(log.timeOut)}` : "Currently signed in"}</span></div>)}</div>}</div>
      </div>}
    </section>

    {permissionAccount && <div role="dialog" aria-modal="true" aria-labelledby="cashier-employee-title" onClick={() => setPermissionAccount(null)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.35)" }}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 520px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#D97706", fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Employee management</p><h3 id="cashier-employee-title" style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>{permissionAccount.fullName}</h3><p style={{ margin: "6px 0 0", color: "#9C8278", fontSize: 13 }}>{permissionAccount.email}</p></div><button type="button" onClick={() => setPermissionAccount(null)} aria-label="Close employee management" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div><div style={{ marginTop: 22, padding: 14, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFDF9" }}><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Order permissions</strong><label className="flex items-center gap-3" style={{ marginTop: 14, color: "#6B4C3B", fontSize: 14, fontWeight: 600 }}><input type="checkbox" checked={permissionAccount.canVoidOrders} onChange={() => void updatePermissions(permissionAccount, { canVoidOrders: !permissionAccount.canVoidOrders })} /> Allow cashier to void orders</label><label className="flex items-center gap-3" style={{ display: "flex", marginTop: 12, color: "#6B4C3B", fontSize: 14, fontWeight: 600 }}><input type="checkbox" checked={permissionAccount.canRefundOrders} onChange={() => void updatePermissions(permissionAccount, { canRefundOrders: !permissionAccount.canRefundOrders })} /> Allow cashier to refund orders    </label></div><div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Transaction record</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{permissionAccount.transactions.length} recent</span></div>{permissionAccount.transactions.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No transactions yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{permissionAccount.transactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{transaction.id} · {formatFinanceDateTime(transaction.createdAt)}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{transaction.amount.toFixed(2)}</strong><span style={{ color: transaction.status === "completed" ? "#2E7D32" : "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{transaction.status}</span>{transaction.reversalType && <span style={{ display: "block", color: "#B91C1C", fontSize: 10 }}>Reversed: {transaction.reversalType}</span>}</span></div>)}</div>}    </div><div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Void & refund activity</strong><span style={{ color: "#9C8278", fontSize: 11 }}>{permissionAccount.reversals.length} recent</span></div>{permissionAccount.reversals.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No voids or refunds yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{permissionAccount.reversals.map((reversal) => <div key={reversal.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>Order #{reversal.id} · {reversal.reversedAt ? formatFinanceDateTime(reversal.reversedAt) : "Unknown time"}</span><span style={{ textAlign: "right" }}><strong style={{ display: "block", color: "#3D2B1F" }}>₱{reversal.amount.toFixed(2)}</strong><span style={{ color: "#B91C1C", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{reversal.status}</span></span></div>)}</div>}</div><div style={{ marginTop: 18 }}><div className="flex items-center justify-between gap-3"><strong style={{ color: "#3D2B1F", fontSize: 14 }}>Attendance history</strong><button type="button" onClick={() => void clearEmployeeLogs(permissionAccount)} style={{ border: "1px solid #FCA5A5", borderRadius: 8, padding: "6px 9px", background: "#FEF2F2", color: "#B91C1C", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>DEV: Clear log history</button></div>{permissionAccount.timeLogs.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No time logs yet.</p> : <div style={{ marginTop: 9, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{permissionAccount.timeLogs.map((log) => <div key={log.id} className="flex items-center justify-between gap-3" style={{ padding: "10px 12px", borderTop: "1px solid #F0E8E2", fontSize: 12 }}><span style={{ color: "#6B4C3B" }}>In: {formatFinanceDateTime(log.timeIn)}</span><span style={{ color: log.timeOut ? "#6B4C3B" : "#2E7D32", fontWeight: log.timeOut ? 400 : 700 }}>{log.timeOut ? `Out: ${formatFinanceDateTime(log.timeOut)}` : "Currently signed in"}</span></div>)}</div>}</div><div className="flex justify-end" style={{ marginTop: 22 }}><button type="button" onClick={() => setPermissionAccount(null)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 15px", background: "#FDF9F5", color: "#6B4C3B", cursor: "pointer", fontWeight: 700 }}>Done</button></div></section></div>}
  </main>;
}

function AccountManagement({ user, onSignOut }: { user: AdminSession; onSignOut: () => void }) {
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/auth/account", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Unable to retrieve account details.");
        if (active) setCreatedAt(payload.data?.createdAt ?? null);
      } catch (accountError) {
        console.error("Account Management: failed to load account details", accountError);
      }
    })();
    return () => { active = false; };
  }, []);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to change password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed successfully.");
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : "Unable to change password.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="p-8" style={{ maxWidth: 1280 }}>
    <div className="flex items-start justify-between gap-4"><div><p style={{ margin: 0, color: "#9C8278", fontSize: 13 }}>View your administrator profile and manage your account password.</p></div><button type="button" onClick={onSignOut} style={{ border: "1px solid #FECACA", borderRadius: 9, padding: "9px 13px", background: "#FEF2F2", color: "#B91C1C", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Sign out</button></div>
    <div className="grid gap-5 mt-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <section className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
        <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>My account</p>
        <h2 style={{ margin: "7px 0 18px", color: "#3D2B1F", fontSize: 22 }}>{user.fullName}</h2>
        <div style={{ display: "grid", gap: 12, color: "#6B4C3B", fontSize: 13 }}>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Email</span>{user.email}</div>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Role</span><span style={{ textTransform: "capitalize" }}>{user.role}</span></div>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Account created</span><span style={{ color: "#9C8278" }}>{createdAt ? new Date(createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not available in the database"}</span></div>
        </div>
      </section>
      <section className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
        <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Security</p>
        <h2 style={{ margin: "7px 0 18px", color: "#3D2B1F", fontSize: 22 }}>Change password</h2>
        {message && <p style={{ color: "#166534", fontSize: 13 }}>{message}</p>}
        {error && <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span style={{ color: "#9C8278", fontSize: 11 }}>Current password</span><input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 11px", background: "#FFFDF9", color: "#3D2B1F" }} /></label>
          <label className="flex flex-col gap-1"><span style={{ color: "#9C8278", fontSize: 11 }}>New password</span><input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 11px", background: "#FFFDF9", color: "#3D2B1F" }} /></label>
          <label className="flex flex-col gap-1"><span style={{ color: "#9C8278", fontSize: 11 }}>Confirm new password</span><input type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 11px", background: "#FFFDF9", color: "#3D2B1F" }} /></label>
          <button type="submit" disabled={saving} style={{ marginTop: 6, border: "none", borderRadius: 9, padding: "11px", background: saving ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", cursor: saving ? "default" : "pointer", fontWeight: 700 }}>{saving ? "Saving..." : "Change password"}</button>
        </form>
      </section>
    </div>
  </main>;
}

function SignOutDialog({ onCancel, onConfirm, signingOut }: { onCancel: () => void; onConfirm: () => void; signingOut: boolean }) {
  return <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.4)", zIndex: 100 }} role="dialog" aria-modal="true" aria-labelledby="admin-sign-out-title">
    <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 380px)", background: "#FDF9F5", boxShadow: "0 20px 60px rgba(61,43,31,0.25)" }}>
      <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Session</p>
      <h2 id="admin-sign-out-title" style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 21 }}>Sign out?</h2>
      <p style={{ margin: "9px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>You will need to sign in again to access the admin portal.</p>
      <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={onCancel} disabled={signingOut} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: signingOut ? "default" : "pointer" }}>Cancel</button><button type="button" onClick={onConfirm} disabled={signingOut} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: signingOut ? "#C9B8AF" : "#B91C1C", color: "#FFF", cursor: signingOut ? "default" : "pointer", fontWeight: 700 }}>{signingOut ? "Signing out..." : "Sign out"}</button></div>
    </div>
  </div>;
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: (session: AdminSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to sign in.");
      onLoggedIn(payload.data);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="flex items-center justify-center min-h-screen p-6" style={{ background: "#F8F9FA" }}>
    <div className="w-full rounded-2xl p-8" style={{ maxWidth: 420, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 48px rgba(61,43,31,0.1)" }}>
      <div className="flex flex-col items-center text-center mb-8"><div className="flex items-center justify-center rounded-xl mb-4" style={{ width: 52, height: 52, background: "#D97706", color: "#FDF9F5" }}><IconCoffee size={26} /></div><h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 25, color: "#3D2B1F" }}>Brew Houze</h1><p style={{ marginTop: 4, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", letterSpacing: "0.08em" }}>ADMIN PORTAL</p></div>
      <form onSubmit={submit} className="flex flex-col gap-4"><label className="flex flex-col gap-1.5"><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="admin@brewhouze.com" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none" }} /></label><label className="flex flex-col gap-1.5"><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Password</span><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none" }} /></label>{error && <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}<button type="submit" disabled={submitting} style={{ marginTop: 8, border: "none", borderRadius: 10, padding: "12px", background: submitting ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontFamily: "Inter, sans-serif", fontWeight: 700, cursor: submitting ? "default" : "pointer" }}>{submitting ? "Signing in..." : "Sign in"}</button></form>
    </div>
  </main>;
}

export default function App() {
  const [authUser, setAuthUser] = useState<AdminSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [showSignOut, setShowSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [additions, setAdditions] = useState<ProductAddition[]>([]);
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

  async function refreshAdditions() {
    try {
      const response = await fetch("/api/additions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load additions.");
      setAdditions(payload.data ?? []);
    } catch (error) {
      console.error(error);
      setAdditions([]);
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
    if (nextPage === "products" || nextPage === "additions") {
      void refreshAdditions();
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
    const timer = window.setTimeout(() => { void refreshAdditions(); }, 0);
    return () => window.clearTimeout(timer);
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
            ? [refreshInventory(), refreshProducts(), refreshAdditions(), refreshCategories()]
            : page === "additions"
              ? [refreshAdditions(), refreshCategories()]
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
        addition_ids: product.additions.map((addition) => addition.id),
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
        addition_ids: product.additions.map((addition) => addition.id),
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

  const pageTitles: Record<Page, string> = { dashboard: "Dashboard", inventory: "Inventory Management", additions: "Additions Management", products: "Product Management", finance: "Finance", accounts: "Accounts & Employees", account: "Account Management" };

  if (authLoading) return <div className="flex items-center justify-center min-h-screen" style={{ background: "#F8F9FA", color: "#9C8278" }}>Loading admin portal...</div>;
  if (!authUser) return <AdminLogin onLoggedIn={setAuthUser} />;

  return <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
    <Sidebar current={page} collapsed={sidebarCollapsed} onChange={handlePageChange} onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar page={page} user={authUser} onAccount={() => setPage("account")} onRequestLogout={() => setShowSignOut(true)} />
      <div className="app-page-heading px-8 pt-7 pb-2" style={{ background: "#F8F9FA", flexShrink: 0 }}><h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26, color: "#3D2B1F", letterSpacing: "-0.02em", margin: 0 }}>{pageTitles[page]}</h1></div>
      <div className="app-content" style={{ flex: 1, overflowY: "auto", background: "#F8F9FA" }}>
        {page === "dashboard" && <Dashboard inventory={inventory} />}
        {page === "inventory" && <Inventory items={inventory} onAdd={handleInventoryAdd} onUpdate={handleInventoryUpdate} onDelete={handleInventoryDelete} />}
        {page === "additions" && <AdditionsManagement inventory={inventory} categories={categories} onCategoriesChange={setCategories} />}
        {page === "products" && <ProductManagement products={products} inventory={inventory} additions={additions} categories={categories} onAdd={handleProductAdd} onEdit={handleProductEdit} onDelete={handleProductDelete} />}
        {page === "finance" && <Finance />}
        {page === "accounts" && <Accounts />}
        {page === "account" && <AccountManagement user={authUser} onSignOut={() => setShowSignOut(true)} />}
      </div>
    </div>
    {showSignOut && <SignOutDialog onCancel={() => setShowSignOut(false)} onConfirm={() => void confirmSignOut()} signingOut={signingOut} />}
  </div>;
}