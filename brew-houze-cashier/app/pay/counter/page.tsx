"use client";

import { useEffect, useState } from "react";

// Opened from the printed GCash sign at the counter (public, no sign-in). It waits until the
// cashier starts a GCash payment, then shows its amount and sends the customer to GCash. After
// paying, PayMongo brings them to /pay/done.
type CounterState =
  | { state: "loading" }
  | { state: "waiting" }
  | { state: "unavailable" }
  | { state: "ready"; token: string; amount: number; redirectUrl: string };

const page: React.CSSProperties = { minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#F8F5F1", fontFamily: "Inter, sans-serif" };
const card: React.CSSProperties = { width: "100%", maxWidth: 380, padding: 28, borderRadius: 20, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.12)", textAlign: "center" };

export default function CounterPayment() {
  const [current, setCurrent] = useState<CounterState>({ state: "loading" });
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (leaving) return;
    let active = true;
    let inFlight = false;
    const check = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch("/api/payments/counter", { cache: "no-store" });
        const payload = await response.json() as { data?: CounterState; error?: string };
        if (!active) return;
        if (response.ok && payload.data) { setCurrent(payload.data); setNotice(""); }
        else setNotice(payload.error || "Connecting…");
      } catch {
        if (active) setNotice("Connection hiccup. Still trying…");
      } finally {
        inFlight = false;
      }
    };
    const first = window.setTimeout(() => void check(), 0);
    const intervalId = window.setInterval(() => void check(), 2500);
    document.addEventListener("visibilitychange", check);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(intervalId); document.removeEventListener("visibilitychange", check); };
  }, [leaving]);

  return <main style={page}>
    <section style={card} aria-live="polite">
      <span style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 14px", borderRadius: 999, background: "#0057E4", color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 15 }}>GCash</span>
      <p style={{ margin: "14px 0 0", color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}>Brew Houze · pay at the counter</p>

      {current.state === "ready" ? <>
        <p style={{ margin: "14px 0 0", color: "#6B4C3B", fontSize: 14 }}>Your order total</p>
        <p style={{ margin: "2px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontWeight: 800, fontSize: 44 }}>₱{current.amount.toFixed(2)}</p>
        <p style={{ margin: "6px 0 0", color: "#9C8278", fontSize: 12.5, lineHeight: 1.5 }}>Check that this matches the amount the cashier told you.</p>
        <a
          href={current.redirectUrl}
          onClick={() => setLeaving(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 54, marginTop: 18, borderRadius: 14, background: "#0057E4", color: "#FFFFFF", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 17, fontWeight: 800, textDecoration: "none", boxShadow: "0 10px 22px rgba(0,87,228,0.3)" }}
        >{leaving ? "Opening GCash…" : `Pay ₱${current.amount.toFixed(2)} with GCash`}</a>
      </> : current.state === "unavailable" ? <>
        <h1 style={{ margin: "14px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800 }}>GCash isn’t available right now</h1>
        <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 14, lineHeight: 1.6 }}>Please pay with cash at the counter.</p>
      </> : <>
        <div aria-hidden="true" style={{ width: 56, height: 56, margin: "18px auto 0", borderRadius: 999, border: "4px solid #E8DDD5", borderTopColor: "#0057E4", animation: "spin 1s linear infinite" }} />
        <h1 style={{ margin: "16px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 22, fontWeight: 800 }}>{current.state === "loading" ? "Connecting…" : "Waiting for the cashier"}</h1>
        <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 14, lineHeight: 1.6 }}>Tell the cashier you’re paying with GCash. Keep this page open: your total appears here as soon as they ring up your order.</p>
      </>}

      {notice && <p style={{ margin: "12px 0 0", color: "#9C8278", fontSize: 12 }}>{notice}</p>}
    </section>
    <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
  </main>;
}
