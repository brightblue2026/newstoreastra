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
  // Draw edge to edge on notched phones; `globals.css` pads the body, and
  // `pb-safe` / `safe-x` the fixed bars, so nothing lands under a notch or
  // the home indicator.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={fontVariables}>
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
