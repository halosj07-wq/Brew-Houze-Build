"use client";

import { useEffect, useRef, useState } from "react";

type QueueOrder = {
  order_id: number;
  queue_number: number;
  items: string;
  created_at: string;
};
type QueuePayload = { data?: { waiting?: QueueOrder[]; ready?: QueueOrder[] }; error?: string };

function IconCoffee() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
}

export default function QueueScreen() {
  const [waiting, setWaiting] = useState<QueueOrder[]>([]);
  const [ready, setReady] = useState<QueueOrder[]>([]);
  const [error, setError] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const knownReadyIdsRef = useRef<Set<number> | null>(null);

  function playReadyPing() {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== "running") return;
    const now = audioContext.currentTime;
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.28);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 0.3);
    });
  }

  useEffect(() => {
    audioContextRef.current = new AudioContext();
    void audioContextRef.current.resume();

    let active = true;
    let requestInFlight = false;
    const loadQueue = async () => {
      if (requestInFlight || document.visibilityState !== "visible") return;
      requestInFlight = true;
      try {
        const response = await fetch("/api/queue", { cache: "no-store" });
        const payload = await response.json() as QueuePayload;
        if (!response.ok) throw new Error(payload.error || "Unable to load the queue.");
        if (active) {
          const nextReadyIds = new Set((payload.data?.ready ?? []).map((order) => order.order_id));
          if (knownReadyIdsRef.current && Array.from(nextReadyIds).some((id) => !knownReadyIdsRef.current?.has(id))) playReadyPing();
          knownReadyIdsRef.current = nextReadyIds;
          setWaiting(payload.data?.waiting ?? []);
          setReady(payload.data?.ready ?? []);
          setError("");
        }
      } catch (loadError) {
        console.error("Queue screen: failed to load queue", loadError);
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the queue.");
      } finally {
        requestInFlight = false;
      }
    };

    void loadQueue();
    const intervalId = window.setInterval(() => void loadQueue(), 5_000);
    document.addEventListener("visibilitychange", loadQueue);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", loadQueue);
      void audioContextRef.current?.close();
    };
  }, []);

  return <main className="queue-screen">
    <header className="screen-header">
      <div className="brand"><span className="brand-mark"><IconCoffee /></span><div><strong>Brew Houze</strong><span>Customer Queue</span></div></div>
    </header>
    {error && <div className="screen-error">{error}</div>}
    <section className="queue-grid">
      <section className="queue-column waiting-column"><div className="column-heading"><div><p className="eyebrow">IN PROGRESS</p><h1>Wait List</h1></div><span className="count waiting-count">{waiting.length}</span></div><div className="order-list">{waiting.length === 0 ? <div className="empty-card"><IconCoffee /><strong>No orders waiting</strong><span>New orders will appear here.</span></div> : waiting.map((order) => <article className="order-card waiting-card" key={order.order_id}><strong>#{order.queue_number}</strong><span>Preparing your order</span></article>)}</div></section>
      <section className="queue-column ready-column"><div className="column-heading"><div><p className="eyebrow">PLEASE COLLECT</p><h1>Ready for Pickup</h1></div><span className="count ready-count">{ready.length}</span></div><div className="order-list">{ready.length === 0 ? <div className="empty-card"><IconCoffee /><strong>No orders ready</strong><span>Ready orders will appear here.</span></div> : ready.map((order) => <article className="order-card ready-card" key={order.order_id}><strong>#{order.queue_number}</strong><span>Please pick up at the counter</span></article>)}</div></section>
    </section>
  </main>;
}
