/**
 * Brand artwork that ships with the codebase rather than the database.
 *
 * The logos in `public/brands/` are BBTC's own marks, supplied as transparent
 * PNGs. `Brand.logoUrl` exists in the schema but nothing sets it yet. The
 * bundled file comes first because a stored URL on a host `next/image` is not
 * configured for would take the whole page down; `logoUrl` only fills in for
 * a brand with no bundled logo.
 *
 * `line` is the one-sentence description shown when a brand has no tagline
 * of its own. A tagline set on the brand always takes precedence.
 */

const BRAND_ART: Record<string, { logo: string; line: string }> = {
  'mx-3': { logo: '/brands/mx-3.png', line: 'Grease-cutting dishwash in 24 fragrances.' },
  rafasi: { logo: '/brands/rafasi.png', line: 'Detergents that keep colours bright.' },
  landfloro: { logo: '/brands/landfloro.png', line: 'Floor cleaners for a fresh, spotless home.' },
  fairoze: { logo: '/brands/fairoze.png', line: 'Everyday care for hands and body.' },
  ansaf: { logo: '/brands/ansaf.png', line: 'Wash, shine and protect your vehicle.' },
  'ilfa-valley': { logo: '/brands/ilfa-valley.png', line: 'Strong, aromatic tea for every cup.' },
  kenzaniya: { logo: '/brands/kenzaniya.png', line: 'Pantry staples you can trust.' },
  makafa: { logo: '/brands/makafa.png', line: 'Premium perfume and fragrance.' },
};

export function brandLogoSrc(slug: string, logoUrl?: string | null): string | null {
  return BRAND_ART[slug]?.logo || logoUrl || null;
}

export function brandLine(slug: string, tagline?: string | null): string | null {
  return tagline || BRAND_ART[slug]?.line || null;
}
