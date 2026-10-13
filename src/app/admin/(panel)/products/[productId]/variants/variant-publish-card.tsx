import { PublishButton } from '../../publish-button';
import { setVariantActiveAction } from './actions';
import { variantNotice } from './variant-notice';

/**
 * One variant's place on the store, and the button that changes it — the same
 * card the product's Photos page has for the product, so publishing reads the
 * same at both levels. Shown on the variant's edit page and its photo page.
 */
export function VariantPublishCard({
  productId,
  productName,
  productIsActive,
  variant,
  label,
  returnTo,
  noticeKind,
}: {
  productId: string;
  productName: string;
  productIsActive: boolean;
  variant: { id: string; isActive: boolean };
  label: string;
  returnTo: 'edit' | 'photos';
  noticeKind?: string;
}) {
  const notice = variantNotice(noticeKind, { label, productName, productIsActive });

  return (
    <div className="mt-12 max-w-2xl rounded-card border border-line p-6">
      {notice && (
        <p
          role={notice.tone === 'warning' ? 'alert' : 'status'}
          className={`mb-4 rounded-control border px-4 py-3 type-body ${
            notice.tone === 'warning' ? 'border-warning text-warning' : 'border-success text-success'
          }`}
        >
          {notice.text}
        </p>
      )}
      <h2 className="type-heading">{variant.isActive ? 'Published' : 'Not published'}</h2>
      <p className="mt-2 type-body text-ink-soft">
        {!variant.isActive
          ? `Customers cannot see or choose ${label}. Publishing does not delete or change anything else.`
          : productIsActive
            ? `Customers can choose ${label} on the store.`
            : `${label} is ready. It will appear on the store once "${productName}" itself is published.`}
      </p>
      <form
        action={setVariantActiveAction.bind(null, productId, variant.id, !variant.isActive, returnTo)}
        className="mt-4"
      >
        <PublishButton isActive={variant.isActive} />
      </form>
    </div>
  );
}
