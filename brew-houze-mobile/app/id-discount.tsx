"use client";

import { useState } from "react";
import Image from "next/image";

// Counter-less ID discounts on the mobile menu (senior, PWD and others, see
// lib/id-verifications.ts on the server):
//   photo   the customer photographs their ID, the café checks it on the POS, then they pay here
//   saved   an ID the café already checked and the customer asked to remember: no photo, no wait
// Either way the barista checks the real ID at pickup. "Send to the counter" stays available.

export type IdDiscountRule = { id: number; code: string; name: string; discountKind: "percent" | "fixed"; discountValue: number; maxDiscount: number | null; vatExempt: boolean; requiresId: boolean; idLabel: string | null };
export type VatSetting = { registered: boolean; rate: number };
export type SavedId = { typeId: number; typeName: string; holderName: string; idEnding: string | null };
// Which items are the holder's own (indexes into the order's items), or a shared bill.
export type IdCoverage = { lines: { line: number; quantity: number }[] } | { group_size: number };
export type IdSheetLine = { label: string; qty: number; unit: number };
export type IdCheckState = {
  token: string; status: "pending" | "approved" | "rejected" | "cancelled" | "expired" | "used";
  rejectReason: string | null; discountName: string | null; holderName: string | null;
  breakdown: { subtotal: number; discountAmount: number; vatExemptAmount: number; total: number } | null; problem: string | null;
};

const peso = (value: number) => `₱${value.toFixed(2)}`;

// The same calculation as the server (which has the final say).
export function idDiscountAmounts(rule: IdDiscountRule, coveredAmount: number, vat: VatSetting): { vatExempt: number; discount: number } {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const covered = Math.max(0, round2(coveredAmount));
  const vatExempt = rule.vatExempt && vat.registered && vat.rate > 0 ? round2(covered - covered / (1 + vat.rate / 100)) : 0;
  const base = round2(covered - vatExempt);
  let discount = rule.discountKind === "percent" ? base * rule.discountValue / 100 : rule.discountValue;
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return { vatExempt, discount: round2(Math.min(Math.max(0, discount), base)) };
}

// Phone photos are large: shrink to at most 1400 px and re-save as JPEG before sending.
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("That photo could not be opened. Please take it again."));
      element.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That photo could not be opened. Please take it again.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Choosing what the discount covers, and for a photo check the name, ID number, photo and consent.
