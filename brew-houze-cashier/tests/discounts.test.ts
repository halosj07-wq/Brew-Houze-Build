import { unitCases } from "./harness";
import { idDiscountAmounts, isStatutoryDiscount, parseIdDiscounts } from "@/lib/discounts";

// ID discounts (lib/discounts.ts): senior and PWD in a VAT-registered café take the VAT off first
// (price / 1.12), then 20% of what is left; other discounts come off the price as it is.
const senior = { discountKind: "percent" as const, discountValue: 20, maxDiscount: null, vatExempt: true };
const vat = { registered: true, rate: 12 };

unitCases("cashier", "ID Discounts", [
  { id: "UT-DIS-01", fn: "idDiscountAmounts", title: "senior discount removes VAT, then 20%", input: "Senior, ₱112.00 item, VAT-registered (12%)", expected: { vatExempt: 12, discount: 20 }, expectedText: "VAT exempt ₱12.00, discount ₱20.00 (pays ₱80.00)", run: () => idDiscountAmounts(senior, 112, vat) },
  { id: "UT-DIS-02", fn: "idDiscountAmounts", title: "PWD discount on two items", input: "PWD, ₱224.00 covered, VAT-registered (12%)", expected: { vatExempt: 24, discount: 40 }, expectedText: "VAT exempt ₱24.00, discount ₱40.00 (pays ₱160.00)", run: () => idDiscountAmounts(senior, 224, vat) },
  { id: "UT-DIS-03", fn: "idDiscountAmounts", title: "no VAT removal when the café is not VAT-registered", input: "Senior, ₱100.00 item, not VAT-registered", expected: { vatExempt: 0, discount: 20 }, expectedText: "VAT exempt ₱0.00, discount ₱20.00", run: () => idDiscountAmounts(senior, 100, { registered: false, rate: 12 }) },
  { id: "UT-DIS-04", fn: "idDiscountAmounts", title: "student discount comes off the VAT-inclusive price", input: "Student 10%, ₱150.00 item", expected: { vatExempt: 0, discount: 15 }, expectedText: "VAT exempt ₱0.00, discount ₱15.00", run: () => idDiscountAmounts({ discountKind: "percent", discountValue: 10, maxDiscount: null, vatExempt: false }, 150, vat) },
  { id: "UT-DIS-05", fn: "idDiscountAmounts", title: "percent discount stops at its cap", input: "20% capped at ₱50.00, ₱500.00 covered", expected: { vatExempt: 0, discount: 50 }, expectedText: "Discount ₱50.00 (the cap, not ₱100.00)", run: () => idDiscountAmounts({ discountKind: "percent", discountValue: 20, maxDiscount: 50, vatExempt: false }, 500, vat) },
  { id: "UT-DIS-06", fn: "idDiscountAmounts", title: "fixed discount never exceeds the item price", input: "Fixed ₱30.00 off, ₱20.00 item", expected: { vatExempt: 0, discount: 20 }, expectedText: "Discount ₱20.00 (item becomes free, not negative)", run: () => idDiscountAmounts({ discountKind: "fixed", discountValue: 30, maxDiscount: null, vatExempt: false }, 20, vat) },
  { id: "UT-DIS-07", fn: "idDiscountAmounts", title: "nothing covered gives no discount", input: "Senior, ₱0.00 covered", expected: { vatExempt: 0, discount: 0 }, run: () => idDiscountAmounts(senior, 0, vat) },
  { id: "UT-DIS-08", fn: "idDiscountAmounts", title: "a negative amount is treated as nothing", input: "Senior, −₱50.00 covered (invalid)", expected: { vatExempt: 0, discount: 0 }, run: () => idDiscountAmounts(senior, -50, vat) },
  { id: "UT-DIS-09", fn: "isStatutoryDiscount", title: "senior and PWD are fixed by law", input: "\"senior\", \"pwd\", \"student\"", expected: [true, true, false], run: () => ["senior", "pwd", "student"].map(isStatutoryDiscount) },
  { id: "UT-DIS-10", fn: "parseIdDiscounts", title: "cleans the holder name and empty ID number", input: "holder \"  Juan   Dela Cruz \", ID number \"  \", group of 3", expected: [{ typeId: 1, holderName: "Juan Dela Cruz", idNumber: null, lines: null, groupSize: 3 }], run: () => parseIdDiscounts([{ type_id: 1, holder_name: "  Juan   Dela Cruz ", id_number: "  ", group_size: 3 }]) },
  { id: "UT-DIS-11", fn: "parseIdDiscounts", title: "anything but a list gives no discounts", input: "\"senior\" (not a list)", expected: [], run: () => parseIdDiscounts("senior") },
]);
