import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@/generated/prisma/enums';
import {
  SHIPROCKET_STATUS_MAP,
  parseTrackingWebhook,
  trackingUrlFor,
} from './shiprocket-tracking';

/*
  The tracking webhook's parser and status map, which are the only parts of the
  Shiprocket integration that can be tested without a network — and, not
  coincidentally, the parts where a mistake has consequences. Everything else in
  that module is a fetch with a fallback.
*/

describe('SHIPROCKET_STATUS_MAP', () => {
  /*
    The security property of the whole file. §10: order state changes only from
    a verified Razorpay webhook. Shiprocket authenticates with a shared header
    token, which is weaker, so it must not be able to reach CONFIRMED — the
    status that means "the money arrived".

    `order-status.ts` enforces this independently by refusing
    PENDING_PAYMENT → CONFIRMED for a STAFF actor. This asserts the second
    layer: the map cannot even name it.
  */
  it('cannot map any courier scan to CONFIRMED', () => {
    const targets = Object.values(SHIPROCKET_STATUS_MAP);
    expect(targets).not.toContain('CONFIRMED');
    expect(targets).not.toContain(OrderStatus.CONFIRMED);
  });

  it('only ever names statuses the order state machine knows', () => {
    for (const target of Object.values(SHIPROCKET_STATUS_MAP)) {
      expect(Object.keys(OrderStatus)).toContain(target);
    }
  });
});

describe('parseTrackingWebhook', () => {
  it('reads a delivered scan', () => {
    const event = parseTrackingWebhook({
      awb: '1234567890',
      order_id: 'BB-2627-00001',
      current_status: 'Delivered',
      courier_name: 'DTDC',
    });

    expect(event).toMatchObject({
      awbNumber: '1234567890',
      orderNumber: 'BB-2627-00001',
      status: 'DELIVERED',
      courierName: 'DTDC',
      outForDelivery: false,
    });
  });

  it('matches status case-insensitively, because Shiprocket is not consistent', () => {
    expect(parseTrackingWebhook({ current_status: 'DELIVERED' })?.status).toBe('DELIVERED');
    expect(parseTrackingWebhook({ current_status: 'delivered' })?.status).toBe('DELIVERED');
    expect(parseTrackingWebhook({ current_status: 'Delivered' })?.status).toBe('DELIVERED');
  });

  it('flags the out-for-delivery scan, which gets its own message', () => {
    const event = parseTrackingWebhook({ current_status: 'Out For Delivery' });
    expect(event?.outForDelivery).toBe(true);
    // It is still a SHIPPED order — out for delivery is not a status change.
    expect(event?.status).toBe('SHIPPED');
  });

  it('treats every RTO spelling as a return', () => {
    for (const raw of ['RTO_INITIATED', 'RTO INITIATED', 'RTO_DELIVERED', 'Returned']) {
      expect(parseTrackingWebhook({ current_status: raw })?.status).toBe('RETURNED');
    }
  });

  it('reports an intermediate scan as noise rather than guessing', () => {
    const event = parseTrackingWebhook({ current_status: 'Reached Destination Hub' });
    expect(event).not.toBeNull();
    expect(event?.status).toBeNull();
    // The raw value survives so it can be logged.
    expect(event?.rawStatus).toBe('Reached Destination Hub');
  });

  it('accepts the alternative field names Shiprocket sends', () => {
    expect(parseTrackingWebhook({ shipment_status: 'Shipped' })?.status).toBe('SHIPPED');
    expect(parseTrackingWebhook({ status: 'Shipped' })?.status).toBe('SHIPPED');
    expect(parseTrackingWebhook({ awb_code: '999', current_status: 'Shipped' })?.awbNumber).toBe(
      '999',
    );
    expect(
      parseTrackingWebhook({ channel_order_id: 'BB-2627-00009', current_status: 'Shipped' })
        ?.orderNumber,
    ).toBe('BB-2627-00009');
  });

  it('coerces a numeric AWB, which Shiprocket sometimes sends unquoted', () => {
    expect(parseTrackingWebhook({ awb: 1234567890, current_status: 'Shipped' })?.awbNumber).toBe(
      '1234567890',
    );
  });

  it('returns null for anything without a status', () => {
    for (const bad of [null, undefined, 'string', 42, {}, { awb: '123' }, { current_status: '  ' }]) {
      expect(parseTrackingWebhook(bad)).toBeNull();
    }
  });
});

describe('trackingUrlFor', () => {
  it('builds a customer-facing tracking link', () => {
    expect(trackingUrlFor('1234567890')).toBe('https://shiprocket.co/tracking/1234567890');
  });

  it('encodes an AWB rather than interpolating it raw', () => {
    // The AWB reaches this from a third party's webhook body, and the result
    // goes into an email and a WhatsApp message.
    expect(trackingUrlFor('a b/c')).toBe('https://shiprocket.co/tracking/a%20b%2Fc');
  });
});
