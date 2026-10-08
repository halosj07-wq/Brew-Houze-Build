import { unitCases } from "./harness";
import { parseOrderItems, parseServiceType } from "@/lib/orders";
import { canHandOff, stationForRole } from "@/lib/stations";
import { parseCoverage } from "@/lib/id-verifications";

// Orders (lib/orders.ts): what a cart may contain before it is priced; staff roles (lib/stations.ts).
const line = (extra: Record<string, unknown> = {}) => ({ product_variant_id: 5, quantity: 1, ...extra });

unitCases("cashier", "Orders", [
  { id: "UT-ORD-01", fn: "parseServiceType", title: "accepts dine in, take out and delivery only", input: "\"dine_in\", \"delivery\", \"pickup\"", expected: ["dine_in", "delivery", null], run: () => ["dine_in", "delivery", "pickup"].map(parseServiceType) },
  { id: "UT-ORD-02", fn: "parseOrderItems", title: "keeps a valid cart line", input: "Variant 5, quantity 2, add-on 9", expected: [{ productVariantId: 5, quantity: 2, additionIds: [9], rewardId: null, customizations: [], note: "" }], run: () => parseOrderItems([line({ quantity: 2, addition_ids: [9] })]) },
  { id: "UT-ORD-03", fn: "parseOrderItems", title: "drops a line with quantity 0", input: "Variant 5, quantity 0", expected: [], expectedText: "No lines", run: () => parseOrderItems([line({ quantity: 0 })]) },
  { id: "UT-ORD-04", fn: "parseOrderItems", title: "drops a line over the 500 limit", input: "Variant 5, quantity 501", expected: [], expectedText: "No lines", run: () => parseOrderItems([line({ quantity: 501 })]) },
  { id: "UT-ORD-05", fn: "parseOrderItems", title: "a free reward line is one item only", input: "Reward line, quantity 2", expected: [], expectedText: "No lines", run: () => parseOrderItems([line({ quantity: 2, reward_id: 3 })]) },
  { id: "UT-ORD-06", fn: "parseOrderItems", title: "keeps a repeated add-on (double shot) and drops invalid ones", input: "Add-ons [7, 7, −1, \"x\"]", expected: [7, 7], run: () => parseOrderItems([line({ addition_ids: [7, 7, -1, "x"] })])[0].additionIds },
  { id: "UT-ORD-07", fn: "parseOrderItems", title: "keeps only less/none requests, one per ingredient, in order", input: "Ingredient 12 \"none\", 4 \"less\", 8 \"extra\"", expected: [{ inventoryId: 4, level: "less" }, { inventoryId: 12, level: "none" }], run: () => parseOrderItems([line({ customizations: [{ inventory_id: 12, level: "none" }, { inventory_id: 4, level: "less" }, { inventory_id: 8, level: "extra" }] })])[0].customizations },
  { id: "UT-ORD-08", fn: "parseOrderItems", title: "tidies the note on a line", input: "Note \"  less   ice\\n please \"", expected: "less ice please", run: () => parseOrderItems([line({ note: "  less   ice\n please " })])[0].note },
  { id: "UT-ORD-09", fn: "parseCoverage", title: "a shared bill split by the group", input: "{ group_size: 3 }", expected: { lines: null, groupSize: 3 }, run: () => parseCoverage({ group_size: 3 }) },
]);

unitCases("cashier", "Staff Roles", [
  { id: "UT-STA-01", fn: "stationForRole", title: "baristas work the bar, kitchen staff the kitchen", input: "\"Barista\", \"kitchen\", \"cashier\"", expected: ["bar", "kitchen", null], expectedText: "bar, kitchen, both (null)", run: () => ["Barista", "kitchen", "cashier"].map(stationForRole) },
  { id: "UT-STA-02", fn: "canHandOff", title: "the kitchen and riders do not hand orders over", input: "\"barista\", \"cashier\", \"kitchen\", \"rider\"", expected: [true, true, false, false], run: () => ["barista", "cashier", "kitchen", "rider"].map(canHandOff) },
]);
