"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Page = "pos" | "queue" | "reversals" | "accounts";
type Session = { adminId: number; fullName: string; email: string; role: string; canVoidOrders?: boolean; canRefundOrders?: boolean };
type IconProps = { size?: number };
type QueueOrderDetail = { product_name: string; size_label: string | null; temperature?: "hot" | "cold" | "both" | null; quantity: number; additions: { name: string; quantity: number }[] };
type QueueOrder = { order_id: number; queue_number: number; items: string; created_at: string; order_source: string; order_details: QueueOrderDetail[]; status?: string; queue_status?: string; total_amount?: number; payment_method?: string | null; reversal_type?: string | null; reversed_at?: string | null };

function IconCoffee({ size = 20 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>;
}

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
  { id: "accounts", label: "Account Management", Icon: IconUsers },
];

// The last queue number this terminal punched, kept across reloads for the rest of the shift.
type LastOrder = { queueNumber: number; punchedAt: number; shiftId: number };
type QueueCounts = { waiting: number; ready: number };
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

function Sidebar({ current, collapsed, lastOrder, queueCounts, now, shiftOpen, canManageReversals, onChange, onToggle }: { current: Page; collapsed: boolean; lastOrder: LastOrder | null; queueCounts: QueueCounts | null; now: number; shiftOpen: boolean; canManageReversals: boolean; onChange: (page: Page) => void; onToggle: () => void }) {
  const visibleNavItems = navItems.filter((item) => item.id !== "reversals" || canManageReversals);
  const waiting = queueCounts?.waiting ?? 0;
  return <aside className={`app-sidebar ${collapsed ? "is-collapsed" : "is-expanded"} flex flex-col`} style={{ background: "#3D2B1F", minHeight: "100vh", width: collapsed ? 52 : 240, flexShrink: 0 }}>
    <div className="flex items-center gap-3 px-6 py-7 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: "#D97706" }}><IconCoffee size={20} /></div>
      <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 14, color: "#FDF9F5", lineHeight: 1.2 }}>Brew Houze</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>CAFE</p></div>
    </div>
    <div className="sidebar-toggle-row"><button onClick={onToggle} title={collapsed ? "Expand sidebar" : "Minimize sidebar"} aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #6B4C3B", borderRadius: 6, background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", transform: collapsed ? "rotate(180deg)" : "none" }}><IconChevron size={14} /></button></div>
    <nav className="flex flex-col gap-1 px-3 pt-5 flex-1">
      {visibleNavItems.map(({ id, label, Icon }) => {
        const active = current === id;
        const badge = id === "queue" && waiting > 0 ? waiting : 0;
        return <button key={id} onClick={() => onChange(id)} title={collapsed ? label : undefined} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left w-full" style={{ position: "relative", background: active ? "#D97706" : "transparent", color: active ? "#FDF9F5" : "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: active ? 600 : 400, cursor: "pointer", border: "none" }}>
          <Icon size={17} /><span>{label}</span>
          {badge > 0 && <b className="nav-badge" aria-label={`${badge} waiting`} style={{ marginLeft: "auto", minWidth: 22, height: 20, padding: "0 6px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: active ? "#FDF9F5" : "#D97706", color: active ? "#B45309" : "#FFFFFF", fontSize: 11, fontWeight: 800 }}>{badge > 99 ? "99+" : badge}</b>}
        </button>;
      })}
    </nav>
    <button type="button" onClick={() => onChange("queue")} title="Open the queue" className="mx-3 mb-5 rounded-xl" style={{ background: "rgba(217,119,6,0.14)", border: "1px solid rgba(217,119,6,0.35)", padding: collapsed ? "10px 2px" : "13px 14px", textAlign: collapsed ? "center" : "left", cursor: "pointer", color: "#FDF9F5" }}>
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
    </button>
    <div className="px-6 py-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>CASHIER PORTAL</p></div>
  </aside>;
}

function TopBar({ page, user, shift, onOpenShift, onCloseShift, onAccount, onRequestLogout }: { page: Page; user: Session; shift: CurrentShift | null | undefined; onOpenShift: () => void; onCloseShift: () => void; onAccount: () => void; onRequestLogout: () => void }) {
  const title = page === "pos" ? "Point of Sale" : page === "queue" ? "Queue" : page === "reversals" ? "Void & Refund" : "Account Management";
  return <header className="app-topbar flex items-center justify-between px-8 py-4 border-b" style={{ background: "#FDF9F5", borderColor: "#E8DDD5", flexShrink: 0 }}>
    <div className="flex items-center gap-4" style={{ color: "#9C8278" }}>
      <span className="flex items-center gap-2"><IconChevron size={14} /><span style={{ fontSize: 13 }}>{title}</span></span>
      <ShiftChip shift={shift} onOpenShift={onOpenShift} onCloseShift={onCloseShift} />
    </div>
    <div className="flex items-center gap-5">
      <div className="text-right"><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15, color: "#3D2B1F" }}>Brew Houze Cafe</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#D97706", letterSpacing: "0.06em" }}>CASHIER PORTAL</p></div>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#F3EDE5", border: "1px solid #E8DDD5" }}>
        <button type="button" onClick={onAccount} title="Open Account Management" aria-label="Open Account Management" className="flex items-center gap-3" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
          <div className="flex items-center justify-center rounded-full text-white font-bold text-sm" style={{ width: 34, height: 34, background: "#3D2B1F" }}>{user.fullName.charAt(0).toUpperCase()}</div>
          <div><p style={{ fontWeight: 700, fontSize: 13, color: "#3D2B1F", lineHeight: 1.3, margin: 0 }}>{user.fullName}</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", textTransform: "capitalize", margin: "2px 0 0" }}>{user.role}</p></div>
          <span aria-hidden="true" style={{ color: "#9C8278", fontSize: 16 }}>›</span>
        </button>
        <button onClick={onRequestLogout} title="Sign out" style={{ border: "none", borderLeft: "1px solid #D8C8BE", background: "transparent", color: "#9C8278", cursor: "pointer", fontSize: 12, padding: "8px 0 8px 11px" }}>Sign out</button>
      </div>
    </div>
  </header>;
}

