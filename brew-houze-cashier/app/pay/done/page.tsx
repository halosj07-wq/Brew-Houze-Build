// Where the customer's phone lands after approving a counter GCash payment. Public (no sign-in):
// it shows no order details, the cashier's screen confirms the payment and the queue number.
export default function PaymentDone() {
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#F8F5F1", fontFamily: "Inter, sans-serif" }}>
    <section style={{ width: "100%", maxWidth: 380, padding: 28, borderRadius: 20, background: "#FDF9F5", border: "1px solid #E8DDD5", boxShadow: "0 16px 40px rgba(61,43,31,0.12)", textAlign: "center" }}>
      <div aria-hidden="true" style={{ width: 60, height: 60, margin: "0 auto", borderRadius: 20, display: "grid", placeItems: "center", background: "#DCFCE7", color: "#15803D", fontSize: 30, fontWeight: 800 }}>✓</div>
      <p style={{ margin: "18px 0 0", color: "#D97706", fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}>Brew Houze</p>
      <h1 style={{ margin: "6px 0 0", color: "#3D2B1F", fontFamily: "Hanken Grotesk, sans-serif", fontSize: 24, fontWeight: 800 }}>You can go back to the counter</h1>
      <p style={{ margin: "10px 0 0", color: "#6B4C3B", fontSize: 14, lineHeight: 1.6 }}>The cashier&apos;s screen shows when your GCash payment is confirmed, along with your queue number. You can close this page.</p>
    </section>
  </main>;
}
