import type { PoolClient } from "pg";
import pool from "@/lib/db";

// ID discounts: senior citizen, PWD, student, employee meal and custom discounts (see
// id-discounts-migration.sql). brew-houze-cashier and brew-houze-mobile keep identical copies of
// this file.
//
// Each person with a discount (the holder) is one entry on the order, covering either
//   their own items   chosen cart lines, all or some of the units on each line, or
//   a shared bill     the whole order split evenly by the number of people (groupSize),
// never both in one order. Senior and PWD discounts are fixed by law: when the shop is
// VAT-registered the VAT comes off first (price / 1.12), then 20% of what is left. Other
// discounts come off the price as it is. An order uses ID discounts or a loyalty discount
// reward, not both.

type Db = PoolClient | typeof pool;

export type DiscountCode = "senior" | "pwd" | "student" | "employee" | "custom";
export type DiscountTypeRule = {
  id: number; code: DiscountCode; name: string; discountKind: "percent" | "fixed"; discountValue: number; maxDiscount: number | null;
  vatExempt: boolean; requiresId: boolean; idLabel: string | null; isActive: boolean;
};
export type VatSettings = { registered: boolean; rate: number };
// lines: indexes into the order's items, with how many units of each line the holder had.
// null means a shared bill split by groupSize.
export type IdDiscountInput = { typeId: number; holderName: string; idNumber: string | null; lines: { line: number; quantity: number }[] | null; groupSize: number | null };
export type PlannedIdDiscount = {
  rule: DiscountTypeRule; holderName: string; idNumber: string | null; lines: { line: number; quantity: number }[] | null; groupSize: number | null;
  coveredAmount: number; vatExempt: number; discount: number;
};

const MAX_HOLDERS = 20;
const round2 = (value: number) => Math.round(value * 100) / 100;

// Senior and PWD discounts follow the law and cannot be changed, only switched on or off.
export function isStatutoryDiscount(code: string): boolean {
  return code === "senior" || code === "pwd";
}

export async function vatSettings(db: Db = pool): Promise<VatSettings> {
  const result = await db.query("SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN ('vat_registered', 'vat_rate')");
  const values = new Map(result.rows.map((row) => [String(row.setting_key), String(row.setting_value)]));
  const rate = Number(values.get("vat_rate") ?? 12);
  return { registered: values.get("vat_registered") !== "false", rate: Number.isFinite(rate) && rate >= 0 && rate <= 50 ? rate : 12 };
}

function toRule(row: Record<string, unknown>): DiscountTypeRule {
  return {
    id: Number(row.discount_type_id),
    code: String(row.code) as DiscountCode,
    name: String(row.name),
    discountKind: row.discount_kind === "fixed" ? "fixed" : "percent",
    discountValue: Number(row.discount_value),
    maxDiscount: row.max_discount === null || row.max_discount === undefined ? null : Number(row.max_discount),
    vatExempt: Boolean(row.vat_exempt),
    requiresId: Boolean(row.requires_id),
    idLabel: (row.id_label as string | null) ?? null,
    isActive: Boolean(row.is_active),
  };
}

export async function discountTypes(db: Db = pool, activeOnly = true): Promise<DiscountTypeRule[]> {
  const result = await db.query(`
    SELECT discount_type_id, code, name, discount_kind, discount_value, max_discount, vat_exempt, requires_id, id_label, is_active
    FROM discount_types
    ${activeOnly ? "WHERE is_active = TRUE" : ""}
    ORDER BY sort_order, name, discount_type_id
  `);
  return result.rows.map(toRule);
}

// Reads ID discounts from a request body: [{ type_id, holder_name, id_number, lines: [{ line, quantity }], group_size }].
// Values are checked properly by planIdDiscounts.
export function parseIdDiscounts(value: unknown): IdDiscountInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_HOLDERS + 1).map((raw) => {
    const entry = (raw ?? {}) as { type_id?: unknown; holder_name?: unknown; id_number?: unknown; lines?: unknown; group_size?: unknown };
    const idNumber = typeof entry.id_number === "string" ? entry.id_number.trim() : "";
    const groupSize = Number(entry.group_size);
    return {
      typeId: Number(entry.type_id),
      holderName: typeof entry.holder_name === "string" ? entry.holder_name.trim().replace(/\s+/g, " ") : "",
      idNumber: idNumber || null,
      lines: Array.isArray(entry.lines) ? entry.lines.map((line) => { const item = (line ?? {}) as { line?: unknown; quantity?: unknown }; return { line: Number(item.line), quantity: Number(item.quantity) }; }) : null,
      groupSize: Number.isInteger(groupSize) ? groupSize : null,
    };
  });
}

// What one holder saves on coveredAmount (VAT included): the VAT taken off (senior and PWD in a
// VAT-registered shop), then the discount on what is left.
export function idDiscountAmounts(rule: Pick<DiscountTypeRule, "discountKind" | "discountValue" | "maxDiscount" | "vatExempt">, coveredAmount: number, vat: VatSettings): { vatExempt: number; discount: number } {
  const covered = Math.max(0, round2(coveredAmount));
  const vatExempt = rule.vatExempt && vat.registered && vat.rate > 0 ? round2(covered - covered / (1 + vat.rate / 100)) : 0;
  const base = round2(covered - vatExempt);
  let discount = rule.discountKind === "percent" ? base * rule.discountValue / 100 : rule.discountValue;
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return { vatExempt, discount: round2(Math.min(Math.max(0, discount), base)) };
}

