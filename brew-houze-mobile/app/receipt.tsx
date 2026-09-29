"use client";

import { useEffect, useState } from "react";

// The customer's virtual receipt (see /api/receipt): shown in a sheet, the same content as the
// counter's printed slip, and saved to the phone as a PNG picture.

type Receipt = {
  orderId: number; queueNumber: number | null; status: string; createdAt: string; reversedAt: string | null;
  source: "mobile" | "counter"; cashierName: string | null; customerName: string | null; serviceType: string | null;
  items: { name: string; size: string | null; temperature: string | null; quantity: number; unitPrice: number; rewardName: string | null; additions: { name: string; quantity: number; unitPrice: number }[] }[];
  subtotal: number | null; discountAmount: number; discountLabel: string | null; vatExemptAmount: number; deliveryFee: number;
  idDiscounts: { name: string; holderName: string; idEnding: string | null; groupSize: number | null; coveredAmount: number; vatExempt: number; discount: number }[];
  total: number; paymentMethod: string; paidWithGcash: boolean; paymentReference: string | null; cashPortion: number | null; received: number | null; change: number | null;
  delivery: { recipient: string; street: string; landmark: string | null; zone: string; status: string } | null;
  stars: { earned: number; used: number } | null;
};

// One line of the receipt, drawn the same way on screen and in the saved picture.
type Line =
  | { kind: "name" | "center" | "small" | "title" | "stamp" | "legal"; text: string }
  | { kind: "queue"; text: string }
  | { kind: "row"; left: string; right: string; bold?: boolean; sub?: boolean }
  | { kind: "detail"; text: string }
  | { kind: "rule" };

const money = (value: number) => value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const deliveryStatus: Record<string, string> = { preparing: "Preparing", ready: "Packed for the rider", out: "On the way", delivered: "Delivered", failed: "Not delivered", cancelled: "Cancelled" };

