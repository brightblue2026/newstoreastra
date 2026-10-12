import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, RevealItem } from '@/components/Reveal';
import CountUp from '@/components/CountUp';
import PinnedSteps from '@/components/PinnedSteps';
import ProductCard from '@/components/ProductCard';
import MagneticButton from '@/components/MagneticButton';
import HouseSpectrum from '@/components/HouseSpectrum';
import Image from 'next/image';
import HomeCollections from '@/components/HomeCollections';
import StoreQuestions from '@/components/StoreQuestions';
import RecordSeal from '@/components/art/RecordSeal';
import StoryScene from '@/components/art/StoryScene';
import FeatureIcon, { type FeatureIconName } from '@/components/art/FeatureIcon';
import { CONTACT } from '@/lib/contact';
import { isRazorpayConfigured } from '@/lib/razorpay';
import { getContent } from '@/lib/content';
import { getBrands, getFeaturedCombos, getFeaturedProducts } from '@/lib/storefront';
import { formatPrice } from '@/lib/money';

export const metadata: Metadata = {
  title: { absolute: 'Bright Blue | Home care, food & everyday essentials' },
  alternates: { canonical: '/' },
  description:
    'Bright Blue Trading Corporation — home care, personal care and food, manufactured in Kerala since 2019.',
};

export const revalidate = 60;

/*
  The homepage.

  Structure follows the Cleancult teardown: belief before catalogue. No product
  grid above the fold, no prices in the hero, no reviews carousel. The homepage
  sells the company; /shop sells the SKU.

  Every section guards its own data, and a section with nothing to show renders
  nothing rather than an empty frame. That is what lets this page be correct
  today — before brands and products are seeded — without a placeholder in it.
*/

