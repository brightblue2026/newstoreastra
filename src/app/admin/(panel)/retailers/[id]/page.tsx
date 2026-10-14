import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireCatalogueAccess } from '@/lib/session';
import { updateRetailerAction } from '../actions';
import { RetailerForm } from '../retailer-form';

export default async function EditRetailerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCatalogueAccess();

  const { id } = await params;
  const retailer = await db.retailer.findUnique({ where: { id } });
  if (!retailer) notFound();

  return (
    <div>
      <Link href="/admin/retailers" className="type-caption text-ink-soft underline">
        All retailers
      </Link>
      <h1 className="mt-4 type-display-sm">{retailer.name}</h1>
      {!retailer.isActive && (
        <p className="mt-2 type-body text-warning">
          Hidden from the Stockists page. Use List on the retailers table to show it again.
        </p>
      )}
      <RetailerForm
        action={updateRetailerAction.bind(null, retailer.id)}
        submitLabel="Save retailer"
        initialValues={{
          name: retailer.name,
          address: retailer.address,
          city: retailer.city,
          district: retailer.district,
          pincode: retailer.pincode,
          phone: retailer.phone ?? '',
        }}
      />
    </div>
  );
}
