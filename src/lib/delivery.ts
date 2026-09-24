import 'server-only';
import type { Paise } from '@/lib/money';
import {
  isServiceablePincode,
  rateShipping,
  type ShippingQuote,
  type ShippingSettings,
} from '@/lib/shipping';
import { isShiprocketConfigured, rateShipment } from '@/lib/shiprocket';

/*
  One delivery quote, from whichever source can answer.

  §10: "Serviceability and rate by pincode on the product page and at checkout
  ... Fallback: on timeout or failure at checkout, use the admin's flat-rate
  weight slab table. Never block an order because a third party is down."

  This is the seam that sentence describes. `shipping.ts` stays pure and knows
  only the slab table; `shiprocket.ts` knows only the API; neither knows about
  the other. This module is the only place that decides which answer to use,
  which means there is exactly one place to look when a delivery charge is
  wrong.

  The decision, in order:

    1. Live rating off, unconfigured, or no origin pincode → slab table.
    2. Shiprocket unreachable, timed out, or errored → slab table.
    3. Shiprocket answers "nobody delivers there" → *not serviceable*. This is
       the one case where a live answer overrides the local prefix list, and it
       is the right way round: Shiprocket knows its couriers' coverage and the
       admin's prefix list is a rough approximation of it.
    4. Shiprocket returns couriers → cheapest one wins.

  Note what case 3 does not do: it does not treat an *unreachable* Shiprocket as
  "not serviceable". `rateShipment` returns null for "could not ask" and an
  empty courier list for "asked, nobody goes there", and conflating the two
  would refuse orders BBTC can fulfil every time the API blinks.
*/

export type DeliveryRateSource = 'shiprocket' | 'slab';

export interface DeliveryQuote extends ShippingQuote {
  source: DeliveryRateSource;
  /** The courier behind a live rate. Null for a slab-table rate. */
  courierName: string | null;
  courierId: number | null;
  estimatedDays: number | null;
  /** False only when a source that actually knows says so — never on a failure. */
  serviceable: boolean;
  /**
   * Whether a courier collects cash there, when Shiprocket was asked. Null for
   * a slab-table quote — then the admin's COD allowlist is the only answer.
   */
  codServiceable: boolean | null;
  /** Why the slab table answered, when it did. For the admin, not the customer. */
  fallbackReason: string | null;
}

export interface DeliveryQuoteInput {
  settings: ShippingSettings;
  deliveryPincode: string;
  weightGrams: number;
  cod: boolean;
  declaredValuePaise: Paise;
}

function fromSlabTable(
  input: DeliveryQuoteInput,
  fallbackReason: string | null,
): DeliveryQuote {
  const quote = rateShipping(input.settings, input.weightGrams);
  return {
    ...quote,
    source: 'slab',
    courierName: null,
    courierId: null,
    estimatedDays: null,
    serviceable: isServiceablePincode(input.settings, input.deliveryPincode),
    codServiceable: null,
    fallbackReason,
  };
}

/**
 * Quote delivery for a cart.
 *
 * Never throws and never blocks: every failure path lands on the slab table
 * with a reason recorded. The caller can price an order on the result
 * unconditionally.
 */
export async function quoteDelivery(input: DeliveryQuoteInput): Promise<DeliveryQuote> {
  const { settings } = input;

  if (!settings.preferLiveRates) {
    return fromSlabTable(input, null);
  }
  if (!isShiprocketConfigured()) {
    return fromSlabTable(input, 'Shiprocket credentials are not set on this deployment.');
  }
  if (!settings.originPincode) {
    return fromSlabTable(input, 'No pickup pincode is configured, so no live rate can be asked for.');
  }

  const live = await rateShipment({
    pickupPincode: settings.originPincode,
    deliveryPincode: input.deliveryPincode,
    weightGrams: input.weightGrams,
    cod: input.cod,
    declaredValuePaise: input.declaredValuePaise,
  });

  if (live === null) {
    return fromSlabTable(input, 'Shiprocket could not be reached; the slab table priced this.');
  }

  if (!live.serviceable || live.couriers.length === 0) {
    // Asked and answered: no courier covers that pincode. The rate is still
    // taken from the slab table so the order summary has a number to show, but
    // `serviceable: false` is what stops the order.
    const quote = rateShipping(settings, input.weightGrams);
    return {
      ...quote,
      source: 'shiprocket',
      courierName: null,
      courierId: null,
      estimatedDays: null,
      serviceable: false,
      codServiceable: false,
      fallbackReason: null,
    };
  }

  // `rateShipment` sorts cheapest first.
  const best = live.couriers[0];

  return {
    pricePaise: best.pricePaise,
    totalGrams: input.weightGrams,
    slabUptoGrams: null,
    overflow: false,
    source: 'shiprocket',
    courierName: best.courierName,
    courierId: best.courierId,
    estimatedDays: best.estimatedDays,
    serviceable: true,
    codServiceable: live.codServiceable,
    fallbackReason: null,
  };
}
