import Link from 'next/link';
import { buildHref, type QueryValues } from '@/lib/query';
import { PRODUCT_SORTS, type ProductSort } from '@/lib/storefront';

/*
  Filter and sort controls.

  Every control is a link. No `'use client'`, no router push, no state — the
  URL is the state. Filtering works with JavaScript still downloading, a
  filtered listing is shareable and indexable, and the page stays a server
  component all the way down.

  Accent discipline: a selected chip inverts to ink, it does not take the brand
  colour. On /brands/[slug] the accent is already spent on the page header, and
  a second live accent here would break the one-at-a-time rule.
*/

function Chip({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      className={`rounded-full border px-4 py-2 type-caption motion-accent ${
        selected
          ? 'border-ink bg-ink text-paper'
          : 'border-line text-ink-soft hover:border-ink hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

export type FilterGroup = {
  label: string;
  /** The query key this group writes to. */
  param: string;
  options: { value: string; label: string; count?: number }[];
};

export default function FilterBar({
  pathname,
  current,
  groups,
  sort,
}: {
  pathname: string;
  current: QueryValues;
  groups: FilterGroup[];
  sort: ProductSort;
}) {
  return (
    <div className="space-y-8">
      {groups
        .filter((group) => group.options.length > 0)
        .map((group) => {
          const active = current[group.param];

          return (
            <div key={group.param}>
              <h2 className="type-caption text-ink-soft">{group.label}</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <Chip
                  href={buildHref(pathname, current, { [group.param]: undefined })}
                  selected={active === undefined}
                >
                  All
                </Chip>
                {group.options.map((option) => (
                  <Chip
                    key={option.value}
                    // Clicking the selected chip clears it, so a filter can be
                    // undone without hunting for "All".
                    href={buildHref(pathname, current, {
                      [group.param]: active === option.value ? undefined : option.value,
                    })}
                    selected={active === option.value}
                  >
                    {option.label}
                    {option.count !== undefined && (
                      <span className="ml-2 tabular-nums text-current opacity-60">
                        {option.count}
                      </span>
                    )}
                  </Chip>
                ))}
              </div>
            </div>
          );
        })}

      <div>
        <h2 className="type-caption text-ink-soft">Sort</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(PRODUCT_SORTS) as ProductSort[]).map((key) => (
            <Chip
              key={key}
              href={buildHref(pathname, current, {
                // "Featured" is the default, so it is expressed as the absence
                // of the parameter rather than `?sort=featured`. One canonical
                // URL per result set.
                sort: key === 'featured' ? undefined : key,
              })}
              selected={sort === key}
            >
              {PRODUCT_SORTS[key]}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