export default async function HomePage() {
  const [hero, record, trust, stepsBlock, story] = await Promise.all([
    getContent('home_hero'),
    getContent('world_record'),
    getContent('trust_badges'),
    getContent('home_steps'),
    getContent('home_story'),
  ]);

  // The ticker, header and footer come from the storefront layout; this page
  // still reads brands for its own pills and house grid.
  const [brands, products, combos] = await Promise.all([
    getBrands(),
    getFeaturedProducts(8),
    getFeaturedCombos(8),
  ]);

  // The pinned sequence is photography-led — three captions beside an empty
  // frame is worse than no section. It appears once every step has real art.
  // "Combos that save more" only while there are combos to point at, and
  // online payment only once Razorpay's keys are set — the same check the
  // checkout uses. Otherwise the slot says something that is always true.
  const features: Array<{ icon: FeatureIconName; title: string; body: string }> = [
    {
      icon: 'fragrance',
      title: 'Fragrances you’ll notice',
      body: 'Scents that stay long after the wash. MX-3 alone comes in 24.',
    },
    {
      icon: 'certified',
      title: 'An ISO 9001:2015 company',
      body: 'Made under a certified quality system, from formula to bottle.',
    },
    combos.length > 0
      ? {
          icon: 'combo',
          title: 'Combos that save more',
          body: 'Bundle your home-care essentials and pay less.',
        }
      : isRazorpayConfigured()
        ? {
            icon: 'payment',
            title: 'Secure online payment',
            body: 'Checkout is handled by Razorpay, so card details never touch this site.',
          }
        : {
            icon: 'maker',
            title: 'Straight from the maker',
            body: 'Every order here comes from Bright Blue itself, not a reseller.',
          },
    {
      icon: 'delivery',
      title: 'Delivered to your door',
      body: 'Order online and we’ll ship it to you.',
    },
  ];

  const steps = stepsBlock.steps.filter((step) => step.img.length > 0);
  const showSteps = steps.length === stepsBlock.steps.length && steps.length > 0;

  return (
    <>
      {/* 01 — brand pills. One swipeable row on a phone: nine pills wrapped
          into five rows pushed the headline half a screen down, and a wrapped
          row re-flowed — jolting everything below it — when the brand font
          arrived a second or two after first paint. */}
      {brands.length > 0 && (
        <Reveal
          className="mx-auto flex max-w-(--container-page) gap-3 overflow-x-auto px-6 pt-16 [scrollbar-width:none] *:shrink-0 sm:flex-wrap sm:overflow-visible"
          gap={0.04}
        >
          {brands.map((brand) => (
            <RevealItem key={brand.slug}>
              <Link
                href={`/brands/${brand.slug}`}
                className="group flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-line px-4 py-2 type-caption motion-accent hover:border-ink hover:bg-ink hover:text-paper"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full transition-transform duration-(--bb-duration-accent) ease-(--bb-ease-out) group-hover:scale-150"
                  style={{ backgroundColor: brand.accentHex }}
                />
                {brand.name}
              </Link>
            </RevealItem>
          ))}
        </Reveal>
      )}

      {/* 04 — hero */}
      <div
        className={`mx-auto grid max-w-(--container-page) items-center gap-12 px-6 pb-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] ${
          brands.length > 0 ? 'pt-16' : 'pt-24'
        }`}
      >
      <Reveal>
        <RevealItem>
          <p className="type-caption text-ink-soft">{hero.eyebrow}</p>
        </RevealItem>
        <RevealItem>
          <h1 className="mt-6 max-w-4xl type-display-lg">
            {hero.before}{' '}
            {/*
              The second type register, for real: Instrument Serif italic
              colliding with Clash Display's grotesque caps. `font-accent`
              is a genuine third face (see src/app/fonts.ts), not weight and
              case tricks inside the display face.
            */}
            <em className="font-accent text-[1.15em] italic text-ink-soft">
              {hero.emphasis}
            </em>
            {/* The space is conditional: `after` is empty by default, and a
                bare {' '} would leave a trailing space in the heading. */}
            {hero.after && <> {hero.after}</>}
          </h1>
        </RevealItem>
        <RevealItem>
          <p className="mt-8 max-w-2xl type-body-lg text-ink-soft">{hero.body}</p>
        </RevealItem>
        <RevealItem>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <MagneticButton href={hero.ctaHref}>{hero.ctaLabel}</MagneticButton>
            <Link href="/shop?brand=mx-3" className="btn btn-secondary">Discover MX-3</Link>
          </div>
          <p className="mt-6 type-caption text-ink-soft">Made in India · Since 2019</p>
        </RevealItem>
      </Reveal>
        {/* Decorative: a Kerala counter with 24 bubbles, one per fragrance. */}
        <div className="relative rounded-card border border-line bg-sky/60 p-8 lg:p-12">
          <div className="flex items-center justify-between gap-4"><span className="type-caption">The MX-3 collection</span><span className="rounded-full border border-ink/20 px-3 py-1 text-xs">Dish care</span></div>
          <Image src="/collection/dishwash-cutout.webp" alt="Original MX-3 dishwashing liquid bottles from the Bright Blue collection" width={800} height={800} priority sizes="(max-width: 1024px) 90vw, 500px" className="mx-auto aspect-square w-full object-contain" />
          <div className="flex items-end justify-between border-t border-ink/15 pt-6"><div><span className="type-display-sm">24</span><p className="mt-1 type-body text-ink-soft">Signature fragrances</p></div><Link href="/shop?brand=mx-3" aria-label="Explore MX-3 dish care" className="flex size-12 items-center justify-center rounded-full bg-ink text-paper">↗</Link></div>
        </div>
      </div>

      <HomeCollections />

      {/* 05 — the record */}
      <section className="bg-sky">
        <div className="mx-auto grid max-w-(--container-page) items-center gap-12 px-6 py-24 md:grid-cols-[minmax(0,1fr)_auto]">
        <Reveal>
          <RevealItem>
            {/*
              Baseline-aligned rather than inline: the two halves are different
              type sizes with different line-heights, so relying on a word space
              between them set the gap at the larger size and left the headline
              sitting off the number's baseline once either wrapped.
            */}
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="type-display-lg">
                <CountUp to={record.count} />
              </span>
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

      {/* 06 — trust badges */}
      <Reveal className="mx-auto grid max-w-(--container-page) gap-8 px-6 py-24 sm:grid-cols-2 lg:grid-cols-4">
        {trust.badges.map((badge) => (
          <RevealItem key={badge.label}>
            <p className="type-caption">{badge.label}</p>
            <p className="mt-2 type-body text-ink-soft">{badge.detail}</p>
          </RevealItem>
        ))}
      </Reveal>

      {/* 07 — the eight houses */}
      {brands.length > 0 && (
        <section className="border-t border-line">
          <Reveal className="mx-auto max-w-(--container-page) px-6 py-24">
            <RevealItem>
              <h2 className="type-display-sm">Our brands. One standard.</h2>
            </RevealItem>
            <RevealItem className="mt-16">
              <HouseSpectrum brands={brands} />
            </RevealItem>
          </Reveal>
        </section>
      )}

      {/* 07b — why buy here */}
      <section className="border-t border-line">
        <Reveal className="mx-auto grid max-w-(--container-page) gap-10 px-6 py-24 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <RevealItem key={feature.title}>
              <FeatureIcon name={feature.icon} className="size-12" />
              <h3 className="mt-6 type-subhead">{feature.title}</h3>
              <p className="mt-2 max-w-xs type-body text-ink-soft">{feature.body}</p>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {/* 08 — how it's made */}
      {showSteps && <PinnedSteps steps={steps} eyebrow={stepsBlock.eyebrow} />}

      {/* 09 — best sellers */}
      {products.length > 0 && (
        <section className="border-t border-line">
          <Reveal className="mx-auto max-w-(--container-page) px-6 py-24">
            <RevealItem>
              <h2 className="type-display-sm">Best sellers</h2>
            </RevealItem>
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product) => (
                <RevealItem key={product.slug}>
                  {/*
                    No `onQuickAdd` until the cart exists in Phase 4. The card
                    supports it; shipping a button that does nothing does not.
                  */}
                  <ProductCard product={product} />
                </RevealItem>
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* 10 — combos */}
      {combos.length > 0 && (
        <section className="border-t border-line">
          <Reveal className="mx-auto max-w-(--container-page) px-6 py-24">
            <RevealItem>
              <h2 className="type-display-sm">Combos &amp; offers</h2>
            </RevealItem>
            <ul className="mt-16 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4">
              {combos.map((combo) => (
                <li key={combo.slug} className="flex w-72 shrink-0 snap-start pt-1">
                  <Link
                    href={`/combos/${combo.slug}`}
                    className="group card-lift flex w-full flex-col rounded-card border border-line bg-paper p-6"
                  >
                    <span className="block type-subhead">{combo.name}</span>
                    <span className="mt-2 block type-body text-ink-soft">
                      {combo.shortDesc}
                    </span>
                    <span className="mt-auto flex items-baseline justify-between gap-4 pt-4">
                      <span className="type-body font-medium" data-price>
                        {formatPrice(combo.pricePaise)}
                      </span>
                      <span className="type-caption text-ink-soft">
                        View <span aria-hidden="true" className="arrow-nudge">&rarr;</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>
      )}

      {/* 11 — our story */}
      <section className="border-t border-line bg-sky">
        <div className="mx-auto grid max-w-(--container-page) items-end gap-12 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Reveal>
          <RevealItem>
            <h2 className="type-display-sm">{story.heading}</h2>
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
      </section>

      <StoreQuestions />

      {/* 12 — support */}
      <section className="border-t border-line">
        <Reveal className="mx-auto flex max-w-(--container-page) flex-col gap-8 px-6 py-24 md:flex-row md:items-center md:justify-between">
          <RevealItem className="flex items-start gap-6">
            <FeatureIcon name="phone" className="size-12 shrink-0" />
            <div>
              <h2 className="type-display-sm">Questions? We&rsquo;re here.</h2>
              <p className="mt-4 max-w-xl type-body-lg text-ink-soft">
                Call us toll-free or write to us about an order, a product or trade pricing.
              </p>
            </div>
          </RevealItem>
          <RevealItem className="flex flex-col gap-3 sm:flex-row md:shrink-0">
            <a href={CONTACT.tollFreeHref} className="btn btn-primary tabular-nums">
              Call {CONTACT.tollFreeDisplay}
            </a>
            <a href={`mailto:${CONTACT.email}`} className="btn btn-secondary">
              Email us
            </a>
          </RevealItem>
        </Reveal>
      </section>
    </>
  );
}
