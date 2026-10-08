import { unitCases } from "./harness";
import { birthdayMatch, computeDiscount, discountText, rewardMismatch, type LoyaltyRewardRule } from "@/lib/loyalty";

// Loyalty (lib/loyalty.ts): discount rewards, free-item rewards and birthday treats.
const reward = (rule: Partial<LoyaltyRewardRule>): LoyaltyRewardRule => ({
  id: 1, campaignId: 1, kind: "seasonal", name: "Reward", starsCost: 10, rewardType: "discount",
  productId: null, category: null, maxPrice: null, discountKind: "percent", discountValue: 10, maxDiscount: null, minOrderAmount: null, ...rule,
});
const coffee = { productId: 1, category: "Coffee", amount: 150 };
const pastry = { productId: 2, category: "Pastries", amount: 20 };

unitCases("cashier", "Loyalty", [
  { id: "UT-LOY-01", fn: "computeDiscount", title: "percent discount on the whole order", input: "10% off, ₱300.00 order", expected: 30, expectedText: "₱30.00", run: () => computeDiscount(reward({}), [{ ...coffee, amount: 300 }], 300) },
  { id: "UT-LOY-02", fn: "computeDiscount", title: "percent discount stops at its cap", input: "10% off up to ₱20.00, ₱300.00 order", expected: 20, expectedText: "₱20.00", run: () => computeDiscount(reward({ maxDiscount: 20 }), [{ ...coffee, amount: 300 }], 300) },
  { id: "UT-LOY-03", fn: "computeDiscount", title: "refused below the minimum order", input: "Needs ₱200.00, order is ₱150.00", expected: { error: "\"Reward\" needs an order of at least ₱200.00." }, expectedText: "Error: needs an order of at least ₱200.00", run: () => computeDiscount(reward({ minOrderAmount: 200 }), [coffee], 150) },
  { id: "UT-LOY-04", fn: "computeDiscount", title: "category discount only counts that category, never more than it", input: "₱30.00 off Pastries; coffee ₱150.00 + pastry ₱20.00", expected: 20, expectedText: "₱20.00 (the pastry's price, not ₱30.00)", run: () => computeDiscount(reward({ discountKind: "fixed", discountValue: 30, category: "Pastries" }), [coffee, pastry], 170) },
  { id: "UT-LOY-05", fn: "computeDiscount", title: "refused when the category is not in the order", input: "₱30.00 off Pastries; coffee only", expected: { error: "\"Reward\" only applies to Pastries items that is not in this order." }, expectedText: "Error: only applies to Pastries items", run: () => computeDiscount(reward({ discountKind: "fixed", discountValue: 30, category: "Pastries" }), [coffee], 150) },
  { id: "UT-LOY-06", fn: "rewardMismatch", title: "free drink up to a price accepts a cheaper drink", input: "Free drink up to ₱160.00, Americano ₱150.00", expected: null, expectedText: "Accepted (no reason given)", run: () => rewardMismatch(reward({ rewardType: "free_item", maxPrice: 160 }), { productId: 1, category: "Coffee", price: 150, name: "Americano" }) },
  { id: "UT-LOY-07", fn: "rewardMismatch", title: "free drink up to a price refuses a dearer drink", input: "Free drink up to ₱160.00, Caramel Latte ₱180.00", expected: "\"Reward\" covers items up to ₱160.00. Caramel Latte costs ₱180.00.", run: () => rewardMismatch(reward({ rewardType: "free_item", maxPrice: 160 }), { productId: 3, category: "Coffee", price: 180, name: "Caramel Latte" }) },
  { id: "UT-LOY-08", fn: "rewardMismatch", title: "a discount reward cannot be taken as a free item", input: "10% discount reward used on an item", expected: "\"Reward\" is a discount, not a free item.", run: () => rewardMismatch(reward({}), { productId: 1, category: "Coffee", price: 150, name: "Americano" }) },
  { id: "UT-LOY-09", fn: "birthdayMatch", title: "birthday-day treat on the birthday itself", input: "Birthday Oct 8, window \"day\", today 2026-10-08", expected: { eligible: true, claimYear: 2026 }, run: () => birthdayMatch("2001-10-08", "day", "2026-10-08") },
  { id: "UT-LOY-10", fn: "birthdayMatch", title: "birthday-day treat not the day after", input: "Birthday Oct 8, window \"day\", today 2026-10-09", expected: { eligible: false, claimYear: 2026 }, run: () => birthdayMatch("2001-10-08", "day", "2026-10-09") },
  { id: "UT-LOY-11", fn: "birthdayMatch", title: "birthday week across New Year belongs to the old year", input: "Birthday Dec 31, window \"week\", today 2027-01-02", expected: { eligible: true, claimYear: 2026 }, run: () => birthdayMatch("1999-12-31", "week", "2027-01-02") },
  { id: "UT-LOY-12", fn: "birthdayMatch", title: "a 29 February birthday falls on 28 February in other years", input: "Birthday Feb 29, window \"day\", today 2027-02-28", expected: { eligible: true, claimYear: 2027 }, run: () => birthdayMatch("2004-02-29", "day", "2027-02-28") },
  { id: "UT-LOY-13", fn: "birthdayMatch", title: "birthday month treat any day that month", input: "Birthday Oct 8, window \"month\", today 2026-10-30", expected: { eligible: true, claimYear: 2026 }, run: () => birthdayMatch("2001-10-08", "month", "2026-10-30") },
  { id: "UT-LOY-14", fn: "discountText", title: "describes a capped percent discount", input: "10% off, up to ₱50.00", expected: "10% off (up to ₱50.00)", run: () => discountText({ discountKind: "percent", discountValue: 10, maxDiscount: 50, category: null }) },
]);