// Checks the ID discounts of an order and works out each holder's amounts. lineAmounts holds,
// per order item (same order as the items sent), what one unit is charged (a reward line only
// its add-ons) and how many units the line has.
export async function planIdDiscounts(client: PoolClient, inputs: IdDiscountInput[], lineAmounts: { unitAmount: number; quantity: number }[]): Promise<PlannedIdDiscount[]> {
  if (inputs.length === 0) return [];
  if (inputs.length > MAX_HOLDERS) throw new Error(`An order can have at most ${MAX_HOLDERS} ID discounts.`);
  const typeIds = Array.from(new Set(inputs.map((input) => input.typeId)));
  if (typeIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error("Choose the discount for each person.");
  const rules = new Map((await client.query(`
    SELECT discount_type_id, code, name, discount_kind, discount_value, max_discount, vat_exempt, requires_id, id_label, is_active
    FROM discount_types WHERE discount_type_id = ANY($1::int[]) AND is_active = TRUE
  `, [typeIds])).rows.map((row) => [Number(row.discount_type_id), toRule(row)]));
  const vat = await vatSettings(client);

  const shared = inputs.filter((input) => input.lines === null);
  if (shared.length > 0 && shared.length !== inputs.length) throw new Error("Use either each person's own items or a shared bill for all ID discounts in one order, not both.");
  const groupSize = shared.length > 0 ? inputs[0].groupSize : null;
  if (shared.length > 0) {
    if (groupSize === null || !Number.isInteger(groupSize) || groupSize < 1 || groupSize > 50) throw new Error("Enter how many people share the bill (1 to 50).");
    if (inputs.some((input) => input.groupSize !== groupSize)) throw new Error("Every ID discount on a shared bill uses the same number of people.");
    if (inputs.length > groupSize) throw new Error(`There are more ID discounts (${inputs.length}) than people sharing the bill (${groupSize}).`);
  }
  const orderAmount = lineAmounts.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
  const unitsTaken = new Map<number, number>();
  const idsSeen = new Set<string>();

  return inputs.map((input) => {
    const rule = rules.get(input.typeId);
    if (!rule) throw new Error("A discount on this order is no longer available. Remove it and add it again.");
    if (input.holderName.length < 2 || input.holderName.length > 80) throw new Error(`Enter the full name for the ${rule.name} discount.`);
    const idNumber = input.idNumber ? input.idNumber.slice(0, 40) : null;
    if (rule.requiresId && (!idNumber || idNumber.length < 3)) throw new Error(`Enter the ${rule.idLabel ?? "ID number"} for ${input.holderName}.`);
    if (idNumber) {
      const seenKey = `${rule.code}:${idNumber.toLowerCase()}`;
      if (idsSeen.has(seenKey)) throw new Error(`The same ${rule.name} ID (${idNumber}) is on this order twice.`);
      idsSeen.add(seenKey);
    }

    let coveredAmount: number;
    let lines: { line: number; quantity: number }[] | null = null;
    if (input.lines === null) {
      coveredAmount = orderAmount / Number(groupSize);
    } else {
      // Merge repeated lines, then check nobody takes more units than the line has.
      const merged = new Map<number, number>();
      for (const entry of input.lines) {
        if (!Number.isInteger(entry.line) || entry.line < 0 || entry.line >= lineAmounts.length || !Number.isInteger(entry.quantity) || entry.quantity < 1) throw new Error(`Check the items covered by ${input.holderName}'s discount.`);
        merged.set(entry.line, (merged.get(entry.line) ?? 0) + entry.quantity);
      }
      lines = Array.from(merged, ([line, quantity]) => ({ line, quantity })).sort((a, b) => a.line - b.line);
      for (const { line, quantity } of lines) {
        const taken = (unitsTaken.get(line) ?? 0) + quantity;
        if (taken > lineAmounts[line].quantity) throw new Error("An item is covered by more ID discounts than there are units of it.");
        unitsTaken.set(line, taken);
      }
      coveredAmount = lines.reduce((sum, { line, quantity }) => sum + lineAmounts[line].unitAmount * quantity, 0);
    }
    coveredAmount = round2(coveredAmount);
    if (coveredAmount <= 0) throw new Error(`${input.holderName}'s discount does not cover anything that is charged.`);
    const amounts = idDiscountAmounts(rule, coveredAmount, vat);
    return { rule, holderName: input.holderName, idNumber, lines, groupSize: input.lines === null ? groupSize : null, coveredAmount, ...amounts };
  });
}

// The order's discount_label and discount_source for its ID discounts.
export function idDiscountSummary(planned: PlannedIdDiscount[]): { label: string; source: string } {
  const names = Array.from(new Set(planned.map((entry) => entry.rule.name)));
  const codes = Array.from(new Set(planned.map((entry) => entry.rule.code)));
  const label = planned.length === 1
    ? `${planned[0].rule.name} (${planned[0].holderName})`
    : names.map((name) => { const count = planned.filter((entry) => entry.rule.name === name).length; return count > 1 ? `${name} x${count}` : name; }).join(", ");
  return { label, source: codes.length === 1 ? codes[0] : "mixed" };
}
