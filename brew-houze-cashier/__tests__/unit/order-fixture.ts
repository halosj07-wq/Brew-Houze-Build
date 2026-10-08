import { fakeDb } from "./fake-db";
import { placeOrder, type OrderItemInput, type PlaceOrderInput } from "@/lib/orders";

// A small café for the checkout tests (lib/orders.ts placeOrder), answered by a fake database.
//   Spanish Latte (variant 5)  ₱120.00, made at the bar: 18 g espresso beans, 150 ml fresh milk
//                              (customer may ask for less or none), 15 ml caramel syrup (same)
//   Bottled Water (variant 8)  ₱30.00, sold as stocked: 1 bottle
//   Extra Shot (add-on 9)      ₱25.00, 18 g espresso beans
//   Variant 99                 archived (not on the menu any more)
const VARIANTS = [
  { product_variant_id: 5, product_id: 1, price: "120.00", product_name: "Spanish Latte", product_type: "recipe", product_category: "Coffee", station: "bar" },
  { product_variant_id: 8, product_id: 2, price: "30.00", product_name: "Bottled Water", product_type: "stock", product_category: "Drinks", station: "bar" },
];
const RECIPES = [
  { product_variant_id: 5, inventory_id: 10, required_quantity: "18", item_name: "Espresso Beans", is_customizable: false, is_whole_unit: false, unit_cost: "1.2" },
  { product_variant_id: 5, inventory_id: 11, required_quantity: "150", item_name: "Fresh Milk", is_customizable: true, is_whole_unit: false, unit_cost: "0.1" },
  { product_variant_id: 5, inventory_id: 12, required_quantity: "15", item_name: "Caramel Syrup", is_customizable: true, is_whole_unit: false, unit_cost: "0.5" },
  { product_variant_id: 8, inventory_id: 20, required_quantity: "1", item_name: "Water Bottle", is_customizable: false, is_whole_unit: true, unit_cost: "12" },
];
const ADDITIONS = [{ addition_id: 9, addition_name: "Extra Shot", inventory_id: 10, quantity: "18", price: "25.00", station: "bar" }];
const ITEMS: Record<number, { item_name: string; ingredient_category: string; unit_of_measure: string }> = {
  10: { item_name: "Espresso Beans", ingredient_category: "Coffee", unit_of_measure: "g" },
  11: { item_name: "Fresh Milk", ingredient_category: "Dairy", unit_of_measure: "ml" },
  12: { item_name: "Caramel Syrup", ingredient_category: "Syrups", unit_of_measure: "ml" },
  20: { item_name: "Water Bottle", ingredient_category: "Drinks", unit_of_measure: "pc" },
};

export const latte = (extra: Partial<OrderItemInput> = {}): OrderItemInput => ({ productVariantId: 5, quantity: 1, additionIds: [], rewardId: null, customizations: [], note: "", ...extra });

// orders: the orders already in each shift (for queue numbers). stock: what is on hand.
export function orderDb(options: { open?: boolean; stock?: Record<number, number>; orders?: { shift_id: number; queue_number: number }[] } = {}) {
  const stock = { 10: 1000, 11: 2000, 12: 500, 20: 24, ...options.stock };
  const orders = options.orders ?? [];
  const has = (ids: unknown, id: number) => (ids as number[]).includes(id);
  const db = fakeDb([
    [/FROM shifts WHERE closed_at IS NULL FOR SHARE/, options.open === false ? [] : [{ shift_id: 7 }]],
    [/FROM product_variants pv JOIN products p/, (params) => VARIANTS.filter((row) => has(params[0], row.product_variant_id))],
    [/FROM variant_ingredients vi JOIN inventory i/, (params) => RECIPES.filter((row) => has(params[0], row.product_variant_id))],
    [/addition_categories/, []],
    [/FROM additions a WHERE a.is_active/, (params) => ADDITIONS.filter((row) => has(params[0], row.addition_id))],
    [/derived_from_inventory_id IS NOT NULL/, []],
    // The guarded stock update: only when enough is on hand (quantity >= $1).
    [/^UPDATE inventory SET quantity = quantity - \$1/, (params) => {
      const [amount, id] = params as [number, keyof typeof stock];
      if (stock[id] < amount) return { rows: [], rowCount: 0 };
      stock[id] -= amount;
      return [{ inventory_id: id, ...ITEMS[id], quantity: String(stock[id]) }];
    }],
    [/^SELECT item_name FROM inventory WHERE inventory_id/, (params) => [{ item_name: ITEMS[params[0] as number].item_name }]],
    // COALESCE(MAX(queue_number), 0) + 1 over the orders of the shift ($1).
    [/MAX\(queue_number\)/, (params) => [{ queue_number: Math.max(0, ...orders.filter((order) => order.shift_id === params[0]).map((order) => order.queue_number)) + 1 }]],
    [/^INSERT INTO sales_orders/, (params) => [{ order_id: 900, queue_number: params[2], created_at: "2026-10-08T10:00:00.000+08:00" }]],
    [/^INSERT INTO sales_order_items/, [{ order_item_id: 501 }]],
  ]);
  // The saved order, by column.
  const savedOrder = () => {
    const params = db.ran(/^INSERT INTO sales_orders/)[0]?.params ?? [];
    return { total: params[1], queueNumber: params[2], source: params[3], customerToken: params[4], received: params[5], change: params[6], method: params[7], shiftId: params[8], subtotal: params[13] };
  };
  // What each stock update took off, by item name.
  const deducted = () => Object.fromEntries(db.ran(/^UPDATE inventory SET quantity = quantity - \$1/).map((entry) => [ITEMS[entry.params[1] as number].item_name, entry.params[0]]));
  return { db, stock, savedOrder, deducted };
}

export function order(db: ReturnType<typeof orderDb>["db"], input: Partial<PlaceOrderInput>) {
  return placeOrder(db.client, { source: "cashier", cashierAdminId: 2, paymentMethod: "online", serviceType: "dine_in", items: [latte()], ...input });
}
