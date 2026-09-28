"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Printable Stars sign for the counter (the loyalty twin of the GCash sign). Its QR code never
// changes: it opens the mobile menu with ?claim=1, where a signed-in customer picks a reward (or
// asks to be added to their order) and the cashier accepts it on the staff app.
export default function StarsSign() {
  const [qr, setQr] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    let active = true;
    const target = `${window.location.origin}/?claim=1`;
    void import("qrcode")
      .then((QRCode) => QRCode.toDataURL(target, { margin: 1, width: 720, errorCorrectionLevel: "M", color: { dark: "#1F140D", light: "#FFFFFF" } }))
      .then((url) => { if (active) { setQr(url); setAddress(target); } });
    return () => { active = false; };
  }, []);

  return <main className="sign-page">
    <div className="sign-toolbar">
      <p>Print this on A5 or A4 and place it at the counter, next to the GCash sign. The same sign works for every customer.</p>
      <button type="button" onClick={() => window.print()} disabled={!qr}>Print sign</button>
    </div>
    <section className="sign-card">
      <span className="sign-badge">★ Stars</span>
      <h1>Earn and use your stars</h1>
      <p className="sign-sub">Ordering at the counter? Scan with your phone camera before you pay.</p>
      <div className="sign-qr">{qr ? <Image src={qr} alt="QR code that opens Brew Houze stars on your phone" width={360} height={360} unoptimized /> : <span>Preparing QR…</span>}</div>
      <ol>
        <li>Sign in to your Brew Houze account.</li>
        <li>Choose a free reward, or just <b>add me to my order</b> to earn stars.</li>
        <li>Tell the cashier your name.</li>
      </ol>
      <p className="sign-brand">Brew Houze</p>
      {address && <p className="sign-address">{address.replace(/^https?:\/\//, "")}</p>}
    </section>
    <style>{`
      .sign-page { min-height: 100dvh; padding: 24px 16px 40px; background: #F3EDE5; font-family: 'DM Sans', sans-serif; }
      .sign-toolbar { max-width: 520px; margin: 0 auto 16px; display: flex; align-items: center; gap: 14px; color: #6B4C3B; font-size: 13px; line-height: 1.5; }
      .sign-toolbar p { margin: 0; flex: 1; }
      .sign-toolbar button { flex-shrink: 0; height: 44px; padding: 0 18px; border: none; border-radius: 12px; background: #2c1810; color: #FDF9F5; font-weight: 800; font-size: 14px; cursor: pointer; }
      .sign-toolbar button:disabled { opacity: 0.5; cursor: default; }
      .sign-card { max-width: 520px; margin: 0 auto; padding: 36px 32px; border-radius: 24px; background: #FFFFFF; border: 1px solid #E8DDD5; text-align: center; color: #2c1810; }
      .sign-badge { display: inline-flex; align-items: center; height: 38px; padding: 0 20px; border-radius: 999px; background: #FBBF24; color: #2c1810; font-weight: 800; font-size: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sign-card h1 { margin: 14px 0 0; font-family: 'Playfair Display', serif; font-size: 38px; line-height: 1.1; }
      .sign-sub { margin: 10px auto 0; max-width: 360px; color: #6B4C3B; font-size: 15px; line-height: 1.5; }
      .sign-qr { width: 100%; max-width: 360px; aspect-ratio: 1; margin: 22px auto 0; display: grid; place-items: center; color: #9C8278; }
      .sign-qr img { width: 100%; height: auto; }
      .sign-card ol { margin: 22px auto 0; max-width: 340px; padding-left: 22px; list-style: decimal; text-align: left; font-size: 15px; line-height: 1.7; }
      .sign-brand { margin: 22px 0 0; font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #D97706; }
      .sign-address { margin: 4px 0 0; color: #9C8278; font-size: 11px; font-family: monospace; overflow-wrap: anywhere; }
      @media print {
        @page { margin: 12mm; }
        .sign-page { padding: 0; background: #FFFFFF; }
        .sign-toolbar { display: none; }
        .sign-card { border: 2px solid #2c1810; max-width: none; }
      }
    `}</style>
  </main>;
}
