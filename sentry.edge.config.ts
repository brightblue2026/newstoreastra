import * as Sentry from '@sentry/nextjs';
import { scrubCapabilityToken } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  sendDefaultPii: false,

  // See sentry.server.config.ts — the order-access capability token in a
  // request URL isn't covered by sendDefaultPii, which governs IP/user data,
  // not query parameters.
  beforeSend(event) {
    if (event.request?.url) event.request.url = scrubCapabilityToken(event.request.url);
    return event;
  },
  beforeSendTransaction(event) {
    if (event.request?.url) event.request.url = scrubCapabilityToken(event.request.url);
    return event;
  },
});
