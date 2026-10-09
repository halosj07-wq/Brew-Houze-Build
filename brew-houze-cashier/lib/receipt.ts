// The receipt (order slip) of an order, shared by the print window, the PDF and RawBT (Android
// thermal printers) in app/page.tsx. It is not a BIR official receipt: this system is not a
// BIR-registered POS, so the slip says so.

type Station = "bar" | "kitchen";

export const RECEIPT_BUSINESS = { name: "Brew Houze", lines: ["fb.com/BrewHouzeCafe"] as string[] };

// A receipt with drinks and food lists them under BAR and KITCHEN (heading on the first item of each).
export function receiptItemsByStation(receipt: ReceiptData) {
  const stations = new Set(receipt.items.map((item) => item.station ?? "bar"));
  if (stations.size < 2) return receipt.items.map((item) => ({ ...item, heading: "" }));
  return (["bar", "kitchen"] as Station[]).flatMap((station) => receipt.items.filter((item) => (item.station ?? "bar") === station).map((item, index) => ({ ...item, heading: index === 0 ? station.toUpperCase() : "" })));
}


export type ReceiptData = {
  orderId: number; queueNumber: number | null; shiftId: number | null; status: string; total: number;
  paymentMethod: string; paymentProvider: string | null; paymentReference: string | null; cashPortion: number | null;
  received: number | null; change: number | null; orderSource: string; returnMethod: string | null;
  createdAt: string; reversedAt: string | null; cashierName: string | null; customerName?: string | null;
  loyalty?: { starsEarned: number; starsUsed?: number; balance: number; campaignName: string } | null;
  subtotal?: number | null; discountAmount?: number; discountLabel?: string | null; serviceType?: string | null;
  // Senior, PWD and other ID discounts: one per person, with the VAT removed (senior and PWD) and the discount.
  vatExemptAmount?: number; idDiscounts?: ReceiptIdDiscount[];
  // Delivery orders: the fee, and where it went.
  deliveryFee?: number; delivery?: { recipient: string; phone: string; street: string; landmark: string | null; zone: string; status: string; rider: string | null; checkId?: boolean; notes?: string | null; codCollected?: number | null; deliveredAt?: string | null } | null;
  // rewardName: the line was a loyalty reward (free, paid with stars).
  items: { name: string; size: string | null; temperature: string | null; quantity: number; unitPrice: number; rewardName?: string | null; station?: Station; custom?: string | null; additions: { name: string; quantity: number; unitPrice: number }[] }[];
};

export type ReceiptIdDiscount = { code: string; name: string; holderName: string; idNumber: string | null; groupSize: number | null; coveredAmount: number; vatExempt: number; discount: number };
// Senior and PWD sales are signed by the customer (the shop keeps the record).
export function needsSignature(entry: ReceiptIdDiscount): boolean {
  return entry.code === "senior" || entry.code === "pwd";
}


// A delivery order's progress, printed on its receipt.
export const receiptDeliveryStatus: Record<string, string> = { preparing: "Preparing", ready: "Packed for the rider", out: "On the way", delivered: "Delivered", failed: "Not delivered", cancelled: "Cancelled" };
// What the receipt says under the total for a delivery: the customer's thanks, or the rider's reminder.
export const receiptFooter = (receipt: ReceiptData) => receipt.serviceType === "delivery" ? "Thank you! Enjoy your order." : `Thank you!${receipt.queueNumber !== null ? " Please wait for your number." : ""}`;
// The subtotal of the items (orders saved before subtotals were recorded work it out from the total).
export const receiptSubtotal = (receipt: ReceiptData) => receipt.subtotal ?? receipt.total + (receipt.discountAmount ?? 0) + (receipt.vatExemptAmount ?? 0) - (receipt.deliveryFee ?? 0);

export function receiptMoney(value: number): string {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function receiptTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}


