"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AccountButton, AccountSheet, CartAccountNote, discountText, rewardMismatch, usableRewards, useCustomerAccount, type LoyaltyReward } from "./account";
import { IdCheckStatus, IdDiscountSheet, type IdCheckState, type IdCoverage, type IdDiscountRule, type VatSetting } from "./id-discount";

type Product = {
  id: number;
  name: string;
  category: string;
  description: string;
  price: number;
  productType?: "recipe" | "stock";
  image: string;
  additions?: Addition[];
  // Barista Featured Specials (Admin, Menu, Featured) and their badge.
  badge?: string;
  featured?: boolean;
  featuredOrder?: number;
  variants?: Variant[];
};
type Ingredient = { inventoryId: number; requiredQuantity: number; availableQuantity: number };
type Addition = { id: number; name: string; quantity: number; price: number; unit: string; inventoryId: number; availableQuantity: number };
type Variant = { id: number; size: string | null; temperature?: "hot" | "cold" | "both" | null; price: number; maxQuantity: number; available: boolean; ingredients: Ingredient[] };
// rewardId: a loyalty reward line (one item, free, paid with the customer's stars).
type CartItem = { key: string; product: Product; variantId: number | null; variantName: string; price: number; quantity: number; ingredients: Ingredient[]; additions: Addition[]; rewardId?: number; rewardName?: string; rewardCost?: number; rewardBirthday?: boolean };
type OrderStatus = "waiting" | "served" | "flushed";
// delivery: a delivery order; deliveryStatus its progress (preparing, ready, out, delivered, failed, cancelled).
type TrackedOrder = { trackingToken: string; queueNumber: number | null; status: OrderStatus; delivery?: boolean; deliveryStatus?: string | null };
// Delivery as the mobile menu sees it (see /api/delivery).
type DeliveryInfo = { enabled: boolean; openNow: boolean; hours: { start: string; end: string } | null; freeAbove: number | null; cod: { enabled: boolean; maxAmount: number; minOrders: number }; zones: { id: number; name: string; description: string | null; fee: number; minOrder: number | null }[] };
const trackedOrdersStorageKey = "brew-houze-tracked-orders";
// A GCash payment in progress: its reference and the cart, so the cart comes back if it fails.
const pendingPaymentStorageKey = "brew-houze-pending-payment";
type PaymentConfig = { method: "gcash" | "none"; testMode?: boolean; minimumAmount?: number };
type PaymentCheck = { token: string; state: "checking" | "slow" | "failed"; message?: string; cart: CartItem[] };
// ID discounts (senior, PWD and others) are checked at the counter: the customer sends their cart
// there with a 4-digit code and pays the cashier. Kept in storage so a reload keeps the code.
type IdDiscountOption = IdDiscountRule;
type SentCart = { token: string; code: string; expiresAt: string; discountName: string; status: "waiting" | "expired" | "cancelled" };
const sentCartStorageKey = "brew-houze-sent-cart";
// The Favorites chip (not a category name).
const FAVORITES = "__favorites";
// An ID photo the café is checking (or approved), so a reload keeps following it.
const idCheckStorageKey = "brew-houze-id-check";

function sortVariants(variants: Variant[]): Variant[] {
  const sizeOrder = new Map([["8 oz", 0], ["12 oz", 1], ["16 oz", 2], ["22 oz", 3]]);
  const temperatureOrder = { hot: 0, cold: 1, both: 2 };
  return [...variants].sort((left, right) => {
    const leftSize = sizeOrder.get((left.size ?? "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rightSize = sizeOrder.get((right.size ?? "").trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (leftSize !== rightSize) return leftSize - rightSize;
    return temperatureOrder[left.temperature ?? "both"] - temperatureOrder[right.temperature ?? "both"];
  });
}

function isTrackedOrder(value: unknown): value is TrackedOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<TrackedOrder>;
  return typeof order.trackingToken === "string"
    && (typeof order.queueNumber === "number" || order.queueNumber === null)
    && (order.status === "waiting" || order.status === "served" || order.status === "flushed");
}

function IconSearch() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function IconCoffee() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
}

const iconProps = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function IconFilter() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconProps}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
}
function IconSparkle() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 2l1.6 4.9L15.5 8.5l-4.9 1.6L9 15l-1.6-4.9L2.5 8.5l4.9-1.6L9 2Z" /><path d="M18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9L18 13Z" opacity=".7" /></svg>;
}
function IconDineIn() {
  return <svg width="28" height="28" viewBox="0 0 24 24" {...iconProps}><path d="M4 11h13v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" /><path d="M17 12h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8 3c-.6.8-.6 1.7 0 2.5s.6 1.7 0 2.5M12 3c-.6.8-.6 1.7 0 2.5s.6 1.7 0 2.5" /></svg>;
}
function IconDelivery() {
  return <svg width="28" height="28" viewBox="0 0 24 24" {...iconProps}><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17h7M15 17l-2-6h-3M13 11l1-3h3M5 12h5v3" /></svg>;
}
function IconTakeOut() {
  return <svg width="28" height="28" viewBox="0 0 24 24" {...iconProps}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M9 9a3 3 0 0 0 6 0" /></svg>;
}

function IconTrash() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...iconProps} aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
}

function IconCart() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
}

