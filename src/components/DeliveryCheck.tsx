'use client';

import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/money';
import { checkDelivery, type DeliveryCheckResult } from '@/server/actions/delivery';

/**
 * Pincode check under the add-to-cart button: can this reach me, what does
 * delivery cost, is cash on delivery possible. Checkout asks the same question
 * again on the whole cart — this is the early answer for one unit.
 */
export default function DeliveryCheck({ variantId }: { variantId: string }) {
  const [pincode, setPincode] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DeliveryCheckResult | null>(null);

  // A different variant weighs differently; an old answer would mislead.
  useEffect(() => setResult(null), [variantId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      setResult(await checkDelivery({ variantId, pincode }));
    } catch {
      setResult({ ok: false, error: 'Could not check just now. Try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <label htmlFor="delivery-pincode" className="block type-caption text-ink-soft">
        Check delivery to your pincode
      </label>
      <div className="mt-2 flex max-w-sm gap-3">
        <input
          id="delivery-pincode"
          value={pincode}
          onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="682030"
          className="min-w-0 flex-1 rounded-control border border-line bg-paper px-4 py-3 type-mono"
        />
        <button
          type="submit"
          disabled={pending || pincode.length !== 6}
          className="rounded-control border border-ink px-5 py-3 type-body disabled:opacity-50"
        >
          {pending ? 'Checking…' : 'Check'}
        </button>
      </div>

      <div aria-live="polite" className="mt-3 type-body">
        {result && !result.ok && <p className="text-warning">{result.error}</p>}
        {result?.ok && !result.serviceable && (
          <p className="text-warning">
            We do not deliver to {pincode} yet. Call us and we will help.
          </p>
        )}
        {result?.ok && result.serviceable && (
          <ul className="space-y-1">
            <li>
              Delivers to {pincode}
              {result.estimatedDays !== null &&
                ` in about ${result.estimatedDays} day${result.estimatedDays === 1 ? '' : 's'}`}
              {result.pricePaise !== null &&
                ` · delivery ${result.pricePaise === 0 ? 'free' : formatPrice(result.pricePaise)}`}
            </li>
            <li className="text-ink-soft">
              {result.codAvailable ? 'Cash on delivery available' : 'Pay online — no cash on delivery here'}
            </li>
          </ul>
        )}
      </div>
    </form>
  );
}
