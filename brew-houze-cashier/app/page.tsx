"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Page = "pos" | "queue" | "reversals" | "accounts";
type Session = { adminId: number; fullName: string; email: string; role: string; canVoidOrders?: boolean; canRefundOrders?: boolean };
type IconProps = { size?: number };
type QueueOrderDetail = { product_name: string; size_label: string | null; temperature?: "hot" | "cold" | "both" | null; quantity: number; additions: { name: string; quantity: number }[] };
type QueueOrder = { order_id: number; queue_number: number; items: string; created_at: string; order_source: string; order_details: QueueOrderDetail[]; status?: string; queue_status?: string; total_amount?: number };

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

function IconChevron({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}

function uniqueQueueOrders(orders: QueueOrder[]) {
  return Array.from(new Map(orders.map((order) => [order.order_id, order])).values());
}

const navItems: { id: Page; label: string; Icon: React.FC<IconProps> }[] = [
  { id: "pos", label: "Point of Sale", Icon: IconGrid },
  { id: "queue", label: "Queue", Icon: IconList },
  { id: "reversals", label: "Void & Refund", Icon: IconList },
  { id: "accounts", label: "Account Management", Icon: IconUsers },
];

function Sidebar({ current, collapsed, queueNumber, canManageReversals, onChange, onToggle }: { current: Page; collapsed: boolean; queueNumber: number | null; canManageReversals: boolean; onChange: (page: Page) => void; onToggle: () => void }) {
  const visibleNavItems = navItems.filter((item) => item.id !== "reversals" || canManageReversals);
  return <aside className={`app-sidebar ${collapsed ? "is-collapsed" : "is-expanded"} flex flex-col`} style={{ background: "#3D2B1F", minHeight: "100vh", width: collapsed ? 52 : 240, flexShrink: 0 }}>
    <div className="flex items-center gap-3 px-6 py-7 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: "#D97706" }}><IconCoffee size={20} /></div>
      <div><p style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 700, fontSize: 14, color: "#FDF9F5", lineHeight: 1.2 }}>Brew Houze</p><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>CAFE</p></div>
    </div>
    <div className="sidebar-toggle-row"><button onClick={onToggle} title={collapsed ? "Expand sidebar" : "Minimize sidebar"} aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #6B4C3B", borderRadius: 6, background: "#3D2B1F", color: "#FDF9F5", cursor: "pointer", transform: collapsed ? "rotate(180deg)" : "none" }}><IconChevron size={14} /></button></div>
    <nav className="flex flex-col gap-1 px-3 pt-5 flex-1">
      {visibleNavItems.map(({ id, label, Icon }) => <button key={id} onClick={() => onChange(id)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left w-full" style={{ background: current === id ? "#D97706" : "transparent", color: current === id ? "#FDF9F5" : "rgba(255,255,255,0.55)", fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: current === id ? 600 : 400, cursor: "pointer", border: "none" }}><Icon size={17} /><span>{label}</span></button>)}
    </nav>
    <div className="mx-3 mb-5 rounded-xl" style={{ background: "rgba(217,119,6,0.16)", border: "1px solid rgba(217,119,6,0.35)", padding: collapsed ? "10px 4px" : "12px 14px", textAlign: collapsed ? "center" : "left" }}>
      <p style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#D97706", letterSpacing: "0.06em" }}>{collapsed ? "Q" : queueNumber === null ? "QUEUE" : "LAST QUEUE"}</p>
      <p style={{ margin: "3px 0 0", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: collapsed ? 18 : 26, lineHeight: 1, color: "#FDF9F5" }}>{queueNumber === null ? "—" : `#${queueNumber}`}</p>
      {!collapsed && <p style={{ margin: "5px 0 0", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{queueNumber === null ? "No orders yet" : "Last order today"}</p>}
    </div>
    <div className="px-6 py-5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}><p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>CASHIER PORTAL</p></div>
  </aside>;
}

function TopBar({ page, user, onAccount, onRequestLogout }: { page: Page; user: Session; onAccount: () => void; onRequestLogout: () => void }) {
  const title = page === "pos" ? "Point of Sale" : page === "queue" ? "Queue" : page === "reversals" ? "Void & Refund" : "Account Management";
  return <header className="app-topbar flex items-center justify-between px-8 py-4 border-b" style={{ background: "#FDF9F5", borderColor: "#E8DDD5", flexShrink: 0 }}>
    <div className="flex items-center gap-2" style={{ color: "#9C8278" }}><IconChevron size={14} /><span style={{ fontSize: 13 }}>{title}</span></div>
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

function POSPage({ onQueueAssigned }: { onQueueAssigned: (queueNumber: number) => void }) {
  type Ingredient = { inventory_id: number; required_quantity: string | number; available_quantity: string | number };
  type Addition = { addition_id: number; addition_name: string; quantity: string | number; price: string | number; unit_of_measure: string; inventory_id: number; available_quantity: string | number };
  type Variant = { product_variant_id: number; price: string | number; size_label: string | null; temperature?: "hot" | "cold" | "both"; available?: boolean; max_quantity?: number; ingredients: Ingredient[] };
  type Product = { product_id: number; product_name: string; product_description?: string; product_category: string | null; image_url?: string | null; additions: Addition[]; variants: Variant[] };
  type ProductsResponse = { data?: Product[] };
  type CartItem = { key: string; productId: number; variantId: number | null; name: string; size?: string | null; temperature?: "hot" | "cold" | "both"; qty: number; price: number; ingredients: Ingredient[]; additions: Addition[] };
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [queueError, setQueueError] = useState("");
  const [selectionProduct, setSelectionProduct] = useState<Product | null>(null);
  const cartLineId = useRef(0);

  async function loadQueue() {
    const response = await fetch("/api/queue", { cache: "no-store" });
    const payload = await response.json() as { data?: { waiting?: QueueOrder[] }; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load queue.");
    setQueue(payload.data?.waiting ?? []);
  }

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let queueSignature = "";
    const refresh = async () => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      try {
        const signatureResponse = await fetch("/api/queue?signatureOnly=1", { cache: "no-store" });
        const signaturePayload = await signatureResponse.json() as { signature?: Record<string, unknown>; error?: string };
        if (!signatureResponse.ok) throw new Error(signaturePayload.error || "Unable to check queue.");
        const nextSignature = JSON.stringify(signaturePayload.signature ?? {});
        if (queueSignature === nextSignature) return;
        queueSignature = nextSignature;
        await loadQueue();
        if (active) setQueueError("");
      } catch (error) {
        console.error("POS: failed to load queue", error);
        if (active) setQueueError(error instanceof Error ? error.message : "Unable to load queue.");
      } finally {
        requestInFlight = false;
      }
    };
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 10_000);
    return () => { active = false; window.clearInterval(intervalId); };
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
          setProducts((current) => JSON.stringify(current) === JSON.stringify(nextProducts) ? current : nextProducts);
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

  function getCartLimit(candidate: Variant, currentCart: CartItem[], candidateKey: string): number {
    if (candidate.ingredients.length === 0) return 0;
    const usedByOthers = new Map<number, number>();
    currentCart.filter((item) => item.key !== candidateKey).forEach((item) => {
      item.ingredients.forEach((ingredient) => usedByOthers.set(ingredient.inventory_id, (usedByOthers.get(ingredient.inventory_id) ?? 0) + Number(ingredient.required_quantity) * item.qty));
      item.additions.forEach((addition) => usedByOthers.set(addition.inventory_id, (usedByOthers.get(addition.inventory_id) ?? 0) + Number(addition.quantity) * item.qty));
    });
    const resources = new Map<number, { available: number; required: number }>();
    candidate.ingredients.forEach((ingredient) => {
      const inventoryId = ingredient.inventory_id;
      const current = resources.get(inventoryId) ?? { available: Number(ingredient.available_quantity), required: 0 };
      resources.set(inventoryId, {
        available: Math.min(current.available, Number(ingredient.available_quantity)),
        required: current.required + Number(ingredient.required_quantity),
      });
    });
    const limit = Math.min(...Array.from(resources.entries()).map(([inventoryId, resource]) => (
      (resource.available - (usedByOthers.get(inventoryId) ?? 0)) / resource.required
    )));
    return Math.max(0, Math.floor(limit));
  }

  function canAddAddition(item: CartItem, addition: Addition): boolean {
    const used = cart.reduce((total, current) => {
      const ingredientUse = current.ingredients.filter((ingredient) => ingredient.inventory_id === addition.inventory_id).reduce((sum, ingredient) => sum + Number(ingredient.required_quantity) * current.qty, 0);
      const additionUse = current.additions.filter((selected) => selected.inventory_id === addition.inventory_id).reduce((sum, selected) => sum + Number(selected.quantity) * current.qty, 0);
      return total + ingredientUse + additionUse;
    }, 0);
    return used + Number(addition.quantity) * item.qty <= Number(addition.available_quantity);
  }

  function getItemCartLimit(item: CartItem, currentCart: CartItem[]): number {
    const variant = products.flatMap((product) => product.variants).find((candidate) => candidate.product_variant_id === item.variantId);
    if (!variant) return Number.MAX_SAFE_INTEGER;
    const usedByOthers = new Map<number, number>();
    currentCart.filter((entry) => entry.key !== item.key).forEach((entry) => {
      entry.ingredients.forEach((ingredient) => usedByOthers.set(ingredient.inventory_id, (usedByOthers.get(ingredient.inventory_id) ?? 0) + Number(ingredient.required_quantity) * entry.qty));
      entry.additions.forEach((addition) => usedByOthers.set(addition.inventory_id, (usedByOthers.get(addition.inventory_id) ?? 0) + Number(addition.quantity) * entry.qty));
    });
    const limits = [
      ...item.ingredients.map((ingredient) => ({
        available: Number(ingredient.available_quantity),
        required: Number(ingredient.required_quantity),
        inventoryId: ingredient.inventory_id,
      })),
      ...item.additions.map((addition) => ({
        available: Number(addition.available_quantity),
        required: Number(addition.quantity),
        inventoryId: addition.inventory_id,
      })),
    ];
    return limits.length === 0 ? 0 : Math.max(0, Math.floor(Math.min(...limits.map((limit) => (limit.available - (usedByOthers.get(limit.inventoryId) ?? 0)) / limit.required))));
  }

  function getRemainingQuantity(product: Product, variant: Variant): number {
    return getCartLimit(variant, cart, "");
  }

  function addToCart(product: Product, variant: Variant | null) {
    const variantId = variant ? Number(variant.product_variant_id) : null;
    cartLineId.current += 1;
    const key = `${product.product_id}:${variantId ?? "v"}:${cartLineId.current}`;
    const price = variant ? Number(variant.price) : 0;
    setCart((prev) => {
      if (variant && getCartLimit(variant, prev, key) <= 0) return prev;
      return [...prev, { key, productId: product.product_id, variantId, name: product.product_name, size: variant?.size_label ?? null, temperature: variant?.temperature, qty: 1, price, ingredients: variant?.ingredients ?? [], additions: [] }];
    });
  }

  function toggleAddition(key: string, addition: Addition) {
    setCart((prev) => prev.map((item) => {
      if (item.key !== key) return item;
      const selected = item.additions.some((current) => current.addition_id === addition.addition_id);
      return { ...item, additions: selected ? item.additions.filter((current) => current.addition_id !== addition.addition_id) : [...item.additions, addition] };
    }));
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) => {
      const item = prev.find((entry) => entry.key === key);
      if (!item) return prev;
      const variant = products.flatMap((product) => product.variants).find((entry) => entry.product_variant_id === item.variantId);
      const limit = variant ? getItemCartLimit(item, prev) : Number.MAX_SAFE_INTEGER;
      const nextQuantity = Math.min(limit, Math.max(0, item.qty + delta));
      return prev.flatMap((entry) => {
        if (entry.key !== key) return [entry];
        return nextQuantity > 0 ? [{ ...entry, qty: nextQuantity }] : [];
      });
    });
  }

  async function checkout() {
    if (cart.length === 0 || checkingOut) return;
    const subtotalValue = cart.reduce((s, it) => s + (it.price + it.additions.reduce((total, addition) => total + Number(addition.price), 0)) * it.qty, 0);
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
            addition_ids: item.additions.map((addition) => addition.addition_id),
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
      onQueueAssigned(queueNumber);
      const refresh = await fetch("/api/products", { cache: "no-store" });
      if (refresh.ok) {
        const refreshedPayload = await refresh.json() as ProductsResponse;
        setProducts(refreshedPayload.data ?? []);
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to complete checkout.");
    } finally {
      setCheckingOut(false);
    }
  }

  const filtered = products.filter((p) => p.product_name.toLowerCase().includes(search.toLowerCase()) || (p.product_category ?? "").toLowerCase().includes(search.toLowerCase()));
  const groupedProducts = Array.from(
    filtered.reduce((groups, product) => {
      const category = product.product_category?.trim() || "Other";
      const categoryProducts = groups.get(category) ?? [];
      categoryProducts.push(product);
      groups.set(category, categoryProducts);
      return groups;
    }, new Map<string, Product[]>())
  );
  const subtotal = cart.reduce((s, it) => s + (it.price + it.additions.reduce((total, addition) => total + Number(addition.price), 0)) * it.qty, 0);
  const parsedReceivedAmount = Number.parseFloat(receivedAmount);
  const changeDue = Number.isFinite(parsedReceivedAmount) ? Math.max(0, parsedReceivedAmount - subtotal) : 0;
  const hasValidPayment = paymentMethod === "online" || subtotal === 0 || (Number.isFinite(parsedReceivedAmount) && parsedReceivedAmount >= subtotal);

  return <main className="pos-layout p-6" style={{ display: "flex", gap: 20, padding: 24 }}>
    <section style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="pos-search" placeholder="Search products or category..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #E8DDD5", minWidth: 320, background: "#FDF9F5", color: "#3D2B1F", outline: "none", boxShadow: "0 2px 8px rgba(61,43,31,0.04)" }} />
        </div>
        <div style={{ color: "#9C8278", fontSize: 12, whiteSpace: "nowrap", fontFamily: "JetBrains Mono, monospace" }}>{loading ? "LOADING..." : `${filtered.length} PRODUCTS`}</div>
      </div>

      <div className="pos-category-list">
        {groupedProducts.map(([category, categoryProducts]) => (
          <section key={category} className="pos-category-section">
            <div className="pos-category-divider">
              <span>{category}</span>
              <span className="pos-category-count">{categoryProducts.length} item{categoryProducts.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
              {categoryProducts.map((product) => (
          <button key={product.product_id} type="button" className="pos-card rounded-2xl" onClick={() => setSelectionProduct(product)} style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 245, padding: 0, textAlign: "left", cursor: "pointer", color: "#3D2B1F" }}>
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
                {product.variants?.length ? "Tap to choose size and temperature" : "Tap to add to cart"}
              </div>
            </div>
          </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>

    <aside style={{ width: 360, flexShrink: 0 }}>
      <div className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif" }}>Cart</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflow: "auto" }}>
          {cart.length === 0 && <div style={{ color: "#9C8278" }}>Cart is empty</div>}
          {cart.map((item) => (
            <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{item.name}{item.size ? ` — ${item.size}` : ""}{item.temperature === "hot" ? " · Hot" : item.temperature === "cold" ? " · Cold" : ""}</div>
                <div style={{ fontSize: 12, color: "#9C8278" }}>₱{(item.price).toFixed(2)} • x{item.qty}</div>
                {item.additions.length > 0 && <div style={{ marginTop: 5, fontSize: 11, color: "#6B4C3B" }}>+ {item.additions.map((addition) => `${addition.addition_name} (₱${Number(addition.price).toFixed(2)})`).join(", ")}</div>}
                <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 4 }}>
                  {products.find((product) => product.product_id === item.productId)?.additions?.map((addition) => { const selected = item.additions.some((current) => current.addition_id === addition.addition_id); const allowed = selected || canAddAddition(item, addition); return <label key={addition.addition_id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: allowed ? "#6B4C3B" : "#B9A398", cursor: allowed ? "pointer" : "not-allowed" }}><input type="checkbox" checked={selected} disabled={!allowed} onChange={() => toggleAddition(item.key, addition)} />{addition.addition_name} · ₱{Number(addition.price).toFixed(2)}{!allowed && " · insufficient stock"}</label>; })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => updateQty(item.key, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E8DDD5", background: "#fff" }}>-</button>
                <button onClick={() => updateQty(item.key, +1)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E8DDD5", background: "#fff" }}>+</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #E8DDD5", paddingTop: 8 }}>
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
      <div className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 12, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif" }}>Queue</h3>
          <span style={{ fontSize: 11, color: "#9C8278" }}>{queue.length} waiting</span>
        </div>
        {queueError && <p style={{ color: "#B91C1C", fontSize: 12 }}>{queueError}</p>}
        {queue.length === 0 && !queueError && <p style={{ color: "#9C8278", fontSize: 13, margin: 0 }}>No customers waiting.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {queue.map((order) => <div key={order.order_id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderTop: "1px solid #F0E8E2" }}>
            <strong style={{ color: "#D97706", fontSize: 18, minWidth: 40 }}>#{order.queue_number}</strong>
            <span style={{ flex: 1, color: "#6B4C3B", fontSize: 12 }}>{order.items}{order.order_source === "online" && <small style={{ display: "block", color: "#0D9488", fontWeight: 700, marginTop: 3 }}>ONLINE ORDER</small>}</span>
          </div>)}
        </div>
        <p style={{ margin: 0, color: "#9C8278", fontSize: 11 }}>Preview only. Manage and serve orders from the Queue tab.</p>
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
                <span>{variant.size_label ?? "Regular"} · {variant.temperature === "hot" ? "Hot" : variant.temperature === "cold" ? "Cold" : "Hot & Cold"}</span>
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

function QueuePage() {
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [readyQueue, setReadyQueue] = useState<QueueOrder[]>([]);
  const [queueError, setQueueError] = useState("");
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<number>>(new Set());

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

  function toggleOrderDetails(orderId: number) {
    setExpandedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
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

  return <main className="p-8" style={{ maxWidth: 1000 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, marginBottom: 18 }}>
      <div>
        <h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 28, color: "#3D2B1F", margin: 0 }}>Queue</h1>
        <p style={{ color: "#9C8278", fontSize: 13, margin: "5px 0 0" }}>Manage waiting orders and serve customers when their orders are ready.</p>
      </div>
      <span style={{ color: "#9C8278", fontSize: 12 }}>{queue.length} waiting</span>
    </div>
    <div className="rounded-2xl" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "Hanken Grotesk, sans-serif", fontSize: 19, color: "#7C2D12" }}>Ready for Pickup</h2>
          <p style={{ margin: "4px 0 0", color: "#9A3412", fontSize: 12 }}>These orders stay here until they are manually flushed.</p>
        </div>
        <span style={{ color: "#9A3412", fontSize: 12 }}>{readyQueue.length} ready</span>
      </div>
      {readyQueue.length === 0 && <p style={{ color: "#9A3412", margin: 0, fontSize: 13 }}>No orders ready for pickup.</p>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {readyQueue.map((order) => <div key={order.order_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: "1px solid #FED7AA" }}>
          <strong style={{ color: "#C2410C", fontSize: 24, minWidth: 60 }}>#{order.queue_number}</strong>
          <span style={{ flex: 1, color: "#7C2D12", fontSize: 13 }}>{order.items}{order.order_source === "online" && <small style={{ display: "block", color: "#0D9488", fontWeight: 700, marginTop: 3 }}>ONLINE ORDER</small>}</span>
          <button onClick={() => void flushOrder(order.order_id).catch((error) => setQueueError(error instanceof Error ? error.message : "Unable to flush ready order."))} style={{ border: "1px solid #EA580C", background: "#FFF", color: "#C2410C", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Flush</button>
        </div>)}
      </div>
    </div>
    <div className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 18 }}>
      {queueError && <p style={{ color: "#B91C1C", fontSize: 13 }}>{queueError}</p>}
      {queue.length === 0 && !queueError && <p style={{ color: "#9C8278", margin: 0 }}>No customers waiting.</p>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {queue.map((order) => {
          const expanded = expandedOrderIds.has(order.order_id);
          return <div key={order.order_id} style={{ padding: "14px 12px", borderTop: "1px solid #F0E8E2", background: order.order_source === "online" ? "#F0FDFA" : "transparent", borderLeft: order.order_source === "online" ? "4px solid #0D9488" : "4px solid transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <strong style={{ color: "#D97706", fontSize: 24, minWidth: 60 }}>#{order.queue_number}</strong>
              <button type="button" onClick={() => toggleOrderDetails(order.order_id)} aria-expanded={expanded} style={{ flex: 1, border: "none", background: "transparent", padding: 0, textAlign: "left", color: "#6B4C3B", fontSize: 13, cursor: "pointer" }}>
                <span>{order.items}</span>
                {order.order_source === "online" && <small style={{ display: "block", color: "#0D9488", fontWeight: 700, marginTop: 3 }}>ONLINE ORDER</small>}
                <small style={{ display: "block", color: "#9C8278", fontSize: 11, marginTop: 4 }}>{expanded ? "Hide order details" : "View order details"} <span aria-hidden="true">{expanded ? "▲" : "▼"}</span></small>
              </button>
              <button onClick={() => void serveOrder(order.order_id).catch((error) => setQueueError(error instanceof Error ? error.message : "Unable to serve order."))} style={{ border: "1px solid #D97706", background: "#FFF7ED", color: "#B45309", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Serve</button>
            </div>
            {expanded && <div style={{ margin: "12px 0 0 74px", padding: "10px 12px", background: "rgba(255,255,255,0.72)", border: "1px solid #E8DDD5", borderRadius: 10 }}>
              {order.order_details.map((detail, index) => <div key={`${order.order_id}-${index}`} style={{ padding: index === 0 ? 0 : "9px 0 0", marginTop: index === 0 ? 0 : 9, borderTop: index === 0 ? "none" : "1px solid #F0E8E2", color: "#6B4C3B", fontSize: 12 }}>
                <strong>{detail.product_name}{detail.size_label ? ` · ${detail.size_label}` : ""}{detail.temperature === "hot" ? " · Hot" : detail.temperature === "cold" ? " · Cold" : ""} × {detail.quantity}</strong>
                {detail.additions.length > 0 && <div style={{ marginTop: 5, color: "#7E22CE" }}>Additions: {detail.additions.map((addition) => `${addition.name} × ${addition.quantity}`).join(", ")}</div>}
              </div>)}
            </div>}
          </div>;
        })}
      </div>
    </div>
  </main>;
}

function ReversalsPage({ user }: { user: Session }) {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [pendingAction, setPendingAction] = useState<{ order: QueueOrder; action: "void" | "refund" } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    try {
      const response = await fetch("/api/order-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.order_id, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Unable to ${action} order.`);
      setPendingAction(null);
      await loadOrders();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} order.`);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadOrders(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  return <main className="p-8" style={{ maxWidth: 1000 }}>
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 28, color: "#3D2B1F", margin: 0 }}>Void & Refund</h1>
      <p style={{ color: "#9C8278", fontSize: 13, margin: "5px 0 0" }}>Undo recent orders and return their ingredients and add-ons to inventory.</p>
    </div>
    <div className="rounded-2xl" style={{ background: "#FDF9F5", border: "1px solid #E8DDD5", padding: 18 }}>
      {error && <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}
      {loading ? <p style={{ color: "#9C8278", margin: 0 }}>Loading recent orders...</p> : orders.length === 0 ? <p style={{ color: "#9C8278", margin: 0 }}>No recent orders.</p> : orders.map((order) => <div key={order.order_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #F0E8E2" }}><strong style={{ color: "#D97706", minWidth: 48 }}>#{order.queue_number}</strong><span style={{ flex: 1, color: "#6B4C3B", fontSize: 12 }}>{order.items}<small style={{ display: "block", marginTop: 3, color: order.status === "completed" ? "#9C8278" : "#B91C1C", fontWeight: 700, textTransform: "uppercase" }}>{order.status}</small></span>{order.status === "completed" && user.canVoidOrders && <button onClick={() => setPendingAction({ order, action: "void" })} style={{ border: "1px solid #B91C1C", background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Void</button>}{order.status === "completed" && user.canRefundOrders && <button onClick={() => setPendingAction({ order, action: "refund" })} style={{ border: "1px solid #B91C1C", background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Refund</button>}</div>)}
    </div>
    {pendingAction && <div role="dialog" aria-modal="true" aria-labelledby="reverse-order-title" onClick={() => setPendingAction(null)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 20, background: "rgba(61,43,31,.35)" }}><section onClick={(event) => event.stopPropagation()} style={{ width: "min(100%, 500px)", maxHeight: "85vh", overflowY: "auto", padding: 24, background: "#FDF9F5", border: "1px solid #E8DDD5", borderRadius: 16, boxShadow: "0 18px 50px rgba(61,43,31,.2)" }}><div className="flex items-start justify-between gap-3"><div><p style={{ margin: 0, color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>Review order reversal</p><h2 id="reverse-order-title" style={{ margin: "6px 0 0", color: "#3D2B1F", fontSize: 22 }}>{pendingAction.action === "void" ? "Void" : "Refund"} Order #{pendingAction.order.order_id}</h2></div><button type="button" onClick={() => setPendingAction(null)} aria-label="Close reversal confirmation" style={{ border: "none", background: "transparent", color: "#9C8278", fontSize: 24, cursor: "pointer" }}>×</button></div><div style={{ marginTop: 18, border: "1px solid #E8DDD5", borderRadius: 10, overflow: "hidden" }}>{pendingAction.order.order_details.map((detail, index) => <div key={`${pendingAction.order.order_id}-${index}`} style={{ padding: "11px 12px", borderTop: index ? "1px solid #F0E8E2" : "none", color: "#6B4C3B", fontSize: 13 }}><strong>{detail.product_name}{detail.size_label ? ` · ${detail.size_label}` : ""}{detail.temperature === "hot" ? " · Hot" : detail.temperature === "cold" ? " · Cold" : ""} × {detail.quantity}</strong>{detail.additions.length > 0 && <div style={{ marginTop: 5, color: "#7E22CE", fontSize: 12 }}>Add-ons: {detail.additions.map((addition) => `${addition.name} × ${addition.quantity}`).join(", ")}</div>}</div>)}</div><div className="flex items-center justify-between" style={{ marginTop: 18, paddingTop: 14, borderTop: "2px solid #3D2B1F" }}><strong>Total</strong><strong style={{ fontSize: 20 }}>₱{Number(pendingAction.order.total_amount ?? 0).toFixed(2)}</strong></div><p style={{ margin: "14px 0 0", color: "#9C8278", fontSize: 12, lineHeight: 1.5 }}>This will restore the order&apos;s ingredients and add-ons to inventory. This action cannot be undone.</p><div className="flex justify-end gap-2" style={{ marginTop: 20 }}><button type="button" onClick={() => setPendingAction(null)} style={{ border: "1px solid #E8DDD5", borderRadius: 9, padding: "10px 14px", background: "#F3EDE5", color: "#6B4C3B", cursor: "pointer", fontWeight: 700 }}>Cancel</button><button type="button" onClick={() => void reverseOrder(pendingAction.order, pendingAction.action)} style={{ border: "1px solid #B91C1C", borderRadius: 9, padding: "10px 14px", background: "#B91C1C", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Confirm {pendingAction.action === "void" ? "void" : "refund"}</button></div></section></div>}
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

function Login({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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

  return <main className="flex items-center justify-center min-h-screen p-6" style={{ background: "#F8F9FA" }}>
    <div className="w-full rounded-2xl p-8" style={{ maxWidth: 420, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 48px rgba(61,43,31,0.1)" }}>
      <div className="flex flex-col items-center text-center mb-8"><div className="flex items-center justify-center rounded-xl mb-4" style={{ width: 52, height: 52, background: "#D97706", color: "#FDF9F5" }}><IconCoffee size={26} /></div><h1 style={{ fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 25, color: "#3D2B1F" }}>Brew Houze</h1><p style={{ marginTop: 4, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#9C8278", letterSpacing: "0.08em" }}>CASHIER PORTAL</p></div>
      <form onSubmit={submit} className="flex flex-col gap-4"><label className="flex flex-col gap-1.5"><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="cashier@brewhouze.com" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none" }} /></label><label className="flex flex-col gap-1.5"><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9C8278", textTransform: "uppercase" }}>Password</span><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" style={{ border: "1px solid #E8DDD5", borderRadius: 10, padding: "11px 12px", background: "#FDF9F5", color: "#3D2B1F", outline: "none" }} /></label>{error && <p style={{ color: "#B91C1C", fontSize: 13 }}>{error}</p>}<button type="submit" disabled={submitting} style={{ marginTop: 8, border: "none", borderRadius: 10, padding: "12px", background: submitting ? "#C9B8AF" : "#3D2B1F", color: "#FDF9F5", fontWeight: 700, cursor: submitting ? "default" : "pointer" }}>{submitting ? "Signing in..." : "Sign in"}</button></form>
    </div>
  </main>;
}

export default function App() {
  const [user, setUser] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<Page>("pos");
  const [showSignOut, setShowSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);

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
    setQueueNumber(null);
    setShowSignOut(false);
    setSigningOut(false);
    setUser(null);
  }

  if (authLoading) return <div className="min-h-screen" style={{ background: "#F8F9FA" }} />;
  if (!user) return <Login onLoggedIn={setUser} />;
  const canManageReversals = Boolean(user.canVoidOrders || user.canRefundOrders);
  const visiblePage = page === "reversals" && !canManageReversals ? "pos" : page;
  async function confirmSignOut() {
    setSigningOut(true);
    await logout();
  }
  return <div className="flex min-h-screen"><Sidebar current={visiblePage} collapsed={collapsed} queueNumber={queueNumber} canManageReversals={canManageReversals} onChange={setPage} onToggle={() => setCollapsed((value) => !value)} /><div className="flex flex-col flex-1 min-w-0"><TopBar page={visiblePage} user={user} onAccount={() => setPage("accounts")} onRequestLogout={() => setShowSignOut(true)} /><div className="flex-1 app-content">{visiblePage === "pos" ? <POSPage onQueueAssigned={setQueueNumber} /> : visiblePage === "queue" ? <QueuePage /> : visiblePage === "reversals" ? <ReversalsPage user={user} /> : <AccountPage user={user} onSignOut={() => setShowSignOut(true)} />}</div></div>{showSignOut && <SignOutDialog onCancel={() => setShowSignOut(false)} onConfirm={() => void confirmSignOut()} signingOut={signingOut} />}</div>;
}