export function IdDiscountSheet({ mode, rule, vat, lines, saved, signedIn, payLabel, onSendPhoto, onPaySaved, onClose }: {
  mode: "photo" | "saved"; rule: IdDiscountRule; vat: VatSetting; lines: IdSheetLine[]; saved: SavedId | null; signedIn: boolean;
  // What the button says when paying with a saved ID ("Pay with GCash" or "Send order").
  payLabel: string;
  onSendPhoto: (details: { holderName: string; idNumber: string; coverage: IdCoverage; photo: string; remember: boolean }) => Promise<void>;
  onPaySaved: (coverage: IdCoverage) => Promise<void>;
  onClose: () => void;
}) {
  const [shared, setShared] = useState(false);
  const [picks, setPicks] = useState<number[]>(() => lines.map((line) => line.qty));
  const [people, setPeople] = useState(2);
  const [holderName, setHolderName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const orderAmount = lines.reduce((sum, line) => sum + line.unit * line.qty, 0);
  const covered = shared ? orderAmount / Math.max(1, people) : lines.reduce((sum, line, index) => sum + line.unit * (picks[index] ?? 0), 0);
  const amounts = idDiscountAmounts(rule, covered, vat);
  const total = Math.max(0, orderAmount - amounts.vatExempt - amounts.discount);
  const coverage: IdCoverage = shared ? { group_size: people } : { lines: picks.flatMap((quantity, line) => quantity > 0 ? [{ line, quantity }] : []) };
  const problem = covered <= 0 ? "Tick what you'll eat or drink yourself."
    : mode === "saved" ? ""
      : holderName.trim().length < 2 ? "Enter your full name as it is on the ID."
        : rule.requiresId && idNumber.trim().length < 3 ? `Enter your ${rule.idLabel ?? "ID number"}.`
          : !photo ? "Take a photo of your ID."
            : !consent ? "Agree to the photo being used for the check."
              : "";

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try {
      setPhoto(await shrinkPhoto(file));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "That photo could not be used.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    if (problem || working) return;
    setWorking(true);
    setError("");
    try {
      if (mode === "saved") await onPaySaved(coverage);
      else await onSendPhoto({ holderName: holderName.trim().replace(/\s+/g, " "), idNumber: idNumber.trim(), coverage, photo: photo!, remember });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.");
      setWorking(false);
    }
  }

  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !working) onClose(); }}>
    <section className="cart-modal id-sheet" aria-label={`${rule.name} discount`}>
      <div className="cart-modal-heading"><div><p className="eyebrow">{mode === "saved" ? "YOUR SAVED ID" : "ID DISCOUNT"}</p><h2>{mode === "saved" ? `Your ${rule.name} discount` : `Send your ${rule.name} ID`}</h2></div><button className="modal-close inline" disabled={working} onClick={onClose} aria-label="Close">×</button></div>
      {mode === "saved" && saved && <p className="id-sheet-saved">✓ Checked by the café: {saved.holderName}{saved.idEnding ? ` · ID ending ${saved.idEnding}` : ""}</p>}

      <p className="id-sheet-label">What does the discount cover?</p>
      <div className="service-choice id-sheet-mode" role="radiogroup" aria-label="What the discount covers">
        <button type="button" role="radio" aria-checked={!shared} onClick={() => setShared(false)}><strong>My own items</strong><span>What I&apos;ll eat or drink</span></button>
        <button type="button" role="radio" aria-checked={shared} onClick={() => setShared(true)}><strong>Shared bill</strong><span>Split by the number of people</span></button>
      </div>
      {shared ? <div className="id-sheet-people">
        <span>People sharing the order</span>
        <div className="quantity-control"><button type="button" onClick={() => setPeople((value) => Math.max(1, value - 1))} aria-label="One person fewer">−</button><span>{people}</span><button type="button" onClick={() => setPeople((value) => Math.min(50, value + 1))} aria-label="One person more">+</button></div>
        <small>Your share: {peso(orderAmount)} ÷ {people} = {peso(orderAmount / people)}</small>
      </div> : <div className="id-sheet-lines">
        {lines.map((line, index) => <div key={index} className={`id-sheet-line${(picks[index] ?? 0) > 0 ? " is-on" : ""}`}>
          <label><input type="checkbox" checked={(picks[index] ?? 0) > 0} onChange={(event) => setPicks((current) => current.map((value, at) => at === index ? (event.target.checked ? line.qty : 0) : value))} /><span><strong>{line.label}</strong><small>{peso(line.unit)} each</small></span></label>
          {line.qty > 1 && (picks[index] ?? 0) > 0 && <div className="quantity-control"><button type="button" onClick={() => setPicks((current) => current.map((value, at) => at === index ? Math.max(1, value - 1) : value))} aria-label="One fewer">−</button><span>{picks[index]}</span><button type="button" onClick={() => setPicks((current) => current.map((value, at) => at === index ? Math.min(line.qty, value + 1) : value))} aria-label="One more">+</button></div>}
        </div>)}
      </div>}

      {mode === "photo" && <>
        <div className="id-sheet-fields">
          <label><span>Full name (as on the ID)</span><input value={holderName} onChange={(event) => setHolderName(event.target.value)} maxLength={80} autoComplete="name" /></label>
          {(rule.requiresId || rule.idLabel) && <label><span>{rule.idLabel ?? "ID no."}{rule.requiresId ? "" : " (optional)"}</span><input value={idNumber} onChange={(event) => setIdNumber(event.target.value)} maxLength={40} autoComplete="off" /></label>}
        </div>
        <label className={`id-photo${photo ? " has-photo" : ""}`}>
          <input type="file" accept="image/*" capture="environment" onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} />
          {photo ? <><Image src={photo} alt="Your ID photo" width={420} height={264} unoptimized /><span>Retake photo</span></>
            : <><strong>{photoBusy ? "Preparing the photo…" : "📷 Take a photo of your ID"}</strong><small>Front side, flat and well lit, with your name and ID number readable.</small></>}
        </label>
        <label className="id-sheet-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree that Brew Houze uses this photo only to check my discount. It is deleted as soon as the café has checked it.</span></label>
        {signedIn && <label className="id-sheet-check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember my ID on my account, so next time I get the discount without a photo. Only my name and ID number are kept, never the photo.</span></label>}
      </>}

      {covered > 0 && <div className="id-sheet-summary">
        <div><span>{shared ? "Your share" : "Your items"}</span><b>{peso(covered)}</b></div>
        {amounts.vatExempt > 0 && <div><span>Less VAT ({vat.rate}%)</span><b>−{peso(amounts.vatExempt)}</b></div>}
        <div><span>Less {rule.discountKind === "percent" ? `${rule.discountValue}%` : "discount"}</span><b>−{peso(amounts.discount)}</b></div>
        <div className="is-total"><span>{mode === "saved" ? "Order total" : "Order total, once approved"}</span><b>{peso(total)}</b></div>
      </div>}
      <p className="no-payment-note">Show your ID when you pick up your order. The discount is for your own food and drinks.</p>
      {(error || problem) && <p className={error ? "error-message" : "id-sheet-problem"}>{error || problem}</p>}
      <button className="add-order-button" disabled={Boolean(problem) || working || photoBusy} onClick={() => void submit()}>{working ? (mode === "saved" ? "Opening payment..." : "Sending your ID...") : mode === "saved" ? payLabel : "Send for checking"} <span>{peso(total)} →</span></button>
    </section>
  </div>;
}

