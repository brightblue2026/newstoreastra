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
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://res.cloudinary.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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
