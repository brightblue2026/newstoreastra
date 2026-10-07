import { Reveal, RevealItem } from '@/components/Reveal';
import ProductCard, { type ProductCardData } from '@/components/ProductCard';

/*
  The listing grid, shared by /shop, /brands/[slug], /categories/[slug] and
  /search so all four stagger and space identically.

  Still a server component — `Reveal` and `ProductCard` own the client
  boundary between them. No `onQuickAdd`: adding to the cart from a grid needs
  a variant, and a product with three sizes has no single one to add.
*/
export default function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <Reveal className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" gap={0.04}>
      {products.map((product) => (
        <RevealItem key={product.slug}>
          <ProductCard product={product} />
        </RevealItem>
      ))}
    </Reveal>
  );
}

/**
 * What a listing shows when a filter matches nothing.
 *
 * An empty catalogue and an over-narrow filter are different situations and
 * read differently, so the caller supplies the sentence.
 */
export function EmptyListing({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-sky/30 px-6 py-16 text-center">
      <p className="mx-auto max-w-md type-body-lg text-ink-soft">{children}</p>
    </div>
  );
}
