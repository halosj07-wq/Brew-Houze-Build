"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

// The delivery map on OpenStreetMap (Leaflet; no key, free): the café, each delivery's address, each rider where
// their phone last was, and the road from the rider (or the café, before pickup) to the door, from OpenStreetMap's
// public router (OSRM); a straight dashed line when it cannot be reached. The same file is in the admin and staff
// apps. pickCafe: a tap on the map sets the café's place (the admin's Delivery page).

export type MapStopView = {
  id: number; queueNumber: number | null; status: string; recipient: string; address: string; zone: string;
  lat: number | null; lng: number | null; riderName: string | null; riderLat: number | null; riderLng: number | null; riderSeenAt: string | null;
};

const pin = (L: typeof Leaflet, html: string, className: string) => L.divIcon({ html, className: `dm-pin ${className}`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16] });
const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const routes = new Map<string, [number, number][]>();

// The road between two points ([lat, lng] pairs), or null.
async function road(from: [number, number], to: [number, number]): Promise<[number, number][] | null> {
  const key = `${from.map((v) => v.toFixed(4))}>${to.map((v) => v.toFixed(4))}`;
  if (routes.has(key)) return routes.get(key)!;
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const payload = await response.json() as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
    const line = payload.routes?.[0]?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number]) ?? null;
    if (line) routes.set(key, line);
    return line;
  } catch {
    return null;
  }
}

export default function DeliveryMap({ cafe, stops, height = 320, pickCafe }: {
  cafe: { lat: number; lng: number } | null; stops: MapStopView[]; height?: number; pickCafe?: (spot: { lat: number; lng: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const fitted = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const pickRef = useRef(pickCafe);
  useEffect(() => { pickRef.current = pickCafe; });

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current || map.current) return;
      lib.current = L;
      const start = cafe ?? { lat: 14.1364, lng: 121.4165 };
      map.current = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], cafe ? 14 : 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      map.current.on("click", (event: Leaflet.LeafletMouseEvent) => pickRef.current?.({ lat: Math.round(event.latlng.lat * 1e6) / 1e6, lng: Math.round(event.latlng.lng * 1e6) / 1e6 }));
      setLoaded(true);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // (the map is made once; what is on it follows below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = lib.current, group = layer.current, view = map.current;
    if (!loaded || !L || !group || !view) return;
    let stale = false;
    group.clearLayers();
    const points: [number, number][] = [];
    if (cafe) {
      L.marker([cafe.lat, cafe.lng], { icon: pin(L, "☕", "is-cafe"), title: "The café" }).bindPopup("<b>The café</b>").addTo(group);
      points.push([cafe.lat, cafe.lng]);
    }
    const riders = new Map<string, { lat: number; lng: number; name: string; seen: string | null }>();
    for (const stop of stops) {
      if (stop.riderLat !== null && stop.riderLng !== null) riders.set(stop.riderName ?? "Rider", { lat: stop.riderLat, lng: stop.riderLng, name: stop.riderName ?? "Rider", seen: stop.riderSeenAt });
      if (stop.lat === null || stop.lng === null) continue;
      const label = `#${stop.queueNumber ?? "—"}`;
      L.marker([stop.lat, stop.lng], { icon: pin(L, escape(label), stop.status === "out" ? "is-out" : "is-ready"), title: stop.recipient })
        .bindPopup(`<b>${escape(label)} · ${escape(stop.recipient)}</b><br>${escape(stop.address)}<br>${escape(stop.zone)}<br><i>${stop.status === "out" ? `On the way${stop.riderName ? ` with ${escape(stop.riderName)}` : ""}` : "Packed, waiting for a rider"}</i>`)
        .addTo(group);
      points.push([stop.lat, stop.lng]);
      // the road to the door: from the rider when they are out with it, from the café before
      const from: [number, number] | null = stop.status === "out" && stop.riderLat !== null && stop.riderLng !== null ? [stop.riderLat, stop.riderLng] : cafe ? [cafe.lat, cafe.lng] : null;
      if (from) {
        const to: [number, number] = [stop.lat, stop.lng];
        const style = { color: stop.status === "out" ? "#D97706" : "#9C8278", weight: 4, opacity: 0.8 };
        void road(from, to).then((line) => {
          if (stale) return;
          if (line) L.polyline(line, style).addTo(group);
          else L.polyline([from, to], { ...style, dashArray: "6 8" }).addTo(group);
        });
      }
    }
    for (const rider of riders.values()) {
      const age = rider.seen ? Math.round((Date.now() - new Date(rider.seen).getTime()) / 60_000) : null;
      L.marker([rider.lat, rider.lng], { icon: pin(L, "🛵", "is-rider"), title: rider.name, zIndexOffset: 500 })
        .bindPopup(`<b>${escape(rider.name)}</b><br>${age === null ? "" : age < 1 ? "just now" : `${age} min ago`}`).addTo(group);
      points.push([rider.lat, rider.lng]);
    }
    if (!fitted.current && points.length > 0) {
      fitted.current = true;
      if (points.length === 1) view.setView(points[0], 15);
      else view.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
    }
    return () => { stale = true; };
  }, [loaded, cafe, stops]);

  return <div className="dm-wrap">
    <div ref={box} className="dm-map" style={{ height }} role="region" aria-label="Delivery map" />
    {stops.some((stop) => stop.lat === null) && <p className="dm-note">Some addresses could not be found on the map yet: use Open in Maps for those.</p>}
  </div>;
}
