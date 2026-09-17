import type { NextConfig } from 'next';

/**
 * A baseline CSP, not a strict nonce-based one. Next.js's own bootstrap and
 * RSC payload scripts, and the `<script type="application/ld+json">` blocks
 * this app renders inline (see `src/lib/json-ld.ts`), all need
 * `'unsafe-inline'` for `script-src` — a nonce-based CSP would be tighter but
 * needs per-request nonce plumbing through middleware that hasn't been built.
 * This is a real improvement over having no CSP at all, not the strongest
 * possible one. Tighten it once someone can click through the site and watch
 * for `Content-Security-Policy` violations in devtools before deploying.
 *
 * `'unsafe-eval'` is dev-only, and was a real bug the first time this shipped
 * without it: Next's dev server (fast refresh / HMR) generates code via
 * `eval`, so a CSP without it doesn't just look stricter in dev — it silently
 * blocks large parts of the client bundle from ever running. The page still
 * server-renders correctly (so `curl` sees real content), but nothing
 * JS-driven works: no hydration, no scroll-reveal, nothing interactive. That
 * is a much worse failure mode than the CSP being slightly looser locally,
 * so eval is scoped to development only — the production build never eval's
 * generated code and doesn't need it.
 *
 * **Razorpay Checkout needs four of these directives widened, and a fifth
 * added.** This CSP and the checkout screen were built on parallel branches and
 * met in a merge, where `default-src 'self'` silently blocked the whole payment
 * flow: the `checkout.razorpay.com` script never loads, and even if it did, the
 * payment modal is a cross-origin iframe that `frame-src` must permit. The
 * failure is invisible until someone actually clicks Pay, which is why it is
 * spelled out here rather than left as a hostname in a list:
 *
 *   - `script-src`  — checkout.razorpay.com serves checkout.js itself.
 *   - `frame-src`   — the modal, and the bank/3-D Secure pages inside it.
 *   - `connect-src` — checkout.js calls api.razorpay.com and posts telemetry to
 *                     lumberjack.razorpay.com.
 *   - `img-src`     — bank, card-network and UPI-app logos off cdn.razorpay.com.
 *   - `form-action` — netbanking and 3-D Secure redirect by form POST to
 *                     api.razorpay.com.
 *
 * Nothing here is widened for COD, which needs no third party at all.
 */
const RAZORPAY_CHECKOUT = 'https://checkout.razorpay.com';
const RAZORPAY_API = 'https://api.razorpay.com';
/** Covers cdn., lumberjack. and the regional hosts Checkout picks at runtime. */
const RAZORPAY_ANY = 'https://*.razorpay.com';

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RAZORPAY_CHECKOUT}${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://res.cloudinary.com ${RAZORPAY_ANY}`,
  "font-src 'self' data:",
  // The admin image uploader POSTs the file straight from the browser to
  // Cloudinary (src/app/admin/(panel)/products/[productId]/images/image-uploader.tsx)
  // rather than through this app's server, so the fetch itself needs an exception —
  // alongside Razorpay's own connect-src needs above.
  `connect-src 'self' https://api.cloudinary.com ${RAZORPAY_API} ${RAZORPAY_ANY}`,
  `frame-src ${RAZORPAY_CHECKOUT} ${RAZORPAY_API} ${RAZORPAY_ANY}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${RAZORPAY_API}`,
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route, admin and storefront alike.
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
          },
          // Only takes effect over HTTPS; harmless locally over HTTP.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },

  experimental: {
    // Enables forbidden() / unauthorized(), used by the /admin role guards so
    // a permitted-but-insufficient role gets a 403 rather than a redirect.
    authInterrupts: true,
  },

  // The dev-only badge sits bottom-left and covers page content in the QA
  // screenshots, which are taken against `next dev`. It has no effect on a
  // production build either way.
  devIndicators: false,

  images: {
    // Product imagery is served from Cloudinary.
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    formats: ['image/avif', 'image/webp'],
  },

  // The Prisma client is generated into src/generated and must not be bundled
  // for the browser or traced as an edge dependency.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],

  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
