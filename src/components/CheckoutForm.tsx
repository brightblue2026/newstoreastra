'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { CONTACT } from '@/lib/contact';
import { cartLineKey } from '@/lib/cart-line';
import { useCartStore } from '@/lib/cart-store';
import { formatINR } from '@/lib/money';
import { normaliseIndianMobile } from '@/lib/phone';
import { normalisePincode, resolvePincode } from '@/lib/pincode';
import { STATE_CODES } from '@/lib/gst';
import { quoteCheckout, submitOrder } from '@/server/actions/checkout';
import type { CheckoutQuote } from '@/lib/orders';
import { readCart, type CartView } from '@/server/actions/cart';

/*
  One page, three steps — brief §12 Phase 5.

  The steps are sections of a single form, not routes and not a wizard: contact,
  delivery, payment, top to bottom, with the order summary beside them. A
  customer can go back to a field without losing the rest, and the whole thing
  is one submit.

  What the browser is trusted with: ids, quantities, an address, and which of
  the two payment methods was chosen. What it is never trusted with: a price. The
  totals on this screen come from `quoteCheckout`, which re-reads every price
  from Postgres, and the amount actually charged is recomputed a third time
  inside the order transaction. If they disagree, the transaction's figure wins
  and this screen was stale.

  Payment: the browser opens Razorpay Checkout and, on success, is sent to the
  confirmation page — which says *pending* until the signed webhook lands. The
  success handler here changes no order state, because it cannot be trusted to
  (§10). A closed or failed payment leaves the order in PENDING_PAYMENT, which is
  exactly what it is.
*/

const STATES = Object.values(STATE_CODES).sort((a, b) => a.localeCompare(b));

type Step = 1 | 2 | 3;

/**
 * Checkout closes itself after this long. Well inside `STALE_ORDER_MINUTES`
 * (60) in `lib/orders.ts`, so a customer is not still paying when the cron
 * releases the order's stock — the webhook flags that case if it happens anyway.
 */
const RAZORPAY_TIMEOUT_SECONDS = 15 * 60;

interface PendingPayment {
  payment: { razorpayOrderId: string; keyId: string; amountPaise: number };
  orderNumber: string;
  accessToken: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email?: string; contact: string };
  notes: Record<string, string>;
  theme: { color: string };
  /** Seconds before Checkout closes itself. */
  timeout: number;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string }) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

const EMPTY_ADDRESS = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
};

type AddressFields = typeof EMPTY_ADDRESS;

/** Server field errors that the Contact and Delivery sections each display. */
const CONTACT_ERROR_KEYS = new Set(['phone', 'email', 'shipping.phone']);
const DELIVERY_ERROR_KEYS = new Set([
  'shipping.fullName',
  'shipping.pincode',
  'shipping.line1',
  'shipping.line2',
  'shipping.city',
  'shipping.state',
]);

/**
 * `onlinePaymentAvailable` is false until Razorpay's keys are set. Offering the
 * option anyway created an order, held its stock, and only then failed.
 */
