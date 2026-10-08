// How the Excel exports (app/page.tsx) word an order's status, payment and refund method, and the
// date in export file names (Philippine date).

export const excelStatus = (status: string) => status.startsWith("void") ? "Voided" : status.startsWith("refund") ? "Refunded" : status === "completed" ? "Completed" : status.charAt(0).toUpperCase() + status.slice(1);
export const excelPayment = (order: { orderSource: string; paymentMethod: string }) => order.paymentMethod === "cod" ? "Cash on delivery" : order.orderSource === "online" ? "Mobile menu (GCash)" : order.paymentMethod === "split" ? "Split (cash + GCash)" : order.paymentMethod === "online" ? "GCash" : "Cash";
export const excelReturnMethod = (method: string | null | undefined) => method === "gcash" ? "GCash" : method === "cash" ? "Cash" : method === "split" ? "As paid (cash + GCash)" : "";

export function getFinanceDateStamp(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}
