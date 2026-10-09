"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { onLive } from "@/lib/live";
import { manilaWhen, type PromotionKind } from "@/lib/promotions";

// The café's news on the menu (Objective 9): promotions and events the admin posts, shown while
// they are scheduled. A strip of cards under the greeting, and a bell in the header with how many
// are new on this phone. New posts arrive by themselves: the admin's save signals the open menus
// (Supabase Realtime, "promos"), and the menu also checks every minute, so a scheduled post
// appears (and an ended one disappears) on time. Which posts were seen is remembered on the phone.

export type NewsPost = {
  id: number; kind: PromotionKind; title: string; message: string; image: string;
  productId: number | null; productName: string | null;
  eventStartsAt: string | null; eventEndsAt: string | null; showFrom: string; showUntil: string | null;
  version: string;
};

const SEEN_KEY = "bh-news-seen";
const CHECK_EVERY_MS = 60_000;

function readSeen(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.map(String) : [];
  } catch {
    return [];
  }
}

// The posts showing now, how many this phone has not seen, and a way to mark them seen.
// onArrive is called with a post that appeared while the menu was open.
export function useNews(onArrive: (post: NewsPost) => void) {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const known = useRef<Set<string> | null>(null);
  const arrive = useRef(onArrive);
  useEffect(() => { arrive.current = onArrive; }, [onArrive]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/promotions", { cache: "no-store" });
      if (!response.ok) return;
      const next = ((await response.json()).data ?? []) as NewsPost[];
      // Only posts that appear after the first load count as arrivals.
      if (known.current) {
        const fresh = next.find((post) => !known.current!.has(post.version));
        if (fresh) arrive.current(fresh);
      }
      known.current = new Set(next.map((post) => post.version));
      setPosts(next);
    } catch {
      // Offline: keep what is shown.
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { setSeen(readSeen()); void load(); }, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, CHECK_EVERY_MS);
    const stopLive = onLive(["promos"], () => void load());
    return () => { window.clearTimeout(first); window.clearInterval(timer); stopLive(); };
  }, [load]);

  const markSeen = useCallback(() => {
    setSeen(() => {
      const next = posts.map((post) => post.version);
      try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, [posts]);

  const unread = posts.filter((post) => !seen.includes(post.version)).length;
  return { posts, unread, markSeen, isNew: (post: NewsPost) => !seen.includes(post.version) };
}

// "Event · Sat, Oct 11 · 7:00 PM" or "Promo".
function newsLabel(post: NewsPost): string {
  return post.kind === "event" && post.eventStartsAt ? `Event · ${manilaWhen(post.eventStartsAt)}` : "Promo";
}

function IconBell() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
}

export function NewsBell({ count, onOpen }: { count: number; onOpen: () => void }) {
  return <button type="button" className={`bh-news-bell${count > 0 ? " has-new" : ""}`} onClick={onOpen} aria-label={count > 0 ? `Café news, ${count} new` : "Café news"}>
    <IconBell />{count > 0 && <b>{count > 9 ? "9+" : count}</b>}
  </button>;
}

// The cards under the greeting: what is on now, newest promos and soonest events first.
export function NewsStrip({ posts, isNew, onOpen }: { posts: NewsPost[]; isNew: (post: NewsPost) => boolean; onOpen: (post: NewsPost) => void }) {
  if (posts.length === 0) return null;
  return <section className="bh-news" aria-label="Café news">
    <div className="bh-news-row">
      {posts.map((post) => <button key={post.id} type="button" className={`bh-news-card is-${post.kind}`} onClick={() => onOpen(post)}>
        {post.image
          ? <span className="bh-news-photo"><Image src={post.image} alt="" fill unoptimized sizes="280px" style={{ objectFit: "cover" }} /></span>
          : <span className="bh-news-photo is-blank" aria-hidden="true">{post.kind === "event" ? "🎶" : "☕"}</span>}
        <span className="bh-news-body">
          <span className="bh-news-label">{newsLabel(post)}{isNew(post) && <i>New</i>}</span>
          <strong>{post.title}</strong>
          <span className="bh-news-text">{post.message}</span>
        </span>
      </button>)}
    </div>
  </section>;
}

// Every post in full, from the bell or a card. The opened one is scrolled into view.
export function NewsSheet({ posts, focusId, onClose, onSeeItem }: { posts: NewsPost[]; focusId: number | null; onClose: () => void; onSeeItem: (productId: number) => void }) {
  const focusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "start" });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="bh-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="bh-sheet bh-news-sheet" role="dialog" aria-modal="true" aria-label="Café news">
      <div className="bh-sheet-head">
        <div><p className="bh-eyebrow">Brew Houze</p><h2>Promos &amp; events</h2></div>
        <button type="button" className="bh-sheet-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="bh-sheet-scroll">
        {posts.length === 0 ? <p className="bh-news-empty">Nothing new right now. Promos and events from the café show up here.</p>
          : posts.map((post) => <article key={post.id} className={`bh-news-item is-${post.kind}`} ref={post.id === focusId ? (element) => { focusRef.current = element; } : undefined}>
            {post.image && <div className="bh-news-item-photo"><Image src={post.image} alt="" fill unoptimized sizes="560px" style={{ objectFit: "cover" }} /></div>}
            <div className="bh-news-item-body">
              <span className="bh-news-label">{newsLabel(post)}</span>
              <h3>{post.title}</h3>
              {post.kind === "event" && post.eventEndsAt && <p className="bh-news-until">Until {manilaWhen(post.eventEndsAt)}</p>}
              <p className="bh-news-message">{post.message}</p>
              {post.productId !== null && post.productName && <button type="button" className="bh-primary" onClick={() => onSeeItem(post.productId as number)}>See {post.productName}</button>}
            </div>
          </article>)}
      </div>
    </section>
  </div>;
}
