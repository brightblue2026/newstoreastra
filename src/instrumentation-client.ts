import * as Sentry from '@sentry/nextjs';
import { scrubCapabilityToken } from '@/lib/sentry-scrub';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    sendDefaultPii: false,

    // The most important of the three configs for this: the browser SDK
    // captures `window.location.href` itself for both events and
    // transactions, and that's exactly where the order-access capability
    // token (`?t=…`) lives on the order tracking and invoice pages — a
    // standing credential for that order, not covered by sendDefaultPii.
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubCapabilityToken(event.request.url);
      return event;
    },
    beforeSendTransaction(event) {
      if (event.request?.url) event.request.url = scrubCapabilityToken(event.request.url);
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