// ─── Printing through RawBT (Android) ────────────────────────────────────────
// On an Android tablet the RawBT app is the printer's driver (Bluetooth or USB). Instead of the
// print window, the receipt goes to it as ESC/POS commands, the printer's own language: text in
// the printer's font, full width, one tap. Same content as the printed slip. The printer's built-in
// font (code page 437) has no peso sign or accents, so amounts read "P 345.00" and accents are
// dropped. 58 mm rolls fit 32 characters a line, 80 mm rolls 48.
export function escposReceipt(receipt: ReceiptData, reprint: boolean, paperWidth: 58 | 80): Uint8Array {
  const cols = paperWidth === 80 ? 48 : 32;
  const bytes: number[] = [];
  const raw = (...values: number[]) => { bytes.push(...values); };
  const plain = (value: string) => value.replace(/₱/g, "P").replace(/[×✕]/g, "x").replace(/[·•]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
  const write = (value: string) => { for (const char of plain(value)) bytes.push(char.charCodeAt(0)); };
  const newline = () => raw(0x0A);
  const align = (where: "left" | "center") => raw(0x1B, 0x61, where === "center" ? 1 : 0);
  const bold = (on: boolean) => raw(0x1B, 0x45, on ? 1 : 0);
  // GS ! n: n = 0x11 doubles the width and height.
  const size = (big: boolean) => raw(0x1D, 0x21, big ? 0x11 : 0);
  // Words wrapped to the width (a word longer than the line is cut).
  const wrap = (value: string, width: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const word of plain(value).split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (rest.length > width) { if (line) { lines.push(line); line = ""; } lines.push(rest.slice(0, width)); rest = rest.slice(width); }
      if (!line) line = rest;
      else if (line.length + 1 + rest.length <= width) line += ` ${rest}`;
      else { lines.push(line); line = rest; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const center = (value: string, options: { bold?: boolean; big?: boolean } = {}) => {
    align("center"); bold(Boolean(options.bold)); size(Boolean(options.big));
    for (const line of wrap(value, options.big ? Math.floor(cols / 2) : cols)) { write(line); newline(); }
    size(false); bold(false); align("left");
  };
  // A label on the left and an amount on the right (the label wraps, the amount stays on its first
  // line). hang: how far the label's next lines are indented under its first (an item name after
  // "3 x "), so a wrapped name does not read as a new line.
  const row = (left: string, right = "", options: { bold?: boolean; indent?: number; hang?: number } = {}) => {
    const indent = " ".repeat(options.indent ?? 0);
    const hang = " ".repeat(options.hang ?? 0);
    const value = plain(right);
    bold(Boolean(options.bold));
    const [first, ...others] = wrap(left, cols - indent.length - (value ? value.length + 1 : 0));
    const lines = [first, ...(others.length ? wrap(others.join(" "), cols - indent.length - hang.length).map((line) => hang + line) : [])];
    lines.forEach((line, index) => {
      const text = indent + line;
      write(index === 0 && value ? text + " ".repeat(Math.max(1, cols - text.length - value.length)) + value : text);
      newline();
    });
    bold(false);
  };
  const rule = () => { write("-".repeat(cols)); newline(); };
  const money = (value: number) => receiptMoney(value);

  raw(0x1B, 0x40); // reset
  raw(0x1B, 0x74, 0); // code page 437
  center(RECEIPT_BUSINESS.name, { bold: true, big: true });
  RECEIPT_BUSINESS.lines.forEach((line) => center(line));
  center(`ORDER SLIP${reprint ? " - REPRINT" : ""}`, { bold: true });
  if (receipt.queueNumber !== null) {
    rule();
    center("QUEUE NUMBER", { bold: true });
    center(`#${receipt.queueNumber}`, { bold: true, big: true });
  }
  const status = receipt.status.startsWith("void") ? "VOIDED" : receipt.status.startsWith("refund") ? "REFUNDED" : null;
  if (status) center(`*** ${status}${receipt.reversedAt ? ` ${receiptTime(receipt.reversedAt)}` : ""} ***`, { bold: true });
  rule();
  row("Date", receiptTime(receipt.createdAt));
  row("Order", `#${receipt.orderId}${receipt.shiftId ? ` - shift ${receipt.shiftId}` : ""}`);
  row(receipt.orderSource === "online" ? "Ordered on" : "Cashier", receipt.orderSource === "online" ? "Mobile menu" : receipt.cashierName ?? "-");
  if (receipt.customerName) row("Customer", receipt.customerName);
  if (receipt.serviceType) row("Order type", receipt.serviceType === "take_out" ? "TAKE OUT" : receipt.serviceType === "delivery" ? "DELIVERY" : "DINE IN", { bold: true });
  if (receipt.delivery) {
    row("Deliver to", receipt.delivery.recipient);
    row(`${receipt.delivery.street}${receipt.delivery.landmark ? `, near ${receipt.delivery.landmark}` : ""} (${receipt.delivery.zone})`, "", { indent: 2 });
    row(receipt.delivery.phone, "", { indent: 2 });
    if (receipt.delivery.rider) row(`Rider: ${receipt.delivery.rider}`, "", { indent: 2 });
    if (receipt.delivery.notes) row(`Note: ${receipt.delivery.notes}`, "", { indent: 2 });
    row(`Status: ${receiptDeliveryStatus[receipt.delivery.status] ?? receipt.delivery.status}${receipt.delivery.deliveredAt ? ` ${receiptTime(receipt.delivery.deliveredAt)}` : ""}`, "", { indent: 2 });
    if (receipt.delivery.checkId) center("RIDER: CHECK THE DISCOUNT ID AT THE DOOR", { bold: true });
  }
  rule();
  for (const item of receiptItemsByStation(receipt)) {
    if (item.heading) row(item.heading, "", { bold: true });
    row(`${item.quantity} x ${item.name}`, money(item.quantity * item.unitPrice), { hang: `${item.quantity} x `.length });
    const details = [item.size && item.size !== "Regular" ? item.size : "", item.temperature === "hot" ? "Hot" : item.temperature === "cold" ? "Iced" : "", item.quantity > 1 ? `@ ${money(item.unitPrice)}` : "", item.rewardName ? `Reward: ${item.rewardName}` : ""].filter(Boolean).join(" - ");
    if (details) row(details, "", { indent: 2 });
    if (item.custom) row(item.custom, "", { indent: 2 });
    for (const addition of item.additions) row(`+ ${addition.name}${addition.quantity !== 1 ? ` x${addition.quantity}` : ""}`, money(addition.quantity * addition.unitPrice), { indent: 2 });
  }
  rule();
  const idDiscounts = receipt.idDiscounts ?? [];
  if (receipt.discountAmount || receipt.vatExemptAmount || receipt.deliveryFee) {
    row(receipt.deliveryFee ? "Items" : "Subtotal", money(receiptSubtotal(receipt)));
    if (idDiscounts.length > 0) {
      for (const entry of idDiscounts) {
        row(`${entry.name}: ${entry.holderName}`, "", { bold: true });
        if (entry.idNumber) row(`ID ${entry.idNumber}`, "", { indent: 2 });
        row(entry.groupSize ? `Share (1 of ${entry.groupSize})` : "Items covered", money(entry.coveredAmount), { indent: 2 });
        if (entry.vatExempt) row("Less VAT", `-${money(entry.vatExempt)}`, { indent: 2 });
        row("Less discount", `-${money(entry.discount)}`, { indent: 2 });
      }
    } else if (receipt.discountAmount) {
      row(`Discount${receipt.discountLabel ? `: ${receipt.discountLabel}` : ""}`, `-${money(receipt.discountAmount)}`);
    }
  }
  if (receipt.deliveryFee) row("Delivery fee", money(receipt.deliveryFee));
  row("TOTAL", `P ${money(receipt.total)}`, { bold: true });
  const isGcash = receipt.paymentProvider === "paymongo_gcash" || receipt.paymentProvider === "gcash_direct" || receipt.paymentMethod === "online";
  if (receipt.paymentMethod === "split" && receipt.cashPortion !== null) {
    row("Cash", money(receipt.cashPortion));
    if (receipt.received !== null) row("Cash received", money(receipt.received), { indent: 2 });
    if (receipt.change !== null) row("Change", money(receipt.change), { indent: 2 });
    row("GCash", money(receipt.total - receipt.cashPortion));
  } else if (receipt.paymentMethod === "cod") {
    row(receipt.received ? "Cash on delivery" : "To collect", money(receipt.total), { bold: !receipt.received });
    if (receipt.received) row("Collected by rider", money(receipt.received), { indent: 2 });
  } else if (isGcash) {
    row("Paid with GCash", money(receipt.total));
  } else {
    if (receipt.received !== null) row("Cash received", money(receipt.received));
    if (receipt.change !== null) row("Change", money(receipt.change));
  }
  if (isGcash && receipt.paymentReference) row(`Ref ${receipt.paymentReference}`);
  if (receipt.loyalty) {
    rule();
    if (receipt.loyalty.starsUsed) row("Stars used", `-${receipt.loyalty.starsUsed}`);
    if (receipt.loyalty.starsEarned) row("Stars earned", `+${receipt.loyalty.starsEarned}`);
    row("Your stars", String(receipt.loyalty.balance));
    center(receipt.loyalty.campaignName);
  }
  for (const entry of idDiscounts.filter(needsSignature)) {
    rule();
    row(`${entry.name}: ${entry.holderName}${entry.idNumber ? ` - ID ${entry.idNumber}` : ""}`);
    newline(); newline();
    row("Signature", "_".repeat(Math.floor(cols / 2)));
  }
  rule();
  center(receiptFooter(receipt));
  center("THIS IS NOT AN OFFICIAL RECEIPT", { bold: true });
  if (reprint) center(`Reprinted ${receiptTime(new Date().toISOString())}`);
  raw(0x1B, 0x64, 4); // feed 4 lines past the tear bar
  raw(0x1D, 0x56, 0x42, 0); // cut, on printers with a cutter (others ignore it)
  return new Uint8Array(bytes);
}


// The RawBT browser intent that hands the ESC/POS commands to the RawBT app (Android).
export function rawbtIntentUrl(commands: Uint8Array): string {
  let binary = "";
  commands.forEach((value) => { binary += String.fromCharCode(value); });
  return `intent:base64,${btoa(binary)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}