export default function MenuPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // False when no shift is open at the café: the menu can be browsed but orders can't be sent.
  const [storeOpen, setStoreOpen] = useState(true);
  const [error, setError] = useState("");
  // Chips: all (null), a category, or FAVORITES (what this customer orders most).
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [tempFilter, setTempFilter] = useState<"any" | "hot" | "cold">("any");
  const [sortBy, setSortBy] = useState<"menu" | "low" | "high">("menu");
  const [availableOnly, setAvailableOnly] = useState(false);
  // "Added Kape · 12oz" after Add to Cart, for a few seconds.
  const [addedNote, setAddedNote] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedAdditionIds, setSelectedAdditionIds] = useState<number[]>([]);
  // The cart line being changed in the item sheet (null: adding a new one).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [trackedOrders, setTrackedOrders] = useState<TrackedOrder[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({ method: "none" });
  const [paymentCheck, setPaymentCheck] = useState<PaymentCheck | null>(null);
  // Customer account (optional). All account logic lives in ./account.tsx.
  const customer = useCustomerAccount();
  const { refresh: refreshAccount } = customer;
  const [accountOpen, setAccountOpen] = useState(false);
  // A password reset link from email opens the account sheet on its reset screen.
  const [resetToken, setResetToken] = useState<string | null>(null);
  // Opened from the printed Stars sign at the counter (?claim=1).
  const [claimStart, setClaimStart] = useState(false);
  // The reward whose item the customer is choosing.
  const [rewardPick, setRewardPick] = useState<LoyaltyReward | null>(null);
  // A discount reward on the order (at most one).
  const [discountReward, setDiscountReward] = useState<LoyaltyReward | null>(null);
  // Eaten at the café (usually, from the table QR) or taken away.
  const [serviceType, setServiceType] = useState<"dine_in" | "take_out" | "delivery">("dine_in");
  // Delivery: the café's rules and zones, the address chosen in the cart, and GCash or cash on delivery.
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [deliveryAddressId, setDeliveryAddressId] = useState<number | null>(null);
  const [deliveryPayment, setDeliveryPayment] = useState<"gcash" | "cod">("gcash");
  // ID discounts the café gives, the one the customer will claim (null: none), and a cart sent
  // to the counter that is waiting for them.
  const [idDiscountOptions, setIdDiscountOptions] = useState<IdDiscountOption[]>([]);
  const [claimIdType, setClaimIdType] = useState<number | null>(null);
  const [sentCart, setSentCart] = useState<SentCart | null>(null);
  const [sentCartBusy, setSentCartBusy] = useState(false);
  const [idVat, setIdVat] = useState<VatSetting>({ registered: true, rate: 12 });
  // How the customer claims it: a photo checked by the café (pay here), the ID saved on their
  // account, or at the counter. idSheet: the step choosing items (and the photo) is open.
  const [claimMode, setClaimMode] = useState<"photo" | "saved" | "counter">("photo");
  const [idSheet, setIdSheet] = useState<"photo" | "saved" | null>(null);
  const [idCheck, setIdCheck] = useState<IdCheckState | null>(null);
  const [idPaying, setIdPaying] = useState(false);
  const rewardLineId = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const trackedOrdersHydratedRef = useRef(false);
  const pendingReadyPingRef = useRef(false);

  function playReadyPing() {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== "running") {
      pendingReadyPingRef.current = true;
      return;
    }
    pendingReadyPingRef.current = false;
    const now = audioContext.currentTime;
    [880, 1760].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      const start = now + index * 0.015;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.075 : 0.018, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.85);
    });
  }

  useEffect(() => {
    const enableAudio = () => {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      void audioContextRef.current.resume().then(() => {
        if (pendingReadyPingRef.current) playReadyPing();
      }).catch((audioError) => {
        console.error("Mobile menu: failed to enable notification sound", audioError);
      });
    };
    window.addEventListener("pointerdown", enableAudio);
    return () => window.removeEventListener("pointerdown", enableAudio);
  }, []);

  useEffect(() => {
    let restoredOrders: TrackedOrder[] | null = null;
    try {
      const storedOrders = window.localStorage.getItem(trackedOrdersStorageKey);
      if (storedOrders) {
        const parsedOrders: unknown = JSON.parse(storedOrders);
        if (Array.isArray(parsedOrders)) restoredOrders = parsedOrders.filter(isTrackedOrder);
      }
    } catch (storageError) {
      console.error("Mobile menu: failed to restore tracked orders", storageError);
    }
    if (restoredOrders) {
      window.setTimeout(() => {
        setTrackedOrders(restoredOrders ?? []);
        if (restoredOrders && restoredOrders.length > 0) setOrderPlaced(true);
        trackedOrdersHydratedRef.current = true;
      }, 0);
    } else {
      trackedOrdersHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!trackedOrdersHydratedRef.current) return;
    try {
      window.localStorage.setItem(trackedOrdersStorageKey, JSON.stringify(trackedOrders));
    } catch (storageError) {
      console.error("Mobile menu: failed to save tracked orders", storageError);
    }
  }, [trackedOrders]);

  useEffect(() => {
    let restored: PaymentCheck | null = null;
    try {
      const stored = window.localStorage.getItem(pendingPaymentStorageKey);
      const pending = stored ? JSON.parse(stored) as { token?: unknown; cart?: unknown } : null;
      const fromUrl = new URLSearchParams(window.location.search).get("payment");
      const token = typeof pending?.token === "string" ? pending.token : fromUrl;
      if (token && /^[0-9a-f-]{36}$/i.test(token)) restored = { token, state: "checking", cart: Array.isArray(pending?.cart) ? pending.cart as CartItem[] : [] };
      if (fromUrl) window.history.replaceState(null, "", window.location.pathname);
    } catch (storageError) {
      console.error("Mobile menu: failed to restore the payment in progress", storageError);
    }
    if (!restored) return;
    const timer = window.setTimeout(() => setPaymentCheck(restored), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    if (!token) return;
    const timer = window.setTimeout(() => {
      // The link is used once: take it out of the address so a refresh does not reopen it.
      params.delete("reset");
      window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
      setResetToken(token);
      setAccountOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("claim") !== "1") return;
    const timer = window.setTimeout(() => {
      params.delete("claim");
      window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
      setClaimStart(true);
      setAccountOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Asks the server until PayMongo has an answer. The server creates the order once it is paid.
  const checkingPayment = paymentCheck !== null && paymentCheck.state !== "failed";
  const checkingToken = paymentCheck?.token ?? null;
  useEffect(() => {
    if (!checkingPayment || !checkingToken) return;
    let active = true;
    let inFlight = false;
    const started = Date.now();
    const check = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(`/api/payments/${checkingToken}`, { cache: "no-store" });
        const payload = await response.json() as { data?: { status: string; queueNumber: number | null; message: string | null; trackingToken: string }; error?: string };
        if (!active) return;
        const result = payload.data;
        if (response.status === 404) {
          window.localStorage.removeItem(pendingPaymentStorageKey);
          setPaymentCheck(null);
          return;
        }
        if (!response.ok || !result) return;
        if (result.status === "completed") {
          window.localStorage.removeItem(pendingPaymentStorageKey);
          try { window.localStorage.removeItem(idCheckStorageKey); } catch { /* storage unavailable */ }
          setIdCheck(null); setClaimIdType(null);
          setCart([]); setDiscountReward(null); setServiceType("dine_in");
          setTrackedOrders((current) => current.some((order) => order.trackingToken === result.trackingToken) ? current : [...current, { trackingToken: result.trackingToken, queueNumber: result.queueNumber, status: "waiting", delivery: false, deliveryStatus: null }]);
          setPaymentCheck(null);
          setOrderPlaced(true);
          void refreshAccount();
          return;
        }
        if (result.status !== "awaiting_payment") {
          window.localStorage.removeItem(pendingPaymentStorageKey);
          setPaymentCheck((current) => current ? { ...current, state: "failed", message: result.message ?? "The GCash payment did not go through." } : current);
          return;
        }
        if (Date.now() - started > 90_000) setPaymentCheck((current) => current && current.state === "checking" ? { ...current, state: "slow" } : current);
      } catch (checkError) {
        console.error("Mobile menu: payment check failed", checkError);
      } finally {
        inFlight = false;
      }
    };
    void check();
    const intervalId = window.setInterval(() => void check(), 2500);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [checkingPayment, checkingToken, refreshAccount]);

  function returnToOrder() {
    if (paymentCheck?.cart.length) setCart(paymentCheck.cart);
    try { window.localStorage.removeItem(pendingPaymentStorageKey); } catch { /* storage unavailable */ }
    setPaymentCheck(null);
    setCartOpen(true);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/delivery", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: DeliveryInfo } | null) => { if (active && payload?.data) setDeliveryInfo(payload.data); })
      .catch(() => undefined);
    fetch("/api/discounts", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { data?: IdDiscountOption[]; vat?: VatSetting } | null) => { if (active && payload?.data) { setIdDiscountOptions(payload.data); if (payload.vat) setIdVat(payload.vat); } })
      .catch(() => undefined);
    let restored: SentCart | null = null;
    try {
      const stored = window.localStorage.getItem(sentCartStorageKey);
      const parsed = stored ? JSON.parse(stored) as Partial<SentCart> : null;
      if (parsed && typeof parsed.token === "string" && typeof parsed.code === "string") restored = { token: parsed.token, code: parsed.code, expiresAt: String(parsed.expiresAt ?? ""), discountName: String(parsed.discountName ?? "discount"), status: "waiting" };
    } catch {
      // Storage unavailable: nothing to restore.
    }
    let restoredCheck: string | null = null;
    try { restoredCheck = window.localStorage.getItem(idCheckStorageKey); } catch { /* storage unavailable */ }
    const timer = restored || restoredCheck ? window.setTimeout(() => {
      if (restored) setSentCart(restored);
      if (restoredCheck && /^[0-9a-f-]{36}$/i.test(restoredCheck)) setIdCheck({ token: restoredCheck, status: "pending", rejectReason: null, discountName: null, holderName: null, breakdown: null, problem: null });
    }, 0) : undefined;
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, []);

  // Follows an ID photo until the café decides (a restored one is asked once to learn where it is).
  const checkingIdToken = idCheck?.status === "pending" ? idCheck.token : null;
  useEffect(() => {
    if (!checkingIdToken) return;
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/id-verifications/${checkingIdToken}`, { cache: "no-store" });
        if (!active) return;
        if (response.status === 404) { try { window.localStorage.removeItem(idCheckStorageKey); } catch { /* storage unavailable */ } setIdCheck(null); return; }
        const payload = await response.json() as { data?: Omit<IdCheckState, "token"> };
        if (!response.ok || !payload.data) return;
        const result = payload.data;
        if (result.status !== "pending" && result.status !== "approved") { try { window.localStorage.removeItem(idCheckStorageKey); } catch { /* storage unavailable */ } }
        if (result.status === "used") { setIdCheck(null); return; }
        setIdCheck((current) => current && current.token === checkingIdToken ? { ...current, ...result } : current);
      } catch (checkError) {
        console.error("Mobile menu: ID check status failed", checkError);
      }
    };
    void check();
    const intervalId = window.setInterval(() => void check(), 3000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [checkingIdToken]);

  // Follows a cart sent to the counter until the cashier makes it an order (then it is tracked
  // like any order), or it is cancelled or expires.
  const sentToken = sentCart?.status === "waiting" ? sentCart.token : null;
  useEffect(() => {
    if (!sentToken) return;
    let active = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/counter-carts/${sentToken}`, { cache: "no-store" });
        const payload = await response.json() as { data?: { status: string; queueNumber: number | null; queueStatus: string | null; expiresAt: string } };
        if (!active) return;
        if (response.status === 404) { setSentCart(null); try { window.localStorage.removeItem(sentCartStorageKey); } catch { /* storage unavailable */ } return; }
        const result = payload.data;
        if (!response.ok || !result) return;
        if (result.status === "ordered") {
          try { window.localStorage.removeItem(sentCartStorageKey); } catch { /* storage unavailable */ }
          setCart([]); setClaimIdType(null); setServiceType("dine_in"); setSentCart(null); setCartOpen(false);
          const status: OrderStatus = result.queueStatus === "served" ? "served" : "waiting";
          setTrackedOrders((current) => current.some((order) => order.trackingToken === sentToken) ? current : [...current, { trackingToken: sentToken, queueNumber: result.queueNumber, status }]);
          setOrderPlaced(true);
          void refreshAccount();
          return;
        }
        if (result.status === "expired" || result.status === "cancelled") {
          try { window.localStorage.removeItem(sentCartStorageKey); } catch { /* storage unavailable */ }
          setSentCart((current) => current ? { ...current, status: result.status as SentCart["status"] } : current);
        }
      } catch (checkError) {
        console.error("Mobile menu: sent cart check failed", checkError);
      }
    };
    void check();
    const intervalId = window.setInterval(() => void check(), 4000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [sentToken, refreshAccount]);

  useEffect(() => {
    let active = true;
    fetch("/api/products", { cache: "default" })
      .then(async (response) => {
        const payload = await response.json() as { data?: Product[]; storeOpen?: boolean; payment?: PaymentConfig; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load the menu.");
        if (active) {
          setProducts(payload.data ?? []);
          setStoreOpen(payload.storeOpen !== false);
          if (payload.payment) setPaymentConfig(payload.payment);
        }
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

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category).filter(Boolean))), [products]);
  const favoriteIds = useMemo(() => customer.account?.favorites ?? [], [customer.account]);
  const lowestPrice = (product: Product) => { const prices = (product.variants ?? []).map((variant) => variant.price); return prices.length ? Math.min(...prices) : product.price; };
  // What the list shows: the chip, the search, and the filter sheet (temperature, sort, available only).
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = products.filter((product) => {
      if (category === FAVORITES ? !favoriteIds.includes(product.id) : category !== null && product.category !== category) return false;
      if (query && !`${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query)) return false;
      if (tempFilter !== "any" && !(product.variants ?? []).some((variant) => variant.temperature === tempFilter || variant.temperature === "both")) return false;
      if (availableOnly && product.variants?.length && !product.variants.some((variant) => variant.available)) return false;
      return true;
    });
    if (category === FAVORITES && sortBy === "menu") return list.sort((a, b) => favoriteIds.indexOf(a.id) - favoriteIds.indexOf(b.id));
    if (sortBy !== "menu") return list.sort((a, b) => (lowestPrice(a) - lowestPrice(b)) * (sortBy === "low" ? 1 : -1));
    return list;
  }, [availableOnly, category, favoriteIds, products, search, sortBy, tempFilter]);
  // Grouped by category on "All" in menu order; one plain list otherwise.
  const groupedProducts = useMemo(() => {
    if (category !== null || sortBy !== "menu") return [["", visibleProducts]] as [string, Product[]][];
    const groups = new Map<string, Product[]>();
    visibleProducts.forEach((product) => {
      const group = product.category || "Other";
      groups.set(group, [...(groups.get(group) ?? []), product]);
    });
    return Array.from(groups);
  }, [category, sortBy, visibleProducts]);
  const featuredProducts = useMemo(() => products.filter((product) => product.featured).sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0)), [products]);
  const filtersOn = tempFilter !== "any" || sortBy !== "menu" || availableOnly;
  const showFeatured = category === null && !search.trim() && !filtersOn && featuredProducts.length > 0;
  useEffect(() => {
    if (!addedNote) return;
    const timer = window.setTimeout(() => setAddedNote(""), 2600);
    return () => window.clearTimeout(timer);
  }, [addedNote]);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  // The items in the cart; cartTotal (what the customer pays, after a reward discount) comes after the discount below.
  const cartItemsTotal = cart.reduce((total, item) => total + (item.price + item.additions.reduce((additionTotal, addition) => additionTotal + addition.price, 0)) * item.quantity, 0);
  const activeOrders = useMemo(() => trackedOrders.filter((order) => order.status !== "flushed"), [trackedOrders]);
  const activeOrder = activeOrders.length > 0;
  const selectedProductVariants = useMemo(() => sortVariants(selectedProduct?.variants ?? []), [selectedProduct]);

  function getCartLimit(item: Pick<CartItem, "ingredients" | "additions">, currentCart: CartItem[], candidateKey: string) {
    const usedByOthers = new Map<number, number>();
    currentCart.filter((entry) => entry.key !== candidateKey).forEach((entry) => {
      entry.ingredients.forEach((ingredient) => usedByOthers.set(ingredient.inventoryId, (usedByOthers.get(ingredient.inventoryId) ?? 0) + ingredient.requiredQuantity * entry.quantity));
      entry.additions.forEach((addition) => usedByOthers.set(addition.inventoryId, (usedByOthers.get(addition.inventoryId) ?? 0) + addition.quantity * entry.quantity));
    });

    const resources = new Map<number, { available: number; required: number }>();
    item.ingredients.forEach((ingredient) => {
      const current = resources.get(ingredient.inventoryId) ?? { available: ingredient.availableQuantity, required: 0 };
      resources.set(ingredient.inventoryId, { available: Math.min(current.available, ingredient.availableQuantity), required: current.required + ingredient.requiredQuantity });
    });
    item.additions.forEach((addition) => {
      const current = resources.get(addition.inventoryId) ?? { available: addition.availableQuantity, required: 0 };
      resources.set(addition.inventoryId, { available: Math.min(current.available, addition.availableQuantity), required: current.required + addition.quantity });
    });

    if (resources.size === 0) return Number.MAX_SAFE_INTEGER;
    const limit = Math.min(...Array.from(resources.entries()).map(([inventoryId, resource]) => (
      (resource.available - (usedByOthers.get(inventoryId) ?? 0)) / resource.required
    )));
    return Math.max(0, Math.floor(limit));
  }

  function additionAvailable(addition: Addition, quantity: number, currentCart: CartItem[], candidateIngredients: Ingredient[] = [], selectedAdditions: Addition[] = []) {
    const candidate: Pick<CartItem, "ingredients" | "additions"> = {
      ingredients: candidateIngredients,
      additions: [...selectedAdditions, addition],
    };
    return getCartLimit(candidate, currentCart, "") >= quantity;
  }

  // Nothing to choose: one option (available) and no add-ons. + adds these at once; anything else
  // opens the item sheet, so a size or temperature is never picked for the customer.
  const isSimple = (product: Product) => (product.additions ?? []).length === 0 && (product.variants ?? []).filter((variant) => variant.available).length <= 1;
  function quickAdd(product: Product) {
    const variant = sortVariants(product.variants ?? []).find((option) => option.available && getCartLimit({ ingredients: option.ingredients, additions: [] }, cart, `${product.id}-${option.id}-`) >= 1);
    if (!variant) { openProduct(product); return; }
    const key = `${product.id}-${variant.id}-`;
    setCart((current) => current.some((item) => item.key === key)
      ? current.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { key, product, variantId: variant.id, variantName: variant.size ?? "Regular", price: variant.price, quantity: 1, ingredients: variant.ingredients, additions: [] }]);
    setAddedNote(`${product.name} added`);
  }

  // Opens the item sheet for a new line, or with a cart line's choices to change them.
  function openProduct(product: Product, line?: CartItem) {
    setSelectedProduct(product);
    const sortedVariants = sortVariants(product.variants ?? []);
    setSelectedVariantId(line?.variantId ?? sortedVariants.find((variant) => variant.available)?.id ?? sortedVariants[0]?.id ?? null);
    setSelectedQuantity(line?.quantity ?? 1);
    setSelectedAdditionIds(line ? line.additions.map((addition) => addition.id) : []);
    setEditingKey(line?.key ?? null);
    if (line) setCartOpen(false);
  }
  function closeProduct() {
    const wasEditing = editingKey !== null;
    setSelectedProduct(null);
    setEditingKey(null);
    if (wasEditing) setCartOpen(true);
  }

  function addToCart() {
    if (!selectedProduct) return;
    const variant = selectedProduct.variants?.find((item) => item.id === selectedVariantId);
    const price = variant?.price ?? selectedProduct.price;
    const selectedAdditions = (selectedProduct.additions ?? []).filter((addition) => selectedAdditionIds.includes(addition.id));
    const key = `${selectedProduct.id}-${variant?.id ?? "regular"}-${[...selectedAdditionIds].sort((a, b) => a - b).join(",")}`;
    const others = editingKey ? cart.filter((item) => item.key !== editingKey) : cart;
    if (variant) {
      const limit = getCartLimit({ ingredients: variant.ingredients, additions: selectedAdditions }, others, key);
      if (!variant.available || selectedQuantity > limit) return;
    }
    // Editing replaces the line; the same choices as another line join it.
    setCart(() => {
      const existing = others.find((item) => item.key === key);
      if (existing) return others.map((item) => item.key === key ? { ...item, quantity: item.quantity + selectedQuantity } : item);
      const line = { key, product: selectedProduct, variantId: variant?.id ?? null, variantName: variant?.size ?? "Regular", price, quantity: selectedQuantity, ingredients: variant?.ingredients ?? [], additions: selectedAdditions };
      const at = editingKey ? cart.findIndex((item) => item.key === editingKey) : -1;
      return at >= 0 ? [...others.slice(0, at), line, ...others.slice(at)] : [...others, line];
    });
    const wasEditing = editingKey !== null;
    setSelectedProduct(null);
    setEditingKey(null);
    if (wasEditing) setCartOpen(true);
    else setAddedNote(`${selectedQuantity > 1 ? `${selectedQuantity} × ` : ""}${selectedProduct.name} added`);
  }

  function updateCartItem(key: string, change: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.key !== key) return [item];
      const quantity = item.quantity + change;
      if (quantity <= 0) return [];
      if (item.rewardId && change > 0) return [item];
      const variant = item.product.variants?.find((candidate) => candidate.id === item.variantId);
      if (change > 0 && variant && quantity > getCartLimit({ ingredients: variant.ingredients, additions: item.additions }, current, key)) return [item];
      return [{ ...item, quantity }];
    }));
  }

  // Stars: the customer's balance, what rewards in the cart use, and adding a reward item.
  const loyalty = customer.account?.loyalty ?? null;
  const starsInCart = cart.reduce((total, item) => total + (item.rewardCost ?? 0), 0) + (discountReward && discountReward.kind !== "birthday" ? discountReward.starsCost : 0);
  const birthdayInCart = cart.some((item) => item.rewardBirthday) || discountReward?.kind === "birthday";
  const pickableRewards = usableRewards(loyalty).filter((reward) => reward.kind !== "birthday" || !birthdayInCart);
  // The discount on this cart (the server has the final say): minimum order, the items it
  // applies to, % or ₱, its cap.
  const discountPreview = (() => {
    const reward = discountReward;
    if (!reward || !reward.discountKind || !reward.discountValue) return { amount: 0, problem: null as string | null };
    const lineTotal = (item: CartItem) => (item.price + item.additions.reduce((sum, addition) => sum + addition.price, 0)) * item.quantity;
    const all = cart.reduce((sum, item) => sum + lineTotal(item), 0);
    if (reward.minOrderAmount && all + 0.005 < reward.minOrderAmount) return { amount: 0, problem: `Needs an order of at least ₱${reward.minOrderAmount.toFixed(2)}.` };
    const eligible = cart.filter((item) => !item.rewardId && (reward.productId !== null ? item.product.id === reward.productId : !reward.category || item.product.category === reward.category)).reduce((sum, item) => sum + lineTotal(item), 0);
    if (eligible <= 0) return { amount: 0, problem: `Add ${reward.category ? `a ${reward.category} item` : "an item it applies to"} first.` };
    let amount = reward.discountKind === "percent" ? eligible * Number(reward.discountValue) / 100 : Number(reward.discountValue);
    if (reward.maxDiscount) amount = Math.min(amount, Number(reward.maxDiscount));
    return { amount: Math.round(Math.min(amount, eligible) * 100) / 100, problem: null as string | null };
  })();
  const cartTotal = Math.max(0, Math.round((cartItemsTotal - discountPreview.amount) * 100) / 100);
  function pickReward(reward: LoyaltyReward) {
    if (reward.rewardType === "discount") setDiscountReward(reward);
    else setRewardPick(reward);
  }
  const starsLeft = (loyalty?.balance ?? 0) - starsInCart;
  function addRewardItem(product: Product, variant: Variant, reward: LoyaltyReward) {
    rewardLineId.current += 1;
    const key = `reward-${reward.id}-${variant.id}-${rewardLineId.current}`;
    if (!variant.available || getCartLimit({ ingredients: variant.ingredients, additions: [] }, cart, key) < 1) return;
    setCart((current) => [...current, { key, product, variantId: variant.id, variantName: variant.size ?? "Regular", price: 0, quantity: 1, ingredients: variant.ingredients, additions: [], rewardId: reward.id, rewardName: reward.name, rewardCost: reward.kind === "birthday" ? 0 : reward.starsCost, rewardBirthday: reward.kind === "birthday" }]);
    setRewardPick(null);
  }

  // "Use your stars" in the cart (also on an empty cart, for customers who only want their reward).
  const starsSection = loyalty && pickableRewards.length + (discountReward ? 1 : 0) > 0 ? <div className="cart-stars">
    <div className="cart-stars-head"><strong>{loyalty.campaign ? "Use your stars" : "Your birthday treat"}</strong>{loyalty.campaign && <span>★ {starsLeft} left</span>}</div>
    <div className="cart-stars-list">{pickableRewards.map((reward) => {
      const birthdayTreat = reward.kind === "birthday";
      const blocked = reward.rewardType === "discount" && discountReward !== null && discountReward.id !== reward.id;
      return <button key={reward.id} type="button" disabled={blocked || (!birthdayTreat && reward.starsCost > starsLeft)} onClick={() => pickReward(reward)}><span>{birthdayTreat ? "🎂 " : ""}{reward.name}{reward.rewardType === "discount" ? ` · ${discountText(reward)}` : ""}</span><b>{birthdayTreat ? "Free" : `★ ${reward.starsCost}`}</b></button>;
    })}</div>
  </div> : null;

  // Rewards and ID discounts don't go together (one discount per order).
  const rewardsInCart = cart.some((item) => item.rewardId) || discountReward !== null;
  const claiming = claimIdType !== null && !rewardsInCart;

  async function sendToCounter() {
    const orderItems = cart.filter((item) => item.variantId !== null).map((item) => ({ product_variant_id: item.variantId, quantity: item.quantity, addition_ids: item.additions.map((addition) => addition.id) }));
    setPlacingOrder(true);
    setOrderError("");
    try {
      const response = await fetch("/api/counter-carts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: orderItems, service_type: serviceType, discount_type_id: claimIdType }) });
      const payload = await response.json() as { data?: { token: string; code: string; expiresAt: string; discountName: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "Could not send your order to the counter.");
      const sent: SentCart = { ...payload.data, status: "waiting" };
      try { window.localStorage.setItem(sentCartStorageKey, JSON.stringify(sent)); } catch { /* storage unavailable: the code shows until the page is closed */ }
      setSentCart(sent);
      setCartOpen(false);
    } catch (sendError) {
      setOrderError(sendError instanceof Error ? sendError.message : "Could not send your order to the counter.");
    } finally {
      setPlacingOrder(false);
    }
  }

  const savedId = customer.account?.savedId ?? null;
  const savedIdUsable = savedId !== null && idDiscountOptions.some((option) => option.id === savedId.typeId);
  const idMode = (claimMode === "saved" && !savedIdUsable) || (claimMode === "counter" && serviceType === "delivery") ? "photo" : claimMode;
  const activeIdRule = idDiscountOptions.find((option) => option.id === (idMode === "saved" && savedId ? savedId.typeId : claimIdType)) ?? null;
  const idPayLabel = paymentConfig.method === "gcash" ? "Pay with GCash" : "Send order";
  const idOrderItems = () => cart.filter((item) => item.variantId !== null).map((item) => ({ product_variant_id: item.variantId, quantity: item.quantity, addition_ids: item.additions.map((addition) => addition.id) }));
  const idSheetLines = cart.filter((item) => item.variantId !== null).map((item) => ({ label: `${item.product.name} · ${item.variantName}${item.additions.length ? ` + ${item.additions.map((addition) => addition.name).join(", ")}` : ""}`, qty: item.quantity, unit: item.price + item.additions.reduce((sum, addition) => sum + addition.price, 0) }));

  function forgetIdCheck() {
    try { window.localStorage.removeItem(idCheckStorageKey); } catch { /* storage unavailable */ }
    setIdCheck(null);
  }

  // Pays an order with an ID discount the café approved (verification_token) or the saved ID
  // (saved_id): GCash when it is set up, otherwise the order goes straight to the café.
  async function payWithIdDiscount(extra: { verification_token: string } | { saved_id: IdCoverage }) {
    const body = JSON.stringify({ items: idOrderItems(), service_type: serviceType, delivery: deliveryBody, ...extra });
    if (paymentConfig.method === "gcash" && !payCod) {
      const response = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const payload = await response.json() as { data?: { token: string; redirectUrl: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "Could not start the GCash payment.");
      try { window.localStorage.setItem(pendingPaymentStorageKey, JSON.stringify({ token: payload.data.token, cart })); } catch { /* storage unavailable: the return link still carries the reference */ }
      window.location.assign(payload.data.redirectUrl);
      return;
    }
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const payload = await response.json() as { data?: { trackingToken: string; queueNumber: number }; error?: string };
    if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to place order.");
    const placed = payload.data;
    setCart([]); setClaimIdType(null); setServiceType("dine_in"); setCartOpen(false); setIdSheet(null);
    forgetIdCheck();
    setTrackedOrders((current) => [...current, { trackingToken: placed.trackingToken, queueNumber: placed.queueNumber, status: "waiting", delivery: isDelivery, deliveryStatus: isDelivery ? "preparing" : null }]);
    setOrderPlaced(true);
    void refreshAccount();
  }

  async function sendIdPhoto(details: { holderName: string; idNumber: string; coverage: IdCoverage; photo: string; remember: boolean }) {
    const response = await fetch("/api/id-verifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: idOrderItems(), service_type: serviceType, discount_type_id: claimIdType, holder_name: details.holderName, id_number: details.idNumber, coverage: details.coverage, remember: details.remember, consent: true, photo: details.photo }) });
    const payload = await response.json() as { data?: { token: string }; error?: string };
    if (!response.ok || !payload.data) throw new Error(payload.error || "Could not send your ID.");
    try { window.localStorage.setItem(idCheckStorageKey, payload.data.token); } catch { /* storage unavailable: followed until the page is closed */ }
    setIdSheet(null);
    setCartOpen(false);
    setIdCheck({ token: payload.data.token, status: "pending", rejectReason: null, discountName: activeIdRule?.name ?? null, holderName: details.holderName, breakdown: null, problem: null });
  }

  async function payApproved() {
    if (!idCheck) return;
    setIdPaying(true);
    try {
      await payWithIdDiscount({ verification_token: idCheck.token });
    } catch (payError) {
      setIdCheck((current) => current ? { ...current, problem: payError instanceof Error ? payError.message : "Could not start the payment." } : current);
    } finally {
      setIdPaying(false);
    }
  }

  async function cancelIdCheck(then: "cart" | "counter" | "retry" | "plain") {
    if (idCheck && (idCheck.status === "pending" || idCheck.status === "approved")) {
      await fetch(`/api/id-verifications/${idCheck.token}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }).catch(() => undefined);
    }
    forgetIdCheck();
    if (then === "counter") { setClaimMode("counter"); setCartOpen(true); }
    else if (then === "retry") { setClaimMode("photo"); setIdSheet("photo"); }
    else if (then === "plain") { setClaimIdType(null); setCartOpen(true); }
    else setCartOpen(true);
  }

  async function cancelSentCart() {
    if (!sentCart) return;
    setSentCartBusy(true);
    try {
      const response = await fetch(`/api/counter-carts/${sentCart.token}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      if (response.status === 409) return; // The cashier already has it: the check picks up the order.
      try { window.localStorage.removeItem(sentCartStorageKey); } catch { /* storage unavailable */ }
      setSentCart(null);
      setCartOpen(true);
    } finally {
      setSentCartBusy(false);
    }
  }

  // Delivery in the cart: the address (the default one unless another is picked), the fee (free at
  // or above the free delivery amount), the zone's minimum, and whether cash on delivery is open to
  // this customer. The server checks all of it again.
  const isDelivery = serviceType === "delivery";
  const deliveryAddresses = (customer.account?.addresses ?? []).filter((address) => address.zoneActive);
  const chosenAddress = deliveryAddresses.find((address) => address.id === deliveryAddressId) ?? deliveryAddresses.find((address) => address.isDefault) ?? deliveryAddresses[0] ?? null;
  const chosenZone = deliveryInfo?.zones.find((zone) => zone.id === chosenAddress?.zoneId) ?? null;
  const deliveryFee = isDelivery && chosenZone ? (deliveryInfo?.freeAbove && cartTotal + 0.005 >= deliveryInfo.freeAbove ? 0 : chosenZone.fee) : 0;
  const orderTotal = Math.round((cartTotal + deliveryFee) * 100) / 100;
  const minimumShort = isDelivery && chosenZone?.minOrder ? Math.max(0, chosenZone.minOrder - cartItemsTotal) : 0;
  const codProblem = !deliveryInfo?.cod.enabled ? "Not offered by the café"
    : customer.account?.codBlocked ? "Not available for your account"
      : (customer.account?.completedOrders ?? 0) < deliveryInfo.cod.minOrders ? `Opens after ${deliveryInfo.cod.minOrders} completed order${deliveryInfo.cod.minOrders === 1 ? "" : "s"}`
        : orderTotal > deliveryInfo.cod.maxAmount + 0.005 ? `For orders up to ₱${deliveryInfo.cod.maxAmount.toFixed(2)}`
          : null;
  const payCod = isDelivery && deliveryPayment === "cod" && codProblem === null;
  const deliveryProblem = !isDelivery ? ""
    : !customer.account ? "Sign in to order delivery, so the café has your address and number."
      : !deliveryInfo?.enabled ? "Delivery isn't available right now."
        : !deliveryInfo.openNow ? `Delivery is available from ${deliveryInfo.hours?.start ?? ""} to ${deliveryInfo.hours?.end ?? ""}.`
          : !chosenAddress ? "Add a delivery address in your account first."
            : minimumShort > 0 ? `Delivery to ${chosenZone?.name ?? "this area"} starts at ₱${chosenZone?.minOrder?.toFixed(2)} of items. Add ₱${minimumShort.toFixed(2)} more.`
              : "";
  const deliveryBody = isDelivery && chosenAddress ? { address_id: chosenAddress.id, payment: payCod ? "cod" : "gcash" } : undefined;

  async function submitOrder() {
    if (cart.length === 0) return;
    if (deliveryProblem) { setOrderError(deliveryProblem); return; }
    if (claiming) {
      if (idMode === "counter") await sendToCounter();
      else setIdSheet(idMode);
      return;
    }
    setPlacingOrder(true);
    setOrderError("");
    if (discountPreview.problem) { setOrderError(discountPreview.problem); setPlacingOrder(false); return; }
    const orderItems = cart.filter((item) => item.variantId !== null).map((item) => ({ product_variant_id: item.variantId, quantity: item.quantity, addition_ids: item.additions.map((addition) => addition.id), reward_id: item.rewardId ?? null }));
    const discountRewardId = discountReward?.id ?? null;
    // Rewards can make the whole order free: nothing to pay, so it goes straight to the café.
    if (paymentConfig.method === "gcash" && orderTotal > 0 && !payCod) {
      try {
        const response = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: orderItems, discount_reward_id: discountRewardId, service_type: serviceType, delivery: deliveryBody }) });
        const payload = await response.json() as { data?: { token: string; redirectUrl: string }; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "Could not start the GCash payment.");
        try { window.localStorage.setItem(pendingPaymentStorageKey, JSON.stringify({ token: payload.data.token, cart })); } catch { /* storage unavailable: the return link still carries the reference */ }
        window.location.assign(payload.data.redirectUrl);
      } catch (paymentError) {
        setOrderError(paymentError instanceof Error ? paymentError.message : "Could not start the GCash payment.");
        setPlacingOrder(false);
      }
      return;
    }
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: orderItems, discount_reward_id: discountRewardId, service_type: serviceType, delivery: deliveryBody }),
      });
      const payload = await response.json() as { data?: { trackingToken: string; queueNumber: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to place order.");
      setCart([]); setDiscountReward(null); setServiceType("dine_in");
      setCartOpen(false);
      if (payload.data?.trackingToken) {
        setTrackedOrders((current) => [...current, {
          trackingToken: payload.data?.trackingToken ?? "",
          queueNumber: payload.data?.queueNumber ?? null,
          status: "waiting",
          delivery: isDelivery,
          deliveryStatus: isDelivery ? "preparing" : null,
        }]);
      }
      setOrderPlaced(true);
      void refreshAccount();
    } catch (submitError) {
      setOrderError(submitError instanceof Error ? submitError.message : "Unable to place order.");
    } finally {
      setPlacingOrder(false);
    }
  }

  useEffect(() => {
    if (!activeOrder) return;
    let active = true;
    let requestInFlight = false;
    const checkStatus = async () => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      try {
        const results = await Promise.all(activeOrders.map(async (order) => {
          const response = await fetch(`/api/orders/${order.trackingToken}`, { cache: "no-store" });
          const payload = await response.json() as { data?: { queue_status: OrderStatus; service_type?: string | null; delivery_status?: string | null }; error?: string };
          if (response.status === 404) {
            return { trackingToken: order.trackingToken, missing: true as const };
          }
          if (!response.ok) throw new Error(payload.error || "Unable to check order status.");
          return { trackingToken: order.trackingToken, status: payload.data?.queue_status ?? order.status, deliveryStatus: payload.data?.delivery_status ?? null, delivery: payload.data?.service_type === "delivery", missing: false as const };
        }));
        if (active) {
          setTrackedOrders((current) => {
            let newlyReady = false;
            const updatedOrders = current
              .map((order): TrackedOrder | null => {
                const update = results.find((result) => result.trackingToken === order.trackingToken);
                if (!update || update.missing) return null;
                if (update.delivery ? update.deliveryStatus === "out" && order.deliveryStatus !== "out" : update.status === "served" && order.status !== "served") newlyReady = true;
                return { ...order, status: update.status, delivery: update.delivery, deliveryStatus: update.deliveryStatus };
              })
              .filter((order): order is TrackedOrder => order !== null && order.status !== "flushed");
            if (newlyReady) {
              playReadyPing();
              setOrderPlaced(true);
            }
            if (updatedOrders.length === 0) setOrderPlaced(false);
            return updatedOrders;
          });
        }
      } catch (statusError) {
        console.error("Mobile order status check failed", statusError);
      } finally {
        requestInFlight = false;
      }
    };
    void checkStatus();
    const intervalId = window.setInterval(() => void checkStatus(), 10_000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [activeOrder, activeOrders]);

  const priceText = (product: Product) => { const prices = (product.variants ?? []).map((variant) => variant.price); const low = lowestPrice(product); return prices.length > 1 && prices.some((price) => price !== low) ? `from ₱${low.toFixed(2)}` : `₱${low.toFixed(2)}`; };
  const soldOut = (product: Product) => Boolean(product.variants?.length && !product.variants.some((variant) => variant.available));
  // How many of each product are in the cart (the card shows it).
  const inCart = useMemo(() => {
    const counts = new Map<number, number>();
    cart.forEach((item) => counts.set(item.product.id, (counts.get(item.product.id) ?? 0) + item.quantity));
    return counts;
  }, [cart]);
  // The same card everywhere (featured row and menu grid): tap it to open the item sheet; + adds at
  // once when there is nothing to choose, otherwise it opens the sheet too.
  const productCard = (product: Product, where: "row" | "grid") => {
    const out = soldOut(product);
    const count = inCart.get(product.id) ?? 0;
    return <article className={`bh-card${out ? " is-out" : ""}${where === "row" ? " is-row" : ""}`} key={`${where}-${product.id}`}>
      <button type="button" className="bh-card-open" disabled={out} onClick={() => openProduct(product)} aria-label={`${product.name}, ${out ? "sold out" : priceText(product)}`}>
        <span className="bh-card-photo">
          {product.image ? <Image src={product.image} alt="" fill unoptimized sizes="(max-width: 560px) 50vw, 260px" style={{ objectFit: "cover" }} /> : <span className="bh-placeholder"><IconCoffee /></span>}
          {product.badge && <span className="bh-badge">★ {product.badge}</span>}
          {out && <span className="bh-soldout">Sold out</span>}
          {count > 0 && <span className="bh-incart">{count} in cart</span>}
        </span>
        <span className="bh-card-body">
          <strong>{product.name}</strong>
          {product.description && <small>{product.description}</small>}
          <b>{out ? "Sold out" : priceText(product)}</b>
        </span>
      </button>
      {!out && <button type="button" className="bh-plus" onClick={() => (isSimple(product) ? quickAdd(product) : openProduct(product))} aria-label={isSimple(product) ? `Add ${product.name} to cart` : `Choose options for ${product.name}`}>+</button>}
    </article>;
  };

  // The item sheet: temperature, size, add-ons and quantity; adds a new line or updates the one
  // being edited from the cart.
  const sheetVariants = selectedProductVariants;
  const sheetVariant = sheetVariants.find((variant) => variant.id === selectedVariantId) ?? null;
  const temperatureOf = (variant: Variant | null) => (variant?.temperature === "hot" ? "hot" : variant?.temperature === "cold" ? "cold" : null);
  const sheetTemperatures = Array.from(new Set(sheetVariants.map(temperatureOf)));
  const hasTemperatureChoice = sheetTemperatures.length > 1 && !sheetTemperatures.includes(null);
  const shownVariants = hasTemperatureChoice ? sheetVariants.filter((variant) => temperatureOf(variant) === temperatureOf(sheetVariant)) : sheetVariants;
  const showSizes = shownVariants.length > 1 || (shownVariants.length === 1 && Boolean(shownVariants[0].size) && shownVariants[0].size !== "Regular" && selectedProduct?.productType !== "stock");
  function chooseTemperature(temperature: "hot" | "cold") {
    const options = sheetVariants.filter((variant) => temperatureOf(variant) === temperature);
    const next = options.find((variant) => variant.size === sheetVariant?.size && variant.available) ?? options.find((variant) => variant.available) ?? options[0];
    if (next) setSelectedVariantId(next.id);
  }
  const sheetAdditions = (selectedProduct?.additions ?? []).filter((addition) => selectedAdditionIds.includes(addition.id));
  const sheetCartWithoutEdit = editingKey ? cart.filter((item) => item.key !== editingKey) : cart;
  const sheetLimit = sheetVariant ? Math.min(sheetVariant.maxQuantity || Number.MAX_SAFE_INTEGER, getCartLimit({ ingredients: sheetVariant.ingredients, additions: sheetAdditions }, sheetCartWithoutEdit, "")) : Number.MAX_SAFE_INTEGER;
  const sheetUnit = (sheetVariant?.price ?? selectedProduct?.price ?? 0) + sheetAdditions.reduce((sum, addition) => sum + addition.price, 0);
  const sheetBlocked = Boolean(selectedProduct?.variants?.length && (!sheetVariant?.available || selectedQuantity > sheetLimit));

  const serviceOptions = [
    { value: "dine_in" as const, label: "Dine in", Icon: IconDineIn, note: "" },
    { value: "take_out" as const, label: "Take Out", Icon: IconTakeOut, note: "" },
    { value: "delivery" as const, label: "Delivery", Icon: IconDelivery, note: !deliveryInfo?.enabled ? "Unavailable" : !deliveryInfo.openNow ? "Closed now" : "" },
  ];
  const serviceLabel = serviceOptions.find((option) => option.value === serviceType)?.label ?? "Dine in";
  const serviceSwitch = (where: "page" | "cart") => <div className={`bh-service${where === "cart" ? " is-cart" : ""}`} role="radiogroup" aria-label="How you're ordering">
    {serviceOptions.map(({ value, label, Icon, note }) => {
      const off = value === "delivery" && !deliveryInfo?.enabled;
      return <button key={value} type="button" role="radio" aria-checked={serviceType === value} aria-disabled={off} className={off ? "is-off" : ""} onClick={() => { if (!off) setServiceType(value); }}>
        <Icon /><span>{label}{note && <small>{note}</small>}</span>
      </button>;
    })}
  </div>;

  // The order in progress, shown as a pill above the cart bar (and in the header).
  const latestOrder = activeOrders[activeOrders.length - 1] ?? null;
  const orderPillText = !latestOrder ? "" : latestOrder.delivery
    ? ({ preparing: "Preparing", ready: "Packed", out: "On the way", delivered: "Delivered", failed: "Not delivered", cancelled: "Cancelled" } as Record<string, string>)[latestOrder.deliveryStatus ?? "preparing"] ?? "Preparing"
    : latestOrder.status === "served" ? "Ready for pickup" : "Preparing";
  const orderReady = latestOrder ? (latestOrder.delivery ? latestOrder.deliveryStatus === "out" || latestOrder.deliveryStatus === "delivered" : latestOrder.status === "served") : false;
  const sheetOpen = Boolean(selectedProduct || cartOpen || orderPlaced || rewardPick || accountOpen || idSheet || sentCart || paymentCheck);
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sheetOpen]);

  return <main className="bh-shell">
    <header className="bh-header">
      <div className="bh-brand"><Image src="/brand/badge.png" alt="" width={40} height={40} unoptimized priority /><span>Brew Houze Cafe</span></div>
      <div className="bh-header-actions">
        {activeOrder && <button type="button" className={`bh-orders-button${orderReady ? " is-ready" : ""}`} onClick={() => setOrderPlaced(true)} aria-label={`Your orders: ${activeOrders.length} in progress`}>
          <i aria-hidden="true" />#{latestOrder?.queueNumber ?? "—"}
        </button>}
        {!customer.loading && <AccountButton state={customer} onOpen={() => setAccountOpen(true)} />}
      </div>
    </header>

    <div className="bh-page">
      {!storeOpen && <div role="status" className="bh-closed"><strong>We&apos;re closed right now</strong>You can browse the menu. Ordering opens as soon as the café starts serving.</div>}

      <section className="bh-hello">
        <h1>{customer.account ? `Hi, ${customer.account.fullName.split(" ")[0]}!` : "Welcome to Brew Houze Cafe"}</h1>
        <p>Browse our menu and discover something made for your moment.</p>
      </section>

      {serviceSwitch("page")}

      <div className="bh-search-row">
        <label className="bh-search"><IconSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the menu" aria-label="Search the menu" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}</label>
        <button type="button" className={`bh-filter${filtersOn ? " is-on" : ""}`} aria-expanded={filterOpen} aria-label="Filter and sort" onClick={() => setFilterOpen((open) => !open)}><IconFilter />{filtersOn && <i aria-hidden="true" />}</button>
      </div>
      {filterOpen && <div className="bh-filters">
        <div><span>Temperature</span><div className="bh-segment">{([["any", "Any"], ["hot", "Hot"], ["cold", "Iced"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tempFilter === value} onClick={() => setTempFilter(value)}>{label}</button>)}</div></div>
        <div><span>Sort</span><div className="bh-segment">{([["menu", "Menu"], ["low", "Price ↑"], ["high", "Price ↓"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sortBy === value} onClick={() => setSortBy(value)}>{label}</button>)}</div></div>
        <label className="bh-check"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />Available only</label>
        {filtersOn && <button type="button" className="bh-reset" onClick={() => { setTempFilter("any"); setSortBy("menu"); setAvailableOnly(false); }}>Reset</button>}
      </div>}
    </div>

    <nav className="bh-chips" aria-label="Menu categories">
      <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>All</button>
      {favoriteIds.length > 0 && <button type="button" aria-pressed={category === FAVORITES} onClick={() => setCategory(FAVORITES)}>★ Favorites</button>}
      {categories.map((name) => <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
    </nav>

    <div className="bh-page">
      {loading && <div className="bh-empty">Loading the menu…</div>}
      {error && <div className="bh-empty is-error">{error}</div>}
      {!loading && !error && <>
        {showFeatured && <section className="bh-featured" aria-labelledby="featured-title">
          <h2 id="featured-title"><IconSparkle />Barista Featured Specials</h2>
          <div className="bh-row">{featuredProducts.map((product) => productCard(product, "row"))}</div>
        </section>}
        {category === FAVORITES && <p className="bh-note">What you order most, most first.</p>}
        {groupedProducts.map(([group, groupProducts]) => groupProducts.length > 0 && <section className="bh-group" key={group || "all"}>
          {group && <h2 className="bh-group-title">{group}</h2>}
          <div className="bh-grid">{groupProducts.map((product) => productCard(product, "grid"))}</div>
        </section>)}
        {visibleProducts.length === 0 && <div className="bh-empty">{category === FAVORITES ? "Your favorites appear here after you order." : "Nothing on the menu matches your search or filters."}</div>}
      </>}
      <footer className="bh-footer"><IconCoffee /><span>Made with care at Brew Houze</span></footer>
    </div>

    {/* The cart bar, and the order in progress above it. */}
    <div className="bh-dock">
      {addedNote && !sheetOpen && <div className="bh-added" role="status">✓ {addedNote}</div>}
      {activeOrder && !sheetOpen && <button type="button" className={`bh-order-pill${orderReady ? " is-ready" : ""}`} onClick={() => setOrderPlaced(true)}>
        <i aria-hidden="true" /><span>Order #{latestOrder?.queueNumber ?? "—"} · {orderPillText}</span>{activeOrders.length > 1 && <small>+{activeOrders.length - 1} more</small>}<b>View</b>
      </button>}
      {cartCount > 0 && !sheetOpen && <button type="button" className="bh-cartbar" onClick={() => setCartOpen(true)}>
        <span className="bh-cartbar-count">{cartCount}</span>
        <span className="bh-cartbar-text"><strong>View cart</strong><small>{serviceLabel}</small></span>
        <strong className="bh-cartbar-total">₱{cartTotal.toFixed(2)}</strong>
      </button>}
    </div>

    {selectedProduct && <div className="bh-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeProduct(); }}>
      <section className="bh-sheet bh-item" role="dialog" aria-modal="true" aria-label={selectedProduct.name}>
        <button type="button" className="bh-sheet-close is-floating" onClick={closeProduct} aria-label="Close">×</button>
        <div className="bh-sheet-scroll">
          <div className="bh-item-photo">{selectedProduct.image ? <Image src={selectedProduct.image} alt="" fill unoptimized sizes="560px" style={{ objectFit: "cover" }} /> : <span className="bh-placeholder"><IconCoffee /></span>}</div>
          <div className="bh-item-body">
            <p className="bh-eyebrow">{selectedProduct.category}</p>
            <h2>{selectedProduct.name}</h2>
            {selectedProduct.description && <p className="bh-item-desc">{selectedProduct.description}</p>}
            {hasTemperatureChoice && <div className="bh-option-block">
              <div className="bh-option-head"><strong>Temperature</strong></div>
              <div className="bh-temp" role="radiogroup" aria-label="Temperature">
                {(["hot", "cold"] as const).map((temperature) => {
                  const any = sheetVariants.some((variant) => temperatureOf(variant) === temperature && variant.available);
                  return <button key={temperature} type="button" role="radio" aria-checked={temperatureOf(sheetVariant) === temperature} disabled={!any} onClick={() => chooseTemperature(temperature)}>{temperature === "hot" ? "Hot" : "Iced"}</button>;
                })}
              </div>
            </div>}
            {showSizes && <div className="bh-option-block">
              <div className="bh-option-head"><strong>{selectedProduct.productType === "stock" ? "Option" : "Size"}</strong><span>Required</span></div>
              <div className="bh-sizes" role="radiogroup" aria-label="Size">
                {shownVariants.map((variant) => <button key={variant.id} type="button" role="radio" aria-checked={selectedVariantId === variant.id} disabled={!variant.available} onClick={() => setSelectedVariantId(variant.id)}>
                  <strong>{variant.size || "Regular"}{!hasTemperatureChoice && variant.temperature === "hot" ? " · Hot" : !hasTemperatureChoice && variant.temperature === "cold" ? " · Iced" : ""}</strong>
                  <span>{variant.available ? `₱${variant.price.toFixed(2)}` : "Unavailable"}</span>
                </button>)}
              </div>
            </div>}
            {(selectedProduct.additions ?? []).length > 0 && <div className="bh-option-block">
              <div className="bh-option-head"><strong>Add-ons</strong><span>Optional</span></div>
              <div className="bh-addons">{selectedProduct.additions?.map((addition) => {
                const chosen = selectedAdditionIds.includes(addition.id);
                const others = (selectedProduct.additions ?? []).filter((item) => item.id !== addition.id && selectedAdditionIds.includes(item.id));
                const available = chosen || additionAvailable(addition, selectedQuantity, sheetCartWithoutEdit, sheetVariant?.ingredients ?? [], others);
                return <button key={addition.id} type="button" role="checkbox" aria-checked={chosen} disabled={!available} onClick={() => setSelectedAdditionIds((current) => current.includes(addition.id) ? current.filter((id) => id !== addition.id) : [...current, addition.id])}>
                  <i aria-hidden="true">{chosen ? "✓" : ""}</i><span>{addition.name}</span><b>{available ? `+₱${addition.price.toFixed(2)}` : "Out of stock"}</b>
                </button>;
              })}</div>
            </div>}
          </div>
        </div>
        <div className="bh-sheet-foot">
          <div className="bh-stepper" aria-label="Quantity">
            <button type="button" onClick={() => setSelectedQuantity((value) => Math.max(1, value - 1))} disabled={selectedQuantity <= 1} aria-label="One less">−</button>
            <span>{selectedQuantity}</span>
            <button type="button" onClick={() => setSelectedQuantity((value) => value + 1)} disabled={selectedQuantity >= sheetLimit} aria-label="One more">+</button>
          </div>
          <button type="button" className="bh-primary" disabled={sheetBlocked} onClick={addToCart}>
            <span>{sheetBlocked && sheetVariant && sheetLimit === 0 ? "Out of stock" : editingKey ? "Update item" : "Add to cart"}</span><b>₱{(sheetUnit * selectedQuantity).toFixed(2)}</b>
          </button>
        </div>
      </section>
    </div>}

    {cartOpen && <div className="bh-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
      <section className="bh-sheet bh-cart" role="dialog" aria-modal="true" aria-label="Your cart">
        <div className="bh-sheet-head">
          <div><p className="bh-eyebrow">{serviceType === "take_out" ? "Take-out order" : serviceType === "delivery" ? "Delivery order" : "Dine-in order"}</p><h2>Your cart</h2></div>
          <button type="button" className="bh-sheet-close" onClick={() => setCartOpen(false)} aria-label="Close">×</button>
        </div>
        <div className="bh-sheet-scroll">
          {orderError && <p className="bh-error">{orderError}</p>}
          {cart.length === 0 ? <>
            <div className="bh-cart-empty"><IconCart /><strong>Your cart is empty</strong><span>Add something from the menu to start your order.</span><button type="button" className="bh-link" onClick={() => setCartOpen(false)}>Browse the menu</button></div>
            {starsSection}
          </> : <>
            <ul className="bh-lines">{cart.map((item) => {
              const unit = item.price + item.additions.reduce((sum, addition) => sum + addition.price, 0);
              return <li key={item.key}>
                <span className="bh-line-photo">{item.product.image ? <Image src={item.product.image} alt="" fill unoptimized sizes="56px" style={{ objectFit: "cover" }} /> : <IconCoffee />}</span>
                <span className="bh-line-main">
                  <strong>{item.product.name}</strong>
                  <small>{item.rewardId ? `🎁 Reward · ${item.rewardName}${item.rewardCost ? ` · ★ ${item.rewardCost}` : ""}` : `${item.variantName}${(() => { const variant = item.product.variants?.find((option) => option.id === item.variantId); return variant?.temperature === "hot" ? " · Hot" : variant?.temperature === "cold" ? " · Iced" : ""; })()}`}</small>
                  {item.additions.length > 0 && <small>+ {item.additions.map((addition) => addition.name).join(", ")}</small>}
                  <span className="bh-line-foot">
                    <b>{item.rewardId ? "Free" : `₱${(unit * item.quantity).toFixed(2)}`}</b>
                    {!item.rewardId && <button type="button" className="bh-link" onClick={() => openProduct(item.product, item)}>Edit</button>}
                  </span>
                </span>
                <span className="bh-stepper is-small">
                  <button type="button" onClick={() => updateCartItem(item.key, -1)} aria-label={item.quantity === 1 ? `Remove ${item.product.name}` : "One less"}>{item.quantity === 1 ? <IconTrash /> : "−"}</button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => updateCartItem(item.key, 1)} disabled={Boolean(item.rewardId)} aria-label="One more">+</button>
                </span>
              </li>;
            })}</ul>
            <button type="button" className="bh-add-more" onClick={() => setCartOpen(false)}>+ Add more items</button>

            <div className="bh-cart-section"><h3>How you&apos;re ordering</h3>{serviceSwitch("cart")}
              {isDelivery && <div className="cart-delivery">
                {!customer.account ? <p className="cart-delivery-note">Sign in to order delivery, so the café has your address and number. <button type="button" onClick={() => setAccountOpen(true)}>Sign in</button></p>
                  : deliveryAddresses.length === 0 ? <p className="cart-delivery-note">Add where the café should deliver. <button type="button" onClick={() => setAccountOpen(true)}>Add an address</button></p>
                    : chosenAddress && <>
                      <label className="cart-delivery-address"><span>Deliver to</span>
                        <select value={chosenAddress.id} onChange={(event) => setDeliveryAddressId(Number(event.target.value))}>{deliveryAddresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.street}</option>)}</select>
                      </label>
                      <small className="cart-delivery-detail">{chosenAddress.recipientName} · {chosenAddress.phone} · {chosenZone?.name ?? chosenAddress.zoneName}{chosenAddress.landmark ? ` · near ${chosenAddress.landmark}` : ""} · <button type="button" onClick={() => setAccountOpen(true)}>Manage</button></small>
                      <div className="cart-delivery-pay" role="radiogroup" aria-label="How you pay">
                        <button type="button" role="radio" aria-checked={!payCod} onClick={() => setDeliveryPayment("gcash")}><strong>GCash</strong><span>Pay now</span></button>
                        <button type="button" role="radio" aria-checked={payCod} disabled={codProblem !== null} onClick={() => setDeliveryPayment("cod")}><strong>Cash on delivery</strong><span>{codProblem ?? "Pay the rider"}</span></button>
                      </div>
                    </>}
                {deliveryInfo && !deliveryInfo.openNow && <p className="cart-delivery-note is-warning">Delivery is available from {deliveryInfo.hours?.start} to {deliveryInfo.hours?.end}.</p>}
                {minimumShort > 0 && <p className="cart-delivery-note is-warning">Delivery to {chosenZone?.name} starts at ₱{chosenZone?.minOrder?.toFixed(2)} of items. Add ₱{minimumShort.toFixed(2)} more.</p>}
              </div>}
            </div>

            {(starsSection || discountReward) && <div className="bh-cart-section"><h3>Rewards</h3>
              {starsSection}
              {discountReward && <div className="cart-discount"><span>🎁 {discountReward.name}<small>{discountPreview.problem ?? discountText(discountReward)}</small></span><strong>{discountPreview.amount ? `−₱${discountPreview.amount.toFixed(2)}` : "—"}</strong><button type="button" onClick={() => setDiscountReward(null)} aria-label="Remove discount">×</button></div>}
            </div>}

            {idDiscountOptions.length > 0 && <div className="bh-cart-section"><h3>Discount ID</h3>
              <div className={`cart-id-claim${claiming ? " is-on" : ""}`}>
                <label className="cart-id-toggle">
                  <input type="checkbox" checked={claiming} disabled={rewardsInCart} onChange={(event) => {
                    const on = event.target.checked;
                    setClaimIdType(on ? (savedIdUsable && savedId ? savedId.typeId : idDiscountOptions[0].id) : null);
                    if (on) setClaimMode(savedIdUsable ? "saved" : "photo");
                  }} />
                  <span><strong>{savedIdUsable && savedId ? `Use my ${savedId.typeName} discount` : "I have a discount ID"}</strong><small>{idDiscountOptions.map((option) => option.name).join(" · ")}</small></span>
                </label>
                {rewardsInCart ? <p className="cart-id-note">To use an ID discount, remove your star rewards first. One discount per order.</p>
                  : claiming && <>
                    <div className="cart-id-modes" role="radiogroup" aria-label="How to claim it">
                      {savedIdUsable && savedId && <button type="button" role="radio" aria-checked={idMode === "saved"} onClick={() => { setClaimMode("saved"); setClaimIdType(savedId.typeId); }}><strong>✓ My saved ID</strong><span>{savedId.holderName}{savedId.idEnding ? ` · ending ${savedId.idEnding}` : ""}</span></button>}
                      <button type="button" role="radio" aria-checked={idMode === "photo"} onClick={() => setClaimMode("photo")}><strong>📷 Photo of my ID</strong><span>The café checks it, you pay here</span></button>
                      {!isDelivery && <button type="button" role="radio" aria-checked={idMode === "counter"} onClick={() => setClaimMode("counter")}><strong>At the counter</strong><span>Show your ID, pay there</span></button>}
                    </div>
                    {idMode !== "saved" && <div className="cart-id-types" role="radiogroup" aria-label="Which discount">
                      {idDiscountOptions.map((option) => <button key={option.id} type="button" role="radio" aria-checked={claimIdType === option.id} onClick={() => setClaimIdType(option.id)}>{option.name}</button>)}
                    </div>}
                    <p className="cart-id-note">{idMode === "saved" ? "No photo needed. Show your ID when you pick up your order." : idMode === "photo" ? "Take a photo of your ID. The café checks it, usually within a minute, then you pay here. Show your ID when you pick up." : "Send your order to the counter, then show your code and your ID to the cashier and pay there."} The discount covers your own food and drinks.</p>
                  </>}
              </div>
            </div>}

            <div className="bh-cart-section bh-summary">
              <div><span>Items</span><b>₱{cartItemsTotal.toFixed(2)}</b></div>
              {discountPreview.amount > 0 && <div><span>Reward discount</span><b>−₱{discountPreview.amount.toFixed(2)}</b></div>}
              {isDelivery && chosenZone && <div><span>Delivery fee · {chosenZone.name}</span><b>{deliveryFee === 0 ? "Free" : `₱${deliveryFee.toFixed(2)}`}</b></div>}
              {isDelivery && deliveryInfo?.freeAbove && deliveryFee > 0 ? <small>Free delivery from ₱{deliveryInfo.freeAbove.toFixed(2)} of items.</small> : null}
              <div className="is-total"><span>{claiming ? "Before your discount" : "Total"}</span><strong>₱{orderTotal.toFixed(2)}</strong></div>
              <p className="bh-pay-note">{payCod && !claiming ? <>Pay <strong>₱{orderTotal.toFixed(2)} in cash</strong> when your order arrives. Exact change helps the rider.</> : claiming ? (idMode === "counter" ? <>The cashier takes off your discount and you pay at the counter (cash or GCash).</> : <>Your discount comes off in the next step.</>) : cartTotal === 0 && starsInCart > 0 ? <>Your stars cover this whole order (★ {starsInCart}). Nothing to pay: it goes straight to the café.</> : paymentConfig.method === "gcash" ? <>You&apos;ll pay with <strong>GCash</strong>. Your order goes to the café as soon as the payment goes through.{paymentConfig.testMode ? " (Test mode: no real money is charged.)" : ""}{paymentConfig.minimumAmount && cartTotal < paymentConfig.minimumAmount ? <strong style={{ display: "block", color: "#B91C1C" }}>GCash payments start at ₱{paymentConfig.minimumAmount.toFixed(2)}.</strong> : null}</> : "Payment is not included yet. Your order will be sent to the café for preparation."}</p>
              <CartAccountNote state={customer} onOpen={() => setAccountOpen(true)} />
            </div>
          </>}
        </div>
        {cart.length > 0 && <div className="bh-sheet-foot is-stack">
          {deliveryProblem && <p className="cart-delivery-note is-warning">{deliveryProblem}</p>}
          <button type="button" className="bh-primary" disabled={placingOrder || !storeOpen || Boolean(deliveryProblem) || (!claiming && !payCod && paymentConfig.method === "gcash" && orderTotal > 0 && orderTotal < (paymentConfig.minimumAmount ?? 0))} onClick={() => void submitOrder()}>
            <span>{!storeOpen ? "Café is closed" : payCod && !claiming ? (placingOrder ? "Placing your order…" : "Place order · cash on delivery") : claiming ? (idMode === "counter" ? (placingOrder ? "Sending to the counter…" : "Send to the counter") : idMode === "saved" ? "Continue with my discount" : "Continue: send my ID") : placingOrder ? (paymentConfig.method === "gcash" && cartTotal > 0 ? "Opening GCash…" : "Sending order…") : orderTotal === 0 ? "Send free order" : paymentConfig.method === "gcash" ? "Pay with GCash" : "Send order"}</span><b>₱{orderTotal.toFixed(2)}</b>
          </button>
        </div>}
      </section>
    </div>}

    {orderPlaced && <div className="bh-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setOrderPlaced(false); }}>
      <section className="bh-sheet bh-orders" role="dialog" aria-modal="true" aria-label="Your orders">
        <div className="bh-sheet-head"><div><p className="bh-eyebrow">Your orders</p><h2>Order status</h2></div><button type="button" className="bh-sheet-close" onClick={() => setOrderPlaced(false)} aria-label="Close order status">×</button></div>
        <div className="bh-sheet-scroll">
          {trackedOrders.length === 0 ? <p className="bh-empty">No orders in progress.</p> : <div className="tracked-order-list">{trackedOrders.slice().reverse().map((order) => {
            if (order.delivery) {
              const step = order.deliveryStatus ?? "preparing";
              const info: Record<string, [string, string, string, boolean]> = {
                preparing: ["PREPARING", "We're preparing your order.", "The café has your delivery order. We'll let you know when it's on the way.", false],
                ready: ["READY FOR THE RIDER", "Your order is packed.", "It's waiting for the rider to pick it up.", false],
                out: ["ON THE WAY", "Your order is on the way!", "The rider is heading to you. Keep your phone nearby.", true],
                delivered: ["DELIVERED", "Delivered. Enjoy!", "Thank you for ordering from Brew Houze.", true],
                failed: ["NOT DELIVERED", "We couldn't deliver this order.", "The café will contact you about it.", false],
                cancelled: ["CANCELLED", "This order was cancelled.", "Contact the café if you have questions.", false],
              };
              const [badge, title, text, good] = info[step] ?? info.preparing;
              const steps = ["preparing", "ready", "out", "delivered"];
              return <article className={`tracked-order ${good ? "tracked-order-ready" : "tracked-order-waiting"}`} key={order.trackingToken}><div className="tracked-order-top"><div className={`confirmation-icon ${good ? "confirmation-ready" : "confirmation-waiting"}`}>{step === "delivered" ? "✓" : step === "out" ? "🛵" : "•••"}</div><div><p className="status-badge">{badge}</p><h3>{title}</h3></div></div><ol className="delivery-steps">{steps.map((name, index) => <li key={name} className={steps.indexOf(step) >= index ? "is-done" : ""}>{["Preparing", "Packed", "On the way", "Delivered"][index]}</li>)}</ol><div className="queue-ticket"><span>ORDER NUMBER</span><strong>#{order.queueNumber ?? "—"}</strong></div><p>{text}</p></article>;
            }
            const ready = order.status === "served";
            return <article className={`tracked-order ${ready ? "tracked-order-ready" : "tracked-order-waiting"}`} key={order.trackingToken}><div className="tracked-order-top"><div className={`confirmation-icon ${ready ? "confirmation-ready" : "confirmation-waiting"}`}>{ready ? "✓" : "•••"}</div><div><p className="status-badge">{ready ? "READY FOR PICKUP" : "ORDER SENT"}</p><h3>{ready ? "Your order is ready!" : "We’re preparing your order."}</h3></div></div><div className="queue-ticket"><span>QUEUE NUMBER</span><strong>#{order.queueNumber ?? "—"}</strong></div><p>{ready ? "Please pick up your order at the counter." : "The café has received your order. We’ll let you know when it’s ready for pickup."}</p></article>;
          })}</div>}
        </div>
        <div className="bh-sheet-foot"><button type="button" className="bh-primary" onClick={() => setOrderPlaced(false)}><span>Continue browsing</span></button></div>
      </section>
    </div>}

    {rewardPick && <div className="bh-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setRewardPick(null); }}>
      <section className="bh-sheet" role="dialog" aria-modal="true" aria-label={`Choose the item for ${rewardPick.name}`}>
        <div className="bh-sheet-head"><div><p className="bh-eyebrow">Reward · ★ {rewardPick.starsCost}</p><h2>{rewardPick.name}</h2></div><button type="button" className="bh-sheet-close" onClick={() => setRewardPick(null)} aria-label="Close">×</button></div>
        <div className="bh-sheet-scroll">
          <p className="bh-item-desc">Choose the item you want for free.</p>
          <div className="bh-reward-list">
            {(() => {
              const options = products.flatMap((product) => sortVariants(product.variants ?? []).map((variant) => ({ product, variant }))).filter(({ product, variant }) => rewardMismatch(rewardPick, { productId: product.id, category: product.category, price: variant.price }) === null);
              if (options.length === 0) return <p className="bh-empty">Nothing on the menu fits this reward right now.</p>;
              return options.map(({ product, variant }) => {
                const unavailable = !variant.available || getCartLimit({ ingredients: variant.ingredients, additions: [] }, cart, "") < 1;
                return <button key={variant.id} type="button" className="reward-option" disabled={unavailable} onClick={() => addRewardItem(product, variant, rewardPick)}>
                  <span><strong>{product.name}</strong><small>{variant.size || "Regular"}{variant.temperature === "hot" ? " · Hot" : variant.temperature === "cold" ? " · Iced" : ""} · normally ₱{variant.price.toFixed(2)}</small></span>
                  <b>{unavailable ? "Unavailable" : "Free"}</b>
                </button>;
              });
            })()}
          </div>
        </div>
      </section>
    </div>}
    {/* From the Stars sign, wait until the account has loaded so a signed-in customer goes straight to their stars. */}
    {accountOpen && !(claimStart && customer.loading) && <AccountSheet state={customer} resetToken={resetToken} startClaim={claimStart} onClose={() => { setAccountOpen(false); setResetToken(null); setClaimStart(false); }} onResetDone={() => setResetToken(null)} />}
    {idSheet && activeIdRule && <IdDiscountSheet mode={idSheet} rule={activeIdRule} vat={idVat} lines={idSheetLines} saved={savedId} signedIn={Boolean(customer.account)} payLabel={idPayLabel}
      onSendPhoto={sendIdPhoto} onPaySaved={(coverage) => payWithIdDiscount({ saved_id: coverage })} onClose={() => setIdSheet(null)} />}
    {idCheck && !paymentCheck && <IdCheckStatus check={idCheck} payLabel={idPayLabel} paying={idPaying} onPay={() => void payApproved()}
      onCancel={() => void cancelIdCheck("cart")} onRetry={() => void cancelIdCheck("retry")} onCounter={() => void cancelIdCheck("counter")} onClose={() => void cancelIdCheck(idCheck.status === "rejected" ? "plain" : "cart")} />}
    {sentCart && <div className="modal-backdrop bh-legacy">
      <section className="confirmation-modal sent-cart" role="status" aria-live="polite">
        {sentCart.status === "waiting" ? <>
          <p className="eyebrow">SENT TO THE COUNTER</p>
          <h2>Show this code at the counter</h2>
          <div className="queue-ticket sent-cart-code"><span>YOUR CODE</span><strong>{sentCart.code}</strong></div>
          <p>Bring your <strong>{sentCart.discountName}</strong> ID. The cashier checks it, takes off your discount, and you pay at the counter. Your queue number appears here once you&apos;ve paid.</p>
          {sentCart.expiresAt && <p className="sent-cart-expiry">Keep this page open · the code works until {new Date(sentCart.expiresAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}</p>}
          <button className="add-order-button secondary" disabled={sentCartBusy} onClick={() => void cancelSentCart()}>{sentCartBusy ? "Cancelling..." : "Cancel and change my order"}</button>
        </> : <>
          <div className="payment-check-icon is-failed" aria-hidden="true">!</div>
          <h2>{sentCart.status === "expired" ? "Your code expired" : "Your cart was cancelled"}</h2>
          <p>{sentCart.status === "expired" ? "Nobody picked up the cart in time. Your items are still here: send it again when you're at the counter." : "The counter cleared your cart. Your items are still here if you want to send it again."}</p>
          <button className="add-order-button" onClick={() => { setSentCart(null); setCartOpen(true); }}>Back to my order</button>
        </>}
      </section>
    </div>}
    {paymentCheck && <div className="modal-backdrop bh-legacy">
      <section className="confirmation-modal payment-check" role="status" aria-live="polite">
        {paymentCheck.state === "failed" ? <>
          <div className="payment-check-icon is-failed" aria-hidden="true">!</div>
          <h2>Payment not completed</h2>
          <p>{paymentCheck.message}</p>
          <button className="add-order-button" onClick={returnToOrder}>Back to my order</button>
        </> : <>
          <div className="payment-check-spinner" aria-hidden="true" />
          <h2>Confirming your GCash payment…</h2>
          <p>{paymentCheck.state === "slow" ? "GCash is taking longer than usual. If you finished paying, your order appears here as soon as it is confirmed. You can keep this page open." : "This only takes a moment. Please keep this page open."}</p>
          {paymentCheck.state === "slow" && <button className="add-order-button secondary" onClick={returnToOrder}>I didn&apos;t pay, go back to my order</button>}
        </>}
      </section>
    </div>}
  </main>;
}