const ADDONS_TAB = "__addons__";

function POSPage({ onQueueAssigned }: { onQueueAssigned: (queueNumber: number, shiftId: number) => void }) {
  type Ingredient = { inventory_id: number; required_quantity: string | number; available_quantity: string | number };
  type Addition = { addition_id: number; addition_name: string; quantity: string | number; price: string | number; unit_of_measure: string; inventory_id: number; available_quantity: string | number };
  type Variant = { product_variant_id: number; price: string | number; size_label: string | null; temperature?: "hot" | "cold" | "both" | null; available?: boolean; max_quantity?: number; ingredients: Ingredient[] };
  type Product = { product_id: number; product_name: string; product_description?: string; product_category: string | null; product_type?: "recipe" | "stock"; image_url?: string | null; variants: Variant[] };
  type ProductsResponse = { data?: Product[]; additions?: Addition[] };
  // "count" is how many of this add-on go on EACH cup of the line (Double Shot x2 per cup).
  type CartAddition = Addition & { count: number };
  type CartItem = { key: string; productId: number; variantId: number | null; name: string; size?: string | null; temperature?: "hot" | "cold" | "both" | null; isRecipe: boolean; qty: number; price: number; ingredients: Ingredient[]; additions: CartAddition[] };
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [additions, setAdditions] = useState<Addition[]>([]);
  // The cart line that add-ons tapped in the POS list attach to.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Category tab shown in the product area; ADDONS_TAB shows the add-on buttons.
  const [activeCategory, setActiveCategory] = useState("");
  const [selectionProduct, setSelectionProduct] = useState<Product | null>(null);
  const cartLineId = useRef(0);

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

  // Direct-sale items with a single option (a canned drink) go straight into the cart;
  // everything else opens the size/temperature picker.
  function selectProduct(product: Product) {
    const onlyVariant = product.product_type === "stock" && product.variants.length === 1 ? product.variants[0] : null;
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
    return `${item.name}${item.size ? ` — ${item.size}` : ""}${item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}`;
  }

  async function checkout() {
    if (cart.length === 0 || checkingOut) return;
    const subtotalValue = cart.reduce((sum, item) => sum + getLineTotal(item), 0);
    const parsedReceivedAmount = Number.parseFloat(receivedAmount);
    if (paymentMethod === "cash" && subtotalValue > 0) {
      if (!Number.isFinite(parsedReceivedAmount) || parsedReceivedAmount < subtotalValue) {
        setCheckoutError("Received payment must be at least the subtotal.");
        return;
      }
    }
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.filter((item) => item.variantId !== null).map((item) => ({
            product_variant_id: item.variantId,
            quantity: item.qty,
            // Repeated ids mean repeated servings on each cup of the line.
            addition_ids: item.additions.flatMap((addition) => Array.from({ length: addition.count }, () => addition.addition_id)),
          })),
          payment_method: paymentMethod,
          received_amount: paymentMethod === "cash" && Number.isFinite(parsedReceivedAmount) ? parsedReceivedAmount : 0,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to complete checkout.");
      setCart([]);
      setReceivedAmount("");
      const queueNumber = Number(payload.data.queueNumber);
      onQueueAssigned(queueNumber, Number(payload.data.shiftId));
      const refresh = await fetch("/api/products", { cache: "no-store" });
      if (refresh.ok) {
        const refreshedPayload = await refresh.json() as ProductsResponse;
        setProducts(refreshedPayload.data ?? []);
        setAdditions(refreshedPayload.additions ?? []);
      }
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
  const subtotal = cart.reduce((sum, item) => sum + getLineTotal(item), 0);
  const parsedReceivedAmount = Number.parseFloat(receivedAmount);
  const changeDue = Number.isFinite(parsedReceivedAmount) ? Math.max(0, parsedReceivedAmount - subtotal) : 0;
  const hasValidPayment = paymentMethod === "online" || subtotal === 0 || (Number.isFinite(parsedReceivedAmount) && parsedReceivedAmount >= subtotal);

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
            {visibleProducts.map((product) => (
          <button key={product.product_id} type="button" className="pos-card rounded-2xl" onClick={() => selectProduct(product)} style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 245, padding: 0, textAlign: "left", cursor: "pointer", color: "#3D2B1F" }}>
            <div className="pos-card-image" style={{ height: 112, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {product.image_url ? <Image src={product.image_url} alt={product.product_name} width={180} height={98} unoptimized style={{ maxHeight: 98, maxWidth: "82%", width: "auto", objectFit: "contain", position: "relative", zIndex: 1 }} /> : <div style={{ color: "#B9A398", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 15 }}>{product.product_name}</div>}
            </div>
            <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, color: "#3D2B1F", lineHeight: 1.15 }}>{product.product_name}</div>
                  {product.product_description && <div style={{ marginTop: 4, color: "#9C8278", fontSize: 11, lineHeight: 1.35 }}>{product.product_description}</div>}
                  <span style={{ display: "inline-block", marginTop: 5, padding: "3px 7px", borderRadius: 6, background: "#F3EDE5", color: "#6B4C3B", fontSize: 9, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.03em" }}>{product.product_category ?? "Menu"}</span>
                </div>
              </div>
              <div style={{ marginTop: "auto", padding: "8px 10px", borderRadius: 8, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11, fontWeight: 700, textAlign: "center" }}>
                {product.product_type === "stock" ? (product.variants.length > 1 ? "Tap to choose an option" : "Tap to add to cart") : product.variants?.length ? "Tap to choose size and temperature" : "Tap to add to cart"}
              </div>
            </div>
          </button>
            ))}
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

    <aside className="pos-cart" style={{ width: 360, flexShrink: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rounded-2xl" style={{ flex: 1, minHeight: 0, background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif" }}>Cart</h3>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }}>
          {cart.length === 0 && <div style={{ color: "#9C8278" }}>Cart is empty</div>}
          {cart.map((item) => {
            const isSelected = selectedLine?.key === item.key;
            return (
            <div key={item.key} onClick={item.isRecipe ? () => setSelectedKey(item.key) : undefined} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 10, border: isSelected ? "2px solid #D97706" : "1px solid #F0E8E2", background: isSelected ? "#FFF7ED" : "transparent", cursor: item.isRecipe ? "pointer" : "default" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{getLineLabel(item)}</div>
                <div style={{ fontSize: 12, color: "#9C8278" }}>₱{(item.price).toFixed(2)} • x{item.qty}</div>
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
                <button onClick={() => updateQty(item.key, +1)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E8DDD5", background: "#fff" }}>+</button>
              </div>
            </div>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid #E8DDD5", paddingTop: 8, flexShrink: 0 }}>
        {checkoutError && <p style={{ color: "#B91C1C", fontSize: 12, margin: "0 0 8px" }}>{checkoutError}</p>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ color: "#9C8278" }}>Subtotal</div><div>₱{subtotal.toFixed(2)}</div></div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ color: "#6B4C3B", fontSize: 12, fontWeight: 600 }}>Payment method</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => { setPaymentMethod("cash"); if (checkoutError) setCheckoutError(""); }} style={{ flex: 1, border: paymentMethod === "cash" ? "1px solid #3D2B1F" : "1px solid #E8DDD5", background: paymentMethod === "cash" ? "#3D2B1F" : "#FFFDF9", color: paymentMethod === "cash" ? "#FDF9F5" : "#6B4C3B", padding: "9px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cash Payment</button>
                <button type="button" onClick={() => { setPaymentMethod("online"); if (checkoutError) setCheckoutError(""); }} style={{ flex: 1, border: paymentMethod === "online" ? "1px solid #3D2B1F" : "1px solid #E8DDD5", background: paymentMethod === "online" ? "#3D2B1F" : "#FFFDF9", color: paymentMethod === "online" ? "#FDF9F5" : "#6B4C3B", padding: "9px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Online Payment</button>
              </div>
            </div>
            {paymentMethod === "cash" ? <>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "#6B4C3B", fontSize: 12, fontWeight: 600 }}>
                <span>Received payment</span>
                <input type="number" min="0" step="0.01" value={receivedAmount} onChange={(event) => { setReceivedAmount(event.target.value); if (checkoutError) setCheckoutError(""); }} placeholder="0.00" style={{ border: "1px solid #E8DDD5", borderRadius: 8, background: "#FFFDF9", color: "#3D2B1F", padding: "10px 11px", fontSize: 14 }} />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6B4C3B" }}>
                <span>Change</span>
                <strong style={{ color: changeDue > 0 ? "#0F766E" : "#3D2B1F" }}>₱{changeDue.toFixed(2)}</strong>
              </div>
            </> : <p style={{ margin: 0, color: "#9C8278", fontSize: 11, lineHeight: 1.5 }}>Customer will pay via e-wallet/online. This order proceeds directly to checkout without received-amount entry.</p>}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button disabled={checkingOut || cart.length === 0 || !hasValidPayment} onClick={() => void checkout()} style={{ flex: 1, border: "none", background: checkingOut || cart.length === 0 || !hasValidPayment ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", padding: "10px", borderRadius: 10, cursor: checkingOut || cart.length === 0 || !hasValidPayment ? "not-allowed" : "pointer" }}>{checkingOut ? "Processing..." : "Checkout"}</button>
            <button onClick={() => { setCart([]); setReceivedAmount(""); setCheckoutError(""); }} style={{ border: "1px solid #E8DDD5", background: "#fff", padding: "10px", borderRadius: 10 }}>Clear</button>
          </div>
        </div>
      </div>
    </aside>

    {selectionProduct && (
      <div role="dialog" aria-modal="true" aria-label={`Choose ${selectionProduct.product_name}`} onClick={() => setSelectionProduct(null)} style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(61,43,31,0.42)" }}>
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
      </div>
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

function QueuePage() {
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [readyQueue, setReadyQueue] = useState<QueueOrder[]>([]);
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
    if (servedOrder) setReadyQueue((current) => [servedOrder, ...current.filter((order) => order.order_id !== orderId)]);
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
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                  <span style={{ padding: "3px 9px", borderRadius: 999, background: wait.background, color: wait.color, border: `1px solid ${wait.border}`, fontSize: 12, fontWeight: 800 }}>{wait.label}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 999, background: isOnline ? "#CCFBF1" : "#F3EDE5", color: isOnline ? "#0F766E" : "#6B4C3B", fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "JetBrains Mono, monospace" }}>{isOnline ? "Online" : "Counter"}</span>
                </div>
              </header>
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
                <button type="button" disabled={busy} onClick={() => void runOrderAction(order.order_id, serveOrder, "Unable to serve order.")} style={{ width: "100%", height: 48, border: "none", borderRadius: 12, background: busy ? "#C9B8AF" : "#D97706", color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", boxShadow: busy ? "none" : "0 6px 14px rgba(217,119,6,0.28)" }}>{busy ? "Updating…" : "Mark as ready"}</button>
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
            <span style={{ flex: 1, minWidth: 0, color: "#7C2D12", fontSize: 11.5, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{order.items}</span>
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
  const time = date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} · ${time}`;
}

function describeOrderLine(detail: QueueOrderDetail): string {
  const size = detail.size_label && detail.size_label.toLowerCase() !== "regular" ? ` ${detail.size_label}` : "";
  const temperature = detail.temperature === "hot" ? " · Hot" : detail.temperature === "cold" ? " · Iced" : "";
  return `${detail.quantity}× ${detail.product_name}${size}${temperature}`;
}

function ReversalsPage({ user }: { user: Session }) {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [pendingAction, setPendingAction] = useState<{ order: QueueOrder; action: "void" | "refund" } | null>(null);
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
    setSubmitting(true);
    try {
      const response = await fetch("/api/order-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.order_id, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Unable to ${action} order.`);
      setPendingAction(null);
      setError("");
      setNotice(`Order #${order.queue_number} ${action === "void" ? "voided" : "refunded"}. Its ingredients and add-ons were returned to inventory.`);
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

  return <main className="p-6" style={{ maxWidth: 1100 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 26, color: "#3D2B1F", margin: 0 }}>Void & Refund</h1>
        <p style={{ color: "#9C8278", fontSize: 12.5, margin: "4px 0 0" }}>The 30 most recent orders. Reversing an order returns its ingredients and add-ons to inventory.</p>
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

    {loading && orders.length === 0 ? <p style={{ color: "#9C8278" }}>Loading recent orders…</p>
      : visibleOrders.length === 0 ? <div style={{ padding: "40px 0", textAlign: "center", border: "2px dashed #E8DDD5", borderRadius: 16, color: "#9C8278", fontSize: 13 }}>{orders.length === 0 ? "No recent orders." : "No orders match this search or filter."}</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: loading ? 0.6 : 1 }}>
        {visibleOrders.map((order) => {
          const status = reversalStatusStyles[order.status ?? "completed"] ?? reversalStatusStyles.completed;
          const reversible = order.status === "completed";
          const isOnlineOrder = order.order_source === "online";
          return <article key={order.order_id} style={{ display: "flex", alignItems: "stretch", gap: 14, padding: "14px 16px", background: reversible ? "#FDF9F5" : "#FAF7F4", border: "1px solid #E8DDD5", borderLeft: `5px solid ${status.color}`, borderRadius: 14 }}>
            <div style={{ minWidth: 76, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1, color: reversible ? "#3D2B1F" : "#9C8278" }}>#{order.queue_number}</strong>
              <span style={{ marginTop: 5, fontSize: 11.5, color: "#9C8278" }}>{formatOrderTime(order.created_at)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: status.background, color: status.color, border: `1px solid ${status.border}`, fontSize: 11, fontWeight: 800 }}>{status.label}{!reversible && order.reversed_at ? ` · ${formatOrderTime(order.reversed_at)}` : ""}</span>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: isOnlineOrder ? "#CCFBF1" : "#F3EDE5", color: isOnlineOrder ? "#0F766E" : "#6B4C3B", fontSize: 11, fontWeight: 700 }}>{isOnlineOrder ? "Mobile order" : "Counter"}</span>
                <span style={{ padding: "2px 9px", borderRadius: 999, background: "#F3EDE5", color: "#6B4C3B", fontSize: 11, fontWeight: 700 }}>{order.payment_method === "online" ? "Online payment" : "Cash"}</span>
              </div>
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
                {user.canVoidOrders && <button type="button" onClick={() => { setError(""); setPendingAction({ order, action: "void" }); }} style={{ border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#B91C1C", borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Void</button>}
                {user.canRefundOrders && <button type="button" onClick={() => { setError(""); setPendingAction({ order, action: "refund" }); }} style={{ border: "1px solid #E9D5FF", background: "#FAF5FF", color: "#7E22CE", borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>Refund</button>}
              </div>}
            </div>
          </article>;
        })}
      </div>}

    {pendingAction && <div role="dialog" aria-modal="true" aria-labelledby="reverse-order-title" onClick={() => { if (!submitting) setPendingAction(null); }} style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.4)" }}>
      <section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 480px)", maxHeight: "88vh", overflowY: "auto", background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 18, boxShadow: "0 18px 50px rgba(61,43,31,.25)" }}>
        <div style={{ padding: "18px 22px", background: pendingAction.action === "void" ? "#FEF2F2" : "#FAF5FF", borderBottom: `1px solid ${pendingAction.action === "void" ? "#FECACA" : "#E9D5FF"}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p style={{ margin: 0, color: pendingAction.action === "void" ? "#B91C1C" : "#7E22CE", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>{pendingAction.action === "void" ? "Void order" : "Refund order"}</p>
              <h2 id="reverse-order-title" style={{ margin: "5px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800 }}>Order #{pendingAction.order.queue_number}</h2>
              <p style={{ margin: "3px 0 0", color: "#9C8278", fontSize: 11.5 }}>{formatOrderTime(pendingAction.order.created_at)} · Ref {pendingAction.order.order_id}</p>
            </div>
            <button type="button" onClick={() => setPendingAction(null)} disabled={submitting} aria-label="Close reversal confirmation" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 26, lineHeight: 1, cursor: submitting ? "default" : "pointer" }}>×</button>
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
          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: "#3D2B1F", color: "#FDF9F5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>{pendingIsOnline ? "Reverse the online payment of" : "Return in cash to the customer"}</span>
            <strong style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800, whiteSpace: "nowrap" }}>₱{pendingTotal.toFixed(2)}</strong>
          </div>
          <p style={{ margin: "12px 0 0", color: "#9C8278", fontSize: 11.5, lineHeight: 1.5 }}>Stock is returned to inventory, the order leaves the queue, and it no longer counts as a sale. This cannot be undone.</p>
          {error && <p style={{ margin: "10px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
          <div className="flex justify-end gap-2" style={{ marginTop: 18 }}>
            <button type="button" onClick={() => setPendingAction(null)} disabled={submitting} style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 16px", background: "#F3EDE5", color: "#6B4C3B", cursor: submitting ? "default" : "pointer", fontWeight: 700 }}>Keep order</button>
            <button type="button" onClick={() => void reverseOrder(pendingAction.order, pendingAction.action)} disabled={submitting} style={{ border: "none", borderRadius: 10, padding: "11px 18px", background: submitting ? "#C9B8AF" : pendingAction.action === "void" ? "#B91C1C" : "#7E22CE", color: "#fff", cursor: submitting ? "default" : "pointer", fontWeight: 800 }}>{submitting ? "Processing…" : pendingAction.action === "void" ? "Void order" : "Refund order"}</button>
          </div>
        </div>
      </section>
    </div>}
  </main>;
}

function AccountPage({ user, onSignOut }: { user: Session; onSignOut: () => void }) {
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadAccount = async () => {
      const response = await fetch("/api/auth/account", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        setCreatedAt(payload.data?.createdAt ?? null);
      }
    };
    void loadAccount();
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
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to change password.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="p-8" style={{ maxWidth: 1280 }}>
    <h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 28, color: "#3D2B1F", margin: 0 }}>Account Management</h1>
    <div className="flex items-start justify-between gap-4"><div><p style={{ marginTop: 5, color: "#9C8278", fontSize: 13 }}>View your cashier access and manage your account password.</p></div><button type="button" onClick={onSignOut} style={{ border: "1px solid #FECACA", borderRadius: 9, padding: "9px 13px", background: "#FEF2F2", color: "#B91C1C", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Sign out</button></div>
    <div className="grid gap-5 mt-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <section className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
        <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>My account</p>
        <h2 style={{ margin: "7px 0 18px", color: "#3D2B1F", fontSize: 22 }}>{user.fullName}</h2>
        <div style={{ display: "grid", gap: 12, color: "#6B4C3B", fontSize: 13 }}>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Email</span>{user.email}</div>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Role</span><span style={{ textTransform: "capitalize" }}>{user.role}</span></div>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Permissions</span>{user.canVoidOrders || user.canRefundOrders ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>{user.canVoidOrders && <span style={{ padding: "4px 8px", borderRadius: 20, background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700 }}>Can void orders</span>}{user.canRefundOrders && <span style={{ padding: "4px 8px", borderRadius: 20, background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 700 }}>Can refund orders</span>}</div> : <span style={{ color: "#9C8278" }}>No reversal permissions</span>}</div>
          <div><span style={{ display: "block", color: "#9C8278", fontSize: 11 }}>Account created</span><span style={{ color: "#9C8278" }}>{createdAt ? new Date(createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "Not available in the database"}</span></div>
        </div>
      </section>
      <section className="rounded-2xl p-6" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5" }}>
        <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Security</p>
        <h2 style={{ margin: "7px 0 18px", color: "#3D2B1F", fontSize: 22 }}>Change password</h2>
        {message && <p style={{ color: "#166534", fontSize: 13 }}>{message}</p>}{error && <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}
        <form onSubmit={changePassword} className="flex flex-col gap-3"><label className="flex flex-col gap-1"><span style={{ color: "#9C8278", fontSize: 11 }}>Current password</span><input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 11px", background: "#FFFDF9", color: "#3D2B1F" }} /></label><label className="flex flex-col gap-1"><span style={{ color: "#9C8278", fontSize: 11 }}>New password</span><input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 11px", background: "#FFFDF9", color: "#3D2B1F" }} /></label><label className="flex flex-col gap-1"><span style={{ color: "#9C8278", fontSize: 11 }}>Confirm new password</span><input type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 11px", background: "#FFFDF9", color: "#3D2B1F" }} /></label><button type="submit" disabled={saving} style={{ marginTop: 6, border: "none", borderRadius: 9, padding: "11px", background: saving ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", cursor: saving ? "default" : "pointer", fontWeight: 700 }}>{saving ? "Saving..." : "Change password"}</button></form>
      </section>
    </div>
  </main>;
}

function SignOutDialog({ onCancel, onConfirm, signingOut }: { onCancel: () => void; onConfirm: () => void; signingOut: boolean }) {
  return <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(61,43,31,0.4)", zIndex: 100 }} role="dialog" aria-modal="true" aria-labelledby="sign-out-title">
    <div className="rounded-2xl p-6" style={{ width: "min(100% - 40px, 380px)", background: "#FDF9F5", boxShadow: "0 20px 60px rgba(61,43,31,0.25)" }}>
      <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Session</p>
      <h2 id="sign-out-title" style={{ margin: "8px 0 0", color: "#3D2B1F", fontSize: 21 }}>Sign out?</h2>
      <p style={{ margin: "9px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.5 }}>You will need to sign in again to access the cashier portal.</p>
      <div className="flex justify-end gap-2" style={{ marginTop: 22 }}><button type="button" onClick={onCancel} disabled={signingOut} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "9px 14px", background: "#FDF9F5", color: "#6B4C3B", cursor: signingOut ? "default" : "pointer" }}>Cancel</button><button type="button" onClick={onConfirm} disabled={signingOut} style={{ border: "none", borderRadius: 9, padding: "9px 14px", background: signingOut ? "#C9B8AF" : "#B91C1C", color: "#FFF", cursor: signingOut ? "default" : "pointer", fontWeight: 700 }}>{signingOut ? "Signing out..." : "Sign out"}</button></div>
    </div>
  </div>;
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
            <p style={{ margin: "3px 0 0", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#F59E0B", letterSpacing: "0.12em" }}>CASHIER PORTAL</p>
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
        <p className="login-brand-foot" style={{ margin: 0, color: "rgba(253,249,245,0.4)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.08em" }}>BREW HOUZE CAFE · CASHIER PORTAL</p>
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
      <h1 style={authTitle}>Sign in to the cashier portal</h1>
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
  return new Date(value).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function ShiftChip({ shift, onOpenShift, onCloseShift }: { shift: CurrentShift | null | undefined; onOpenShift: () => void; onCloseShift: () => void }) {
  if (shift === undefined) return null;
  const chipButton: React.CSSProperties = { border: "none", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
  if (shift === null) {
    return <div className="flex items-center gap-2 rounded-xl" style={{ padding: "5px 6px 5px 12px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626" }} />
      No open shift
      <button type="button" onClick={onOpenShift} style={{ ...chipButton, background: "#D97706", color: "#FFFFFF" }}>Open shift</button>
    </div>;
  }
  const longShift = shift.hoursOpen >= LONG_SHIFT_HOURS;
  return <div className="flex items-center gap-2 rounded-xl" title={longShift ? "This shift has been open unusually long. Close it at the end of the business day." : undefined} style={{ padding: "5px 6px 5px 12px", background: longShift ? "#FEF3C7" : "#F0FDF4", border: `1px solid ${longShift ? "#FCD34D" : "#BBF7D0"}`, color: longShift ? "#B45309" : "#15803D", fontSize: 12.5, fontWeight: 700 }}>
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: longShift ? "#F59E0B" : "#22C55E" }} />
    <span>Shift open since {formatClock(shift.openedAt)} · {formatShiftDuration(shift.hoursOpen)}{longShift ? " · close it?" : ""}</span>
    <button type="button" onClick={onCloseShift} style={{ ...chipButton, background: "#3D2B1F", color: "#FDF9F5" }}>Close shift</button>
  </div>;
}

function OpenShiftPanel({ onOpened }: { onOpened: (shift: CurrentShift) => void }) {
  const [startingCash, setStartingCash] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening) return;
    const amount = Number(startingCash);
    if (startingCash.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      setError("Enter the starting cash in the drawer (0 if the drawer is empty).");
      return;
    }
    setOpening(true);
    setError("");
    try {
      const response = await fetch("/api/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", starting_cash: amount }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to open the shift.");
      onOpened(payload.data as CurrentShift);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open the shift.");
    } finally {
      setOpening(false);
    }
  }

  return <main style={{ height: "100%", minHeight: 420, display: "grid", placeItems: "center", padding: 24 }}>
    <form onSubmit={openShift} className="rounded-2xl" style={{ width: "min(100%, 440px)", background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.12)", padding: 28 }}>
      <p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Start of business day</p>
      <h2 style={{ margin: "6px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 26, fontWeight: 800, color: "#3D2B1F" }}>Open a shift</h2>
      <p style={{ margin: "8px 0 0", color: "#6B4C3B", fontSize: 13, lineHeight: 1.55 }}>Sales, queue numbers, employee attendance and stock changes are recorded under this shift until it is closed, even past midnight.</p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 20, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
        Starting cash in the drawer
        <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFFFF", padding: "0 14px" }}>
          <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, color: "#9C8278" }}>₱</span>
          <input autoFocus type="number" min={0} step="0.01" inputMode="decimal" value={startingCash} onChange={(event) => setStartingCash(event.target.value)} placeholder="0.00" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "13px 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800, color: "#3D2B1F" }} />
        </span>
      </label>
      {error && <p style={{ margin: "10px 0 0", color: "#B91C1C", fontSize: 12.5 }}>{error}</p>}
      <button type="submit" disabled={opening} style={{ width: "100%", height: 50, marginTop: 18, border: "none", borderRadius: 12, background: opening ? "#C9B8AF" : "#D97706", color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 16, cursor: opening ? "default" : "pointer", boxShadow: opening ? "none" : "0 8px 18px rgba(217,119,6,0.28)" }}>{opening ? "Opening…" : "Open shift"}</button>
    </form>
  </main>;
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

function CloseShiftDialog({ shiftId, onCancel, onClosed }: { shiftId: number; onCancel: () => void; onClosed: () => void }) {
  const [summary, setSummary] = useState<CurrentShift | null>(null);
  const [closedSummary, setClosedSummary] = useState<CurrentShift | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
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
    setClosing(true);
    setError("");
    try {
      const response = await fetch("/api/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", shift_id: shiftId, counted_cash: amount, notes }) });
      const payload = await response.json();
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

  return <div role="dialog" aria-modal="true" aria-labelledby="close-shift-title" onClick={() => { if (!closing && !closedSummary) onCancel(); }} style={{ position: "fixed", inset: 0, zIndex: 70, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.45)" }}>
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

            <p style={sectionLabel}>Cash drawer</p>
            <ShiftSummaryRow label="Starting cash" value={formatPeso(summary.startingCash)} />
            <ShiftSummaryRow label="+ Cash sales" value={formatPeso(summary.cashSales)} />
            <ShiftSummaryRow label="− Cash given back (voids/refunds)" value={formatPeso(summary.cashReversed)} />
            <div style={{ borderTop: "1px solid #E8DDD5" }}><ShiftSummaryRow label="Expected in drawer" value={formatPeso(summary.expectedCash)} strong /></div>

            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
              Counted cash in the drawer
              <span style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #E8DDD5", borderRadius: 12, background: "#FFFFFF", padding: "0 14px" }}>
                <span style={{ fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, fontWeight: 800, color: "#9C8278" }}>₱</span>
                <input autoFocus type="number" min={0} step="0.01" inputMode="decimal" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="0.00" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", padding: "11px 0", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 20, fontWeight: 800, color: "#3D2B1F" }} />
              </span>
            </label>
            {liveDifference && <p style={{ margin: "8px 0 0", color: liveDifference.tone, fontSize: 13, fontWeight: 800 }}>{liveDifference.label}</p>}
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, color: "#6B4C3B", fontSize: 12, fontWeight: 700 }}>
              Notes <span style={{ fontWeight: 400, color: "#9C8278" }}>(optional, e.g. why the drawer is short)</span>
              <textarea value={notes} maxLength={500} rows={2} onChange={(event) => setNotes(event.target.value)} style={{ border: "1px solid #E8DDD5", borderRadius: 10, background: "#FFFFFF", padding: "9px 11px", fontSize: 13, color: "#3D2B1F", outline: "none", resize: "vertical" }} />
            </label>

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
  </div>;
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
  const [now, setNow] = useState(() => Date.now());
  // undefined while loading, null when no shift is open.
  const [shift, setShift] = useState<CurrentShift | null | undefined>(undefined);
  const [closingShift, setClosingShift] = useState(false);

  // Restore the last punched number after mount (localStorage is browser-only).
  useEffect(() => {
    const timeout = window.setTimeout(() => setLastOrder(readStoredLastOrder()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const refreshQueueCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/queue?signatureOnly=1", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { signature?: { waiting_count?: number; ready_count?: number } };
      setQueueCounts({ waiting: Number(payload.signature?.waiting_count ?? 0), ready: Number(payload.signature?.ready_count ?? 0) });
    } catch (error) {
      console.error("Sidebar: failed to load queue counts", error);
    }
  }, []);

  const refreshShift = useCallback(async () => {
    try {
      const response = await fetch("/api/shift", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: CurrentShift | null };
      setShift(payload.data ?? null);
    } catch (error) {
      console.error("Failed to load the current shift", error);
    }
  }, []);

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
    return () => { window.clearTimeout(timeout); window.clearInterval(intervalId); };
  }, [user, refreshQueueCounts, refreshShift]);

  function recordLastOrder(queueNumber: number, shiftId: number) {
    const next = { queueNumber, punchedAt: Date.now(), shiftId };
    setLastOrder(next);
    setNow(next.punchedAt);
    try { window.localStorage.setItem(LAST_ORDER_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable: keep it in memory only */ }
    void refreshQueueCounts();
    void refreshShift();
  }

  function handleShiftOpened(opened: CurrentShift) {
    setShift(opened);
    setPage("pos");
    void refreshQueueCounts();
  }

  function handleShiftClosed() {
    setClosingShift(false);
    setShift(null);
    setPage("pos");
    void refreshQueueCounts();
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
    setPage("pos");
    setLastOrder(null);
    try { window.localStorage.removeItem(LAST_ORDER_STORAGE_KEY); } catch { /* ignore */ }
    setShowSignOut(false);
    setSigningOut(false);
    setUser(null);
  }

  if (resetToken) return <PasswordResetScreen token={resetToken} onDone={finishPasswordReset} />;
  if (authLoading) return <div className="min-h-screen" style={{ background: "#F8F9FA" }} />;
  if (!user) return <Login onLoggedIn={setUser} notice={loginNotice} />;
  const canManageReversals = Boolean(user.canVoidOrders || user.canRefundOrders);
  const visiblePage = page === "reversals" && !canManageReversals ? "pos" : page;
  async function confirmSignOut() {
    setSigningOut(true);
    await logout();
  }
  return <div className="app-shell flex h-screen overflow-hidden"><Sidebar current={visiblePage} collapsed={collapsed} lastOrder={lastOrder && shift && lastOrder.shiftId === shift.shiftId ? lastOrder : null} queueCounts={queueCounts} now={now} shiftOpen={Boolean(shift)} canManageReversals={canManageReversals} onChange={setPage} onToggle={() => setCollapsed((value) => !value)} /><div className="flex flex-col flex-1 min-w-0 min-h-0"><TopBar page={visiblePage} user={user} shift={shift} onOpenShift={() => setPage("pos")} onCloseShift={() => setClosingShift(true)} onAccount={() => setPage("accounts")} onRequestLogout={() => setShowSignOut(true)} /><div className="flex-1 min-h-0 overflow-auto app-content">{visiblePage === "pos" ? (shift === null ? <OpenShiftPanel onOpened={handleShiftOpened} /> : shift === undefined ? <div className="p-8" style={{ color: "#9C8278" }}>Checking the current shift…</div> : <POSPage onQueueAssigned={recordLastOrder} />) : visiblePage === "queue" ? <QueuePage /> : visiblePage === "reversals" ? <ReversalsPage user={user} /> : <AccountPage user={user} onSignOut={() => setShowSignOut(true)} />}</div></div>{closingShift && shift && <CloseShiftDialog shiftId={shift.shiftId} onCancel={() => setClosingShift(false)} onClosed={handleShiftClosed} />}{showSignOut && <SignOutDialog onCancel={() => setShowSignOut(false)} onConfirm={() => void confirmSignOut()} signingOut={signingOut} />}</div>;
}
