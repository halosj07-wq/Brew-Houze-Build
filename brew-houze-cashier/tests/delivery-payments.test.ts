import { unitCases } from "./harness";
import { deliveryFeeFor, normalizePhone, withinDeliveryHours } from "@/lib/delivery";
import { normalizeGcashReference } from "@/lib/gcash";
import { parseCounterCartId } from "@/lib/counter-carts";

// Delivery (lib/delivery.ts) and payments (lib/gcash.ts, lib/counter-carts.ts).
// Manila is UTC+8: 06:00 UTC is 2:00 PM in Manila.
const manila = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00+08:00`);

unitCases("cashier", "Delivery", [
  { id: "UT-DLV-01", fn: "deliveryFeeFor", title: "zone fee below the free-delivery amount", input: "Zone fee ₱50.00, free from ₱500.00, items ₱499.00", expected: 50, expectedText: "₱50.00", run: () => deliveryFeeFor({ zoneFee: 50, freeAbove: 500 }, 499) },
  { id: "UT-DLV-02", fn: "deliveryFeeFor", title: "free delivery from exactly the free-delivery amount", input: "Zone fee ₱50.00, free from ₱500.00, items ₱500.00", expected: 0, expectedText: "₱0.00 (free)", run: () => deliveryFeeFor({ zoneFee: 50, freeAbove: 500 }, 500) },
  { id: "UT-DLV-03", fn: "deliveryFeeFor", title: "always the zone fee when free delivery is off", input: "Zone fee ₱50.00, no free delivery, items ₱2,000.00", expected: 50, expectedText: "₱50.00", run: () => deliveryFeeFor({ zoneFee: 50, freeAbove: null }, 2000) },
  { id: "UT-DLV-04", fn: "normalizePhone", title: "accepts the ways people write mobile numbers", input: "\"0917 123 4567\", \"+63 917-123-4567\", \"9171234567\"", expected: ["09171234567", "09171234567", "09171234567"], run: () => ["0917 123 4567", "+63 917-123-4567", "9171234567"].map(normalizePhone) },
  { id: "UT-DLV-05", fn: "normalizePhone", title: "refuses what is not a mobile number", input: "\"12345\", \"02 8123 4567\" (landline)", expected: [null, null], run: () => ["12345", "02 8123 4567"].map(normalizePhone) },
  { id: "UT-DLV-06", fn: "withinDeliveryHours", title: "open within the delivery hours", input: "Hours 10:00–22:00, now 2:00 PM (Manila)", expected: true, run: () => withinDeliveryHours({ start: "10:00", end: "22:00" }, manila("14:00")) },
  { id: "UT-DLV-07", fn: "withinDeliveryHours", title: "closed after the delivery hours", input: "Hours 10:00–22:00, now 11:00 PM (Manila)", expected: false, run: () => withinDeliveryHours({ start: "10:00", end: "22:00" }, manila("23:00")) },
  { id: "UT-DLV-08", fn: "withinDeliveryHours", title: "hours that run past midnight", input: "Hours 20:00–02:00, now 1:00 AM (Manila)", expected: true, run: () => withinDeliveryHours({ start: "20:00", end: "02:00" }, manila("01:00")) },
]);

unitCases("cashier", "Payments", [
  { id: "UT-PAY-01", fn: "normalizeGcashReference", title: "accepts a 13-digit reference as GCash prints it", input: "\"1234 567 890123\"", expected: "1234567890123", run: () => normalizeGcashReference("1234 567 890123") },
  { id: "UT-PAY-02", fn: "normalizeGcashReference", title: "refuses a reference with a digit missing", input: "\"123456789012\" (12 digits)", expected: null, expectedText: "Rejected (null)", run: () => normalizeGcashReference("123456789012") },
  { id: "UT-PAY-03", fn: "normalizeGcashReference", title: "refuses letters", input: "\"12345ABC90123\"", expected: null, expectedText: "Rejected (null)", run: () => normalizeGcashReference("12345ABC90123") },
  { id: "UT-PAY-04", fn: "parseCounterCartId", title: "reads a cart sent to the counter", input: "\"15\", 0, \"abc\"", expected: [15, null, null], run: () => ["15", 0, "abc"].map(parseCounterCartId) },
]);
