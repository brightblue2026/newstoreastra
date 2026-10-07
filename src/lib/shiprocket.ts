import 'server-only';
import { db } from '@/lib/db';
import { trackingUrlFor } from '@/lib/shiprocket-tracking';
import type { Paise } from '@/lib/money';
import { DEFAULT_BOX, type BoxCm } from '@/lib/parcel';

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
  ten days. It is cached in module scope *and* in the `Setting` table, so a
  cold serverless instance reads the token from Postgres instead of logging in
  again — every cold start would otherwise be a login, and Shiprocket
  throttles those. The row is keyed to the API email, so changing the
  credentials invalidates it.

  There is no Shiprocket sandbox. Every order pushed from a test lands in the
  real dashboard and every AWB assigned is charged to the wallet — cancel test
  orders straight away (`cancelShiprocketOrder`, the admin "Cancel in
  Shiprocket" button).

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

/**
 * Credentials from the environment. Both the `SHIPROCKET_API_*` names and the
 * older `SHIPROCKET_*` ones are read, so either set of variables works.
 */
export function shiprocketConfig(): ShiprocketConfig | null {
  const email = (process.env.SHIPROCKET_API_EMAIL || process.env.SHIPROCKET_EMAIL)?.trim();
  const password = (process.env.SHIPROCKET_API_PASSWORD || process.env.SHIPROCKET_PASSWORD)?.trim();
  if (!email || !password) return null;
  return { email, password };
}

/**
 * Pickup point from the environment — the fallback for a deployment where
 * nobody has saved one in Settings yet. The admin form wins when it is set.
 */
export function shiprocketEnvPickup(): { location: string; pincode: string } {
  const pincode = process.env.SHIPROCKET_PICKUP_PINCODE?.trim() ?? '';
  return {
    location: process.env.SHIPROCKET_PICKUP_LOCATION?.trim() ?? '',
    pincode: /^[1-9][0-9]{5}$/.test(pincode) ? pincode : '',
  };
}

/** True when live rates and order push can be attempted at all. */
export function isShiprocketConfigured(): boolean {
  return shiprocketConfig() !== null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** The `Setting` row the token is shared through. No page reads it. */
const TOKEN_SETTING_KEY = 'shiprocket_token';

/** Clears the cached token, here and in the database, so the next call logs in. */
export function resetShiprocketToken(): void {
  cachedToken = null;
  db.setting.deleteMany({ where: { key: TOKEN_SETTING_KEY } }).catch(() => {});
}

async function readStoredToken(email: string): Promise<{ token: string; expiresAt: number } | null> {
  try {
    const row = await db.setting.findUnique({ where: { key: TOKEN_SETTING_KEY } });
    const data = row?.data as { token?: unknown; expiresAt?: unknown; email?: unknown } | undefined;
    if (
      data &&
      typeof data.token === 'string' &&
      typeof data.expiresAt === 'number' &&
      data.email === email &&
      data.expiresAt > Date.now()
    ) {
      return { token: data.token, expiresAt: data.expiresAt };
    }
  } catch (error) {
    // A database blip only costs one extra login.
    console.warn('[shiprocket] could not read the stored token:', error);
  }
  return null;
}

async function storeToken(email: string, token: { token: string; expiresAt: number }) {
  const data = { ...token, email };
  try {
    await db.setting.upsert({
      where: { key: TOKEN_SETTING_KEY },
      create: { key: TOKEN_SETTING_KEY, data },
      update: { data },
    });
  } catch (error) {
    console.warn('[shiprocket] could not store the token:', error);
  }
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

  const stored = await readStoredToken(config.email);
  if (stored) {
    cachedToken = stored;
    return stored.token;
  }

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
    await storeToken(config.email, cachedToken);
    return body.token;
  } catch (error) {
    console.error('[shiprocket] could not reach the login endpoint:', error);
    return null;
  }
}

type CallResult<T> = { ok: true; data: T } | { ok: false; status: number; detail: string };

/** One authenticated call. Null on any failure, having logged it. */
async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T | null> {
  const result = await callDetailed<T>(path, init);
  return result.ok ? result.data : null;
}

/**
 * The same call, keeping Shiprocket's error text — for the steps where its
 * refusal is information staff need ("wrong pickup location", "already in
 * pickup queue") rather than a bare failure. Status 0: it could not be asked.
 */
async function callDetailed<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<CallResult<T>> {
  const token = await getToken();
  if (!token) return { ok: false, status: 0, detail: 'Could not log in to Shiprocket.' };

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
      return { ok: false, status: 401, detail: 'Shiprocket rejected the login token. Try again.' };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[shiprocket]', path, 'failed with', response.status, detail.slice(0, 400));
      return { ok: false, status: response.status, detail: shiprocketMessage(detail) };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    console.error('[shiprocket]', path, 'threw:', error);
    return { ok: false, status: 0, detail: 'Shiprocket could not be reached.' };
  }
}

