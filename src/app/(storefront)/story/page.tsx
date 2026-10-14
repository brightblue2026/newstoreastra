import type { Metadata } from 'next';
import Image from 'next/image';
import Link from '@/components/Link';
import { Reveal, RevealItem } from '@/components/Reveal';
import CountUp from '@/components/CountUp';
import RecordSeal from '@/components/art/RecordSeal';
import StoryScene from '@/components/art/StoryScene';
import { brandLine, brandLogoSrc } from '@/lib/brand-art';
import { getContent } from '@/lib/content';
import { getBrands } from '@/lib/storefront';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Our story',
  description:
    'Bright Blue Trading Corporation — an FMCG manufacturer in Ernakulam, Kerala, founded in 2019 by V.K. Faisal.',
  alternates: { canonical: '/story' },
};

/*
  The company page.

  Copy comes from the same `home_story` and `world_record` content blocks the
  homepage uses, so editing the story in one place changes it in both. Nothing
  here is written into the component — an empty block falls back to the coded
  default in `lib/content.ts` rather than to filler.
*/

export default async function StoryPage() {
  const [story, record, brands] = await Promise.all([
    getContent('home_story'),
    getContent('world_record'),
    getBrands(),
  ]);

  return (
    <>
      <div className="mx-auto grid max-w-(--container-page) items-end gap-12 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Reveal>
        <RevealItem>
          <p className="type-caption text-ink-soft">Since 2019 · Ernakulam, Kerala</p>
        </RevealItem>
        <RevealItem>
          <h1 className="mt-6 type-display-lg">{story.heading}</h1>
        </RevealItem>
        <div className="mt-12 max-w-2xl space-y-6">
          {story.paragraphs.map((paragraph) => (
            <RevealItem key={paragraph.slice(0, 40)}>
              <p className="type-body-lg text-ink-soft">{paragraph}</p>
            </RevealItem>
          ))}
        </div>
      </Reveal>
      <StoryScene className="w-full max-w-xl" />
      </div>

      <section className="border-y border-line bg-sky">
        <div className="mx-auto grid max-w-(--container-page) items-center gap-12 px-6 py-24 md:grid-cols-[minmax(0,1fr)_auto]">
        <Reveal>
          <RevealItem>
            <p className="type-display-lg">
              <CountUp to={record.count} />{' '}
              <span className="type-display-sm">{record.headline}</span>
            </p>
          </RevealItem>
          <RevealItem>
            <p className="mt-8 max-w-2xl type-body-lg text-ink-soft">{record.body}</p>
          </RevealItem>
        </Reveal>
        <RecordSeal className="mx-auto w-40 md:w-52" />
        </div>
      </section>

      {brands.length > 0 && (
        <Reveal className="mx-auto max-w-(--container-page) px-6 py-24">
          <RevealItem>
            <h2 className="type-display-sm">The houses</h2>
          </RevealItem>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {brands.map((brand) => {
              const logo = brandLogoSrc(brand.slug, brand.logoUrl);
              const line = brandLine(brand.slug, brand.tagline);
              return (
                <RevealItem key={brand.slug}>
                  <Link
                    href={`/brands/${brand.slug}`}
                    className="group block rounded-card border border-line p-6 motion-accent hover:border-ink"
                  >
                    {logo && (
                      <span className="relative mb-6 block h-16 w-full">
                        <Image
                          src={logo}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 240px, (min-width: 640px) 45vw, 90vw"
                          className="object-contain object-left"
                        />
                      </span>
                    )}
                    <span
                      aria-hidden="true"
                      className="block h-1 w-10 rounded-full motion-accent group-hover:w-20"
                      style={{ backgroundColor: brand.accentHex }}
                    />
                    <span className="mt-6 block type-heading">{brand.name}</span>
                    <span className="mt-1 block type-body text-ink-soft">
                      {brand.segmentLabel}
                    </span>
                    {line && <span className="mt-3 block type-body text-ink-soft">{line}</span>}
                  </Link>
                </RevealItem>
              );
            })}
          </div>
        </Reveal>
      )}
    </>
  );
}
