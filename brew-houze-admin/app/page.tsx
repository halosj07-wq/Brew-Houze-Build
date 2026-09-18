"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type Page = "dashboard" | "inventory" | "additions" | "products" | "finance" | "accounts";

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
};

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
          return <button key={id} onClick={() => onChange(id)} className="flex items-center gap-3 py-3 rounded-xl text-left transition-all duration-150 w-full" style={{ paddingLeft: id === "additions" ? 32 : 16, paddingRight: 16, background: active ? "#D97706" : "transparent", color: active ? "#FDF9F5" : "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif", fontSize: id === "additions" ? 12.5 : 13.5, fontWeight: active ? 600 : 400, cursor: "pointer", border: "none" }}><Icon size={id === "additions" ? 15 : 17} /><span>{label}</span></button>;
        })}
      </nav>
      <div className="px-6 py-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em" }}>v1.0.0 — Admin Panel</p></div>
    </aside>
  );
}

function TopBar({ page, user, onLogout }: { page: Page; user: AdminSession; onLogout: () => Promise<void> }) {
  const titles: Record<Page, string> = { dashboard: "Dashboard", inventory: "Inventory Management", additions: "Additions Management", products: "Product Management", finance: "Finance", accounts: "Accounts & Employees" };
  return <header className="app-topbar flex items-center justify-between px-8 py-4 border-b" style={{ background: "#FDF9F5", borderColor: "#E8DDD5", flexShrink: 0 }}>
    <div className="flex items-center gap-2" style={{ color: "#9C8278" }}><IconChevron size={14} /><span style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}>{titles[page]}</span></div>
    <div className="flex items-center gap-5">
      <div className="text-right"><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15, color: "#3D2B1F" }}>Brew Houze Cafe</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#D97706", letterSpacing: "0.06em" }}>ADMIN DASHBOARD</p></div>
      <div className="flex items-center gap-3 rounded-xl px-4 py-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5" }}>
        <div className="flex items-center justify-center rounded-full text-white font-bold text-sm" style={{ width: 32, height: 32, background: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif" }}>{user.fullName.charAt(0).toUpperCase()}</div>
        <div><p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, color: "#3D2B1F", lineHeight: 1.3 }}>{user.fullName}</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "capitalize" }}>{user.role}</p></div>
        <button onClick={() => void onLogout()} title="Log out" style={{ border: "none", background: "transparent", color: "#9C8278", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12 }}>Log out</button>
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
    async function loadWeeklySales() {
      try {
        const response = await fetch("/api/sales-orders?period=week", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Failed to load weekly sales.");
        if (active) setWeeklySales(Number(payload.summary?.revenue ?? 0));
      } catch (error) {
        console.error("Dashboard: failed to load weekly sales", error);
      }
    }
    void loadWeeklySales();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadWeeklySales();
    }, 5_000);
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