/** Shiprocket's `message` field when the body is JSON, else the raw text, trimmed. */
function shiprocketMessage(raw: string): string {
  try {
    const body = JSON.parse(raw) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message.trim().slice(0, 300);
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return raw.trim().slice(0, 300);
}

// ---------- Pickup locations ----------

export interface PickupLocation {
  /** The exact name an order push must quote as `pickup_location`. */
  name: string;
  pincode: string;
  city: string;
  /** Shiprocket will not collect from an address whose phone is unverified. */
  verified: boolean;
}

/**
 * The pickup addresses on the Shiprocket account — what the admin chooses from
 * in Settings, so the name an order push quotes is copied rather than retyped.
 * A misspelt pickup name is the usual reason Shiprocket refuses an order.
 *
 * Null when Shiprocket could not be asked (unconfigured, bad login, down); an
 * empty list when it answered and the account has none.
 */
export async function listPickupLocations(): Promise<PickupLocation[] | null> {
  const body = await call<{
    data?: {
      shipping_address?: {
        pickup_location?: string;
        pin_code?: string | number;
        city?: string;
        phone_verified?: number | boolean;
      }[];
    };
  }>('/settings/company/pickup', { method: 'GET' });

  if (body === null) return null;

  return (body.data?.shipping_address ?? [])
    .filter((entry) => typeof entry.pickup_location === 'string' && entry.pickup_location.trim())
    .map((entry) => ({
      name: (entry.pickup_location as string).trim(),
      pincode: String(entry.pin_code ?? '').trim(),
      city: entry.city?.trim() ?? '',
      verified: entry.phone_verified === 1 || entry.phone_verified === true,
    }));
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
  /** Whether this courier collects cash on delivery at that pincode. */
  cod: boolean;
}

export interface RateResult {
  serviceable: boolean;
  /**
   * True when at least one returned courier takes COD there — so checkout can
   * switch COD off per pincode from Shiprocket's own coverage, not only from
   * the admin's allowlist.
   */
  codServiceable: boolean;
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
        cod?: number | boolean;
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
      // Asked with cod=1, every courier returned takes COD. Asked with cod=0,
      // each row still carries its own flag.
      cod: request.cod || c.cod === 1 || c.cod === true,
    }))
    .sort((a, b) => a.pricePaise - b.pricePaise);

  return {
    serviceable: couriers.length > 0,
    codServiceable: couriers.some((c) => c.cod),
    couriers,
  };
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
  /** From `parcelDimensions`. The default carton when omitted. */
  box?: BoxCm;
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
export async function pushOrder(
  input: PushOrderInput,
): Promise<{ ok: true; result: PushOrderResult } | { ok: false; error: string }> {
  const rupees = (paise: Paise) => Number((paise / 100).toFixed(2));
  const box = input.box ?? DEFAULT_BOX;

  const response = await callDetailed<{ order_id?: number | string; shipment_id?: number | string }>(
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

        // Required on every order. Built from the measured boxes by
        // `parcelDimensions`; the default carton for anything unmeasured.
        length: box.lengthCm,
        breadth: box.breadthCm,
        height: box.heightCm,
        weight: Number((Math.max(input.weightGrams, 1) / 1000).toFixed(3)),
      }),
    },
  );

  if (!response.ok) return { ok: false, error: response.detail };
  const body = response.data;
  if (body.order_id === undefined || body.shipment_id === undefined) {
    console.error('[shiprocket] order push returned no ids');
    return { ok: false, error: 'Shiprocket answered but returned no shipment id.' };
  }

  return {
    ok: true,
    result: {
      shiprocketOrderId: String(body.order_id),
      shipmentId: String(body.shipment_id),
    },
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

// ---------- Pickup, manifest, cancel ----------

/**
 * Ask the courier to collect the shipment. Shiprocket refuses a second request
 * for the same shipment with an "already" message; that counts as done.
 */
export async function requestPickup(
  shipmentId: string,
): Promise<{ ok: true; scheduledFor: string | null } | { ok: false; error: string }> {
  const response = await callDetailed<{
    pickup_status?: number;
    response?: { pickup_scheduled_date?: string | null };
  }>('/courier/generate/pickup', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
  });

  if (!response.ok) {
    if (/already/i.test(response.detail)) return { ok: true, scheduledFor: null };
    return { ok: false, error: response.detail || 'Shiprocket did not accept the pickup request.' };
  }

  return { ok: true, scheduledFor: response.data.response?.pickup_scheduled_date ?? null };
}

