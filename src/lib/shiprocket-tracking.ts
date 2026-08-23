/**
 * Shiprocket tracking — the pure half.
 *
 * Split out of `shiprocket.ts` and kept free of `server-only`, no network and
 * no database, for the same reason `combo-choice.ts` was split out of
 * `cart-pricing.ts`: this is the part that must not be taken on trust, so it
 * has to be testable directly. The rest of `shiprocket.ts` is authenticated
 * `fetch` calls with a documented fallback.
 */

/**
 * Shiprocket's tracking statuses, mapped to this store's order statuses.
 *
 * Only the transitions that mean something to a customer are mapped. Shiprocket
 * emits a long tail of intermediate scans ("Reached Destination Hub") that are
 * noise on an order page, and anything unmapped is acknowledged and ignored
 * rather than guessed at.
 *
 * **Nothing here may map to CONFIRMED.** §10 allows only a verified Razorpay
 * webhook to mark an order paid, and Shiprocket authenticates with a shared
 * header token, which is weaker. `order-status.ts` enforces this independently
 * by refusing PENDING_PAYMENT → CONFIRMED to a STAFF actor; this map not being
 * able to name it is the second layer, and it is asserted in a test.
 */
export const SHIPROCKET_STATUS_MAP: Readonly<Record<string, 'SHIPPED' | 'DELIVERED' | 'RETURNED'>> =
  Object.freeze({
    SHIPPED: 'SHIPPED',
    'IN TRANSIT': 'SHIPPED',
    'OUT FOR DELIVERY': 'SHIPPED',
    DELIVERED: 'DELIVERED',
    RTO_INITIATED: 'RETURNED',
    'RTO INITIATED': 'RETURNED',
    RTO_DELIVERED: 'RETURNED',
    'RTO DELIVERED': 'RETURNED',
    RETURNED: 'RETURNED',
    CANCELED: 'RETURNED',
    CANCELLED: 'RETURNED',
  });

export interface TrackingEvent {
  awbNumber: string | null;
  /** BBTC's own order number, which is what was pushed as `order_id`. */
  orderNumber: string | null;
  /** The mapped order status, or null when the scan is noise. */
  status: 'SHIPPED' | 'DELIVERED' | 'RETURNED' | null;
  rawStatus: string;
  courierName: string | null;
  /** True for the specific "out for delivery" scan, which gets its own message. */
  outForDelivery: boolean;
}

/**
 * Parse a Shiprocket tracking webhook body.
 *
 * Shiprocket is not consistent about field names or casing between event types,
 * so every alternative it has been observed to send is accepted. It validates
 * nothing about authenticity — that is the route handler's job, and it is a
 * token comparison, not a parse.
 */
export function parseTrackingWebhook(payload: unknown): TrackingEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;

  const rawStatus = String(body.current_status ?? body.shipment_status ?? body.status ?? '').trim();
  if (rawStatus === '') return null;

  const key = rawStatus.toUpperCase();

  return {
    awbNumber: stringOrNull(body.awb ?? body.awb_code),
    orderNumber: stringOrNull(body.order_id ?? body.channel_order_id),
    status: SHIPROCKET_STATUS_MAP[key] ?? null,
    rawStatus,
    courierName: stringOrNull(body.courier_name),
    outForDelivery: key === 'OUT FOR DELIVERY',
  };
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/**
 * Shiprocket's customer-facing tracking page.
 *
 * The AWB is encoded rather than interpolated raw: it arrives from a third
 * party's webhook body and the result goes into an email and a WhatsApp
 * message.
 */
export function trackingUrlFor(awbNumber: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awbNumber.trim())}`;
}
