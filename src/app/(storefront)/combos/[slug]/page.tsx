import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddToCartButton from '@/components/AddToCartButton';
import ComboChoices, { type ChoiceSlot } from '@/components/ComboChoices';
import { getComboBySlug } from '@/lib/storefront';
import { formatINR } from '@/lib/money';
import { absoluteUrl } from '@/lib/site';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const combo = await getComboBySlug(slug);

  if (!combo) return { title: 'Combo not found' };

  return {
    title: combo.name,
    description: combo.shortDesc,
    alternates: { canonical: `/combos/${combo.slug}` },
  };
}

/*
  A combo page.

  A combo is a sellable package at a package price, not a discount rule — so
  it gets a real `Offer` at its own price rather than being described as a
  markdown on something else.

  Choice slots are picked here, per slot and per unit ("any 3 MX-3
  fragrances" asks three times). The picks ride on the cart line as ids and are
  re-validated server-side against the slot's own `choiceOf` restriction before
  they can affect what is sold. A combo with no choice slots keeps the plain
  add-to-cart button — there is nothing to decide.
*/

export default async function ComboPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const combo = await getComboBySlug(slug);
  if (!combo) notFound();

  const choiceSlots: ChoiceSlot[] = combo.items
    .filter((item) => item.isChoice)
    .map((item) => ({
      itemId: item.id,
      quantity: item.quantity,
      productName: item.productName,
      options: item.options,
    }));

  const saving =
    combo.componentSumPaise !== null && combo.componentSumPaise > combo.pricePaise
      ? combo.componentSumPaise - combo.pricePaise
      : null;

  const savingPercent =
    saving !== null && combo.componentSumPaise !== null && combo.componentSumPaise > 0
      ? Math.round((saving / combo.componentSumPaise) * 100)
      : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: combo.name,
    description: combo.shortDesc,
    ...(combo.imageUrl ? { image: [combo.imageUrl] } : {}),
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/combos/${combo.slug}`),
      priceCurrency: 'INR',
      price: (combo.pricePaise / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-(--container-page) px-6 py-16">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 type-caption text-ink-soft">
            <li className="flex items-center gap-2">
              <Link href="/shop" className="hover:text-ink">
                Shop
              </Link>
              <span aria-hidden="true">/</span>
            </li>
            <li aria-current="page">{combo.name}</li>
          </ol>
        </nav>

        <div className="mt-12 grid gap-16 lg:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-card bg-sky">
            {combo.imageUrl ? (
              <Image
                src={combo.imageUrl}
                alt={combo.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-12"
              />
            ) : (
              <span className="sr-only">No photograph available</span>
            )}
          </div>

          <div>
            <p className="type-caption text-ink-soft">Combo</p>
            <h1 className="mt-4 type-display-sm">{combo.name}</h1>
            <p className="mt-6 type-body-lg text-ink-soft">{combo.shortDesc}</p>

            {/* The saving panel. Shown only when every component carries a
                price — one unpriced component makes the claim unprovable. */}
            <div className="mt-8">
              <p className="type-display-sm tabular-nums" data-price>
                {formatINR(combo.pricePaise)}
              </p>

              {saving !== null && combo.componentSumPaise !== null && (
                <p className="mt-3 type-body text-ink-soft">
                  <s className="tabular-nums">{formatINR(combo.componentSumPaise)}</s>{' '}
                  <span className="text-success">
                    Save {formatINR(saving)}
                    {savingPercent !== null && ` (${savingPercent}%)`}
                  </span>
                </p>
              )}
            </div>

            <div className="mt-12">
              {choiceSlots.length > 0 ? (
                <ComboChoices
                  comboId={combo.id}
                  slots={choiceSlots}
                  label="Add combo to cart"
                />
              ) : (
                <AddToCartButton kind="COMBO" id={combo.id} label="Add combo to cart" />
              )}
            </div>

            {combo.description && (
              <div className="mt-12 max-w-2xl space-y-4">
                {combo.description
                  .split(/\n{2,}/)
                  .map((paragraph) => paragraph.trim())
                  .filter((paragraph) => paragraph.length > 0)
                  .map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="type-body text-ink-soft">
                      {paragraph}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* --------------------------------------------------- what's inside */}
        {combo.items.length > 0 && (
          <section className="mt-24 border-t border-line pt-16">
            <h2 className="type-display-sm">What&rsquo;s inside</h2>

            <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {combo.items.map((item) => (
                <li key={item.id} className="rounded-card border border-line p-6">
                  <div
                    className="relative aspect-square overflow-hidden rounded-control"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${item.accentHex} 12%, var(--color-paper))`,
                    }}
                  >
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-contain p-6"
                      />
                    ) : (
                      <span className="sr-only">No photograph available</span>
                    )}
                  </div>

                  <p className="mt-4 type-caption text-ink-soft">{item.brandName}</p>

                  <p className="mt-1 type-subhead">
                    <Link href={`/products/${item.productSlug}`} className="hover:underline">
                      {item.productName}
                    </Link>
                  </p>

                  <p className="mt-1 type-body text-ink-soft">
                    {item.size}
                    {item.format && ` · ${item.format}`}
                    {item.quantity > 1 && (
                      <span className="ml-2 tabular-nums">×{item.quantity}</span>
                    )}
                  </p>

                  {item.isChoice ? (
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="type-caption text-ink-soft">Your choice of</p>
                      {item.options.length > 0 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {item.options.map((option) => (
                            <li
                              key={option.id}
                              className="flex items-center gap-2 rounded-full border border-line px-3 py-1 type-caption"
                            >
                              <span
                                aria-hidden="true"
                                className="size-2 rounded-full"
                                style={{
                                  backgroundColor: option.variantHex ?? 'var(--color-line)',
                                }}
                              />
                              {option.variantName ?? 'Variant'}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 type-body text-ink-soft">
                          Any fragrance in this range.
                        </p>
                      )}
                      <p className="mt-3 type-caption text-ink-soft">
                        {item.quantity > 1
                          ? `Pick ${item.quantity} above — repeats allowed.`
                          : 'Pick yours above.'}
                      </p>
                    </div>
                  ) : (
                    item.variantName && (
                      <p className="mt-3 type-body">{item.variantName}</p>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
