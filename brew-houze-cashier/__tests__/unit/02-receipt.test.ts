import { unitCases } from "./harness";
import { escposReceipt, rawbtIntentUrl, type ReceiptData } from "@/lib/receipt";

// Objective 2 (receipts). The order slip sent to a thermal printer through the RawBT app on an
// Android tablet (lib/receipt.ts): ESC/POS commands, 32 characters a line on 58 mm paper and 48 on
// 80 mm. The slip is not a BIR official receipt, and says so.

// The printed text: the commands taken out (ESC @: 2 bytes, GS V: 4, other ESC/GS commands: 3).
function printed(bytes: Uint8Array): string[] {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1B || b === 0x1D) { const c = bytes[i + 1]; i += c === 0x40 ? 1 : c === 0x56 ? 3 : 2; continue; }
    out += b === 0x0A ? "\n" : String.fromCharCode(b);
  }
  return out.split("\n");
}

const base: ReceiptData = {
  orderId: 900, queueNumber: 12, shiftId: 7, status: "completed", total: 185, paymentMethod: "cash", paymentProvider: null, paymentReference: null, cashPortion: null,
  received: 200, change: 15, orderSource: "cashier", returnMethod: null, createdAt: "2026-10-08T10:00:00+08:00", reversedAt: null, cashierName: "Ana Cruz", serviceType: "dine_in",
  items: [{ name: "Spanish Latte", size: "16 oz", temperature: "cold", quantity: 1, unitPrice: 185, additions: [] }],
};
// A drink with a long name and five add-ons.
const loaded: ReceiptData = {
  ...base, total: 725, received: 1000, change: 275,
  items: [{ name: "Caramel Macchiato Frappuccino", size: "Grande", temperature: "cold", quantity: 3, unitPrice: 185, additions: [
    { name: "Extra Espresso Shot", quantity: 2, unitPrice: 25 }, { name: "Caramel Drizzle", quantity: 1, unitPrice: 15 }, { name: "Whipped Cream", quantity: 1, unitPrice: 20 },
    { name: "Oat Milk Substitute", quantity: 1, unitPrice: 35 }, { name: "Vanilla Syrup Pump (Sugar-Free)", quantity: 3, unitPrice: 15 }] }],
};
const senior: ReceiptData = {
  ...base, total: 80, subtotal: 112, discountAmount: 20, vatExemptAmount: 12, received: 100, change: 20,
  items: [{ name: "Americano", size: null, temperature: "hot", quantity: 1, unitPrice: 112, additions: [] }],
  idDiscounts: [{ code: "senior", name: "Senior Citizen", holderName: "Juan Dela Cruz", idNumber: "SC-12345", groupSize: null, coveredAmount: 112, vatExempt: 12, discount: 20 }],
};
const line = (lines: string[], start: string) => lines.find((text) => text.trimStart().startsWith(start)) ?? null;

