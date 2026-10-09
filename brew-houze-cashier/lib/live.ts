"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

// Live screens: listens for the "something changed" signals of lib/realtime.ts on one shared
// Supabase Realtime connection, and reloads a screen right away instead of waiting for its timer.
// The signal carries only the kind of change; each screen reloads through its own API. While the
// connection is up the timers slow down (see livePollGate); if it drops they run at full pace, so
// nothing depends on it. brew-houze-cashier and brew-houze-mobile keep identical copies.

export type LiveScope = "queue" | "line" | "stock" | "promos";
const LIVE_TOPIC = "brew-houze-live";

type Listener = (scope: LiveScope | "reconnect") => void;
const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let connected = false;

function connect() {
  if (channel || typeof window === "undefined") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let subscribedBefore = false;
  channel = client.channel(LIVE_TOPIC)
    .on("broadcast", { event: "changed" }, ({ payload }) => {
      const scope = (payload as { scope?: LiveScope } | null)?.scope;
      if (scope === "queue" || scope === "line" || scope === "stock" || scope === "promos") listeners.forEach((listener) => listener(scope));
    })
    .subscribe((status) => {
      connected = status === "SUBSCRIBED";
      // Back after a dropped connection: reload once, in case a signal was missed meanwhile.
      if (connected && subscribedBefore) listeners.forEach((listener) => listener("reconnect"));
      if (connected) subscribedBefore = true;
    });
}

// Calls `onChange` (at most once per quarter second) when one of `scopes` changes. Returns the
// function that stops listening.
export function onLive(scopes: LiveScope[], onChange: () => void): () => void {
  connect();
  let timer: number | undefined;
  const listener: Listener = (scope) => {
    if (scope !== "reconnect" && !scopes.includes(scope)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (document.visibilityState === "visible") onChange(); }, 250);
  };
  listeners.add(listener);
  return () => { listeners.delete(listener); window.clearTimeout(timer); };
}

// For a screen's regular refresh timer: true on every tick while offline from Realtime, and only
// on every `everyWhenLive`-th tick while live signals are arriving.
export function livePollGate(everyWhenLive: number): () => boolean {
  let ticks = 0;
  return () => !connected || (++ticks % everyWhenLive === 0);
}
