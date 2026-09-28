import pool from "@/lib/db";
import type { IdDiscountInput } from "@/lib/discounts";
import { approvedVerification, parseCoverage, savedIdDiscount } from "@/lib/id-verifications";
import type { OrderItemInput, ServiceType } from "@/lib/orders";

// The ID discount on a mobile order (see lib/id-verifications.ts), always built here on the server
// from what the café approved. The phone never sends the discount itself:
//   verification_token   an ID photo the cashier approved: its items, coverage and service type
//                        are the ones approved, whatever the phone sends
//   saved_id             { lines } or { group_size }: the ID remembered on the signed-in account
export type MobileIdDiscount = { items: OrderItemInput[] | null; serviceType: ServiceType | null; customerId: number | null; idDiscounts: IdDiscountInput[]; verificationId: number | null };

export async function mobileIdDiscount(body: { verification_token?: unknown; saved_id?: unknown }, customerId: number | null): Promise<MobileIdDiscount | null> {
  if (typeof body.verification_token === "string") {
    const approved = await approvedVerification(pool, body.verification_token);
    return { items: approved.items, serviceType: approved.serviceType, customerId: approved.customerId ?? customerId, idDiscounts: [approved.idDiscount], verificationId: approved.id };
  }
  if (body.saved_id !== undefined && body.saved_id !== null) {
    if (customerId === null) throw new Error("Sign in to use your saved ID.");
    const saved = await savedIdDiscount(customerId);
    if (!saved) throw new Error("Your saved ID is no longer on file. Send a photo of your ID instead.");
    return { items: null, serviceType: null, customerId, idDiscounts: [{ typeId: saved.typeId, holderName: saved.holderName, idNumber: saved.idNumber, ...parseCoverage(body.saved_id) }], verificationId: null };
  }
  return null;
}
