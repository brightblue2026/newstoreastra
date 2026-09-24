'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Every few seconds, for about three minutes — past that, a webhook is late, not slow. */
const INTERVAL_MS = 4000;
const MAX_ATTEMPTS = 45;

/**
 * Re-renders the order page while a just-submitted payment is awaiting the
 * Razorpay webhook, so "Confirmed" appears without the customer reloading.
 *
 * It only re-reads the order from the server — the status on screen is still
 * whatever the webhook wrote, never something this component decides (§10).
 * Rendered only while the order is PENDING_PAYMENT, so it unmounts, and stops,
 * the moment the status moves.
 */
export default function PaymentStatusRefresh() {
  const router = useRouter();

  useEffect(() => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