function receiptLines(receipt: Receipt): Line[] {
  const lines: Line[] = [];
  const status = receipt.status.startsWith("void") ? "VOIDED" : receipt.status.startsWith("refund") ? "REFUNDED" : null;
  lines.push({ kind: "name", text: "Brew Houze" }, { kind: "small", text: "fb.com/BrewHouzeCafe" }, { kind: "title", text: "ORDER RECEIPT" });
  if (receipt.queueNumber !== null) lines.push({ kind: "queue", text: `#${receipt.queueNumber}` });
  if (status) lines.push({ kind: "stamp", text: `${status}${receipt.reversedAt ? ` ${when(receipt.reversedAt)}` : ""}` });
  lines.push({ kind: "rule" });
  lines.push({ kind: "row", left: "Date", right: when(receipt.createdAt) });
  lines.push({ kind: "row", left: "Order", right: `#${receipt.orderId}` });
  lines.push(receipt.source === "mobile" ? { kind: "row", left: "Ordered on", right: "Mobile menu" } : { kind: "row", left: "Cashier", right: receipt.cashierName ?? "—" });
  if (receipt.customerName) lines.push({ kind: "row", left: "Customer", right: receipt.customerName });
  if (receipt.serviceType) lines.push({ kind: "row", left: "Order type", right: receipt.serviceType === "take_out" ? "TAKE OUT/PICK UP" : receipt.serviceType === "delivery" ? "DELIVERY" : "DINE IN", bold: true });
  if (receipt.delivery) {
    lines.push({ kind: "row", left: "Deliver to", right: receipt.delivery.recipient });
    lines.push({ kind: "detail", text: `${receipt.delivery.street}${receipt.delivery.landmark ? `, near ${receipt.delivery.landmark}` : ""} (${receipt.delivery.zone})` });
    lines.push({ kind: "detail", text: `Status: ${deliveryStatus[receipt.delivery.status] ?? receipt.delivery.status}` });
  }
  lines.push({ kind: "rule" });
  for (const item of receipt.items) {
    lines.push({ kind: "row", left: `${item.quantity} × ${item.name}`, right: money(item.quantity * item.unitPrice) });
    const details = [item.size && item.size !== "Regular" ? item.size : "", item.temperature === "hot" ? "Hot" : item.temperature === "cold" ? "Iced" : "", item.quantity > 1 ? `@ ${money(item.unitPrice)}` : "", item.rewardName ? `Reward: ${item.rewardName}` : ""].filter(Boolean).join(" · ");
    if (details) lines.push({ kind: "detail", text: details });
    for (const addition of item.additions) lines.push({ kind: "row", left: `+ ${addition.name}${addition.quantity !== 1 ? ` ×${addition.quantity}` : ""}`, right: money(addition.quantity * addition.unitPrice), sub: true });
  }
  lines.push({ kind: "rule" });
  if (receipt.discountAmount || receipt.vatExemptAmount || receipt.deliveryFee) {
    const subtotal = receipt.subtotal ?? receipt.total + receipt.discountAmount + receipt.vatExemptAmount - receipt.deliveryFee;
    lines.push({ kind: "row", left: receipt.deliveryFee ? "Items" : "Subtotal", right: money(subtotal) });
    if (receipt.idDiscounts.length > 0) for (const entry of receipt.idDiscounts) {
      lines.push({ kind: "row", left: `${entry.name}: ${entry.holderName}`, right: "", bold: true });
      if (entry.idEnding) lines.push({ kind: "detail", text: `ID ending ${entry.idEnding}` });
      lines.push({ kind: "row", left: entry.groupSize ? `Share of bill (1 of ${entry.groupSize})` : "Items covered", right: money(entry.coveredAmount), sub: true });
      if (entry.vatExempt) lines.push({ kind: "row", left: "Less VAT (VAT-exempt)", right: `-${money(entry.vatExempt)}`, sub: true });
      lines.push({ kind: "row", left: "Less discount", right: `-${money(entry.discount)}`, sub: true });
    }
    else if (receipt.discountAmount) lines.push({ kind: "row", left: `Discount${receipt.discountLabel ? `: ${receipt.discountLabel}` : ""}`, right: `-${money(receipt.discountAmount)}` });
  }
  if (receipt.deliveryFee) lines.push({ kind: "row", left: "Delivery fee", right: money(receipt.deliveryFee) });
  lines.push({ kind: "row", left: "TOTAL", right: `₱${money(receipt.total)}`, bold: true });
  if (receipt.paymentMethod === "split" && receipt.cashPortion !== null) {
    lines.push({ kind: "row", left: "Cash", right: money(receipt.cashPortion) });
    if (receipt.received !== null) lines.push({ kind: "row", left: "Cash received", right: money(receipt.received), sub: true });
    if (receipt.change !== null) lines.push({ kind: "row", left: "Change", right: money(receipt.change), sub: true });
    lines.push({ kind: "row", left: "GCash", right: money(receipt.total - receipt.cashPortion) });
  } else if (receipt.paymentMethod === "cod") {
    lines.push({ kind: "row", left: receipt.received ? "Cash on delivery" : "To pay on delivery", right: money(receipt.total), bold: !receipt.received });
  } else if (receipt.paidWithGcash) {
    lines.push({ kind: "row", left: "Paid with GCash", right: money(receipt.total) });
    if (receipt.paymentReference) lines.push({ kind: "small", text: `Payment ref ${receipt.paymentReference}` });
  } else {
    if (receipt.received !== null) lines.push({ kind: "row", left: "Cash received", right: money(receipt.received) });
    if (receipt.change !== null) lines.push({ kind: "row", left: "Change", right: money(receipt.change) });
  }
  if (receipt.stars) {
    lines.push({ kind: "rule" });
    if (receipt.stars.used) lines.push({ kind: "row", left: "Stars used", right: `-${receipt.stars.used}` });
    if (receipt.stars.earned) lines.push({ kind: "row", left: "Stars earned", right: `+${receipt.stars.earned}` });
  }
  lines.push({ kind: "rule" }, { kind: "center", text: "Thank you!" }, { kind: "legal", text: "THIS IS NOT AN OFFICIAL RECEIPT" });
  return lines;
}

// The receipt as a picture: 360 points wide at 3x, as tall as it needs to be.
async function drawReceipt(lines: Line[]): Promise<Blob> {
  const scale = 3, width = 360, pad = 22, inner = width - pad * 2;
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Saving pictures is not supported on this browser.");
  const font = (size: number, weight = 400) => `${weight} ${size}px ${family}`;
  // Splits text into lines that fit a width.
  const wrap = (text: string, max: number, style: string) => {
    g.font = style;
    const words = text.split(" ");
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width <= max || !line) line = next; else { out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };
  // First pass measures, second draws.
  const layout = (draw: boolean) => {
    let y = pad;
    const text = (value: string, x: number, style: string, color: string, align: CanvasTextAlign = "left") => { if (!draw) return; g.font = style; g.fillStyle = color; g.textAlign = align; g.fillText(value, x, y); };
    for (const line of lines) {
      if (line.kind === "rule") {
        if (draw) { g.strokeStyle = "#CFC4BA"; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(pad, y + 6); g.lineTo(width - pad, y + 6); g.stroke(); g.setLineDash([]); }
        y += 14;
      } else if (line.kind === "queue") {
        y += 20; text("QUEUE NUMBER", width / 2, font(10, 700), "#9C8278", "center"); y += 36; text(line.text, width / 2, font(34, 800), "#3D2B1F", "center"); y += 10;
      } else if (line.kind === "row") {
        const style = font(line.sub ? 11.5 : 13, line.bold ? 700 : 400);
        g.font = style;
        const rightWidth = line.right ? g.measureText(line.right).width + 12 : 0;
        const indent = line.sub ? 10 : 0;
        const parts = wrap(line.left, inner - rightWidth - indent, style);
        parts.forEach((part, index) => { y += line.sub ? 15 : 17; text(part, pad + indent, style, line.sub ? "#6B4C3B" : "#3D2B1F"); if (index === 0 && line.right) text(line.right, width - pad, style, line.sub ? "#6B4C3B" : "#3D2B1F", "right"); });
      } else {
        const styles = { name: [font(22, 800), "#3D2B1F", 26], center: [font(14, 600), "#3D2B1F", 19], small: [font(11, 400), "#9C8278", 15], title: [font(11, 700), "#6B4C3B", 18], stamp: [font(13, 800), "#B91C1C", 19], legal: [font(9.5, 700), "#9C8278", 15], detail: [font(11, 400), "#9C8278", 14] } as const;
        const [style, color, step] = styles[line.kind];
        const center = line.kind !== "detail";
        for (const part of wrap(line.text, inner, style)) { y += step; text(part, center ? width / 2 : pad + 10, style, color, center ? "center" : "left"); }
      }
    }
    return y + pad;
  };
  const height = Math.ceil(layout(false));
  canvas.width = width * scale;
  canvas.height = height * scale;
  g.scale(scale, scale);
  g.fillStyle = "#FFFDF9";
  g.fillRect(0, 0, width, height);
  g.textBaseline = "alphabetic";
  layout(true);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not make the picture.")), "image/png"));
}

