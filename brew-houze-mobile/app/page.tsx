"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  category: string;
  description: string;
  price: number;
  image: string;
  badge?: string;
  variants?: Variant[];
};
type Ingredient = { inventoryId: number; requiredQuantity: number; availableQuantity: number };
type Variant = { id: number; size: string | null; price: number; maxQuantity: number; available: boolean; ingredients: Ingredient[] };
type CartItem = { key: string; product: Product; variantId: number | null; variantName: string; price: number; quantity: number; ingredients: Ingredient[] };

function IconSearch() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function IconCoffee() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
}

function IconCart() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
}

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState<"waiting" | "served" | "flushed" | "">("");

  useEffect(() => {
    let active = true;
    fetch("/api/products", { cache: "default" })
      .then(async (response) => {
        const payload = await response.json() as { data?: Product[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load the menu.");
        if (active) setProducts(payload.data ?? []);
      })
      .catch((loadError) => {
        console.error("Mobile menu: failed to load products", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the menu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))], [products]);
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "All" || product.category === category;
    const query = search.trim().toLowerCase();
    return matchesCategory && (!query || `${product.name} ${product.description}`.toLowerCase().includes(query));
  }), [category, products, search]);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const activeOrder = Boolean(trackingToken && orderStatus && orderStatus !== "flushed");

  function getCartLimit(variant: Variant, currentCart: CartItem[], candidateKey: string) {
    if (variant.ingredients.length === 0) return 0;
    return Math.max(0, Math.floor(Math.min(...variant.ingredients.map((ingredient) => {
      const usedByOthers = currentCart
        .filter((item) => item.key !== candidateKey)
        .flatMap((item) => item.ingredients)
        .filter((itemIngredient) => itemIngredient.inventoryId === ingredient.inventoryId)
        .reduce((total, itemIngredient) => total + itemIngredient.requiredQuantity * (currentCart.find((item) => item.ingredients.includes(itemIngredient))?.quantity ?? 0), 0);
      return (ingredient.availableQuantity - usedByOthers) / ingredient.requiredQuantity;
    }))));
  }

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedVariantId(product.variants?.[0]?.id ?? null);
    setSelectedQuantity(1);
  }

  function addToCart() {
    if (!selectedProduct) return;
    const variant = selectedProduct.variants?.find((item) => item.id === selectedVariantId);
    const price = variant?.price ?? selectedProduct.price;
    const key = `${selectedProduct.id}-${variant?.id ?? "regular"}`;
    if (variant) {
      const limit = getCartLimit(variant, cart, key);
      const existingQuantity = cart.find((item) => item.key === key)?.quantity ?? 0;
      if (!variant.available || selectedQuantity > limit - existingQuantity) return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) return current.map((item) => item.key === key ? { ...item, quantity: item.quantity + selectedQuantity } : item);
      return [...current, { key, product: selectedProduct, variantId: variant?.id ?? null, variantName: variant?.size ?? "Regular", price, quantity: selectedQuantity, ingredients: variant?.ingredients ?? [] }];
    });
    setSelectedProduct(null);
    setCartOpen(true);
  }

  function updateCartItem(key: string, change: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.key !== key) return [item];
      const quantity = item.quantity + change;
      if (quantity <= 0) return [];
      const variant = item.product.variants?.find((candidate) => candidate.id === item.variantId);
      if (change > 0 && variant && quantity > getCartLimit(variant, current, key)) return [item];
      return [{ ...item, quantity }];
    }));
  }

  async function submitOrder() {
    if (cart.length === 0) return;
    setPlacingOrder(true);
    setOrderError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.filter((item) => item.variantId !== null).map((item) => ({ product_variant_id: item.variantId, quantity: item.quantity })) }),
      });
      const payload = await response.json() as { data?: { trackingToken: string; queueNumber: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to place order.");
      setCart([]);
      setCartOpen(false);
      setTrackingToken(payload.data?.trackingToken ?? "");
      setQueueNumber(payload.data?.queueNumber ?? null);
      setOrderStatus("waiting");
      setOrderPlaced(true);
    } catch (submitError) {
      setOrderError(submitError instanceof Error ? submitError.message : "Unable to place order.");
    } finally {
      setPlacingOrder(false);
    }
  }

  useEffect(() => {
    if (!trackingToken || !activeOrder) return;
    let active = true;
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/orders/${trackingToken}`, { cache: "no-store" });
        const payload = await response.json() as { data?: { queue_status: "waiting" | "served" | "flushed" }; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to check order status.");
        if (active && payload.data) setOrderStatus(payload.data.queue_status);
      } catch (statusError) {
        console.error("Mobile order status check failed", statusError);
      }
    };
    void checkStatus();
    const intervalId = window.setInterval(() => void checkStatus(), 5_000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [activeOrder, trackingToken]);

  return <main className="menu-shell">
    <div className="menu-container">
      <header className="menu-header">
        <div className="brand-mark"><IconCoffee /></div>
        <div className="brand-copy"><strong>Brew Houze</strong><span>Online Menu</span></div>
        <div className="header-actions">
          <button className="header-action cart-logo-button" onClick={() => setCartOpen(true)} aria-label={cartCount > 0 ? `Open cart with ${cartCount} items` : "Open empty cart"}><IconCart />{cartCount > 0 && <span className="header-count">{cartCount}</span>}</button>
          {activeOrder && <button className="header-action queue-action" onClick={() => setOrderPlaced(true)} aria-label="View active queue order">Queue #{queueNumber ?? "—"}</button>}
          <div className="table-pill"><span className="status-dot" />Table QR</div>
        </div>
      </header>

      <section className="welcome">
        <p className="eyebrow">WELCOME TO BREW HOUZE</p>
        <h1>Your next favorite cup<br /><em>starts here.</em></h1>
        <p className="welcome-copy">Browse our menu and discover something made for your moment.</p>
      </section>

      <label className="search-box">
        <IconSearch />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the menu" aria-label="Search the menu" />
      </label>

      <div className="category-row" role="tablist" aria-label="Menu categories">
        {categories.map((item) => <button key={item} className={category === item ? "category active" : "category"} onClick={() => setCategory(item)}>{item}</button>)}
      </div>

      <section className="menu-section">
        <div className="section-heading"><div><p className="eyebrow">CURATED FOR YOU</p><h2>{category === "All" ? "Our menu" : category}</h2></div><span>{visibleProducts.length} items</span></div>
        {loading && <div className="empty-state">Loading the current menu...</div>}
        {error && <div className="empty-state error-state">{error}</div>}
        {!loading && !error && <div className="product-grid">
          {visibleProducts.map((product) => <article className="product-card" key={product.id}>
            <div className="product-image">{product.image ? <img src={product.image} alt="" loading="lazy" decoding="async" /> : <div className="image-placeholder"><IconCoffee /></div>}<div className="image-shade" />{product.badge && <span className="product-badge">{product.badge}</span>}</div>
            <div className="product-info"><div className="product-category">{product.category}</div><h3>{product.name}</h3><p>{product.description}</p><div className="product-footer"><strong>₱{product.variants?.[0]?.price?.toFixed(2) ?? product.price.toFixed(2)}</strong><button disabled={Boolean(product.variants?.length && !product.variants.some((variant) => variant.available))} onClick={() => openProduct(product)} aria-label={`Add ${product.name} to order`}>{product.variants?.length && !product.variants.some((variant) => variant.available) ? "Unavailable" : "Add to order"}</button></div></div>
          </article>)}
        </div>}
        {!loading && !error && visibleProducts.length === 0 && <div className="empty-state">No menu items match your search.</div>}
      </section>

      {cartCount > 0 && <button className="cart-bar" onClick={() => setCartOpen(true)}><span><strong>{cartCount}</strong> item{cartCount === 1 ? "" : "s"} in your order</span><strong>View order · ₱{cartTotal.toFixed(2)}</strong></button>}
      <footer className="menu-footer"><IconCoffee /><span>Made with care at Brew Houze</span></footer>
    </div>
    {selectedProduct && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSelectedProduct(null); }}>
      <section className="item-modal" aria-label="Customize item">
        <button className="modal-close" onClick={() => setSelectedProduct(null)} aria-label="Close">×</button>
        <div className="modal-image">{selectedProduct.image ? <img src={selectedProduct.image} alt="" decoding="async" /> : <IconCoffee />}</div>
        <p className="eyebrow">{selectedProduct.category}</p><h2>{selectedProduct.name}</h2><p className="modal-description">{selectedProduct.description}</p>
        {selectedProduct.variants && selectedProduct.variants.length > 0 && <div className="variant-section"><div className="variant-heading"><strong>Select size</strong><span>Required</span></div><div className="variant-grid">{selectedProduct.variants.map((variant) => <button disabled={!variant.available} key={variant.id} className={`${selectedVariantId === variant.id ? "variant-option selected" : "variant-option"}${!variant.available ? " unavailable" : ""}`} onClick={() => setSelectedVariantId(variant.id)}><strong>{variant.size || "Regular"}</strong><span>{variant.available ? `${variant.maxQuantity} available · ₱${variant.price.toFixed(2)}` : "Unavailable"}</span></button>)}</div></div>}
        <div className="quantity-row"><strong>Quantity</strong><div className="quantity-control"><button onClick={() => setSelectedQuantity((value) => Math.max(1, value - 1))}>−</button><span>{selectedQuantity}</span><button onClick={() => setSelectedQuantity((value) => value + 1)}>+</button></div></div>
        <button className="add-order-button" disabled={Boolean(selectedProduct.variants?.length && (!selectedProduct.variants.find((item) => item.id === selectedVariantId)?.available || selectedQuantity > (selectedProduct.variants.find((item) => item.id === selectedVariantId)?.maxQuantity ?? 0)))} onClick={addToCart}>Add to order <span>₱{((selectedProduct.variants?.find((item) => item.id === selectedVariantId)?.price ?? selectedProduct.price) * selectedQuantity).toFixed(2)} →</span></button>
      </section>
    </div>}
    {cartOpen && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
      <section className="cart-modal" aria-label="Your order"><div className="cart-modal-heading"><div><p className="eyebrow">YOUR TABLE ORDER</p><h2>Review order</h2></div><button className="modal-close inline" onClick={() => setCartOpen(false)} aria-label="Close">×</button></div>
        {orderError && <p className="error-message">{orderError}</p>}{cart.length === 0 ? <div className="empty-cart"><IconCart /><strong>No current items in cart</strong><span>Add an item from the menu to start your order.</span></div> : <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.key}><div><strong>{item.product.name}</strong><span>{item.variantName} · ₱{item.price.toFixed(2)}</span></div><div className="quantity-control"><button onClick={() => updateCartItem(item.key, -1)}>−</button><span>{item.quantity}</span><button onClick={() => updateCartItem(item.key, 1)}>+</button></div></div>)}</div>
        <div className="cart-total"><span>Total</span><strong>₱{cartTotal.toFixed(2)}</strong></div><p className="no-payment-note">Payment is not included yet. Your order will be sent to the café for preparation.</p><button className="add-order-button" disabled={placingOrder} onClick={() => void submitOrder()}>{placingOrder ? "Sending order..." : "Send order"} <span>₱{cartTotal.toFixed(2)} →</span></button></>}
      </section>
    </div>}
    {orderPlaced && <div className="modal-backdrop"><section className="confirmation-modal"><div className="confirmation-icon">{orderStatus === "served" ? "✓" : "!"}</div><p className="eyebrow">{orderStatus === "served" ? "READY FOR PICKUP" : "ORDER SENT"}</p><h2>{orderStatus === "served" ? "Your order is ready." : "Your order is on its way."}</h2><div className="queue-ticket"><span>QUEUE NUMBER</span><strong>#{queueNumber ?? "—"}</strong></div><p>{orderStatus === "served" ? "Please pick up your order at the counter." : "The café has received your order and will notify this screen when it is ready."}</p><button className="add-order-button" onClick={() => setOrderPlaced(false)}>Back to menu</button></section></div>}
  </main>;
}
