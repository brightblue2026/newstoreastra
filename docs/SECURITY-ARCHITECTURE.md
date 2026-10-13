# Architecture and data security

## Implementation choice

Keep the application as a modular Next.js/TypeScript application with PostgreSQL transactions. Application source is strict TypeScript, `allowJs` is disabled, and compilation/lint failures block releases. Browser delivery still uses compiled JavaScript. Existing framework/build `.mjs` scripts are not business logic and were not gratuitously rewritten. A language change alone is not a security control.

## Request and data flow

1. Customer or staff UI submits input to a server action or route. Treat every browser value and provider payload as untrusted.
2. Server boundaries apply validation, rate limits and authorization. Staff mutations re-read the current database role and active status; hiding a menu item is not authorization.
3. Domain functions compute prices, GST, discounts and stock from database records. They use integer paise and enforce order transitions inside transactions with stock/sequence locks.
4. Payment order creation uses the server amount and a bounded provider request. The browser callback does not mark an order paid. A verified captured-payment webhook validates provider order, amount, currency and state before confirmation.
5. Notifications and courier calls run after the transaction. They currently lack a durable outbox; process-crash delivery guarantees are not claimed.
6. PostgreSQL holds commerce data. Supabase Storage holds product photography. Storage service credentials stay server-side; uploads use scoped signed URLs.

## Controls present

- Server-side staff authorization and active-role refresh, password hashing, session protection, shared login/checkout limits and input validation.
- Existing PostgreSQL RLS migration denies public Supabase API access to application tables; application database credentials remain privileged and must stay secret.
- HMAC verification of raw Razorpay payloads, bounded request bodies, amount/currency/capture checks and conditional state writes.
- Courier token verification before parsing; 256 KiB payload limit; ordered AWB/order lookup; reject conflicting identifiers; conditional first-AWB assignment prevents concurrent overwrite; only a winning state transition schedules its ordinary notification.
- HTTPS/HSTS, frame denial, MIME sniffing protection and a baseline CSP. Referrer policy is `same-origin`: cross-origin destinations receive no referrer. This retains same-origin form compatibility with Next Server Actions; `no-referrer` caused native browser form POSTs to send an opaque Origin and fail. Same-origin access logs must still redact order-access query tokens.
- Invoice PDFs use `private, no-store`. This does not erase files deliberately downloaded by customers.
- Checkout quote/place, payment webhook and invoice-render exception logs omit raw error messages, stacks and attached objects. This is targeted hardening, not a claim that all external platform logs have been audited.
- Production dependency audit, unit tests, native build/start smoke, Cloudflare build and disposable PostgreSQL integration gates in CI.

## Verified versus deployment-dependent

All four GitHub CI jobs passed for commit `c477d7c` before this additional hardening. Those database tests use a disposable PostgreSQL service, not the merchant's Supabase project. The additional hardening in `e9356a3` passed all four CI jobs, including 649 unit tests, native production startup/HTTP smoke, Cloudflare build and disposable PostgreSQL integration.

Actual Supabase credentials, storage policy/permissions, Razorpay test-mode Checkout and hosted admin browser flows remain unverified from this workspace. Infrastructure controls cannot be established just by changing application source.

Before opening live sales, configure and verify:

- Staff MFA through the selected identity/access provider, least-privilege operator accounts and account recovery.
- Host/WAF request limits and a trusted proxy configuration; never accept spoofable client-IP headers directly from the internet.
- Managed encrypted storage/backups, restricted database network access, restore testing and credential rotation.
- Restricted log access/retention and redaction of token-bearing URLs at hosting, proxy and monitoring layers.
- Alerting for webhook failures, payment reconciliation, authentication abuse and database exhaustion.
- Real provider and role-based browser acceptance tests, then an independent security assessment.

## Remaining architecture work

Durable checkout-request idempotency and a transactional outbox are still required before promising reliable automatic retries at higher volume. Out-for-delivery courier scans can still repeat notifications; a durable webhook event ledger remains to be implemented. Nonce CSP requires browser/payment compatibility testing. Customer order URLs remain bearer links; protect their logs and plan revocation/expiry when introducing customer accounts. Capacity must be measured against representative database-backed customer/admin workloads.

## Reference guidance

- https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

These references guide the controls; they are not a security certification.
