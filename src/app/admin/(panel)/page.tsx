import Link from 'next/link';
import { requireAdminAccess } from '@/lib/session';
import { canAdminister, canManageCatalogue } from '@/lib/roles';

export default async function AdminHomePage() {
  const user = await requireAdminAccess();

  const sections: {
    title: string;
    note: string;
    links: { href: string; label: string }[];
    locked?: string;
  }[] = [
    {
      title: 'Orders and fulfilment',
      note: 'Track orders as they move from payment through to delivery.',
      links: [{ href: '/admin/orders', label: 'Orders' }],
    },
    {
      title: 'Products and pricing',
      note: 'The catalogue — brands, categories, products, discounts and combos.',
      links: canManageCatalogue(user.role)
        ? [
            { href: '/admin/brands', label: 'Brands' },
            { href: '/admin/categories', label: 'Categories' },
            { href: '/admin/products', label: 'Products' },
            { href: '/admin/discounts', label: 'Discounts' },
            { href: '/admin/combos', label: 'Combos' },
          ]
        : [],
      locked: canManageCatalogue(user.role) ? undefined : 'Manager and above',
    },
    {
      title: 'Content and stockists',
      note: 'Homepage wording, policy pages, and the shops that stock Bright Blue.',
      links: canManageCatalogue(user.role)
        ? [
            { href: '/admin/content', label: 'Content and policies' },
            { href: '/admin/retailers', label: 'Retailers' },
          ]
        : [],
      locked: canManageCatalogue(user.role) ? undefined : 'Manager and above',
    },
    {
      title: 'Users and settings',
      note: 'Seller of record, delivery rates, cash on delivery and payment setup.',
      links: canAdminister(user.role) ? [{ href: '/admin/settings', label: 'Settings' }] : [],
      locked: canAdminister(user.role) ? undefined : 'Administrator only',
    },
  ];

  return (
    <div>
      <h1 className="type-display-sm">Admin</h1>
      <p className="mt-4 type-body-lg text-ink-soft">
        Signed in as {user.email} · {user.role.toLowerCase()}.
      </p>

      <div className="mt-12 grid gap-6 border-t border-line pt-12 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <section
            key={section.title}
            className="flex flex-col rounded-card border border-line p-6"
          >
            <h2 className="type-heading">{section.title}</h2>
            <p className="mt-2 type-caption text-ink-soft">{section.note}</p>

            {section.locked ? (
              <p className="mt-6 type-caption text-ink-soft">{section.locked}</p>
            ) : (
              <ul className="mt-6 space-y-1 border-t border-line pt-4">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="motion-lift flex items-center justify-between rounded-control px-2 py-2 -mx-2 type-body hover:bg-sky"
                    >
                      {link.label}
                      <span aria-hidden className="text-ink-soft">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