type ReceiptSource = { token: string } | { orderId: number };
const receiptQuery = (source: ReceiptSource) => "token" in source ? `token=${encodeURIComponent(source.token)}` : `order=${source.orderId}`;

async function fetchReceipt(source: ReceiptSource): Promise<Receipt> {
  const response = await fetch(`/api/receipt?${receiptQuery(source)}`, { cache: "no-store" });
  const payload = await response.json() as { data?: Receipt; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error || "Could not load the receipt.");
  return payload.data;
}

// Saves the receipt picture to the phone (Downloads, or Photos/Files depending on the phone).
async function saveReceiptImage(receipt: Receipt) {
  const blob = await drawReceipt(receiptLines(receipt));
  const day = receipt.createdAt.slice(0, 10);
  const name = `Brew-Houze-receipt-${receipt.queueNumber !== null ? `${receipt.queueNumber}-` : ""}${day}.png`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// One tap from an order card: the receipt saved without opening it.
export async function downloadReceipt(source: ReceiptSource): Promise<void> {
  await saveReceiptImage(await fetchReceipt(source));
}

// source: the order's tracking token (orders placed on this phone) or its id (a signed-in
// customer's past order).
export function ReceiptSheet({ source, onClose }: { source: ReceiptSource; onClose: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const query = receiptQuery(source);
  useEffect(() => {
    let active = true;
    fetch(`/api/receipt?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { data?: Receipt; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "Could not load the receipt.");
        if (active) setReceipt(payload.data);
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Could not load the receipt."); });
    return () => { active = false; };
  }, [query]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!receipt) return;
    setSaving(true);
    setError("");
    try {
      await saveReceiptImage(receipt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the receipt.");
    } finally {
      setSaving(false);
    }
  }

  const lines = receipt ? receiptLines(receipt) : [];
  return <div className="bh-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="bh-sheet rc-sheet" role="dialog" aria-modal="true" aria-label="Your receipt">
      <div className="bh-sheet-head"><div><p className="bh-eyebrow">Receipt</p><h2>{receipt?.queueNumber !== null && receipt?.queueNumber !== undefined ? `Order #${receipt.queueNumber}` : "Your order"}</h2></div><button type="button" className="bh-sheet-close" onClick={onClose} aria-label="Close">×</button></div>
      <div className="bh-sheet-scroll">
        {error && <p className="bh-error">{error}</p>}
        {!receipt && !error && <p className="rc-loading">Loading your receipt…</p>}
        {receipt && <div className="rc-paper">{lines.map((line, index) => line.kind === "rule" ? <hr key={index} />
          : line.kind === "row" ? <div key={index} className={`rc-row${line.bold ? " is-bold" : ""}${line.sub ? " is-sub" : ""}`}><span>{line.left}</span><span>{line.right}</span></div>
            : line.kind === "queue" ? <div key={index} className="rc-queue"><span>Queue number</span><strong>{line.text}</strong></div>
              : <p key={index} className={`rc-${line.kind}`}>{line.text}</p>)}</div>}
      </div>
      {receipt && <div className="bh-sheet-foot">
        <button type="button" className="bh-primary" disabled={saving} onClick={() => void save()}><span>{saving ? "Saving…" : "Save receipt"}</span><b>PNG</b></button>
      </div>}
    </section>
  </div>;
}
