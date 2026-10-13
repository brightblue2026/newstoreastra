/** Never serialize arbitrary exceptions: provider/ORM messages can contain PII or secrets. */
export function logServerFailure(event: 'checkout.quote' | 'checkout.place' | 'payment.webhook' | 'invoice.render', error: unknown): void {
  const kind = error instanceof TypeError ? 'TypeError' : error instanceof RangeError ? 'RangeError' : 'InternalError';
  console.error('[server-failure]', { event, kind });
}
