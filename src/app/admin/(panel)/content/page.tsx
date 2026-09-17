import Link from 'next/link';
import {
  CONTENT_META,
  EDITABLE_CONTENT_KEYS,
  POLICY_META,
  POLICY_SLUGS,
  policyKey,
  schemaForEditorKey,
  type EditorKey,
} from '@/lib/content-schema';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/*
  Everything a manager can reword without a developer: the homepage blocks,
  the policy pages, and — because "what shows on the homepage" is one question
  to the person asking it — a pointer to the Featured flags that live on
  products and combos.
*/
export default async function ContentPage() {
  await requireCatalogueAccess();

  const [rows, featuredProducts, featuredCombos] = await Promise.all([
    db.contentBlock.findMany(),
    db.product.findMany({
      where: { isFeatured: true },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.combo.findMany({
      where: { isFeatured: true },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const byKey = new Map(rows.map((row) => [row.key, row]));

  function readable(key: EditorKey) {
    const row = byKey.get(key);
    return row ? { row, valid: schemaForEditorKey(key).safeParse(row.data).success } : null;
  }

  return (
    <div>
      <h1 className="type-display-sm">Content</h1>
      <p className="mt-4 max-w-2xl type-body-lg text-ink-soft">
        Wording on the storefront. Changes are live as soon as they are saved.
      </p>

      <section className="mt-12">
        <h2 className="type-heading">Homepage and story</h2>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {EDITABLE_CONTENT_KEYS.map((key) => {
            const stored = readable(key);
            const status =
              !stored || !stored.row.isActive
                ? 'Original wording'
                : stored.valid
                  ? `Edited ${formatDate(stored.row.updatedAt)}`
                  : 'Saved version unreadable, showing original';
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <p className="type-subhead">{CONTENT_META[key].label}</p>
                  <p className="mt-1 type-caption normal-case text-ink-soft">
                    {CONTENT_META[key].where}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <span className="type-caption normal-case text-ink-soft">{status}</span>
                  <Link href={`/admin/content/${key}`} className="type-body text-signal">
                    Edit
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="type-heading">Policies</h2>
        <p className="mt-2 max-w-2xl type-body text-ink-soft">
          A policy has no page and no footer link until it is published. None has a ready-made
          version: these are Bright Blue&apos;s own terms.
        </p>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {POLICY_SLUGS.map((slug) => {
            const stored = readable(policyKey(slug));
            const published = Boolean(stored?.row.isActive && stored.valid);
            const status = !stored
              ? 'Not written'
              : published
                ? `Published ${formatDate(stored.row.updatedAt)}`
                : 'Unpublished';
            return (
              <li key={slug} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <p className="type-subhead">{POLICY_META[slug].label}</p>
                  <p className="mt-1 type-caption normal-case text-ink-soft">
                    {POLICY_META[slug].where}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <span
                    className={`type-caption normal-case ${published ? 'text-ink-soft' : 'text-warning'}`}
                  >
                    {status}
                  </span>
                  <Link href={`/admin/content/${policyKey(slug)}`} className="type-body text-signal">
                    {stored ? 'Edit' : 'Write'}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="type-heading">Featured on the homepage</h2>
        <p className="mt-2 max-w-2xl type-body text-ink-soft">
          Best sellers shows products ticked Featured, and Combos &amp; offers shows combos ticked
          Featured, up to eight of each. Change it on the product or combo itself.
        </p>
        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          <FeaturedList
            title="Products"
            emptyText="No product is featured, so Best sellers is hidden."
            items={featuredProducts.map((item) => ({ ...item, href: `/admin/products/${item.id}` }))}
          />
          <FeaturedList
            title="Combos"
            emptyText="No combo is featured, so Combos & offers is hidden."
            items={featuredCombos.map((item) => ({ ...item, href: `/admin/combos/${item.id}` }))}
          />
        </div>
      </section>
    </div>
  );
}

function FeaturedList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: { id: string; name: string; isActive: boolean; href: string }[];
}) {
  return (
    <div className="rounded-card border border-line p-6">
      <p className="type-caption text-ink-soft">{title}</p>
      {items.length === 0 ? (
        <p className="mt-4 type-body text-ink-soft">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="type-body">
              <Link href={item.href} className="text-signal">
                {item.name}
              </Link>
              {!item.isActive && (
                <span className="ml-2 type-caption normal-case text-warning">
                  not published, so not shown
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
