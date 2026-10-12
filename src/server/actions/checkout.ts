'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { placeOrderInputSchema, quoteInputSchema } from '@/lib/cart-schema';
import { CONTACT } from '@/lib/contact';
import { orderAccessToken } from '@/lib/order-access';
import { isRazorpayConfigured } from '@/lib/razorpay';
import { notifyOrderEvent } from '@/lib/notifications';
import { autoPushOrder } from '@/lib/shiprocket-fulfilment';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { currentUser } from '@/lib/session';
import {
  DiscountExhaustedError,
  OrderConfigurationError,
  placeOrder,
  quoteOrder,
  startPayment,
  type CheckoutQuote,
} from '@/lib/orders';

/*
  Checkout.

  Two actions, and the boundary between them is the point of the whole flow:

    - `quoteCheckout` prices a cart for display. It writes nothing, reserves
      nothing, and can be called as often as the customer edits their address.
    - `submitOrder` is the only thing that creates an order, and it re-derives
      every figure from scratch inside the §4 transaction. It ignores any total
      the browser thinks it knows — the browser never sends one.

  Both are Zod-validated at this boundary. `submitOrder` returns field-level
  messages the form can show, because a wrong pincode is something the customer
  can fix, and a stack trace is not an answer to it.

  A signed-in staff account placing an order is treated as that user's order,
  which is why `currentUser` is consulted: it is also what will pick up a
  customer session once phone OTP exists. Until then, every order is a guest
  order, and guest checkout is the whole customer-facing path.
*/

export type QuoteResult = { ok: true; quote: CheckoutQuote } | { ok: false; error: string };

export async function quoteCheckout(input: unknown): Promise<QuoteResult> {
  const limit = await checkRateLimit('quote-checkout', clientIpFrom(await headers()), 60, 60);
  if (!limit.allowed) return { ok: false, error: 'Please wait a moment before requesting another quote.' };
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) {
    // Nobody types this payload; a malformed one is a bug, not a mistake.
    return { ok: false, error: 'We could not price that cart.' };
  }

  const user = await currentUser();

  try {
    const quote = await quoteOrder({
      lines: parsed.data.lines,
      discountCode: parsed.data.discountCode,
      pincode: parsed.data.pincode,
      state: parsed.data.state,
      paymentMethod: parsed.data.paymentMethod,
      userId: user?.id ?? null,
    });
    return { ok: true, quote };
  } catch (error) {
    console.error('[checkout] could not quote:', error);
    return { ok: false, error: 'We could not price your cart just now. Please try again.' };
  }
}

export type SubmitOrderResult =
  | {
      ok: true;
      orderNumber: string;
      /**
       * The capability token for the confirmation page. Order numbers run in
       * sequence, so the number alone must never grant access — see
       * `lib/order-access.ts`.
       */
      accessToken: string;
      /** Present only for a prepaid order: what Razorpay Checkout needs to open. */
      payment: { razorpayOrderId: string; keyId: string; amountPaise: number } | null;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function submitOrder(input: unknown): Promise<SubmitOrderResult> {
  // By IP, not by account: every order here is a guest order until phone OTP
  // exists, so there is no account to key a limit to yet — see the checkout
  // module comment above.
  const ip = clientIpFrom(await headers());
  const limit = await checkRateLimit('submit-order', ip, 10, 10 * 60);
  if (!limit.allowed) {
    return { ok: false, error: 'Too many orders placed too quickly. Please wait a few minutes and try again.' };
  }

  const parsed = placeOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors };
  }

  const user = await currentUser();
  const data = parsed.data;

  // Refused before anything is written: placing the order first would hold
  // its stock and use up an order number for a payment that cannot start.
  if (data.paymentMethod === 'RAZORPAY' && !isRazorpayConfigured()) {
    return {
      ok: false,
      error: `Online payment is not available yet. Choose cash on delivery, or call ${CONTACT.tollFree}.`,
    };
  }

  let placed;
  try {
    placed = await placeOrder({
      lines: data.lines,
      discountCode: data.discountCode,
      email: data.email || null,
      phone: data.phone,
      paymentMethod: data.paymentMethod,
      shipping: data.shipping,
      billing: data.billing ?? null,
      userId: user?.id ?? null,
      notes: data.notes ?? null,
    });
  } catch (error) {
    if (error instanceof OrderConfigurationError) {
      // Nothing the customer did. Say so, and say who can fix it, without
      // leaking which entity or GSTIN is missing.
      console.error('[checkout] order configuration:', error.message);
      return {
        ok: false,
        error: 'Orders are not being accepted right now. Please call 1800 123 0621.',
      };
    }
    if (error instanceof DiscountExhaustedError) {
      return {
        ok: false,
        error: 'A discount on this order just ran out. Remove the code and try again.',
      };
    }
    console.error('[checkout] could not place the order:', error);
    return {
      ok: false,
      error: 'Something went wrong placing your order. Nothing has been charged — please try again.',
    };
  }

  if (!placed.ok) {
    return { ok: false, error: placed.error };
  }

  if (placed.order.paymentMethod === 'COD') {
    /*
      A COD order is confirmed the moment it is placed, so its confirmation
      message goes now. A prepaid order gets nothing here — it is not confirmed
      until Razorpay's webhook says the money arrived, and that route sends it.
      Telling a customer their order is confirmed before the payment lands is
      exactly the mistake §10 forbids.

      `notifyOrderEvent` never throws, so a failed WhatsApp cannot turn a
      placed order into an error the customer sees.
    */
    const confirmedOrderId = placed.order.id;
    after(() => notifyOrderEvent({ orderId: confirmedOrderId, event: 'CONFIRMED' }));

    // Into Shiprocket after the response, so a slow courier API never delays
    // the customer's confirmation. Off unless enabled in Settings.
    const orderId = placed.order.id;
    after(() => autoPushOrder(orderId));

    return {
      ok: true,
      orderNumber: placed.order.orderNumber,
      accessToken: orderAccessToken(placed.order.orderNumber),
      payment: null,
    };
  }

  const payment = await startPayment(placed.order, {
    customerName: data.shipping.fullName,
    email: data.email || null,
    phone: data.phone,
  });

  if (!payment.ok) {
    return { ok: false, error: payment.error };
  }

  return {
    ok: true,
    orderNumber: placed.order.orderNumber,
    accessToken: orderAccessToken(placed.order.orderNumber),
    payment: {
      razorpayOrderId: payment.razorpayOrderId,
      keyId: payment.keyId,
      amountPaise: placed.order.totalPaise,
    },
  };
}
