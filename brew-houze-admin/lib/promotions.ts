// Promotions and events (see promotions-migration.sql; Objective 9): posts the admin writes for
// customers. The Mobile Menu shows the ones that are showing now as a banner and in its bell.
// brew-houze-admin and brew-houze-mobile keep identical copies of this file.
//
// A post is showing when it is switched on, not archived, its show window has started and not
// ended, and (for an event) the event is not over. An event with no end time is over at the end
// of its day (Philippine time).

export type PromotionKind = "promo" | "event";
export type PromotionStatus = "showing" | "scheduled" | "ended" | "off" | "archived";
export const PROMOTION_TITLE_MAX = 80;
export const PROMOTION_MESSAGE_MAX = 400;

export type PromotionTiming = {
  kind: PromotionKind;
  isActive: boolean;
  archivedAt: string | null;
  showFrom: string;
  showUntil: string | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

// Midnight after the given moment, Philippine time.
export function endOfManilaDay(moment: Date): Date {
  const local = new Date(moment.getTime() + MANILA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - MANILA_OFFSET_MS);
}

// When an event is over: its end time, or the end of its day when it has none.
export function eventOverAt(post: Pick<PromotionTiming, "eventStartsAt" | "eventEndsAt">): Date | null {
  if (post.eventEndsAt) return new Date(post.eventEndsAt);
  if (post.eventStartsAt) return endOfManilaDay(new Date(post.eventStartsAt));
  return null;
}

export function promotionStatus(post: PromotionTiming, now: Date): PromotionStatus {
  if (post.archivedAt) return "archived";
  if (!post.isActive) return "off";
  const over = post.kind === "event" ? eventOverAt(post) : null;
  if ((post.showUntil && new Date(post.showUntil) <= now) || (over && over <= now)) return "ended";
  if (new Date(post.showFrom) > now) return "scheduled";
  return "showing";
}

export const isShowing = (post: PromotionTiming, now: Date) => promotionStatus(post, now) === "showing";

// The order customers see: upcoming events by date (soonest first), then promos (newest first).
export function sortForCustomers<T extends Pick<PromotionTiming, "kind" | "showFrom" | "eventStartsAt"> & { id: number }>(posts: T[]): T[] {
  const time = (value: string | null) => (value ? new Date(value).getTime() : 0);
  return [...posts].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
    if (a.kind === "event") return time(a.eventStartsAt) - time(b.eventStartsAt) || a.id - b.id;
    return time(b.showFrom) - time(a.showFrom) || b.id - a.id;
  });
}

export type PromotionInput = {
  kind: PromotionKind;
  title: string;
  message: string;
  productId: number | null;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  showFrom: string;
  showUntil: string | null;
  isActive: boolean;
};

// A date and time from the admin form (ISO 8601 with its offset), or null when empty.
function moment(value: unknown): Date | null | "bad" {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "bad" : date;
}

// Checks a post from the admin form. Returns the cleaned post, or the first problem in words.
export function parsePromotion(body: Record<string, unknown>, now: Date): { post: PromotionInput } | { error: string } {
  const kind = body.kind === "event" ? "event" : body.kind === "promo" ? "promo" : null;
  if (!kind) return { error: "Choose Promo or Event." };
  const title = String(body.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { error: "Enter the title." };
  if (title.length > PROMOTION_TITLE_MAX) return { error: `Keep the title to ${PROMOTION_TITLE_MAX} characters.` };
  const message = String(body.message ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!message) return { error: "Write the message customers will read." };
  if (message.length > PROMOTION_MESSAGE_MAX) return { error: `Keep the message to ${PROMOTION_MESSAGE_MAX} characters.` };
  let productId: number | null = null;
  if (body.productId !== null && body.productId !== undefined && body.productId !== "") {
    productId = Number(body.productId);
    if (!Number.isInteger(productId) || productId <= 0) return { error: "Choose a menu item, or none." };
  }

  const showFrom = moment(body.showFrom);
  const showUntil = moment(body.showUntil);
  if (showFrom === "bad" || showUntil === "bad") return { error: "Check the show dates." };
  const from = showFrom ?? now;
  if (showUntil && showUntil <= from) return { error: "The post must stop showing after it starts." };
  if (showUntil && showUntil <= now) return { error: "That show window is already over." };

  let eventStartsAt: string | null = null;
  let eventEndsAt: string | null = null;
  if (kind === "event") {
    const starts = moment(body.eventStartsAt);
    const ends = moment(body.eventEndsAt);
    if (starts === "bad" || ends === "bad") return { error: "Check the event date and time." };
    if (!starts) return { error: "Enter when the event starts." };
    if (ends && ends < starts) return { error: "The event must end after it starts." };
    if ((eventOverAt({ eventStartsAt: starts.toISOString(), eventEndsAt: ends ? ends.toISOString() : null }) as Date) <= now) return { error: "That event is already over." };
    eventStartsAt = starts.toISOString();
    eventEndsAt = ends ? ends.toISOString() : null;
  }
  return {
    post: { kind, title, message, productId, eventStartsAt, eventEndsAt, showFrom: from.toISOString(), showUntil: showUntil ? showUntil.toISOString() : null, isActive: body.isActive !== false },
  };
}

// "Sat, Oct 11 · 7:00 PM", Philippine time.
export function manilaWhen(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}
