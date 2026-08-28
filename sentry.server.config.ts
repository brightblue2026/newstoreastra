import * as Sentry from '@sentry/nextjs';
import { scrubCapabilityToken } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // No PII in logs — §13. Customer names, phone numbers and addresses must not
  // leave the database for an error tracker.
  sendDefaultPii: false,

  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
    if (event.request?.url) event.request.url = scrubCapabilityToken(event.request.url);
    delete event.user;
    return event;
  },

  // The order-access capability token (`?t=…`) is a standing credential for
  // that order, not a cookie or auth header — sendDefaultPii and the header
  // stripping above don't cover a query parameter. 10% of transactions are
  // sampled in production, same exposure as an error event.
  beforeSendTransaction(event) {
    if (event.request?.url) event.request.url = scrubCapabilityToken(event.request.url);
    return event;
  },
});
