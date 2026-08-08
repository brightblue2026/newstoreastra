import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPaymentSignature, verifyWebhookSignature } from './razorpay';

const SECRET = 'whsec_test_bbtc';
const BODY = JSON.stringify({
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_ABC123', order_id: 'order_XYZ789' } } },
});
const VALID = createHmac('sha256', SECRET).update(BODY).digest('hex');

describe('verifyWebhookSignature', () => {
  it('accepts a digest of the exact body', () => {
    expect(verifyWebhookSignature(BODY, VALID, SECRET)).toBe(true);
  });

  it('rejects the same payload re-serialised with keys in another order', () => {
    // Why the route handler must read req.text() before it parses anything.
    const reordered = JSON.stringify({
      payload: { payment: { entity: { order_id: 'order_XYZ789', id: 'pay_ABC123' } } },
      event: 'payment.captured',
    });
    expect(reordered).not.toBe(BODY);
    expect(verifyWebhookSignature(reordered, VALID, SECRET)).toBe(false);
  });

  it('rejects a body altered by a single character', () => {
    expect(verifyWebhookSignature(`${BODY} `, VALID, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const forged = createHmac('sha256', 'wrong').update(BODY).digest('hex');
    expect(verifyWebhookSignature(BODY, forged, SECRET)).toBe(false);
  });

  it('rejects a missing, truncated or non-hex signature', () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, '', SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, VALID.slice(0, 32), SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, 'z'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    // An unconfigured deployment must fail closed, never open.
    expect(verifyWebhookSignature(BODY, VALID, '')).toBe(false);
    expect(verifyWebhookSignature(BODY, VALID, undefined)).toBe(false);
  });

  it('tolerates surrounding whitespace on the header value', () => {
    expect(verifyWebhookSignature(BODY, ` ${VALID}\n`, SECRET)).toBe(true);
  });
});

describe('verifyPaymentSignature', () => {
  const keySecret = 'rzp_test_secret';
  const orderId = 'order_XYZ789';
  const paymentId = 'pay_ABC123';
  const signature = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  it('accepts the documented order_id|payment_id digest', () => {
    expect(verifyPaymentSignature(orderId, paymentId, signature, keySecret)).toBe(true);
  });

  it('rejects the pair swapped round', () => {
    expect(verifyPaymentSignature(paymentId, orderId, signature, keySecret)).toBe(false);
  });

  it('rejects a payment id from a different payment', () => {
    expect(verifyPaymentSignature(orderId, 'pay_OTHER', signature, keySecret)).toBe(false);
  });
});
