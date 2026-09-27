"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Printable GCash sign for the counter. Its QR code never changes: it opens /pay/counter on this
// deployment, which shows whatever GCash payment the cashier has just started.
export default function CounterSign() {
  const [qr, setQr] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    let active = true;
    const target = `${window.location.origin}/pay/counter`;
    void import("qrcode")
      .then((QRCode) => QRCode.toDataURL(target, { margin: 1, width: 720, errorCorrectionLevel: "M", color: { dark: "#1F140D", light: "#FFFFFF" } }))
      .then((url) => { if (active) { setQr(url); setAddress(target); } });
    return () => { active = false; };
  }, []);

  return <main className="sign-page">
    <div className="sign-toolbar">
      <p>Print this on A5 or A4 and place it where customers can scan it. The same sign works for every GCash payment.</p>
      <button type="button" onClick={() => window.print()} disabled={!qr}>Print sign</button>
    </div>
    <section className="sign-card">
      <span className="sign-badge">GCash</span>
      <h1>Scan to pay</h1>
      <p className="sign-sub">Tell the cashier you’re paying with GCash, then scan with your phone camera.</p>
      <div className="sign-qr">{qr ? <Image src={qr} alt="QR code that opens the counter GCash payment" width={360} height={360} unoptimized /> : <span>Preparing QR…</span>}</div>
      <ol>
        <li>Your total appears on your phone.</li>
        <li>Tap <b>Pay with GCash</b> and approve it.</li>
        <li>Your queue number shows on the cashier’s screen.</li>
      </ol>
      <p className="sign-brand">Brew Houze</p>
      {address && <p className="sign-address">{address.replace(/^https?:\/\//, "")}</p>}
    </section>
    <style>{`
      .sign-page { min-height: 100dvh; padding: 24px 16px 40px; background: #F3EDE5; font-family: Inter, sans-serif; }
      .sign-toolbar { max-width: 520px; margin: 0 auto 16px; display: flex; align-items: center; gap: 14px; color: #6B4C3B; font-size: 13px; line-height: 1.5; }
      .sign-toolbar p { margin: 0; flex: 1; }
      .sign-toolbar button { flex-shrink: 0; height: 44px; padding: 0 18px; border: none; border-radius: 12px; background: #3D2B1F; color: #FDF9F5; font-weight: 800; font-size: 14px; cursor: pointer; }
      .sign-toolbar button:disabled { opacity: 0.5; cursor: default; }
      .sign-card { max-width: 520px; margin: 0 auto; padding: 36px 32px; border-radius: 24px; background: #FFFFFF; border: 1px solid #E8DDD5; text-align: center; color: #3D2B1F; }
      .sign-badge { display: inline-flex; align-items: center; height: 38px; padding: 0 20px; border-radius: 999px; background: #0057E4; color: #FFFFFF; font-family: 'Hanken Grotesk', sans-serif; font-weight: 800; font-size: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sign-card h1 { margin: 14px 0 0; font-family: 'Hanken Grotesk', sans-serif; font-size: 40px; font-weight: 800; }
      .sign-sub { margin: 8px auto 0; max-width: 360px; color: #6B4C3B; font-size: 15px; line-height: 1.5; }
      .sign-qr { width: 100%; max-width: 360px; aspect-ratio: 1; margin: 22px auto 0; display: grid; place-items: center; color: #9C8278; }
      .sign-qr img { width: 100%; height: auto; }
      .sign-card ol { margin: 22px auto 0; max-width: 340px; padding-left: 22px; list-style: decimal; text-align: left; color: #3D2B1F; font-size: 15px; line-height: 1.7; }
      .sign-brand { margin: 22px 0 0; font-family: 'Hanken Grotesk', sans-serif; font-size: 22px; font-weight: 800; color: #D97706; }
      .sign-address { margin: 4px 0 0; color: #9C8278; font-size: 11px; font-family: 'JetBrains Mono', monospace; overflow-wrap: anywhere; }
      @media print {
        @page { margin: 12mm; }
        .sign-page { padding: 0; background: #FFFFFF; }
        .sign-toolbar { display: none; }
        .sign-card { border: 2px solid #3D2B1F; max-width: none; }
      }
    `}</style>
  </main>;
}
