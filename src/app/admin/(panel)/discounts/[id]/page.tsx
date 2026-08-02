import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { paiseToRupeesInput } from '@/lib/money';
import { requireCatalogueAccess } from '@/lib/session';
import { DiscountForm, type DiscountFormValues } from '../discount-form';
import { updateDiscountAction } from '../actions';
import { formatTiers } from '../format';

/** `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm", local time, no seconds. */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EditDiscountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCatalogueAccess();
  const { id } = await params;

  const discount = await db.discount.findUnique({ where: { id } });
  if (!discount) notFound();

  const [brands, categories, products, combos] = await Promise.all([
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.product.findMany({ orderBy: { name: 'asc' } }),
    db.combo.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const initialValues: DiscountFormValues = {
    name: discount.name,
    publicLabel: discount.publicLabel ?? '',
    code: discount.code ?? '',
    type: discount.type,
    scope: discount.scope,
    valuePercent: discount.valueBps === null ? '' : String(discount.valueBps / 100),
    valueRupees: discount.valuePaise === null ? '' : paiseToRupeesInput(discount.valuePaise),
    buyQty: discount.buyQty === null ? '' : String(discount.buyQty),
    getQty: discount.getQty === null ? '' : String(discount.getQty),
    tiers: formatTiers(discount.tiers),
    minOrderRupees: discount.minOrderPaise === null ? '' : paiseToRupeesInput(discount.minOrderPaise),
    maxDiscountRupees:
      discount.maxDiscountPaise === null ? '' : paiseToRupeesInput(discount.maxDiscountPaise),
    usageLimit: discount.usageLimit === null ? '' : String(discount.usageLimit),
    perCustomerLimit: discount.perCustomerLimit === null ? '' : String(discount.perCustomerLimit),
    stackable: discount.stackable,
    priority: discount.priority,
    startsAt: toDatetimeLocal(discount.startsAt),
    endsAt: discount.endsAt ? toDatetimeLocal(discount.endsAt) : '',
    targetIds: discount.targetIds,
  };

  const boundAction = updateDiscountAction.bind(null, discount.id);

  return (
    <div>
      <h1 className="type-display-sm">Edit discount</h1>
      {discount.usageCount > 0 && (
        <p className="mt-4 type-body text-ink-soft">
          Used {discount.usageCount} time{discount.usageCount === 1 ? '' : 's'} so far.
        </p>
      )}
      <DiscountForm
        action={boundAction}
        initialValues={initialValues}
        brandOptions={brands.map((b) => ({ id: b.id, label: b.name }))}
        categoryOptions={categories.map((c) => ({ id: c.id, label: c.name }))}
        productOptions={products.map((p) => ({ id: p.id, label: p.name }))}
        comboOptions={combos.map((c) => ({ id: c.id, label: c.name }))}
        submitLabel="Save changes"
      />
    </div>
  );
}
