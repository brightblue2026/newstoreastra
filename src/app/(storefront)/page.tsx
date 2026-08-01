import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bright Blue',
  description:
    'Bright Blue Trading Corporation — home care, personal care and food, manufactured in Kerala since 2019.',
};

/**
 * Placeholder. The storefront proper is Phase 2: hero, world record section,
 * claim badges, brand rail, category tiles, combo strip, founder story.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-(--container-page) flex-col justify-center px-6 py-24">
      <p className="type-caption text-ink-soft">Bright Blue Trading Corporation</p>
      <h1 className="mt-6 type-display-lg">
        Twenty-four fragrances.
        <br />
        One dishwashing liquid.
      </h1>
      <p className="mt-8 max-w-2xl type-body-lg text-ink-soft">
        International Book of Records holder for the maximum number of fragrance variants
        created for a dishwashing liquid brand. Awarded to Mr. Faisal V.K. for Bright Blue
        Trading Corporation.
      </p>
      <p className="mt-12 type-body text-ink-soft">
        The store is being built. Phase 2 brings the catalogue online.
      </p>
    </main>
  );
}
