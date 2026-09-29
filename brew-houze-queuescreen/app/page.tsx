"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";

// The customer screen by the counter (a TV or tablet). Preparing on the left, ready on the right
// (the newest called first), and a "Now calling" spotlight with a chime (and, if on, a voice)
// for each new ready number. Built to run unattended: it keeps the screen awake, fits the lists
// to the screen (+N more), rides out network blips, and asks for one tap to allow sound.

// key: the order, or one part of it ("12:bar") when drinks and food are called separately (label).
type QueueOrder = {
  order_id: number;
  queue_number: number;
  items: string;
  created_at: string;
  key?: string;
  label?: string | null;
  ready_at?: string | null;
};
type QueuePayload = { data?: { waiting?: QueueOrder[]; ready?: QueueOrder[] }; mode?: "together" | "separate"; error?: string };
type Calling = { key: string; number: number; label: string | null; until: number };

const CALL_SECONDS = 12;
const VOICE_KEY = "brew-houze-queue-voice";
const keyOf = (order: QueueOrder) => order.key ?? String(order.order_id);

function IconCoffee() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
}

// How many tiles of this size fit in the element (so a full list shows "+N more" instead of
// running off a screen nobody can scroll).
function useCapacity(tileWidth: number, tileHeight: number, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(Number.MAX_SAFE_INTEGER);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const columns = Math.max(1, Math.floor((element.clientWidth + gap) / (tileWidth + gap)));
      const rows = Math.max(1, Math.floor((element.clientHeight + gap) / (tileHeight + gap)));
      setCapacity(columns * rows);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tileWidth, tileHeight, gap]);
  return { ref, capacity };
}

function Tiles({ orders, capacity, kind, calling }: { orders: QueueOrder[]; capacity: number; kind: "waiting" | "ready"; calling: string | null }) {
  const overflow = orders.length > capacity;
  const shown = overflow ? orders.slice(0, Math.max(0, capacity - 1)) : orders;
  return <>
    {shown.map((order) => <article key={keyOf(order)} className={`qs-tile is-${kind}${calling === keyOf(order) ? " is-calling" : ""}`}>
      <span className="qs-number"><span>#</span>{order.queue_number}</span>
      <span className="qs-label">{order.label ? `${order.label} ${kind === "ready" ? "ready" : "· preparing"}` : kind === "ready" ? "Ready" : "Preparing"}</span>
    </article>)}
    {overflow && <article className={`qs-tile is-more is-${kind}`}><span className="qs-more">+{orders.length - shown.length}</span><span className="qs-label">more</span></article>}
  </>;
}