export default function CheckoutForm({
  onlinePaymentAvailable,
}: {
  onlinePaymentAvailable: boolean;
}) {
  const router = useRouter();
  const lines = useCartStore((state) => state.lines);
  const discountCode = useCartStore((state) => state.discountCode);
  const clearCart = useCartStore((state) => state.clear);
  const removeLine = useCartStore((state) => state.removeLine);

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressFields>(EMPTY_ADDRESS);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'RAZORPAY' | 'COD'>(
    onlinePaymentAvailable ? 'RAZORPAY' : 'COD',
  );

  const [cart, setCart] = useState<CartView | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /*
    An order placed whose payment window was closed. Paying again reopens the
    same Razorpay order rather than placing a second one — which used to hold
    the stock twice and leave a duplicate "awaiting payment" order behind.
    Any edit to what was ordered, or where it goes, forgets it: the placed
    order no longer matches the form, so the next submit places a fresh one.
  */
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  useEffect(() => {
    setPendingPayment(null);
  }, [lines, discountCode, email, phone, address, notes, paymentMethod]);

  // The cart lives in localStorage, so the first server pass cannot know it.
  useEffect(() => setMounted(true), []);

  const pincode = normalisePincode(address.pincode);
  const resolution = useMemo(
    () => (pincode.length === 6 ? resolvePincode(pincode) : null),
    [pincode],
  );

  /*
    The state field follows the pincode.

    Where a pincode names exactly one state there is nothing to choose, so the
    field shows it and is read-only — that is also what the server will use,
    whatever is posted. Where a series is genuinely shared (Uttar Pradesh and
    Uttarakhand, Bihar and Jharkhand, Puducherry inside Tamil Nadu) the choice
    narrows to those states. Where it is unlisted, the full list stands.
  */
  useEffect(() => {
    if (resolution?.kind === 'state') {
      setAddress((current) =>
        current.state === resolution.state ? current : { ...current, state: resolution.state },
      );
    }
  }, [resolution]);

  const stateOptions =
    resolution?.kind === 'ambiguous' ? resolution.candidates : resolution?.kind === 'state' ? [] : STATES;

  // Cart contents, for the summary panel. Priced server-side like everywhere else.
  useEffect(() => {
    if (!mounted || lines.length === 0) return;
    let cancelled = false;
    readCart({ lines, ...(discountCode ? { discountCode } : {}) })
      .then((next) => !cancelled && setCart(next))
      .catch((error: unknown) => console.warn('[checkout] could not read the cart:', error));
    return () => {
      cancelled = true;
    };
  }, [mounted, lines, discountCode]);

  const refreshQuote = useCallback(async () => {
    if (lines.length === 0) return;
    setQuoting(true);
    try {
      const result = await quoteCheckout({
        lines,
        ...(discountCode ? { discountCode } : {}),
        ...(pincode.length === 6 ? { pincode } : {}),
        ...(address.state ? { state: address.state } : {}),
        paymentMethod,
      });
      if (result.ok) setQuote(result.quote);
    } catch (error) {
      console.warn('[checkout] could not quote:', error);
    } finally {
      setQuoting(false);
    }
  }, [lines, discountCode, pincode, address.state, paymentMethod]);

  // Re-quote whenever anything that can change a rupee changes. Delivery is
  // rated on the pincode and the tax split on the state, so both belong here.
  useEffect(() => {
    if (!mounted) return;
    void refreshQuote();
  }, [mounted, refreshQuote]);

  // A payment method that stops being available — COD switched off, or a
  // pincode outside its allowlist — must not stay selected, and when only one
  // method works it is the one selected. Before a pincode is entered COD reads
  // as unavailable, which used to flip the form to online payment even with
  // online payment switched off — and nothing flipped it back, so the Pay
  // button stayed greyed out until the customer found the COD option themselves.
  useEffect(() => {
    if (!quote) return;
    if (paymentMethod === 'COD' && !quote.cod.available && onlinePaymentAvailable) {
      setPaymentMethod('RAZORPAY');
    } else if (paymentMethod === 'RAZORPAY' && !onlinePaymentAvailable && quote.cod.available) {
      setPaymentMethod('COD');
    }
  }, [paymentMethod, quote, onlinePaymentAvailable]);

  if (!mounted) {
    return <CheckoutSkeleton />;
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-sky/30 px-6 py-16 text-center">
        <p className="type-heading">Your cart is empty</p>
        <p className="mx-auto mt-3 max-w-md type-body text-ink-soft">
          Add something from the catalogue and it will be waiting here.
        </p>
        <Link href="/shop" className="mt-8 btn btn-primary">
          Browse the catalogue
        </Link>
      </div>
    );
  }

  const setField = (field: keyof AddressFields, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[`shipping.${field}`]) return current;
      const next = { ...current };
      delete next[`shipping.${field}`];
      return next;
    });
  };

  const openRazorpay = async ({ payment, orderNumber, accessToken }: PendingPayment) => {
    // The script starts loading at step 2, so it is almost always here by
    // now; on a slow connection it may still be arriving.
    for (let waited = 0; !window.Razorpay && waited < 8000; waited += 200) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!window.Razorpay) {
      // The order exists and is payable; it just cannot be paid in this tab.
      router.push(`/order/${orderNumber}?t=${accessToken}`);
      return;
    }

    const checkout = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amountPaise, // paise, both here and in our own totals
      currency: 'INR',
      name: 'Bright Blue Trading Corporation',
      description: `Order ${orderNumber}`,
      order_id: payment.razorpayOrderId,
      prefill: {
        name: address.fullName,
        ...(email ? { email } : {}),
        contact: phone,
      },
      notes: { orderNumber },
      theme: { color: '#0f9cd6' },
      timeout: RAZORPAY_TIMEOUT_SECONDS,
      handler: () => {
        // Deliberately does not mark anything paid — §10. The confirmation
        // page reads the order's real status, which the webhook owns.
        clearCart();
        router.push(`/order/${orderNumber}?t=${accessToken}&payment=submitted`);
      },
      modal: {
        ondismiss: () => {
          setSubmitting(false);
          setPendingPayment({ payment, orderNumber, accessToken });
          setFormError(
            `Payment was not completed, so order ${orderNumber} is still awaiting payment. Pay again below, or call ${CONTACT.tollFree} if you need help.`,
          );
        },
      },
    });

    checkout.open();
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    if (pendingPayment) {
      await openRazorpay(pendingPayment);
      return;
    }

    try {
      const result = await submitOrder({
        lines,
        ...(discountCode ? { discountCode } : {}),
        ...(email ? { email } : {}),
        phone,
        paymentMethod,
        // The mobile number is asked once, under Contact; the delivery address
        // carries the same one. Sending `address.phone` (never filled in) made
        // the server refuse every order.
        shipping: { ...address, phone, pincode, line2: address.line2 || null },
        ...(notes ? { notes } : {}),
      });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setSubmitting(false);
        // Send them back to the section that shows the problem. An error with
        // no field on screen stays on Payment, where the message is visible.
        const errorKeys = Object.keys(result.fieldErrors ?? {});
        if (errorKeys.some((key) => CONTACT_ERROR_KEYS.has(key))) {
          setStep(1);
        } else if (errorKeys.some((key) => DELIVERY_ERROR_KEYS.has(key))) {
          setStep(2);
        }
        return;
      }

      if (result.payment) {
        await openRazorpay({
          payment: result.payment,
          orderNumber: result.orderNumber,
          accessToken: result.accessToken,
        });
        return;
      }

      // Cash on delivery: the order is already confirmed.
      clearCart();
      router.push(`/order/${result.orderNumber}?t=${result.accessToken}`);
    } catch (error) {
      console.error('[checkout] submit failed:', error);
      setFormError('We could not confirm the result. Check your order or payment status before trying again.');
      setSubmitting(false);
    }
  };

  // Same rule the server validates with (`phoneSchema` in `cart-schema.ts`),
  // via the one shared implementation — this used to just take the last ten
  // digits, which could tell a customer checkout was ready when the server
  // would still reject the number, or vice versa.
  const contactComplete = normaliseIndianMobile(phone) !== null;
  const deliveryComplete =
    address.fullName.trim().length > 1 &&
    address.line1.trim().length > 3 &&
    address.city.trim().length > 1 &&
    address.state.trim().length > 1 &&
    pincode.length === 6 &&
    !quote?.serviceabilityError;

  return (
    <>
      {/* Razorpay's own hosted script — it must be loaded from their origin,
          not bundled, because it is versioned by them and handles card data.
          Only when online payment is on, and only once the customer is past
          the contact step: with everything it pulls in it is about 2 MB, which
          on a phone was the heaviest thing on the page and bought nothing for
          anyone paying cash on delivery or still typing their number. */}
      {onlinePaymentAvailable && step >= 2 && (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      )}

      <div className="grid gap-12 lg:grid-cols-[1fr_24rem] lg:gap-16">
        <form onSubmit={onSubmit} noValidate className="min-w-0">
          {/* ---------- Step 1: contact ---------- */}
          <Section
            index={1}
            title="Contact"
            open={step === 1}
            done={contactComplete && step !== 1}
            summary={contactComplete ? [phone, email].filter(Boolean).join(' · ') : undefined}
            onOpen={() => setStep(1)}
          >
            <Field label="Mobile number" error={fieldErrors.phone ?? fieldErrors['shipping.phone']} hint="For delivery updates on WhatsApp.">
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={inputClass}
                required
              />
            </Field>

            <Field
              label="Email address"
              optional
              error={fieldErrors.email}
              hint="Where the GST invoice is sent."
            >
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
              />
            </Field>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!contactComplete}
              className="mt-6 rounded-control border border-ink px-6 py-3 type-body disabled:opacity-40"
            >
              Continue to delivery
            </button>
          </Section>

          {/* ---------- Step 2: delivery ---------- */}
          <Section
            index={2}
            title="Delivery"
            open={step === 2}
            done={deliveryComplete && step !== 2}
            summary={
              deliveryComplete
                ? `${address.fullName}, ${address.city} ${pincode}, ${address.state}`
                : undefined
            }
            onOpen={() => setStep(2)}
          >
            <Field label="Full name" error={fieldErrors['shipping.fullName']}>
              <input
                autoComplete="name"
                value={address.fullName}
                onChange={(event) => setField('fullName', event.target.value)}
                className={inputClass}
                required
              />
            </Field>

            <Field label="Pincode" error={fieldErrors['shipping.pincode']}>
              <input
                inputMode="numeric"
                autoComplete="postal-code"
                value={address.pincode}
                onChange={(event) => setField('pincode', event.target.value)}
                className={`${inputClass} max-w-40`}
                required
              />
            </Field>

            {resolution?.kind === 'invalid' && pincode.length === 6 && (
              <p className="type-caption text-warning">That is not a valid pincode.</p>
            )}

            {quote?.serviceabilityError && (
              <p className="type-caption text-warning">
                {quote.serviceabilityError} Call {CONTACT.tollFree} and we will arrange it.
              </p>
            )}

            <Field label="House, building, street" error={fieldErrors['shipping.line1']}>
              <input
                autoComplete="address-line1"
                value={address.line1}
                onChange={(event) => setField('line1', event.target.value)}
                className={inputClass}
                required
              />
            </Field>

            <Field label="Area, landmark" optional error={fieldErrors['shipping.line2']}>
              <input
                autoComplete="address-line2"
                value={address.line2}
                onChange={(event) => setField('line2', event.target.value)}
                className={inputClass}
              />
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Town or city" error={fieldErrors['shipping.city']}>
                <input
                  autoComplete="address-level2"
                  value={address.city}
                  onChange={(event) => setField('city', event.target.value)}
                  className={inputClass}
                  required
                />
              </Field>

              <Field
                label="State"
                error={fieldErrors['shipping.state']}
                hint={
                  resolution?.kind === 'state'
                    ? 'Set by your pincode.'
                    : resolution?.kind === 'ambiguous'
                      ? 'That pincode series spans two states.'
                      : undefined
                }
              >
                {resolution?.kind === 'state' ? (
                  <input value={address.state} readOnly className={`${inputClass} bg-sky/40`} />
                ) : (
                  <select
                    value={address.state}
                    onChange={(event) => setField('state', event.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">Choose a state</option>
                    {stateOptions.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label="Delivery instructions" optional>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                className={inputClass}
              />
            </Field>

            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!deliveryComplete}
              className="mt-6 rounded-control border border-ink px-6 py-3 type-body disabled:opacity-40"
            >
              Continue to payment
            </button>
          </Section>

          {/* ---------- Step 3: payment ---------- */}
          <Section
            index={3}
            title="Payment"
            open={step === 3}
            done={false}
            onOpen={() => setStep(3)}
          >
            <fieldset className="space-y-3">
              <legend className="sr-only">Payment method</legend>

              <label
                className={`flex items-start gap-3 rounded-card border border-line p-4 motion-accent hover:border-ink-soft has-[:checked]:border-ink has-[:checked]:bg-sky/40 ${
                  onlinePaymentAvailable ? 'cursor-pointer' : 'opacity-60'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="RAZORPAY"
                  checked={paymentMethod === 'RAZORPAY'}
                  onChange={() => setPaymentMethod('RAZORPAY')}
                  disabled={!onlinePaymentAvailable}
                  className="mt-1"
                />
                <span>
                  <span className="block type-body">Pay online</span>
                  <span className="block type-caption text-ink-soft">
                    {onlinePaymentAvailable
                      ? 'UPI, card, netbanking or wallet, through Razorpay.'
                      : `Not available yet. Choose cash on delivery, or call ${CONTACT.tollFree} to order.`}
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-3 rounded-card border border-line p-4 motion-accent hover:border-ink-soft has-[:checked]:border-ink has-[:checked]:bg-sky/40 ${
                  quote?.cod.available ? 'cursor-pointer' : 'opacity-60'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                  disabled={!quote?.cod.available}
                  className="mt-1"
                />
                <span>
                  <span className="block type-body">Cash on delivery</span>
                  <span className="block type-caption text-ink-soft">
                    {quote?.cod.available
                      ? quote.cod.feePaise > 0
                        ? `A ${formatINR(quote.cod.feePaise)} handling fee applies.`
                        : 'No handling fee.'
                      : (quote?.cod.reason ??
                        'Not available for this order. Enter your pincode to check.')}
                  </span>
                </span>
              </label>
            </fieldset>

            {formError && (
              <p role="alert" className="mt-6 type-body text-warning">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                quoting ||
                !contactComplete ||
                !deliveryComplete ||
                (paymentMethod === 'RAZORPAY' && !onlinePaymentAvailable) ||
                (paymentMethod === 'COD' && !quote?.cod.available)
              }
              className="mt-6 w-full btn btn-primary px-8 py-4"
            >
              {submitting
                ? 'Placing your order…'
                : pendingPayment
                  ? `Pay ${formatINR(pendingPayment.payment.amountPaise)} for order ${pendingPayment.orderNumber}`
                  : paymentMethod === 'COD'
                  ? `Place order · ${quote ? formatINR(quote.totalPaise) : '—'}`
                  : `Pay ${quote ? formatINR(quote.totalPaise) : ''}`}
            </button>

            <p className="mt-4 type-caption text-ink-soft">
              Prices include GST. You will get a tax invoice with a per-HSN breakdown.
            </p>
          </Section>
        </form>

        {/* ---------- Order summary ---------- */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-card border border-line p-6">
            <h2 className="type-subhead">Your order</h2>

            <ul className="mt-6 space-y-4">
              {cart?.lines.map((line) => (
                <li key={line.key} className="flex gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-control bg-sky">
                    {line.imageUrl && (
                      <Image
                        src={line.imageUrl}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-contain p-1"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="type-caption">{line.name}</p>
                    {line.choices?.map((choice) => (
                      <p key={choice.slotLabel} className="type-caption text-ink-soft">
                        {choice.slotLabel}: {choice.picks.join(', ')}
                      </p>
                    ))}
                    <p className="type-caption text-ink-soft">Quantity {line.quantity}</p>
                  </div>
                  <p className="type-caption tabular-nums" data-price>
                    {formatINR(line.netPaise)}
                  </p>
                </li>
              ))}
            </ul>

            {quote && quote.unavailableLines.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="type-caption text-warning">
                  {quote.unavailableLines.length === 1
                    ? 'One item is no longer available and cannot be ordered.'
                    : `${quote.unavailableLines.length} items are no longer available and cannot be ordered.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    for (const line of quote.unavailableLines) removeLine(cartLineKey(line));
                  }}
                  className="mt-2 type-caption underline"
                >
                  Remove them
                </button>
              </div>
            )}

            <dl className="mt-6 space-y-2 border-t border-line pt-4">
              <Row label="Subtotal" value={quote ? formatINR(quote.subtotalPaise) : '—'} />

              {quote?.appliedDiscounts.map((discount) => (
                <Row
                  key={discount.id}
                  label={discount.label}
                  value={`−${formatINR(discount.amountPaise)}`}
                  tone="success"
                />
              ))}

              <Row
                label="Delivery"
                value={
                  !quote || !quote.deliveryState
                    ? 'Enter a pincode'
                    : quote.shippingPaise === 0
                      ? 'Free'
                      : formatINR(quote.shippingPaise)
                }
              />

              {quote && quote.codFeePaise > 0 && (
                <Row label="Cash-on-delivery fee" value={formatINR(quote.codFeePaise)} />
              )}

              <div className="flex justify-between border-t border-line pt-3 type-body-lg">
                <dt>Total</dt>
                <dd className="font-medium tabular-nums" data-price>
                  {quote ? formatINR(quote.totalPaise) : '—'}
                </dd>
              </div>

              {quote && quote.deliveryState && quote.taxPaise > 0 && (
                <p className="type-caption text-ink-soft">
                  Includes {formatINR(quote.taxPaise)} GST
                  {quote.intraState ? ' (CGST + SGST)' : ' (IGST)'}.
                </p>
              )}
            </dl>
          </div>

          <p className="mt-4 type-caption text-ink-soft">
            Questions? Call {CONTACT.tollFree}, toll free.
          </p>
        </aside>
      </div>
    </>
  );
}

