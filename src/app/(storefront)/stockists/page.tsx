import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal, RevealItem } from '@/components/Reveal';
import { CONTACT } from '@/lib/contact';
import { PINCODE_PATTERN } from '@/lib/retailer';
import {
  findStockistsNearPincode,
  getStockistDistricts,
  getStockistsByDistrict,
  type Stockist,
} from '@/lib/stockists';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Stockists',
  description: 'Where to find Bright Blue products across Kerala.',
  alternates: { canonical: '/stockists' },
};

/*
  Where to buy.

  Most of this catalogue has no published online price yet, so retail is the
  real answer to "where do I get this" for a lot of visitors. Search is a
  plain GET form and the districts are plain links: the locator works with no
  JavaScript and from the keyboard alone. When there are no retailers on file
  the page says so and offers the toll-free number, rather than printing an
  invented list of shops.
*/

type Props = { searchParams: Promise<{ pincode?: string; district?: string }> };

export default async function StockistsPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawPincode = (params.pincode ?? '').replace(/\s+/g, '').slice(0, 12);
  const pincode = PINCODE_PATTERN.test(rawPincode) ? rawPincode : null;
  const pincodeInvalid = rawPincode !== '' && pincode === null;

  const districts = await getStockistDistricts();
  // A pincode search wins over a district; an unknown district is ignored.
  const district =
    !pincode && params.district && districts.includes(params.district) ? params.district : null;

  const near = pincode ? await findStockistsNearPincode(pincode) : null;
  const groups = near ? [] : await getStockistsByDistrict(district ?? undefined);
  const total = groups.reduce((sum, group) => sum + group.stockists.length, 0);

  const tollFree = (
    <a href={CONTACT.tollFreeHref} className="underline">
      {CONTACT.tollFree}
    </a>
  );

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
            {districts.length > 0 ? (
              <>
                Bright Blue is stocked by shops in{' '}
                <span className="tabular-nums">{districts.length}</span>{' '}
                {districts.length === 1 ? 'district' : 'districts'}. Search by pincode, or choose
                a district.
              </>
            ) : (
              <>
                To find your nearest stockist, call {tollFree} toll free, or email{' '}
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
        <>
          <form
            action="/stockists"
            method="get"
            role="search"
            aria-label="Find a stockist by pincode"
            className="mt-12 flex flex-wrap items-end gap-4"
          >
            <div>
              <label htmlFor="pincode" className="block type-caption text-ink-soft">
                Pincode
              </label>
              <input
                id="pincode"
                name="pincode"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={7}
                defaultValue={rawPincode}
                aria-invalid={pincodeInvalid || undefined}
                aria-describedby={pincodeInvalid ? 'pincode-error' : undefined}
                className="mt-2 w-44 rounded-control border border-line bg-paper px-4 py-3 type-body tabular-nums"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Find stockists
            </button>
          </form>
          {pincodeInvalid && (
            <p id="pincode-error" className="mt-3 type-caption normal-case text-warning">
              Enter a 6-digit pincode, such as 682035.
            </p>
          )}

          <nav aria-label="Districts" className="mt-8">
            <ul className="flex flex-wrap gap-3">
              <li>
                <DistrictLink href="/stockists" current={!pincode && !district}>
                  All districts
                </DistrictLink>
              </li>
              {districts.map((name) => (
                <li key={name}>
                  <DistrictLink
                    href={`/stockists?district=${encodeURIComponent(name)}`}
                    current={district === name}
                  >
                    {name}
                  </DistrictLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      {near && pincode && (
        <div className="mt-16 space-y-16">
          <section aria-labelledby="exact-heading">
            <h2 id="exact-heading" className="type-heading">
              At {pincode}
            </h2>
            {near.exact.length > 0 ? (
              <StockistList stockists={near.exact} />
            ) : (
              <p className="mt-4 type-body text-ink-soft">No stockist is listed at {pincode} yet.</p>
            )}
          </section>

          {near.nearby.length > 0 && (
            <section aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="type-heading">
                Nearby
              </h2>
              <p className="mt-2 type-body text-ink-soft">
                Elsewhere in the same postal area.
              </p>
              <StockistList stockists={near.nearby} />
            </section>
          )}

          {near.exact.length === 0 && near.nearby.length === 0 && (
            <p className="type-body text-ink-soft">
              Nothing listed near {pincode} either. Call {tollFree} toll free and we will tell you
              the closest shop, or{' '}
              <Link href="/stockists" className="underline">
                see every district
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {!near && total > 0 && (
        <div className="mt-16 space-y-16">
          {groups.map((group) => (
            <section key={group.district} aria-labelledby={`district-${group.district}`}>
              <h2 id={`district-${group.district}`} className="type-heading">
                {group.district}
              </h2>
              <StockistList stockists={group.stockists} />
            </section>
          ))}
        </div>
      )}

      {districts.length > 0 && (
        <p className="mt-24 border-t border-line pt-8 type-body text-ink-soft">
          Not near any of these? Call {tollFree} toll free.
        </p>
      )}
    </div>
  );
}

function DistrictLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`tap-target rounded-full border px-4 py-2 type-caption motion-accent ${
        current ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
      }`}
    >
      {children}
    </Link>
  );
}

function StockistList({ stockists }: { stockists: Stockist[] }) {
  return (
    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {stockists.map((stockist) => (
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
              className="mt-1 inline-flex min-h-11 items-center type-body underline"
            >
              {stockist.phone}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
