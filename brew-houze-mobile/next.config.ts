import type { NextConfig } from "next";

// Security headers on every response (the same in all four apps):
// - Strict-Transport-Security: browsers use HTTPS only, for two years.
// - frame-ancestors / X-Frame-Options: no other site can show these pages in a frame (clickjacking).
// - base-uri and object-src: no injected <base> tag or plugin content.
// - nosniff: files are only used as the type the server says they are.
// - Referrer-Policy: other sites see only our domain, never a page address with a token in it.
// - Permissions-Policy: no microphone, location, USB or payment-handler access; the camera only
//   for our own pages (the ID photo on the mobile menu).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), usb=(), payment=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
