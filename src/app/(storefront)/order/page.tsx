import type { Metadata } from 'next';
import { CONTACT } from '@/lib/contact';
import { unlockOrder } from '@/server/actions/order-access';

export const metadata: Metadata = {
  title: 'Track your order',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Order lookup — brief §12 Phase 6's "customer tracking via order number +
 * phone, no login", which is also what a customer needs the day after placing
 * an order and losing the confirmation link.
 *
 * A plain server-rendered form. No client JavaScript is needed to look at an
 * order, and none is loaded.
 */
export default function OrderLookupPage() {
  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-16">
      <h1 className="type-display-sm">Track your order</h1>
      <p className="mt-6 max-w-prose type-body text-ink-soft">
        Enter your order number and the mobile number it was placed with. No account needed.
      </p>

      <form action={unlockOrder} className="mt-12 max-w-sm space-y-6">
        <label className="block">
          <span className="block type-caption text-ink-soft">Order number</span>
          <input
            name="orderNumber"
            required
            placeholder="BB-2627-00001"
            autoCapitalize="characters"
            spellCheck={false}
            className="mt-2 w-full rounded-control border border-line bg-paper px-4 py-3 type-mono placeholder:text-ink-soft"
          />
        </label>

        <label className="block">
          <span className="block type-caption text-ink-soft">Mobile number</span>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            className="mt-2 w-full rounded-control border border-line bg-paper px-4 py-3 type-body"
          />
        </label>

        <button
          type="submit"
          className="rounded-control bg-signal px-8 py-4 type-body font-medium text-paper motion-lift"
        >
          Find my order
        </button>
      </form>

      <p className="mt-12 type-caption text-ink-soft">
        Cannot find it? Call {CONTACT.tollFree}, toll free, or email {CONTACT.email}.
      </p>
    </div>
  );
}