// Following a photo check: waiting, approved (pay now), rejected (why), or gone.
export function IdCheckStatus({ check, payLabel, paying, onPay, onCancel, onRetry, onCounter, onClose }: {
  check: IdCheckState; payLabel: string; paying: boolean;
  onPay: () => void; onCancel: () => void; onRetry: () => void; onCounter: () => void; onClose: () => void;
}) {
  const name = check.discountName ?? "discount";
  return <div className="modal-backdrop">
    <section className="confirmation-modal payment-check id-status" role="status" aria-live="polite">
      {check.status === "pending" ? <>
        <div className="payment-check-spinner id-spinner" aria-hidden="true" />
        <h2>The café is checking your ID…</h2>
        <p>This usually takes a minute. Keep this page open: you can pay as soon as your {name} ID is approved.</p>
        <button className="add-order-button secondary" onClick={onCancel}>Cancel</button>
        <button className="id-status-link" onClick={onCounter}>Pay at the counter instead</button>
      </> : check.status === "approved" ? <>
        <div className="payment-check-icon is-approved" aria-hidden="true">✓</div>
        <h2>Your {name} ID is approved</h2>
        {check.breakdown ? <div className="id-sheet-summary">
          <div><span>Items</span><b>{peso(check.breakdown.subtotal)}</b></div>
          {check.breakdown.vatExemptAmount > 0 && <div><span>Less VAT</span><b>−{peso(check.breakdown.vatExemptAmount)}</b></div>}
          <div><span>Less discount</span><b>−{peso(check.breakdown.discountAmount)}</b></div>
          <div className="is-total"><span>Total</span><b>{peso(check.breakdown.total)}</b></div>
        </div> : <p className="id-sheet-problem">{check.problem ?? "Checking the total…"}</p>}
        <p>Show your ID when you pick up your order.</p>
        <button className="add-order-button" disabled={paying || !check.breakdown} onClick={onPay}>{paying ? "Opening payment..." : payLabel} <span>{check.breakdown ? `${peso(check.breakdown.total)} →` : ""}</span></button>
        <button className="id-status-link" disabled={paying} onClick={onCancel}>Cancel this order</button>
      </> : check.status === "rejected" ? <>
        <div className="payment-check-icon is-failed" aria-hidden="true">!</div>
        <h2>Your ID wasn&apos;t accepted</h2>
        <p>{check.rejectReason ?? "The café could not accept this ID."}</p>
        <button className="add-order-button" onClick={onRetry}>Send a new photo</button>
        <button className="id-status-link" onClick={onCounter}>Pay at the counter instead</button>
        <button className="id-status-link" onClick={onClose}>Order without the discount</button>
      </> : <>
        <div className="payment-check-icon is-failed" aria-hidden="true">!</div>
        <h2>{check.status === "expired" ? "This ID check expired" : check.status === "used" ? "Already ordered" : "ID check cancelled"}</h2>
        <p>{check.status === "expired" ? "It wasn't checked or paid in time. Your items are still in your order: send your ID again when you're ready." : check.status === "used" ? "This approval was already used for an order." : "Your items are still in your order."}</p>
        <button className="add-order-button" onClick={onClose}>Back to my order</button>
      </>}
    </section>
  </div>;
}