const inputClass =
  'w-full rounded-control border border-line bg-paper px-4 py-3 type-body motion-accent hover:border-ink-soft focus-visible:border-ink';

/**
 * What checkout looks like before the cart has been read from localStorage —
 * the same grid, the contact step open, the other two closed — so the real
 * form replaces it in place instead of pushing everything below it down.
 */
function CheckoutSkeleton() {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        Loading your cart
      </span>
      <div className="grid gap-12 lg:grid-cols-[1fr_24rem] lg:gap-16" aria-hidden="true">
        <div className="min-w-0">
          <div className="border-b border-line pb-8">
            <div className="h-7 w-32 rounded-full skeleton" />
            <div className="mt-6 space-y-6">
              {[0, 1].map((field) => (
                <div key={field}>
                  <div className="h-4 w-32 rounded-full skeleton" />
                  <div className="mt-2 h-13 rounded-control skeleton" />
                  <div className="mt-1 h-4 w-56 max-w-full rounded-full skeleton" />
                </div>
              ))}
              <div className="h-12 w-48 rounded-control skeleton" />
            </div>
          </div>
          {[0, 1].map((step) => (
            <div key={step} className="border-b border-line py-8">
              <div className="h-7 w-32 rounded-full skeleton" />
            </div>
          ))}
        </div>
        <div className="h-72 rounded-card border border-line" />
      </div>
    </>
  );
}

