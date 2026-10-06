"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { shrinkPhoto } from "./id-discount";

// Direct GCash (the café's own QR, see lib/gcash.ts on the server): the customer pays the café's
// QR in their GCash app, then sends the 13-digit reference number and a screenshot of the receipt.
// The cashier checks the café's GCash and confirms it; only then is the order made. A phone cannot
// scan its own screen, so the QR can be saved and uploaded in GCash, or paid by sending to the
// number.

export type GcashAccount = { accountName: string; accountNumber: string; qrVersion: string | null };

const peso = (value: number) => `₱${value.toFixed(2)}`;
const groupedReference = (value: string) => value.replace(/\D/g, "").replace(/^(\d{4})(\d{0,3})(\d{0,6}).*$/, (_, a: string, b: string, c: string) => [a, b, c].filter(Boolean).join(" "));
const groupedNumber = (value: string) => value.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");

function useCountdown(until: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export function DirectGcashPay({ token, amount, payBy, account, onSent, onCancel }: {
  token: string; amount: number; payBy: string | null; account: GcashAccount;
  onSent: () => void; onCancel: () => void;
}) {
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const left = useCountdown(payBy);
  const digits = reference.replace(/\D/g, "");
  const qrUrl = `/api/gcash-qr?v=${account.qrVersion ?? ""}`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setError(`Could not copy. The ${what} is ${text}.`);
    }
  }

  async function chooseProof(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setProof(await shrinkPhoto(file));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "That screenshot could not be opened.");
    }
  }

  async function send() {
    if (digits.length !== 13) { setError("Enter the 13-digit reference number from your GCash receipt."); return; }
    if (!proof) { setError("Add a screenshot of your GCash receipt."); return; }
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/payments/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", reference: digits, proof }) });
      const payload = await response.json() as { data?: { status: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "Could not send the payment.");
      onSent();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send the payment.");
      setWorking(false);
    }
  }

  return <section className="confirmation-modal gcash-pay" aria-label="Pay with GCash">
    <p className="gcash-pay-kicker">Pay with GCash</p>
    <p className="gcash-pay-amount">{peso(amount)}</p>
    {left && <p className="gcash-pay-time">Pay and send within <b>{left}</b></p>}

    <ol className="gcash-pay-steps">
      <li>
        <strong>Pay exactly {peso(amount)} to Brew Houze</strong>
        <div className="gcash-pay-qr"><Image src={qrUrl} alt="Brew Houze's GCash QR" width={220} height={220} unoptimized /></div>
        <span className="gcash-pay-account">{account.accountName} · {groupedNumber(account.accountNumber)}</span>
        <div className="gcash-pay-links">
          <a className="add-order-button secondary" href={qrUrl} download="brew-houze-gcash-qr.png">Save the QR</a>
          <button type="button" className="add-order-button secondary" onClick={() => void copy(account.accountNumber, "number")}>{copied === "number" ? "Number copied" : "Copy the number"}</button>
        </div>
        <em>In GCash: <b>QR</b>, then <b>Upload QR</b> and pick the saved QR. Or use <b>Send Money</b> to the number.</em>
      </li>
      <li>
        <strong>Enter the reference number from your receipt</strong>
        <input className="gcash-pay-reference" value={groupedReference(reference)} onChange={(event) => { setReference(event.target.value); setError(""); }} inputMode="numeric" autoComplete="off" placeholder="1234 567 890123" aria-label="GCash reference number" />
      </li>
      <li>
        <strong>Add a screenshot of the receipt</strong>
        <label className="gcash-pay-proof">
          {proof ? <Image src={proof} alt="Your GCash receipt" width={120} height={160} unoptimized /> : <span>Choose screenshot</span>}
          <input type="file" accept="image/*" onChange={(event) => void chooseProof(event.target.files?.[0])} />
        </label>
      </li>
    </ol>
    {error && <p className="gcash-pay-error" role="alert">{error}</p>}
    <button type="button" className="add-order-button" onClick={() => void send()} disabled={working}>{working ? "Sending…" : "I've paid, send to the café"}</button>
    <button type="button" className="add-order-button secondary" onClick={onCancel} disabled={working}>I didn&apos;t pay, go back to my order</button>
    <p className="gcash-pay-note">The café checks your payment in its GCash before making your order. Only send after paying.</p>
  </section>;
}
