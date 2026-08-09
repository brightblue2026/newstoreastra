import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature, webhookIdempotencyKey } from './razorpay-webhook';

const SECRET = 'test_webhook_secret';

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a body that does not match the signature', () => {
    const body = '{"event":"payment.captured"}';
    const tamperedBody = '{"event":"payment.failed"}';
    expect(verifyWebhookSignature(tamperedBody, sign(body), SECRET)).toBe(false);
  });

  it('rejects a signature produced with the wrong secret', () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign(body, 'wrong_secret'), SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyWebhookSignature('{}', null, SECRET)).toBe(false);
    expect(verifyWebhookSignature('{}', undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature('{}', '', SECRET)).toBe(false);
  });

  it('rejects a malformed (non-hex) signature without throwing', () => {
    expect(() => verifyWebhookSignature('{}', 'not-hex-at-all!!', SECRET)).not.toThrow();
    expect(verifyWebhookSignature('{}', 'not-hex-at-all!!', SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, 'ab', SECRET)).toBe(false);
  });

  it('rejects when the webhook secret is empty', () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign(body), '')).toBe(false);
  });
});

describe('webhookIdempotencyKey', () => {
  it('keys on event + payment id when a payment entity is present', () => {
    const key = webhookIdempotencyKey({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_123', order_id: 'order_456' } } },
    });
    expect(key).toBe('payment.captured:pay_123');
  });

  it('falls back to the order id when there is no payment entity', () => {
    const key = webhookIdempotencyKey({
      event: 'order.paid',
      payload: { order: { entity: { id: 'order_456' } } },
    });
    expect(key).toBe('order.paid:order_456');
  });

  it('produces a stable placeholder rather than throwing when both are absent', () => {
    const key = webhookIdempotencyKey({ event: 'payment.failed' });
    expect(key).toBe('payment.failed:unknown');
  });

  it('two deliveries of the same event carry the same key', () => {
    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_123' } } },
    };
    expect(webhookIdempotencyKey(payload)).toBe(webhookIdempotencyKey({ ...payload }));
  });
});
