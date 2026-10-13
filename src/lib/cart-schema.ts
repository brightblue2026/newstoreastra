/**
 * The Zod shapes for everything a browser sends about a cart or an order.
 *
 * Its own module rather than living beside `cartLineKey` in `cart-line.ts`,
 * which the client store imports: keeping Zod out of that import chain keeps it
 * out of the storefront's client bundle. And its own module rather than living
 * in the server actions that use it, because every export from a `'use server'`
 * file has to be an async function.
 *
 * Nothing here validates a *price*. There is no price to validate — the client
 * sends ids, quantities and an address, and every rupee is looked up server-side.
 */

import { z } from 'zod';
import { normaliseIndianMobile } from '@/lib/phone';

export const cartLineSchema = z.object({
  kind: z.enum(['VARIANT', 'COMBO']),
  // cuid-shaped, but not asserted as one: an id that doesn't resolve is already
  // handled as `unavailable` downstream, and a stricter check here would only
  // turn a recoverable state into an error.
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
  choices: z
    .array(
      z.object({
        itemId: z.string().min(1).max(64),
        // One id per unit of the slot; the real bound is the slot's own
        // quantity, which only the combo row knows.
        variantIds: z.array(z.string().min(1).max(64)).min(1).max(50),
      }),
    )
    .max(20)
    .optional(),
});

export const cartLinesSchema = z.array(cartLineSchema).max(100);

export const discountCodeSchema = z.string().trim().max(64).optional();

/** Digits only. Six of them, first digit 1–9 — India Post allocates no 0 series. */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a six-digit pincode.');

/**
 * Ten digits, optionally with +91 or a leading 0, and the first digit is 6–9 —
 * every Indian mobile series. Stored as the bare ten digits so WhatsApp, SMS and
 * a courier's manifest all read the same number.
 *
 * `normaliseIndianMobile` (`src/lib/phone.ts`) is the single place this rule
 * is decided — length-aware, so it never mistakes a bare ten-digit mobile
 * that happens to start "91" (e.g. 9198765432) for a country-code prefix.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const mobile = normaliseIndianMobile(value);
    if (!mobile) {
      ctx.addIssue({ code: 'custom', message: 'Enter a ten-digit mobile number.' });
      return z.NEVER;
    }
    return mobile;
  });

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name.').max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(4, 'Enter the house or building and the street.').max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(2, 'Enter the town or city.').max(120),
  // Not necessarily the state that ends up on the order: a pincode that
  // unambiguously names a state overrules this, so nobody can select Kerala for
  // a Bengaluru pincode and turn an IGST order into a CGST + SGST one.
  state: z.string().trim().min(2, 'Choose the state.').max(120),
  pincode: pincodeSchema,
});

export const quoteInputSchema = z.object({
  lines: cartLinesSchema,
  discountCode: discountCodeSchema,
  pincode: z.string().trim().max(10).optional(),
  state: z.string().trim().max(120).optional(),
  paymentMethod: z.enum(['RAZORPAY', 'COD']),
});

export const placeOrderInputSchema = z.object({
  lines: cartLinesSchema.min(1, 'Your cart is empty.'),
  discountCode: discountCodeSchema,
  email: z.string().trim().max(200).email('Enter a valid email address.').optional().or(z.literal('')),
  phone: phoneSchema,
  paymentMethod: z.enum(['RAZORPAY', 'COD']),
  shipping: addressSchema,
  /** Absent means "bill to the delivery address". */
  billing: addressSchema.optional().nullable(),
  notes: z.string().trim().max(500).optional(),
});

// The browser must explicitly acknowledge the displayed policies; never infer consent.
export const checkoutSubmissionSchema = placeOrderInputSchema.extend({
  acceptedTerms: z.literal(true, { error: 'Please agree to the terms and privacy notice before placing your order.' }),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type PlaceOrderFormInput = z.infer<typeof placeOrderInputSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