function Section({
  index,
  title,
  open,
  done,
  summary,
  onOpen,
  children,
}: {
  index: number;
  title: string;
  open: boolean;
  done: boolean;
  summary?: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line py-8 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="flex items-center gap-3 type-subhead">
          {/* Step marker: outlined while waiting, ink while open, a check once done. */}
          <span
            aria-hidden="true"
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border type-mono motion-accent ${
              open
                ? 'border-ink bg-ink text-paper'
                : done
                  ? 'border-success bg-success text-paper'
                  : 'border-line text-ink-soft'
            }`}
          >
            {!open && done ? (
              <svg viewBox="0 0 16 16" className="size-4" fill="none">
                <path
                  d="M3.5 8.5l3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-draw"
                />
              </svg>
            ) : (
              index
            )}
          </span>
          <span className="sr-only">Step {index}: </span>
          {title}
        </h2>
        {!open && done && (
          <button
            type="button"
            onClick={onOpen}
            className="tap-target link-underline type-caption text-ink-soft motion-accent hover:text-ink"
          >
            Change
          </button>
        )}
      </div>

      {!open && summary && <p className="mt-2 pl-11 type-caption text-ink-soft">{summary}</p>}

      {open && <div className="mt-6 animate-rise space-y-6">{children}</div>}
    </section>
  );
}

function Field({
  label,
  children,
  error,
  hint,
  optional,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="block type-caption text-ink-soft">
        {label}
        {optional && ' (optional)'}
      </span>
      <span className="mt-2 block">{children}</span>
      {hint && !error && <span className="mt-1 block type-caption text-ink-soft">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block type-caption text-warning">
          {error}
        </span>
      )}
    </label>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <div className="flex justify-between type-body">
      <dt className={tone === 'success' ? 'text-success' : 'text-ink-soft'}>{label}</dt>
      <dd className={`tabular-nums ${tone === 'success' ? 'text-success' : ''}`} data-price>
        {value}
      </dd>
    </div>
  );
}
