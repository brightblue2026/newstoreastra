# Isolated performance evidence — 15 October 2026

Source: [GitHub Actions run 38689759197](https://github.com/brightblue2026/newstoreastra/actions/runs/38689759197).
Candidate application: `b2f888e5`; baseline: `c311cebb87a2d459b874feefabc5e01d07c9b7e0`.
The later `bea8b83` change affects only admin upload-input positioning and test diagnostics.
The subsequent accessibility change darkens the shared action blue and Razorpay
theme colour; these measurements were taken before that colour-only change.

Both revisions used the same synthetic PostgreSQL fixture and measurement scripts.
Each load run made 400 read-only requests at concurrency 20. Baseline p95 was
564 ms; candidate p95 was 490 ms. Both had zero failed requests. Browser samples
cover three cold loads of each of three routes at desktop and throttled-mobile
profiles (18 loads per revision). All returned HTTP 200 without browser errors.
The candidate's mobile median LCP was 948 ms for home, 868 ms for shop, and
1864 ms for the product page. The product result is essentially unchanged from
the baseline's 1860 ms; the homepage median increased from 888 ms. These small
samples do not establish statistically significant browser-speed differences.

This is a native Next.js production build on isolated CI infrastructure, not a
measurement of the Cloudflare deployment, live Supabase, hosted payments, or
maximum production capacity. The fixture does not reproduce the complete live
image catalogue. Observed blocking time is not field INP or Lighthouse TBT.
Public-host measurement was skipped; this run did not send load to the live store.
