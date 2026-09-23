import type { Metadata } from 'next';
import CheckoutForm from '@/components/CheckoutForm';
import { isRazorpayConfigured } from '@/lib/razorpay';

export const metadata: Metadata = {
  title: 'Checkout',
  // Nothing to index, and a crawler must never be able to reach a cart state.
  robots: { index: false, follow: false },
};

/**
 * Checkout is dynamic and never cached — §4: "Cart, checkout, account, and all
 * of /admin are dynamic and no-store." Everything on the page depends on a cart
 * that lives in the browser and prices that are re-read per request, so a cached
 * copy would be wrong for whoever received it.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-(--container-page) px-6 py-16">
      <h1 className="type-display-sm">Checkout</h1>
      <p className="mt-4 max-w-prose type-body text-ink-soft">
        Three steps. Prices include GST, and the delivery charge is settled once you enter a
        pincode.
      </p>

      <div className="mt-16">
        <CheckoutForm onlinePaymentAvailable={isRazorpayConfigured()} />
      </div>
    </div>
  );
}
