/**
 * Production configuration.
 * - Security headers on every response (CSP allows only what Turfly actually loads: Razorpay checkout,
 *   OpenStreetMap tiles, https images).
 * - The image optimiser is disabled: Turfly uses plain <img>, and the optimiser endpoint has been
 *   the source of several Next.js security advisories.
 * - NEXT_OUTPUT=standalone (set in the Dockerfile) produces a small self-contained server for Docker;
 *   a plain `npm start` deployment (e.g. this PC) uses the normal output.
 * - NEXT_DIST_DIR lets a new build be prepared without touching the one a live server is using.
 */
const razorpay = "https://checkout.razorpay.com https://api.razorpay.com https://*.razorpay.com";
// `next dev` needs eval for React Refresh; production builds never get it.
const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const csp = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts; Razorpay Checkout loads its own script.
  `script-src 'self' 'unsafe-inline'${devEval} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${razorpay} https://lumberjack.razorpay.com`,
  `frame-src ${razorpay}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.razorpay.com\")" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker must never be cached, so app updates reach users immediately.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};
export default nextConfig;
