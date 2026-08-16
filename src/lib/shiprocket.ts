import 'server-only';
import { trackingUrlFor } from '@/lib/shiprocket-tracking';
import type { Paise } from '@/lib/money';

/*
  Shiprocket — brief §10 "Shipping" and §12 Phase 6.

  Shiprocket aggregates DTDC, which BBTC already uses, and handles COD
  remittance. This module covers the five things Phase 6 asks for: a rate, an
  order push, an AWB, a label, and the shape of a tracking webhook.

  **The governing rule is §10's last line: "Never block an order because a third
  party is down."** So every function here returns a result object rather than
  throwing, every call has a timeout, and `rateShipment` in particular is
  written to be *optional* — its caller already has the flat-rate slab table and
  uses it whenever this returns nothing. There is no code path where Shiprocket
  being unreachable stops a customer buying something.

  Auth: Shiprocket issues a bearer token from an email/password login, valid for
  ten days. It is cached in module scope with a conservative expiry. On a
  serverless deployment each cold instance logs in once, which is what the
  token endpoint is for; a shared cache would need Redis, which this deployment
  does not have and does not need for a ten-day token.

  Not built here: return/RTO handling and COD remittance reconciliation. Both
  are real Shiprocket features and both need business decisions about who
  reconciles what — §10 explicitly wants RTO measured for two months before COD
  expands, and that measurement does not exist yet.
*/

const SHIPROCKET_API = 'https://apiv2.shiprocket.in/v1/external';

/** Every outbound call is bounded, because an unbounded one is how checkout hangs. */
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Shiprocket says ten days. Nine is used so a token is never presented in the
 * hour it expires — a 401 mid-checkout is worse than one extra login.
 */
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

export interface ShiprocketConfig {
  email: string;
  password: string;
}