/**
 * The manifest PDF the courier signs at pickup. Generated once; for a shipment
 * that already has one, Shiprocket refuses to generate again, so this falls
 * back to printing the existing manifest — keyed by Shiprocket's *order* id.
 */
export async function generateManifest(
  shipmentId: string,
  shiprocketOrderId: string | null,
): Promise<string | null> {
  const generated = await callDetailed<{ manifest_url?: string }>('/manifests/generate', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
  });
  if (generated.ok && generated.data.manifest_url) return generated.data.manifest_url;

  if (!shiprocketOrderId) return null;
  const printed = await call<{ manifest_url?: string }>('/manifests/print', {
    method: 'POST',
    body: JSON.stringify({ order_ids: [Number(shiprocketOrderId)] }),
  });
  return printed?.manifest_url ?? null;
}

/**
 * Cancel an order in Shiprocket — test orders above all, since there is no
 * sandbox. Cancelling releases an assigned AWB's charge back to the wallet.
 */
export async function cancelShiprocketOrder(
  shiprocketOrderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await callDetailed<unknown>('/orders/cancel', {
    method: 'POST',
    body: JSON.stringify({ ids: [Number(shiprocketOrderId)] }),
  });
  return response.ok ? { ok: true } : { ok: false, error: response.detail };
}

// ---------- Live tracking ----------

export interface TrackingScan {
  at: string;
  status: string;
  location: string | null;
}

export interface TrackingSnapshot {
  currentStatus: string | null;
  /** Expected delivery date as Shiprocket gives it, or null. */
  expectedDelivery: string | null;
  /** Newest first, as Shiprocket returns them. */
  scans: TrackingScan[];
}

/**
 * The courier's scan history for an AWB — for the customer's order page.
 *
 * Short timeout: it renders inside a page load, and the page is complete
 * without it (the AWB and the courier's own link are shown regardless).
 */
export async function trackByAwb(awbNumber: string): Promise<TrackingSnapshot | null> {
  const body = await call<{
    tracking_data?: {
      etd?: string | null;
      shipment_track?: { current_status?: string | null; edd?: string | null }[] | null;
      shipment_track_activities?:
        | {
            date?: string;
            activity?: string;
            location?: string | null;
            'sr-status-label'?: string;
          }[]
        | null;
    };
  }>(`/courier/track/awb/${encodeURIComponent(awbNumber.trim())}`, {
    method: 'GET',
    timeoutMs: 3_000,
  });

  const data = body?.tracking_data;
  if (!data) return null;

  const scans = (data.shipment_track_activities ?? [])
    .filter((scan) => typeof scan.date === 'string' && (scan.activity || scan['sr-status-label']))
    .map((scan) => ({
      at: scan.date as string,
      status: (scan.activity || scan['sr-status-label'] || '').trim(),
      location: scan.location?.trim() || null,
    }))
    .slice(0, 20);

  const track = data.shipment_track?.[0];
  return {
    currentStatus: track?.current_status?.trim() || null,
    expectedDelivery: track?.edd || data.etd || null,
    scans,
  };
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