unitCases("cashier", "Objective 2 - POS and Queue", [
  { id: "UT-POS-20", fn: "escposReceipt", kind: "Boundary", title: "no line on 58 mm paper is longer than 32 characters", input: "Long drink name with 5 add-ons, 58 mm",
    expected: 32, expectedText: "Longest line ≤ 32 characters", run: () => Math.min(32, Math.max(...printed(escposReceipt(loaded, false, 58)).map((text) => text.length))) },
  { id: "UT-POS-21", fn: "escposReceipt", kind: "Boundary", title: "80 mm paper uses its 48 characters", input: "Same order, 80 mm",
    expected: { fits: true, total: "TOTAL" + " ".repeat(35) + "P 725.00" }, run: () => { const lines = printed(escposReceipt(loaded, false, 80)); return { fits: lines.every((text) => text.length <= 48), total: line(lines, "TOTAL") }; } },
  { id: "UT-POS-22", fn: "escposReceipt", kind: "Positive", title: "every add-on is listed with its own amount, right-aligned", input: "5 add-ons, 58 mm",
    expected: ["  + Extra Espresso Shot x2 50.00", "  + Caramel Drizzle        15.00", "  + Whipped Cream          20.00", "  + Oat Milk Substitute    35.00", "  + Vanilla Syrup Pump     45.00"],
    run: () => printed(escposReceipt(loaded, false, 58)).filter((text) => text.startsWith("  + ")) },
  { id: "UT-POS-23", fn: "escposReceipt", kind: "Boundary", title: "a wrapped item name continues indented under the name, not as a new line", input: "\"3 x Caramel Macchiato Frappuccino\" on 58 mm",
    expected: ["3 x Caramel Macchiato     555.00", "    Frappuccino"], run: () => { const lines = printed(escposReceipt(loaded, false, 58)); const at = lines.findIndex((text) => text.startsWith("3 x ")); return lines.slice(at, at + 2); } },
  { id: "UT-POS-24", fn: "escposReceipt", kind: "Positive", title: "a senior discount prints its VAT exemption, discount and a signature line", input: "Senior, ₱112.00 Americano",
    expected: { vat: "  Less VAT                -12.00", discount: "  Less discount           -20.00", total: "TOTAL                    P 80.00", signature: true },
    run: () => { const lines = printed(escposReceipt(senior, false, 58)); return { vat: line(lines, "Less VAT"), discount: line(lines, "Less discount"), total: line(lines, "TOTAL"), signature: lines.some((text) => text.startsWith("Signature")) }; } },
  { id: "UT-POS-25", fn: "escposReceipt", kind: "Positive", title: "a split payment prints the cash part, the change and the GCash part", input: "Split ₱300.00: cash ₱100.00 (received ₱150.00), GCash ₱200.00",
    expected: ["Cash                      100.00", "  Cash received           150.00", "  Change                   50.00", "GCash                     200.00"],
    run: () => { const lines = printed(escposReceipt({ ...base, total: 300, paymentMethod: "split", cashPortion: 100, received: 150, change: 50 }, false, 58)); return ["Cash ", "Cash received", "Change", "GCash"].map((start) => lines.find((text) => text.trimStart().startsWith(start))); } },
  { id: "UT-POS-26", fn: "escposReceipt", kind: "Negative", title: "characters the printer cannot print are replaced (₱ → P, é → e)", input: "Item \"Café Latte ₱\"",
    expected: { item: "1 x Cafe Latte P", onlyPrintable: true },
    run: () => { const bytes = escposReceipt({ ...base, items: [{ ...base.items[0], name: "Café Latte ₱" }] }, false, 58); return { item: (line(printed(bytes), "1 x") ?? "").slice(0, 16), onlyPrintable: printed(bytes).join("").split("").every((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) <= 0x7E) }; } },
  { id: "UT-POS-27", fn: "escposReceipt", kind: "Positive", title: "the commands reset the printer first and feed and cut at the end", input: "Any receipt",
    expected: { start: [0x1B, 0x40], end: [0x1B, 0x64, 4, 0x1D, 0x56, 0x42, 0] }, run: () => { const bytes = Array.from(escposReceipt(base, false, 58)); return { start: bytes.slice(0, 2), end: bytes.slice(-7) }; } },
  { id: "UT-POS-28", fn: "escposReceipt", kind: "Positive", title: "a voided order's slip says VOIDED", input: "Order voided",
    expected: true, run: () => printed(escposReceipt({ ...base, status: "voided" }, true, 58)).some((text) => text.startsWith("*** VOIDED")) },
  { id: "UT-POS-29", fn: "escposReceipt", kind: "Positive", title: "the slip states it is not an official receipt", input: "Any receipt",
    expected: true, run: () => printed(escposReceipt(base, false, 58)).includes("THIS IS NOT AN OFFICIAL RECEIPT") },
  { id: "UT-POS-30", fn: "rawbtIntentUrl", kind: "Positive", title: "the RawBT intent carries the exact commands for the RawBT app", input: "The commands of a receipt",
    expected: { scheme: true, sameBytes: true },
    run: () => { const bytes = escposReceipt(base, false, 58); const url = rawbtIntentUrl(bytes); const data = url.slice("intent:base64,".length, url.indexOf("#Intent")); return { scheme: url.startsWith("intent:base64,") && url.endsWith("#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;"), sameBytes: Buffer.from(data, "base64").equals(Buffer.from(bytes)) }; } },
], "receipt");
