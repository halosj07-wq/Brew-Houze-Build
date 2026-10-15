// Brew Houze Staff Portal: keeps the app on the tablet so it still opens without the internet
// (offline counter orders, see lib/offline.ts). Only the app itself is kept: the page and its
// scripts, styles, fonts and images. Requests to /api are never stored; they always go to the
// server, and the app saves counter orders for later when they cannot.
//   the page        from the server when it answers within a few seconds (and kept), else the kept copy
//   scripts, styles from the kept copy when there is one (their names change with every release),
//   and images      else from the server (and kept)
const CACHE = "brew-houze-staff-v1";
const PAGE = "/";
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(PAGE)).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("brew-houze-staff-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// The app lists what it loaded before this worker was in charge, to keep those too.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "keep" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(event.data.urls.map((url) => cache.match(url).then((hit) => hit || cache.add(url)).catch(() => undefined)))));
});

function pageFromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("slow")), PAGE_TIMEOUT_MS);
    fetch(request).then((response) => {
      clearTimeout(timer);
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(PAGE, response.clone()));
      resolve(response);
    }, (error) => { clearTimeout(timer); reject(error); });
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    // Only the portal itself (the customer GCash pages under /pay stay online-only).
    if (url.pathname !== "/") return;
    event.respondWith(pageFromNetwork(request).catch(() => caches.match(PAGE).then((kept) => kept || Response.error())));
    return;
  }
  if (/^\/(_next\/static|brand)\//.test(url.pathname) || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then((kept) => kept || fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
      return response;
    })));
  }
});