export default function QueueScreen() {
  const [waiting, setWaiting] = useState<QueueOrder[]>([]);
  const [ready, setReady] = useState<QueueOrder[]>([]);
  const [mode, setMode] = useState<"together" | "separate">("together");
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [calling, setCalling] = useState<Calling | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const knownReadyRef = useRef<Set<string> | null>(null);
  const voiceRef = useRef(true);
  const { ref: waitingRef, capacity: waitingCapacity } = useCapacity(150, 112, 12);
  const { ref: readyRef, capacity: readyCapacity } = useCapacity(210, 150, 14);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VOICE_KEY) === "off") {
        voiceRef.current = false;
        const timer = window.setTimeout(() => setVoiceOn(false), 0);
        return () => window.clearTimeout(timer);
      }
    } catch { /* storage unavailable */ }
  }, []);

  // Sound needs one tap on most browsers (a kiosk set to allow autoplay starts right away).
  const enableSound = useCallback(async () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    try { await audioContextRef.current.resume(); } catch { /* not allowed yet */ }
    setSoundOn(audioContextRef.current.state === "running");
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void enableSound(), 0);
    const unlock = () => void enableSound();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.clearTimeout(first); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); void audioContextRef.current?.close(); audioContextRef.current = null; };
  }, [enableSound]);

  const announce = useCallback((entries: QueueOrder[]) => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const start = context.currentTime;
    [659.25, 880, 1318.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const at = start + index * 0.14;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    });
    if (voiceRef.current && "speechSynthesis" in window) {
      const text = entries.map((entry) => `Order ${entry.queue_number}${entry.label ? `, ${entry.label.toLowerCase()}` : ""}, ready`).join(". ");
      window.setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(`${text}. Please collect at the counter.`);
        utterance.lang = "en-US";
        utterance.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }, 700);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    let queueSignature = "";
    const loadQueue = async () => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      try {
        const signatureResponse = await fetch("/api/queue?signatureOnly=1", { cache: "no-store" });
        const signaturePayload = await signatureResponse.json() as { signature?: Record<string, unknown>; error?: string };
        if (!signatureResponse.ok) throw new Error(signaturePayload.error || "Unable to check the queue.");
        if (active) { setOffline(false); setUpdatedAt(Date.now()); }
        const nextSignature = JSON.stringify(signaturePayload.signature ?? {});
        if (queueSignature === nextSignature) return;
        const response = await fetch("/api/queue", { cache: "no-store" });
        const payload = await response.json() as QueuePayload;
        if (!response.ok) throw new Error(payload.error || "Unable to load the queue.");
        // Only remembered once the list itself loaded, so a failed load is retried next time.
        queueSignature = nextSignature;
        if (!active) return;
        const nextReady = payload.data?.ready ?? [];
        // New ready numbers since the last look (not on the first load): call them.
        if (knownReadyRef.current) {
          const fresh = nextReady.filter((order) => !knownReadyRef.current?.has(keyOf(order)));
          if (fresh.length > 0) {
            const first = fresh[0];
            setCalling({ key: keyOf(first), number: first.queue_number, label: first.label ?? null, until: Date.now() + CALL_SECONDS * 1000 });
            announce(fresh);
          }
        }
        knownReadyRef.current = new Set(nextReady.map(keyOf));
        setWaiting(payload.data?.waiting ?? []);
        setReady(nextReady);
        setMode(payload.mode === "separate" ? "separate" : "together");
        setLoaded(true);
      } catch (loadError) {
        // A dropped connection is expected on a screen left running: warn and keep the last board.
        console.warn("Queue screen: failed to load queue", loadError);
        if (active) setOffline(true);
      } finally {
        requestInFlight = false;
      }
    };
    const onVisible = () => void loadQueue();
    void loadQueue();
    const intervalId = window.setInterval(() => void loadQueue(), 5_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [announce]);

  // The clock (after mount, so the server and the screen agree), and the spotlight timing out.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 1_000);
    return () => { window.clearTimeout(first); window.clearInterval(intervalId); };
  }, []);
  const spotlight = calling && now !== null && now < calling.until && ready.some((order) => keyOf(order) === calling.key) ? calling : null;

  // Keep the screen awake while the page is showing.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wakeLock && document.visibilityState === "visible") lock = await wakeLock.request("screen");
      } catch { /* not supported or not allowed: the screen may sleep */ }
    };
    void request();
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); void lock?.release().catch(() => undefined); };
  }, []);

  // Full screen, and the cursor and controls hide after a few idle seconds.
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 4000);
    const wake = () => { setIdle(false); window.clearTimeout(timer); timer = window.setTimeout(() => setIdle(true), 4000); };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.clearTimeout(timer); window.removeEventListener("pointermove", wake); window.removeEventListener("pointerdown", wake); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voiceRef.current = next;
    try { window.localStorage.setItem(VOICE_KEY, next ? "on" : "off"); } catch { /* storage unavailable */ }
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const clock = now === null ? null : new Date(now);
  const time = clock?.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  const date = clock?.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" });
  const updated = updatedAt ? new Date(updatedAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";

  return <main className={`qs${idle ? " is-idle" : ""}`}>
    <header className="qs-header">
      <div className="qs-brand">
        <span className="qs-badge"><Image src="/brand/badge.png" alt="" width={64} height={64} unoptimized priority /></span>
        <div><strong>Brew Houze</strong><span>Order status</span></div>
      </div>
      <div className="qs-clock" aria-live="off">{time && <><strong>{time}</strong><span>{date}</span></>}</div>
    </header>

    {!loaded && offline && <div className="qs-banner">Can&apos;t reach the café system. Trying again…</div>}

    <section className="qs-board">
      <section className="qs-column is-waiting" aria-label="Preparing">
        <div className="qs-heading"><div><p>In progress</p><h1>Preparing</h1></div><span className="qs-count">{waiting.length}</span></div>
        <div className="qs-list is-waiting" ref={waitingRef}>
          {loaded && waiting.length === 0 ? <div className="qs-empty"><IconCoffee /><strong>Nothing in progress</strong><span>New orders appear here.</span></div>
            : <Tiles orders={waiting} capacity={waitingCapacity} kind="waiting" calling={null} />}
        </div>
      </section>

      <section className="qs-column is-ready" aria-label="Ready for pickup">
        <div className="qs-heading"><div><p>Please collect at the counter</p><h1>Ready</h1></div><span className="qs-count">{ready.length}</span></div>
        {spotlight && <div className="qs-spotlight" key={spotlight.key} role="status" aria-live="assertive">
          <span className="qs-spotlight-eyebrow">Now calling</span>
          <span className="qs-spotlight-number"><span>#</span>{spotlight.number}</span>
          <span className="qs-spotlight-label">{spotlight.label ? `${spotlight.label} ready · collect at the counter` : "Your order is ready · collect at the counter"}</span>
        </div>}
        <div className="qs-list is-ready" ref={readyRef}>
          {loaded && ready.length === 0 ? <div className="qs-empty"><IconCoffee /><strong>No orders ready yet</strong><span>Your number shows here when it&apos;s ready.</span></div>
            : <Tiles orders={ready} capacity={readyCapacity} kind="ready" calling={spotlight?.key ?? null} />}
        </div>
      </section>
    </section>

    <footer className="qs-footer">
      <span className={`qs-live${offline ? " is-offline" : ""}`}><i />{offline ? "Reconnecting…" : updated ? `Live · updated ${updated}` : "Connecting…"}</span>
      {mode === "separate" && <span className="qs-note">Drinks and food are called separately</span>}
      <span className="qs-controls">
        {soundOn
          ? <button type="button" onClick={toggleVoice} aria-pressed={voiceOn}>{voiceOn ? "🔊 Voice on" : "🔔 Chime only"}</button>
          : <button type="button" className="is-attention" onClick={() => void enableSound()}>🔇 Tap to turn on sound</button>}
        <button type="button" onClick={toggleFullscreen}>{fullscreen ? "Exit full screen" : "⛶ Full screen"}</button>
      </span>
    </footer>
  </main>;
}