function AdditionsManagement({ inventory }: { inventory: InventoryItem[] }) {
  const [items, setItems] = useState<AdditionItem[]>([]);
  const [additionName, setAdditionName] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedInventory = inventory.find((item) => String(item.inventory_id) === inventoryId);
  const additionInputBase = { border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none", width: "100%" };

  async function loadItems() {
    try {
      setLoading(true);
      const response = await fetch("/api/additions", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load additions.");
      setItems((payload.data ?? []).map((item: { id: number; name: string; inventoryId: number; itemName: string; unit: string; quantity: number; }) => ({
        addition_id: Number(item.id),
        addition_name: item.name,
        inventory_id: Number(item.inventoryId),
        item_name: item.itemName,
        unit_of_measure: item.unit,
        quantity: Number(item.quantity),
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
    if (!additionName.trim() || !selectedInventory || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Addition name, inventory item, and a quantity greater than zero are required.");
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
        body: JSON.stringify({ addition_name: additionName, inventory_id: selectedInventory.inventory_id, quantity: parsedQuantity }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to create addition.");
      setItems((current) => [...current, payload.data]);
      setAdditionName("");
      setInventoryId("");
      setQuantity("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create addition.");
    } finally {
      setSaving(false);
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
        <button type="submit" disabled={saving || loading} style={{ border: "none", borderRadius: 10, padding: "11px 16px", background: saving ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Adding..." : "Add Addition"}</button>
      </form>
      {error && <p style={{ color: "#B91C1C", fontSize: 13, marginTop: 14 }}>{error}</p>}
    </div>
    <div className="rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: "#E8DDD5" }}><h3 style={{ margin: 0, color: "#3D2B1F", fontWeight: 700 }}>Addition Items</h3></div>
      {loading ? <p className="p-6" style={{ color: "#9C8278" }}>Loading additions...</p> : items.length === 0 ? <p className="p-6" style={{ color: "#9C8278" }}>No addition items yet.</p> : <div className="divide-y">{items.map((item) => <div key={item.addition_id} className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderColor: "#E8DDD5" }}><div><p style={{ margin: 0, color: "#3D2B1F", fontWeight: 700 }}>{item.addition_name}</p><p style={{ margin: "4px 0 0", color: "#9C8278", fontSize: 12 }}>Uses {item.item_name}</p></div><p style={{ margin: 0, color: "#6B4C3B", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>{item.quantity} {item.unit_of_measure}</p></div>)}</div>}
    </div>
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
type ProductVariant = { id?: number; size: string; price: number; hasSales?: boolean; ingredients: ProductIngredient[] };
type ProductAddition = { id: number; name: string; quantity: number; unit: string };
type Product = { id: number; name: string; category: string; imageUrl: string; imageData: string; price: number; hasSales?: boolean; ingredients: ProductIngredient[]; variants: ProductVariant[]; additions: ProductAddition[] };

const productCategories = ["Espresso Drinks", "Cold Drinks"];

type DraftIngredient = { inventoryId: number; qty: string };
type DraftVariant = { size: string; price: string; ingredients: DraftIngredient[] };

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
        {(product.imageData || product.imageUrl.trim()) ? <img src={product.imageData || product.imageUrl.trim()} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="flex items-center justify-center w-full h-full" style={{ color: "#D5C5BC" }}><IconImage size={36} /></div>}
        <button onClick={onEdit} title="Edit product" style={{ position: "absolute", top: 8, right: 46, width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.9)", color: "#6B4C3B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}><IconPencil size={13} /></button>
        <button onClick={onDeleteClick} title="Archive product" style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.9)", color: "#C0392B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}><IconTrash size={13} /></button>
      </div>
      <div className="flex flex-col gap-2 p-4" style={{ flex: 1 }}>
        {hasSizeTabs && (
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", width: "fit-content" }}>
            {displayedVariants.map((variant, index) => (
              <button
                key={`${product.id}-tab-${variant.id ?? index}`}
                onClick={() => setSelectedIndex(index)}
                style={{
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  background: selectedIndex === index ? "#3D2B1F" : "transparent",
                  color: selectedIndex === index ? "#FDF9F5" : "#6B4C3B",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {variant.size}
              </button>
            ))}
          </div>
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
        </div>
      </div>
    </div>
  );
}

const standardVariantSizes = ["16 oz", "22 oz"];

function buildFormVariants(product: Product | undefined, defaultInventoryId: number): DraftVariant[] {
  const existing = product?.variants ?? [];
  const usedSizes = new Set<string>();

  const seeded: DraftVariant[] = standardVariantSizes.map((size) => {
    const match = existing.find((variant) => variant.size.trim().toLowerCase() === size.toLowerCase());
    if (match) {
      usedSizes.add(match.size);
      return { size: match.size, price: String(match.price), ingredients: match.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })) };
    }
    return { size, price: "", ingredients: [{ inventoryId: 0, qty: "" }] };
  });

  // Preserve any variant whose size doesn't match a standard label, so no data is lost.
  for (const variant of existing) {
    if (usedSizes.has(variant.size)) continue;
    seeded.push({ size: variant.size, price: String(variant.price), ingredients: variant.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })) });
  }

  if (!product) {
    // Brand-new product: pre-select an inventory item on the first size so the form isn't empty.
    seeded[0] = { ...seeded[0], ingredients: [{ inventoryId: defaultInventoryId, qty: "" }] };
  } else if (existing.length === 0 && product.ingredients.length > 0) {
    // Legacy product stored without variants — seed the first size with its flat-level ingredients.
    seeded[0] = { size: standardVariantSizes[0], price: String(product.price), ingredients: product.ingredients.map((ingredient) => ({ inventoryId: ingredient.inventoryId, qty: String(ingredient.qty) })) };
  }

  return seeded;
}

function ProductManagement({
  products,
  inventory,
  additions,
  onAdd,
  onEdit,
  onDelete,
}: {
  products: Product[];
  inventory: InventoryItem[];
  additions: ProductAddition[];
  onAdd: (product: Product) => Promise<void>;
  onEdit: (product: Product) => Promise<void>;
  onDelete: (id: number, variantSize?: string) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [filterCat, setFilterCat] = useState("All");
  const [formName, setFormName] = useState("");
  const [formCat, setFormCat] = useState(productCategories[0]);
  const [formImage, setFormImage] = useState("");
  const [formImageData, setFormImageData] = useState("");
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [formVariants, setFormVariants] = useState<DraftVariant[]>([
    { size: "16 oz", price: "", ingredients: [{ inventoryId: inventory[0]?.inventory_id ?? 0, qty: "" }] },
    { size: "22 oz", price: "", ingredients: [{ inventoryId: 0, qty: "" }] },
  ]);
  const [selectedAdditionIds, setSelectedAdditionIds] = useState<number[]>([]);
  const [additionToAdd, setAdditionToAdd] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [draggedIngredientIndex, setDraggedIngredientIndex] = useState<number | null>(null);
  const activeVariant = formVariants[selectedVariantIndex] ?? formVariants[0];
  const formIngredients = activeVariant?.ingredients ?? [];
  const setFormIngredients = (updater: (previous: DraftIngredient[]) => DraftIngredient[]) => setFormVariants((previous) => previous.map((variant, index) => index === selectedVariantIndex ? { ...variant, ingredients: updater(variant.ingredients) } : variant));

  function resetForm(product?: Product) {
    setEditingProduct(product ?? null);
    setFormName(product?.name ?? "");
    setFormCat(product?.category ?? productCategories[0]);
    setFormImage(product?.imageUrl ?? "");
    setFormImageData(product?.imageData ?? "");
    setSelectedVariantIndex(0);
    setFormVariants(buildFormVariants(product, inventory[0]?.inventory_id ?? 0));
    setSelectedAdditionIds(product?.additions?.map((addition) => addition.id) ?? []);
    setAdditionToAdd("");
    setActionError("");
  }

  function openModal() { resetForm(); setShowModal(true); }
  function openEditModal(product: Product) { resetForm(product); setShowModal(true); }
  function closeModal() { if (!saving) setShowModal(false); }
  function addIngredientRow(variantIndex = selectedVariantIndex) {
    setFormVariants((prev) => prev.map((variant, index) => index === variantIndex ? { ...variant, ingredients: [...variant.ingredients, { inventoryId: 0, qty: "" }] } : variant));
  }
  function removeIngredientRow(ingredientIndex: number, variantIndex = selectedVariantIndex) {
    setFormVariants((prev) => prev.map((variant, index) => index === variantIndex ? { ...variant, ingredients: variant.ingredients.filter((_, i) => i !== ingredientIndex) } : variant));
  }

  function addProductAddition() {
    const additionId = Number(additionToAdd);
    if (!Number.isInteger(additionId) || additionId <= 0 || selectedAdditionIds.includes(additionId)) return;
    setSelectedAdditionIds((current) => [...current, additionId]);
    setAdditionToAdd("");
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
    const variants = formVariants.map((variant) => ({
      size: variant.size,
      price: Number(variant.price),
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
        category: formCat,
        price: variants[0].price,
        imageUrl: formImage.trim(),
        imageData: formImageData,
        ingredients: variants[0].ingredients,
        variants,
        additions: selectedAdditionIds.map((id) => additions.find((addition) => addition.id === id)).filter((addition): addition is ProductAddition => Boolean(addition)),
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
            <option>All</option>{productCategories.map((category) => <option key={category}>{category}</option>)}
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
                  {["16 oz", "22 oz"].filter((size) => deleteTarget.variants.length > 1 && deleteTarget.variants.some((variant) => variant.size.toLowerCase() === size.toLowerCase() && !variant.hasSales)).map((size) => <button key={size} onClick={async () => { try { setActionError(""); await onDelete(deleteTarget.id, size); setDeleteTarget(null); } catch (error) { setActionError(error instanceof Error ? error.message : "Failed to archive variant."); } }} style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#F3EDE5", color: "#6B4C3B", textAlign: "left", cursor: "pointer" }}>Archive {size} only</button>)}
                  <button onClick={async () => { if (!window.confirm(`Archive the entire ${deleteTarget.name} product?`)) return; try { setActionError(""); await onDelete(deleteTarget.id); setDeleteTarget(null); } catch (error) { setActionError(error instanceof Error ? error.message : "Failed to archive product."); } }} style={{ padding: "11px 13px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", textAlign: "left", cursor: "pointer" }}>Archive whole product</button>
                </>
              )}
            </div>
            <button onClick={() => setDeleteTarget(null)} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.45)", zIndex: 50 }} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="flex flex-col rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", width: "100%", maxWidth: 560, height: "92vh", maxHeight: 760, boxShadow: "0 16px 48px rgba(61,43,31,0.22)" }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "#E8DDD5", background: "#F3EDE5", flexShrink: 0 }}><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "#3D2B1F" }}>{editingProduct ? "Edit Product" : "Add New Product"}</p><button onClick={closeModal} disabled={saving} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E8DDD5", background: "#FDF9F5", color: "#9C8278", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconX size={14} /></button></div>
            <div className="flex flex-col gap-5 px-6 py-6" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Name</label><input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Vanilla Cold Brew" style={inputBase} /></div>
              <div className="flex flex-col gap-1.5"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Category</label><select value={formCat} onChange={(e) => setFormCat(e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>{productCategories.map((category) => <option key={category}>{category}</option>)}</select></div>
              <div className="flex flex-col gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Image <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label><input value={formImage} onChange={(e) => { setFormImage(e.target.value); setFormImageData(""); }} placeholder="Paste an image URL" style={inputBase} /><div className="flex items-center gap-2" style={{ color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}><span style={{ flex: 1, height: 1, background: "#E8DDD5" }} />or<span style={{ flex: 1, height: 1, background: "#E8DDD5" }} /></div><div className="flex items-center gap-2 flex-wrap"><label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "fit-content", border: "1px solid #E8DDD5", borderRadius: 10, padding: "9px 13px", background: "#F3EDE5", color: "#6B4C3B", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><IconImage size={14} /> Choose image<input type="file" accept="image/*" onChange={importProductImage} style={{ display: "none" }} /></label>{(formImageData || formImage.trim()) && <button type="button" onClick={removeProductImage} style={{ border: "1px solid #FECACA", borderRadius: 10, padding: "9px 13px", background: "#FEF2F2", color: "#B91C1C", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Remove image</button>}</div>{(formImageData || formImage.trim()) && <div style={{ width: "100%", height: 120, borderRadius: 10, overflow: "hidden", background: "#F3EDE5" }}><img src={formImageData || formImage.trim()} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>}</div>
              <div className="flex flex-col gap-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5" }}>{formVariants.map((variant, index) => <button key={variant.size} onClick={() => setSelectedVariantIndex(index)} style={{ border: "none", borderRadius: 8, padding: "7px 12px", background: selectedVariantIndex === index ? "#3D2B1F" : "transparent", color: selectedVariantIndex === index ? "#FDF9F5" : "#6B4C3B", fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{variant.size}</button>)}</div><div className="flex items-center gap-2"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "uppercase" }}>Price</label><input type="number" min={0} value={activeVariant?.price ?? ""} onChange={(event) => setFormVariants((prev) => prev.map((variant, index) => index === selectedVariantIndex ? { ...variant, price: event.target.value } : variant))} placeholder="0" style={{ ...inputBase, width: 100 }} /></div></div><div className="flex items-center justify-between"><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", letterSpacing: "0.05em", textTransform: "uppercase" }}>{activeVariant?.size} Ingredients</label><button onClick={() => addIngredientRow()} disabled={inventory.length === 0} className="flex items-center gap-1 rounded-lg px-3 py-1" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5", fontFamily: "Inter, sans-serif", fontSize: 12, color: "#6B4C3B", cursor: inventory.length ? "pointer" : "default" }}><IconPlus size={11} /> Add</button></div>
                <div className="flex flex-col gap-2">{formIngredients.map((row, index) => { const inv = inventory.find((item) => item.inventory_id === row.inventoryId); return <div key={index} draggable={!saving} onDragStart={() => setDraggedIngredientIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveIngredientRow(index)} onDragEnd={() => setDraggedIngredientIndex(null)} className="flex items-center gap-2" style={{ opacity: draggedIngredientIndex === index ? 0.45 : 1, border: draggedIngredientIndex !== null && draggedIngredientIndex !== index ? "1px dashed #D97706" : "1px solid transparent", borderRadius: 10, padding: 2 }}><span title="Drag to reorder" style={{ color: "#9C8278", cursor: saving ? "default" : "grab", fontSize: 18, lineHeight: 1, userSelect: "none" }}>:::</span><select value={row.inventoryId || ""} onChange={(e) => setFormIngredients((prev) => prev.map((r, i) => i === index ? { ...r, inventoryId: Number(e.target.value) } : r))} style={{ ...inputBase, flex: 1 }}><option value="">Select inventory item</option>{inventory.map((item) => <option key={item.inventory_id} value={item.inventory_id}>{item.item_name}</option>)}</select><input type="number" min={0} step={inv?.is_whole_unit ? 1 : "any"} placeholder="Qty" value={row.qty} onChange={(e) => setFormIngredients((prev) => prev.map((r, i) => i === index ? { ...r, qty: inv?.is_whole_unit ? sanitizeWholeUnitValue(e.target.value) : e.target.value } : r))} style={{ ...inputBase, width: 70 }} /><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", width: 55, flexShrink: 0 }}>{inv?.unit_of_measure ?? ""}</span><button onClick={() => removeIngredientRow(index)} disabled={formIngredients.length === 1} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#C0392B", cursor: formIngredients.length === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: formIngredients.length === 1 ? 0.5 : 1 }}><IconX size={12} /></button></div>; })}</div>
              </div>
              <div className="flex flex-col gap-3 rounded-xl p-4" style={{ border: "2px solid #D97706", background: "#FFF7ED" }}>
                <div><label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#6B4C3B", letterSpacing: "0.05em", textTransform: "uppercase" }}>Product Additions</label><p style={{ margin: "4px 0 0", color: "#9C8278", fontSize: 12 }}>Bind existing additions that customers can order with this product.</p></div>
                {additions.length === 0 ? <p style={{ margin: 0, color: "#9C8278", fontSize: 12 }}>No additions available. Create one in Additions Management first.</p> : <>
                  <div className="flex items-center gap-2"><select value={additionToAdd} onChange={(event) => setAdditionToAdd(event.target.value)} style={{ ...inputBase, flex: 1 }}><option value="">Select an addition to bind</option>{additions.filter((addition) => !selectedAdditionIds.includes(addition.id)).map((addition) => <option key={addition.id} value={addition.id}>{addition.name} · {addition.quantity} {addition.unit}</option>)}</select><button type="button" onClick={addProductAddition} disabled={!additionToAdd} style={{ border: "none", borderRadius: 10, padding: "10px 14px", background: additionToAdd ? "#3D2B1F" : "#C9B8AF", color: "#FDF9F5", fontWeight: 700, cursor: additionToAdd ? "pointer" : "default" }}>Bind</button></div>
                  {selectedAdditionIds.length === 0 ? <p style={{ margin: 0, color: "#9C8278", fontSize: 12 }}>No additions bound to this product.</p> : <div className="flex flex-col gap-2">{selectedAdditionIds.map((additionId) => { const addition = additions.find((item) => item.id === additionId); if (!addition) return null; return <div key={addition.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ border: "1px solid #E8DDD5", background: "#FDF9F5" }}><span><span style={{ display: "block", color: "#3D2B1F", fontSize: 13, fontWeight: 600 }}>{addition.name}</span><span style={{ color: "#9C8278", fontSize: 11 }}>{addition.quantity} {addition.unit} consumed from inventory</span></span><button type="button" onClick={() => removeProductAddition(addition.id)} disabled={saving} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "5px 9px", background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>Remove</button></div>; })}</div>}
                </>}
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
  status: string;
  created_at: string;
  items: { product_id: number; product_name: string; size_label: string; quantity: number; unit_price: number }[];
};
type SalesSummary = { order_count: number; revenue: number; items_sold: number };
type TopProduct = { product_name: string; quantity: number; revenue: number };
type DailySale = { sale_date: string; order_count: number; revenue: number; items_sold: number };

function formatSalesDate(value: string): string {
  const rawValue = String(value ?? "").trim();
  const date = new Date(rawValue.includes("T") ? rawValue : `${rawValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return rawValue || "Unknown date";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function Finance() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");
  const [selectedDate, setSelectedDate] = useState("");
  const [summary, setSummary] = useState<SalesSummary>({ order_count: 0, revenue: 0, items_sold: 0 });
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);

  const loadOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    if (showLoading) setError("");
    try {
      const query = new URLSearchParams({ period });
      if (selectedDate) query.set("date", selectedDate);
      const response = await fetch(`/api/sales-orders?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load sales records.");
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
  }, [period, selectedDate]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadOrders(); }, 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadOrders(false);
    }, 5_000);
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

  const averageTicket = Number(summary.order_count) ? Number(summary.revenue) / Number(summary.order_count) : 0;
  const periodLabel = period === "all" ? "All time" : `Last ${period} days`;

  return <main className="finance-shell p-8" style={{ color: "#3D2B1F", overflowY: "auto", maxWidth: 1380 }}>
    <div className="flex items-start justify-between gap-4 mb-6">
      <div><div style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#D97706" }} /> Business pulse</div><h2 style={{ marginTop: 7, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>Sales Overview</h2><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13 }}>A simple view of how your coffee shop is performing.</p></div>
      <div className="flex items-center gap-2"><select value={period} onChange={(event) => { setSelectedDate(""); setPeriod(event.target.value as typeof period); }} disabled={Boolean(selectedDate)} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 12px", background: "#FDF9F5", color: "#6B4C3B", boxShadow: "0 3px 10px rgba(61,43,31,.04)" }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select><button onClick={() => void loadOrders()} disabled={loading} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "10px 14px", background: "#3D2B1F", color: "#FDF9F5", cursor: loading ? "default" : "pointer", boxShadow: "0 4px 12px rgba(61,43,31,.12)" }}>{loading ? "Loading..." : "Refresh"}</button></div>
    </div>
    {error && <p className="mb-4" style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}
    {!loading && <><div className="grid gap-4 mb-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
      {[[`Revenue · ${periodLabel}`, `₱${Number(summary.revenue).toFixed(2)}`, "#3D2B1F", "primary"], ["Orders", String(summary.order_count), "#D97706", ""], ["Items sold", String(summary.items_sold), "#6B4C3B", ""], ["Average ticket", `₱${averageTicket.toFixed(2)}`, "#2E7D32", ""]].map(([label, value, color, emphasis]) => <div key={label} className="rounded-2xl p-5" style={{ background: emphasis ? "linear-gradient(135deg, #3D2B1F 0%, #5B4030 100%)" : "#FDF9F5", border: emphasis ? "none" : "1px solid #E8DDD5", boxShadow: "0 5px 18px rgba(61,43,31,.06)", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", right: -25, top: -25, background: emphasis ? "rgba(217,119,6,.18)" : "rgba(217,119,6,.07)" }} /><p style={{ position: "relative", color: emphasis ? "rgba(255,255,255,.62)" : "#9C8278", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p><p style={{ position: "relative", marginTop: 10, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 27, fontWeight: 800, color: emphasis ? "#FDF9F5" : color }}>{value}</p></div>)}
    </div><div className="grid gap-5 mb-7" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, .85fr)" }}><section className="rounded-2xl p-5" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 5px 18px rgba(61,43,31,.05)" }}><div className="flex items-center justify-between mb-4"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>Top Sellers</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>What customers are ordering most</p></div><span style={{ color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>TOP 5</span></div>{topProducts.length === 0 ? <p style={{ color: "#9C8278", fontSize: 13 }}>No product sales in this period.</p> : topProducts.map((product, index) => <div key={product.product_name} className="flex items-center gap-3 py-3" style={{ borderBottom: index === topProducts.length - 1 ? "none" : "1px solid #F0E8E2" }}><span style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: index === 0 ? "#D97706" : "#F3EDE5", color: index === 0 ? "#fff" : "#6B4C3B", fontWeight: 800, fontSize: 12 }}>{index + 1}</span><div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.product_name}</strong><div style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>{product.quantity} sold</div></div><span style={{ fontWeight: 700, fontSize: 13 }}>₱{Number(product.revenue).toFixed(2)}</span></div>)}</section><section className="rounded-2xl p-6" style={{ background: "linear-gradient(145deg, #3D2B1F, #674735)", color: "#FDF9F5", boxShadow: "0 8px 24px rgba(61,43,31,.16)", position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", right: -35, bottom: -45, width: 150, height: 150, borderRadius: "50%", border: "22px solid rgba(253,249,245,.08)" }} /><div style={{ position: "relative" }}><span style={{ color: "#FDE68A", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }}>    Owner&apos;s note</span><h3 style={{ margin: "12px 0 10px", fontWeight: 800, fontSize: 20 }}>Keep an eye on your best cups.</h3><p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, lineHeight: 1.65 }}>Use top sellers to guide prep and purchasing. Inventory deductions happen automatically after every completed order.</p><div style={{ marginTop: 24, display: "inline-flex", padding: "6px 10px", borderRadius: 7, background: "rgba(255,255,255,.1)", color: "#FDE68A", fontFamily: "JetBrains Mono, monospace", fontSize: 10, textTransform: "uppercase" }}>{periodLabel}</div></div></section></div>
    <section className="mb-7"><div className="flex items-end justify-between mb-3"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Daily Sales</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>Overall sales grouped by date · {periodLabel}</p></div><div className="flex items-center gap-2"><label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 12 }}>Date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={{ border: "none", background: "transparent", color: "#6B4C3B", outline: "none" }} /></label>{selectedDate && <button onClick={() => setSelectedDate("")} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontSize: 12 }}>Clear</button>}<span style={{ color: "#9C8278", fontSize: 11 }}>{dailySales.length} day{dailySales.length === 1 ? "" : "s"}</span></div></div>{dailySales.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>No dated sales records found.</div> : <div className="rounded-2xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Date", "Orders", "Items sold", "Revenue"].map((heading) => <th key={heading} style={{ padding: "12px 16px", textAlign: heading === "Date" ? "left" : "right", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{dailySales.map((day) => <tr key={day.sale_date} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "14px 16px", fontWeight: 700 }}>{formatSalesDate(day.sale_date)}</td><td style={{ padding: "14px 16px", textAlign: "right", color: "#6B4C3B" }}>{day.order_count}</td><td style={{ padding: "14px 16px", textAlign: "right", color: "#6B4C3B" }}>{day.items_sold}</td><td style={{ padding: "14px 16px", textAlign: "right", fontWeight: 800 }}>₱{Number(day.revenue).toFixed(2)}</td></tr>)}</tbody></table></div></div>}</section>
    <section><div className="flex items-end justify-between mb-3"><div><h3 style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>Order History</h3><p style={{ marginTop: 3, color: "#9C8278", fontSize: 11 }}>{selectedDate ? `Completed transactions on ${formatSalesDate(selectedDate)}` : `Completed transactions in the selected period`}</p></div><div className="flex items-center gap-2"><label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#FDF9F5", color: "#6B4C3B", fontSize: 12 }}>Date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={{ border: "none", background: "transparent", color: "#6B4C3B", outline: "none" }} /></label>{selectedDate && <button onClick={() => setSelectedDate("")} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "8px 10px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontSize: 12 }}>Clear</button>}<span style={{ color: "#9C8278", fontSize: 11 }}>{orders.length} shown</span></div></div>{orders.length === 0 ? <div className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>No completed sales records found.</div> : <div className="flex flex-col gap-3">{orders.map((order) => <div key={order.order_id} className="rounded-2xl p-4 flex items-center justify-between gap-4" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 3px 12px rgba(61,43,31,.04)" }}><div style={{ minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>Order #{order.order_id}<span style={{ color: "#2E7D32", background: "#DCFCE7", borderRadius: 20, padding: "3px 8px", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase" }}>{order.status}</span></div><div style={{ marginTop: 6, color: "#9C8278", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{new Date(order.created_at).toLocaleString()} · {order.items.map((item) => `${item.product_name} (${item.size_label}) × ${item.quantity}`).join(", ")}</div></div><div className="flex items-center gap-4"><strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 16, whiteSpace: "nowrap" }}>₱{Number(order.total_amount).toFixed(2)}</strong><button onClick={() => void deleteOrder(order.order_id)} disabled={deletingId === order.order_id} style={{ border: "1px solid #FECACA", borderRadius: 8, padding: "8px 11px", background: "#FEF2F2", color: "#B91C1C", cursor: deletingId === order.order_id ? "default" : "pointer", fontSize: 11 }}>{deletingId === order.order_id     ? "Archiving..." : "Archive test sale"}</button></div></div>)}</div>}</section></>}
  </main>;
}
type CashierAccount = { id: number; fullName: string; email: string; role: string; isActive: boolean };

function Accounts() {
  const [accounts, setAccounts] = useState<CashierAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAccounts = async () => {
    try {
      const response = await fetch("/api/cashier-accounts", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load cashier accounts.");
      setAccounts(payload.data ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load cashier accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadAccounts(); }, 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAccounts();
    }, 5_000);
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
    {loading ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", color: "#9C8278" }}>Loading cashier accounts...</div> : accounts.length === 0 ? <div className="rounded-xl p-8 text-center" style={{ background: "#FDF9F5", border: "1px dashed #D8C8BE", color: "#9C8278" }}>No cashier accounts found. Create an active cashier in the <code>admin_users</code> table to enable POS access.</div> : <div className="rounded-xl overflow-hidden" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F3EDE5" }}>{["Cashier", "Email", "Role", "Status"].map((heading) => <th key={heading} style={{ padding: "13px 16px", textAlign: "left", color: "#9C8278", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{accounts.map((account) => <tr key={account.id} style={{ borderTop: "1px solid #F0E8E2" }}><td style={{ padding: "15px 16px", fontWeight: 700 }}>{account.fullName}</td><td style={{ padding: "15px 16px", color: "#6B4C3B", fontSize: 13 }}>{account.email}</td><td style={{ padding: "15px 16px", color: "#9C8278", fontSize: 12, textTransform: "capitalize" }}>{account.role}</td><td style={{ padding: "15px 16px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 20, padding: "5px 9px", background: account.isActive ? "#DCFCE7" : "#F3EDE5", color: account.isActive ? "#166534" : "#9C8278", fontSize: 11, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: account.isActive ? "#22C55E" : "#B9A398" }} />{account.isActive ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div></div>}
  </main>;
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [additions, setAdditions] = useState<ProductAddition[]>([]);

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
    setAuthUser(null);
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

  function handlePageChange(nextPage: Page) {
    setPage(nextPage);
    if (nextPage === "inventory" || nextPage === "products" || nextPage === "dashboard") {
      void refreshInventory();
      void refreshProducts();
    }
    if (nextPage === "products" || nextPage === "additions") void refreshAdditions();
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
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshInventory();
        void refreshProducts();
        void refreshAdditions();
      }
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshInventory();
      void refreshProducts();
      void refreshAdditions();
    }, 5_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const collapseOnPhone = window.setTimeout(() => {
      if (window.innerWidth <= 640) setSidebarCollapsed(true);
    }, 0);
    return () => window.clearTimeout(collapseOnPhone);
  }, []);

  async function handleInventoryAdd(item: InventoryItem) {
    setInventory((prev) => [...prev, item].sort((a, b) => a.ingredient_category.localeCompare(b.ingredient_category) || a.item_name.localeCompare(b.item_name)));
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
    setInventory((prev) => prev.filter((item) => item.inventory_id !== id));
    setProducts((prev) => prev.map((product) => ({
      ...product,
      ingredients: product.ingredients.filter((ingredient) => ingredient.inventoryId !== id),
    })));
  }

  async function handleProductAdd(product: Product) {
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: product.name,
        product_category: product.category,
        price: product.price,
        image_url: product.imageUrl,
        image_data: product.imageData,
        addition_ids: product.additions.map((addition) => addition.id),
        variants: product.variants.map((variant) => ({ id: variant.id, size: variant.size, price: variant.price, ingredients: variant.ingredients.map((ingredient) => ({ inventory_id: ingredient.inventoryId, required_quantity: ingredient.qty })) })),
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
        product_category: product.category,
        price: product.price,
        image_url: product.imageUrl,
        image_data: product.imageData,
        addition_ids: product.additions.map((addition) => addition.id),
        variants: product.variants.map((variant) => ({ id: variant.id, size: variant.size, price: variant.price, ingredients: variant.ingredients.map((ingredient) => ({ inventory_id: ingredient.inventoryId, required_quantity: ingredient.qty })) })),
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

  const pageTitles: Record<Page, string> = { dashboard: "Dashboard", inventory: "Inventory Management", additions: "Additions Management", products: "Product Management", finance: "Finance", accounts: "Accounts & Employees" };

  if (authLoading) return <div className="flex items-center justify-center min-h-screen" style={{ background: "#F8F9FA", color: "#9C8278" }}>Loading admin portal...</div>;
  if (!authUser) return <AdminLogin onLoggedIn={setAuthUser} />;

  return <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
    <Sidebar current={page} collapsed={sidebarCollapsed} onChange={handlePageChange} onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar page={page} user={authUser} onLogout={handleLogout} />
      <div className="app-page-heading px-8 pt-7 pb-2" style={{ background: "#F8F9FA", flexShrink: 0 }}><h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26, color: "#3D2B1F", letterSpacing: "-0.02em", margin: 0 }}>{pageTitles[page]}</h1></div>
      <div className="app-content" style={{ flex: 1, overflowY: "auto", background: "#F8F9FA" }}>
        {page === "dashboard" && <Dashboard inventory={inventory} />}
        {page === "inventory" && <Inventory items={inventory} onAdd={handleInventoryAdd} onUpdate={handleInventoryUpdate} onDelete={handleInventoryDelete} />}
        {page === "additions" && <AdditionsManagement inventory={inventory} />}
        {page === "products" && <ProductManagement products={products} inventory={inventory} additions={additions} onAdd={handleProductAdd} onEdit={handleProductEdit} onDelete={handleProductDelete} />}
        {page === "finance" && <Finance />}
        {page === "accounts" && <Accounts />}
      </div>
    </div>
  </div>;
}