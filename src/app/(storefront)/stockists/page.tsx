import type { Metadata } from 'next';
import { Reveal, RevealItem } from '@/components/Reveal';
import { getStockistsByDistrict } from '@/lib/storefront';
import { CONTACT } from '@/lib/contact';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Stockists',
  description: 'Where to find Bright Blue products across Kerala.',
  alternates: { canonical: '/stockists' },
};

/*
  Where to buy.

  Most of this catalogue has no published online price yet, so retail is the
  real answer to "where do I get this" for a lot of visitors. When there are no
  retailers on file the page says so and offers the toll-free number, rather
  than printing an invented list of shops.
*/

export default async function StockistsPage() {
  const districts = await getStockistsByDistrict();

  const total = districts.reduce((sum, group) => sum + group.stockists.length, 0);

  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-24">
      <Reveal>
        <RevealItem>
          <p className="type-caption text-ink-soft">Where to buy</p>
        </RevealItem>
        <RevealItem>
          <h1 className="mt-6 type-display-sm">Stockists</h1>
        </RevealItem>
        <RevealItem>
          <p className="mt-6 max-w-2xl type-body-lg text-ink-soft">
            {total > 0 ? (
              <>
                Bright Blue is stocked by{' '}
                <span className="tabular-nums">{total}</span>{' '}
                {total === 1 ? 'retailer' : 'retailers'} across Kerala.
              </>
            ) : (
              <>
                To find your nearest stockist, call{' '}
                <a href={CONTACT.tollFreeHref} className="underline">
                  {CONTACT.tollFree}
                </a>{' '}
                toll free, or email{' '}
                <a href={`mailto:${CONTACT.email}`} className="underline">
                  {CONTACT.email}
                </a>
                .
              </>
            )}
          </p>
        </RevealItem>
      </Reveal>

      {districts.length > 0 && (
        <div className="mt-16 space-y-16">
          {districts.map((group) => (
            <section key={group.district}>
              <h2 className="type-heading">{group.district}</h2>
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.stockists.map((stockist) => (
                  <li key={stockist.id} className="rounded-card border border-line p-6">
                    <p className="type-subhead">{stockist.name}</p>
                    <address className="mt-3 not-italic type-body text-ink-soft">
                      {stockist.address}
                      <br />
                      {stockist.city} {stockist.pincode}
                    </address>
                    {stockist.phone && (
                      <a
                        href={`tel:${stockist.phone.replace(/[^\d+]/g, '')}`}
                        className="mt-3 inline-block type-body underline"
                      >
                        {stockist.phone}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {total > 0 && (
        <p className="mt-24 border-t border-line pt-8 type-body text-ink-soft">
          Not near any of these? Call{' '}
          <a href={CONTACT.tollFreeHref} className="underline">
            {CONTACT.tollFree}
          </a>{' '}
          toll free.
        </p>
      )}
    </div>
  );
}
