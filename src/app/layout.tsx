import type { Metadata, Viewport } from 'next';
import { fontVariables } from './fonts';
import SmoothScroll from '@/components/SmoothScroll';
import { SITE_URL } from '@/lib/site';
import { jsonLdString } from '@/lib/json-ld';
import './globals.css';

const SITE_TITLE = 'Bright Blue';
const SITE_DESCRIPTION =
  'Bright Blue Trading Corporation — home care, personal care and food, manufactured in Kerala since 2019.';

export const metadata: Metadata = {
  // Lets every page declare `alternates.canonical` as a path and have Next
  // resolve it against the real origin.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s · Bright Blue',
  },
  description: SITE_DESCRIPTION,
  // No `images` entry yet — there is no real brand/OG asset in `public/`
  // (image upload isn't built), and a broken image link in a social
  // preview is worse than no preview at all. Add one here once a real
  // og-image exists.
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

/**
 * Organization JSON-LD — real data from the GST REG-06 certificate (see
 * DECISIONS.md), not placeholder. `telephone` is the toll-free number
 * printed on every product label, not a guess.
 */
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Bright Blue Trading Corporation',
  url: SITE_URL,
  telephone: '+91-1800-123-0621',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '66/927 Pappurath, Krishnaswamy Road, Pullepady',
    addressLocality: 'Kochi',
    addressRegion: 'Kerala',
    postalCode: '682035',
    addressCountry: 'IN',
  },
  // brightblue.in is the old WooCommerce site this project replaces, not a
  // property to point search engines at. bbtcglobal.com is BBTC's separate,
  // currently-live static corporate site — confirmed real, see DECISIONS.md.
  sameAs: ['https://www.bbtcglobal.com'],
};

export const viewport: Viewport = {
  // BBTC's own declared theme colour, and the page background.
  themeColor: '#faf7f2',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` because the inline script below deliberately
    // adds a `js` class to this element before React hydrates, so the server
    // HTML and the live DOM differ by exactly that one class. Without it React
    // reports a hydration mismatch on every page load. Scoped to `<html>`, so
    // it silences that one class and nothing inside the page.
    <html lang="en-IN" className={fontVariables} suppressHydrationWarning>
      <head>
        {/*
          Marks the document as scripted, synchronously, before the first paint.

          Every scroll reveal starts hidden — but only for readers who can run
          the script that brings it back. The server HTML used to ship 31
          elements at `opacity: 0` on the homepage alone, so with JavaScript
          blocked, broken or merely slow, most of the page was invisible: bad
          for readers, and bad for any crawler that does not execute scripts.
          The hidden state now lives in CSS behind `.js` (see globals.css), so
          no-JS renders the page in full and scripted browsers still animate.

          Inline and in `<head>` on purpose: a deferred or external script runs
          after first paint, which would show every section and then hide it —
          a flash on every page load. `script-src` already allows
          'unsafe-inline' (see next.config.ts).
        */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(organizationJsonLd) }}
        />
        {/* Renders nothing; every scroll-driven animation inherits its feel
            from this. Opts itself out under prefers-reduced-motion. */}
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
