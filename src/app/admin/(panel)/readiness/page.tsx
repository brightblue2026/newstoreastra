import Link from 'next/link';
import { db } from '@/lib/db';
import { requireAdministrator } from '@/lib/session';
import { configurationChecks } from '@/lib/readiness';
import { missingBusinessDetails } from '@/lib/business';
import { getPublishedPolicies } from '@/lib/content';

export default async function ReadinessPage() {
  await requireAdministrator();
  const [products, stocked, sellers, policies] = await Promise.all([
    db.product.count({ where: { isActive: true } }),
    db.inventory.count({ where: { quantity: { gt: 0 }, location: { isActive: true } } }),
    db.entity.findMany({ where: { isSeller: true, isActive: true }, select: { gstin: true } }),
    getPublishedPolicies(),
  ]);
  const missingDetails = missingBusinessDetails();
  const checks = [
    ...configurationChecks(process.env),
    { id: 'catalogue', label: 'Published catalogue', ready: products > 0, detail: `${products} published products. Verify prices, product images, HSN/GST and required label information in Products.` },
    { id: 'stock', label: 'Stock recorded', ready: stocked > 0, detail: 'Record stock for every sellable variant at an active location. Untracked products cannot be ordered.' },
    { id: 'seller', label: 'Seller of record', ready: sellers.length === 1 && Boolean(sellers[0].gstin), detail: 'Exactly one active seller with a confirmed GSTIN is needed for invoicing.' },
    { id: 'business', label: 'Business details confirmed', ready: missingDetails.length === 0, detail: missingDetails.length ? `Confirm: ${missingDetails.join(', ')}.` : 'Confirm the public seller identity matches the invoice entity and payment account.' },
    { id: 'policies', label: 'Customer policies', ready: policies.length === 4, detail: `${policies.length} of 4 policies explicitly published in admin: shipping, returns, privacy and terms. Standing fallback text also exists; review and approve it before launch.` },
  ];
  const passed = checks.filter((check) => check.ready).length;
  return (
    <div>
      <p className="type-caption text-ink-soft">Launch preparation</p>
      <h1 className="mt-4 type-display-sm">Store readiness</h1>
      <div className="mt-8 rounded-card border border-line bg-white p-6"><p className="type-heading">{passed} of {checks.length} configuration checks met</p><p className="mt-2 type-body text-ink-soft">These checks show setup progress. They do not certify payment settlement, live delivery, security or capacity. Complete the staging acceptance checklist before opening the store.</p><progress value={passed} max={checks.length} aria-label="Configuration checks met" className="mt-6 h-3 w-full accent-ink" /></div>
      <ul className="mt-8 divide-y divide-line rounded-card border border-line bg-white">
        {checks.map((check) => <li key={check.id} className="flex items-start gap-4 p-6"><span className={`mt-1 rounded-full border px-3 py-1 text-xs font-medium ${check.ready ? 'border-success text-success' : 'border-warning text-warning'}`}>{check.ready ? 'Set up' : 'Action needed'}</span><div><h2 className="type-subhead">{check.label}</h2><p className="mt-2 type-body text-ink-soft">{check.detail}</p></div></li>)}
      </ul>
      <div className="mt-8 flex flex-wrap gap-4"><Link href="/admin/products" className="btn btn-primary">Manage products</Link><Link href="/admin/settings" className="btn btn-secondary">Open settings</Link><Link href="/admin/content" className="btn btn-secondary">Review policies</Link></div>
    </div>
  );
}
