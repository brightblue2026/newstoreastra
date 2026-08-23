import Link from 'next/link';
import { requireAdminAccess } from '@/lib/session';
import { canAdminister, canManageCatalogue } from '@/lib/roles';

export default async function AdminHomePage() {
  const user = await requireAdminAccess();

  return (
    <div>
      <h1 className="type-display-sm">Admin</h1>
      <p className="mt-4 type-body-lg text-ink-soft">Signed in as {user.email}.</p>

      <dl className="mt-12 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
        <div>
          <dt className="type-caption text-ink-soft">Orders and fulfilment</dt>
          <dd className="mt-2 type-body">
            <Link href="/admin/orders" className="text-signal">
              Orders
            </Link>
          </dd>
        </div>
        <div>
          <dt className="type-caption text-ink-soft">Products and pricing</dt>
          <dd className="mt-2 type-body">
            {canManageCatalogue(user.role) ? (
              <span className="flex gap-4">
                <Link href="/admin/brands" className="text-signal">
                  Brands
                </Link>
                <Link href="/admin/categories" className="text-signal">
                  Categories
                </Link>
                <Link href="/admin/products" className="text-signal">
                  Products
                </Link>
                <Link href="/admin/discounts" className="text-signal">
                  Discounts
                </Link>
                <Link href="/admin/combos" className="text-signal">
                  Combos
                </Link>
              </span>
            ) : (
              'Manager and above'
            )}
          </dd>
        </div>
        <div>
          <dt className="type-caption text-ink-soft">Users and settings</dt>
          <dd className="mt-2 type-body">
            {canAdminister(user.role) ? (
              <Link href="/admin/settings" className="text-signal">
                Settings
              </Link>
            ) : (
              'Administrator only'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
