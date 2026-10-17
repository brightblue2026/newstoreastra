import Image from 'next/image';
import Link from '@/components/Link';

const collections = [
  { brand: 'MX-3', slug: 'mx-3', category: 'Dish care', copy: 'A fresh start for every kitchen.', image: 'dishwash-cutout.webp' },
  { brand: 'Rafasi', slug: 'rafasi', category: 'Fabric care', copy: 'Care for the clothes you live in.', image: 'rafasi-clothwash-cutout.webp' },
  { brand: 'Kenzaniya', slug: 'kenzaniya', category: 'Food & pantry', copy: 'Good ingredients. Everyday rituals.', image: 'kenzaniya-pinksalt-cutout.webp' },
  { brand: 'ANSAF', slug: 'ansaf', category: 'Car care', copy: 'Bring a little shine to every journey.', image: 'ansafnew.webp' },
] as const;

/** Real BBTC photography, without invented prices, ratings or delivery promises. */
export default function HomeCollections({ brands }: { brands: Array<{ slug: string; productCount: number }> }) {
  const available = collections.filter((item) => brands.some((brand) => brand.slug === item.slug && brand.productCount > 0));
  if (available.length === 0) return null;
  return (
    <section aria-labelledby="collection-title" className="collections-colour-band border-y border-line">
      <div className="mx-auto max-w-(--container-page) px-6 py-16 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="type-caption text-ink-soft">Made for the everyday</p>
            <h2 id="collection-title" className="mt-4 type-display-sm">Find your kind of care.</h2>
          </div>
          <Link href="/shop" className="btn btn-secondary">Explore all products <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {available.map((item, index) => (
            <Link href={`/shop?brand=${item.slug}`} key={item.slug} data-collection={item.slug} className={`group collection-editorial relative overflow-hidden rounded-card border border-line transition-shadow hover:shadow-bb ${available.length === 1 ? 'md:col-span-2 md:grid md:grid-cols-2 md:items-center' : ''}`}>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-sky/40 p-8">
                <span className="absolute left-4 top-4 font-mono text-xs text-ink-soft">0{index + 1} / {item.category}</span>
                <Image src={`/collection/${item.image}`} alt={`${item.brand} ${item.category} product`} width={480} height={480} sizes="(max-width: 768px) 90vw, 560px" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none" />
              </div>
              <div className={`border-line p-6 lg:p-8 ${available.length === 1 ? 'border-t md:border-t-0' : 'border-t'}`}>
                <div className="flex items-center justify-between"><h3 className="type-heading">{item.brand}</h3><span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full border border-ink/20 transition-colors group-hover:bg-ink group-hover:text-paper">↗</span></div>
                <p className="mt-2 type-body text-ink-soft">{item.copy}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