export function shiprocketConfig(): ShiprocketConfig | null {
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

/** True when live rates and order push can be attempted at all. */
export function isShiprocketConfigured(): boolean {
  return shiprocketConfig() !== null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Exported for tests and for an admin "reconnect" action; clears the cached token. */
export function resetShiprocketToken(): void {
  cachedToken = null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A bearer token, from cache when one is still good.
 *
 * Returns null rather than throwing on any failure — every caller has a
 * fallback, and a login failure is an operational problem for the admin to see
 * in the logs, not an exception to surface to a customer.
 */
async function getToken(): Promise<string | null> {
  const config = shiprocketConfig();
  if (!config) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  try {
    const response = await fetchWithTimeout(`${SHIPROCKET_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });

    if (!response.ok) {
      console.error('[shiprocket] login failed with', response.status);
      return null;
    }

    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      console.error('[shiprocket] login returned no token');
      return null;
    }

    cachedToken = { token: body.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return body.token;
  } catch (error) {
    console.error('[shiprocket] could not reach the login endpoint:', error);
    return null;
  }
}

/** One authenticated call. Null on any failure, having logged it. */
async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const response = await fetchWithTimeout(`${SHIPROCKET_API}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 401) {
      // The cached token was rejected. Drop it so the next call logs in again
      // rather than repeating a request that cannot succeed.
      resetShiprocketToken();
      console.warn('[shiprocket] token rejected on', path);
      return null;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[shiprocket]', path, 'failed with', response.status, detail.slice(0, 400));
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error('[shiprocket]', path, 'threw:', error);
    return null;
  }
}

// ---------- Serviceability and rates ----------

export interface RateRequest {
  /** Where the parcel ships from. BBTC's dispatch pincode. */
  pickupPincode: string;
  deliveryPincode: string;
  weightGrams: number;
  /** COD changes both serviceability and the rate. */
  cod: boolean;
  /** Declared value, for insurance and COD limits. */
  declaredValuePaise: Paise;
}

export interface CourierQuote {
  courierId: number;
  courierName: string;
  pricePaise: Paise;
  /** Shiprocket's own estimate, in days. Null when it does not give one. */
  estimatedDays: number | null;
  cod: boolean;
}

export interface RateResult {
  serviceable: boolean;
  /** Cheapest first. Empty when nothing serviceable was returned. */
  couriers: CourierQuote[];
}

/**
 * Live rate shopping.
 *
 * Returns null — not an empty result — when Shiprocket could not be asked at
 * all, so the caller can tell "nobody delivers there" apart from "we could not
 * find out", and fall back to the slab table only in the second case. Reporting
 * an unreachable API as "not serviceable" would refuse orders BBTC can
 * perfectly well fulfil.
 */
export async function rateShipment(request: RateRequest): Promise<RateResult | null> {
  const params = new URLSearchParams({
    pickup_postcode: request.pickupPincode.trim(),
    delivery_postcode: request.deliveryPincode.trim(),
    // Shiprocket takes kilograms as a decimal string.
    weight: (Math.max(request.weightGrams, 1) / 1000).toFixed(3),
    cod: request.cod ? '1' : '0',
    declared_value: String(Math.round(request.declaredValuePaise / 100)),
  });

  const body = await call<{
    data?: {
      available_courier_companies?: {
        courier_company_id?: number;
        courier_name?: string;
        rate?: number;
        estimated_delivery_days?: string | number;
        is_surface?: boolean;
      }[];
    };
  }>(`/courier/serviceability/?${params.toString()}`, { method: 'GET' });

  if (body === null) return null;

  const companies = body.data?.available_courier_companies ?? [];

  const couriers: CourierQuote[] = companies
    .filter((c) => typeof c.courier_company_id === 'number' && typeof c.rate === 'number')
    .map((c) => ({
      courierId: c.courier_company_id as number,
      courierName: c.courier_name?.trim() || 'Courier',
      // Shiprocket quotes rupees as a number; this codebase is paise.
      pricePaise: Math.round((c.rate as number) * 100),
      estimatedDays: parseEstimatedDays(c.estimated_delivery_days),
      cod: request.cod,
    }))
    .sort((a, b) => a.pricePaise - b.pricePaise);

  return { serviceable: couriers.length > 0, couriers };
}

function parseEstimatedDays(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const match = /\d+/.exec(value);
  return match ? Number(match[0]) : null;
}

// ---------- Order push ----------

export interface PushOrderItem {
  name: string;
  sku: string;
  quantity: number;
  /** Per unit, GST inclusive. Shiprocket wants rupees; the conversion is here. */
  unitPricePaise: Paise;
  hsnCode: string;
}

export interface PushOrderInput {
  orderNumber: string;
  placedAt: Date;
  pickupLocationName: string;

  customerName: string;
  email: string | null;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;

  items: PushOrderItem[];
  subtotalPaise: Paise;
  shippingPaise: Paise;
  discountPaise: Paise;
  codAmountPaise: Paise;
  paymentMethod: 'RAZORPAY' | 'COD';
  weightGrams: number;
}

export interface PushOrderResult {
  shiprocketOrderId: string;
  shipmentId: string;
}

/**
 * Create the order in Shiprocket.
 *
 * `order_id` is BBTC's own order number, so a Shiprocket dashboard row traces
 * straight back. Amounts convert to rupees here and only here — Shiprocket's
 * unit is the rupee, this codebase's is the paise, and mixing them is the
 * classic hundred-fold bug.
 */
export async function pushOrder(input: PushOrderInput): Promise<PushOrderResult | null> {
  const rupees = (paise: Paise) => Number((paise / 100).toFixed(2));

  const body = await call<{ order_id?: number | string; shipment_id?: number | string }>(
    '/orders/create/adhoc',
    {
      method: 'POST',
      body: JSON.stringify({
        order_id: input.orderNumber,
        order_date: formatShiprocketDate(input.placedAt),
        pickup_location: input.pickupLocationName,

        billing_customer_name: input.customerName,
        billing_last_name: '',
        billing_address: input.addressLine1,
        billing_address_2: input.addressLine2 ?? '',
        billing_city: input.city,
        billing_pincode: input.pincode,
        billing_state: input.state,
        billing_country: 'India',
        billing_email: input.email ?? '',
        billing_phone: input.phone,
        shipping_is_billing: true,

        order_items: input.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          units: item.quantity,
          selling_price: rupees(item.unitPricePaise),
          hsn: item.hsnCode,
        })),

        payment_method: input.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
        sub_total: rupees(input.subtotalPaise),
        shipping_charges: rupees(input.shippingPaise),
        total_discount: rupees(input.discountPaise),

        // Dimensions are required by the API. BBTC has no per-variant box
        // sizes, so a single conservative carton is declared and the weight —
        // which is what actually drives the rate — is real.
        length: 20,
        breadth: 15,
        height: 15,
        weight: Number((Math.max(input.weightGrams, 1) / 1000).toFixed(3)),
      }),
    },
  );

  if (body === null) return null;
  if (body.order_id === undefined || body.shipment_id === undefined) {
    console.error('[shiprocket] order push returned no ids');
    return null;
  }

  return {
    shiprocketOrderId: String(body.order_id),
    shipmentId: String(body.shipment_id),
  };
}

/** Shiprocket wants `YYYY-MM-DD HH:mm`. */
function formatShiprocketDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

// ---------- AWB and label ----------

export interface AwbResult {
  awbNumber: string;
  courierName: string;
  /** Shiprocket's public tracking page for this AWB. */
  trackingUrl: string;
}

/**
 * Assign an AWB to a shipment, optionally on a chosen courier.
 *
 * Without `courierId` Shiprocket picks by the account's own courier rules,
 * which is the right default — BBTC's operations team sets those in the
 * Shiprocket dashboard, and duplicating that policy in code would mean two
 * places to change it.
 */
export async function assignAwb(
  shipmentId: string,
  courierId?: number,
): Promise<AwbResult | null> {
  const body = await call<{
    response?: { data?: { awb_code?: string; courier_name?: string } };
  }>('/courier/assign/awb', {
    method: 'POST',
    body: JSON.stringify({
      shipment_id: Number(shipmentId),
      ...(courierId ? { courier_id: courierId } : {}),
    }),
  });

  if (body === null) return null;

  const awb = body.response?.data?.awb_code;
  if (!awb) {
    console.error('[shiprocket] AWB assignment returned no code for shipment', shipmentId);
    return null;
  }

  return {
    awbNumber: awb,
    courierName: body.response?.data?.courier_name?.trim() || 'Courier',
    trackingUrl: trackingUrlFor(awb),
  };
}

/**
 * The shipping label PDF for a shipment.
 *
 * Returns the URL Shiprocket hosts rather than the bytes: the label is fetched
 * by a member of staff clicking print, and proxying a third party's PDF through
 * this server would add a failure mode without adding anything.
 */
export async function generateLabel(shipmentId: string): Promise<string | null> {
  const body = await call<{ label_url?: string; label_created?: number }>(
    '/courier/generate/label',
    {
      method: 'POST',
      body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
    },
  );

  if (body === null) return null;
  if (!body.label_url) {
    console.error('[shiprocket] label generation returned no URL for shipment', shipmentId);
    return null;
  }
  return body.label_url;
}

// ---------- Tracking webhook ----------

/*
  The parser and the status map live in `shiprocket-tracking.ts`, kept pure and
  free of `server-only` so they can be tested directly — they are the part of
  this integration where a mistake has consequences. Re-exported here so a
  caller has one Shiprocket import.
*/
export {
  SHIPROCKET_STATUS_MAP,
  parseTrackingWebhook,
  trackingUrlFor,
  type TrackingEvent,
} from '@/lib/shiprocket-tracking';
