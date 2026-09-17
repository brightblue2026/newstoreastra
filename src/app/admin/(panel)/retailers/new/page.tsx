import Link from 'next/link';
import { requireCatalogueAccess } from '@/lib/session';
import { createRetailerAction } from '../actions';
import { RetailerForm } from '../retailer-form';

export default async function NewRetailerPage() {
  await requireCatalogueAccess();

  return (
    <div>
      <Link href="/admin/retailers" className="type-caption text-ink-soft underline">
        All retailers
      </Link>
      <h1 className="mt-4 type-display-sm">New retailer</h1>
      <RetailerForm action={createRetailerAction} submitLabel="Add retailer" />
    </div>
  );
}
