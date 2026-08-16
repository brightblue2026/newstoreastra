-- Phase 6: fulfilment, invoices, communications.
--
-- Four nullable columns on "Order". All nullable with no default and no
-- backfill, so this is safe to apply to a table with rows in it: an order
-- placed before Phase 6 simply has no invoice date and no shipment, which is
-- the truth about it.
--
-- Authored by hand rather than by `prisma migrate dev` — this environment has
-- no DATABASE_URL and `migrate diff` needs a shadow database. Same as the
-- Phase 5 settings migration.

-- Shiprocket keys AWB assignment and label generation off the *shipment* id,
-- which is not the order id it also returns. Both are needed.
ALTER TABLE "Order" ADD COLUMN "shiprocketShipmentId" TEXT;

-- The label PDF URL Shiprocket generates, cached so reprinting a label does
-- not re-bill a generation call.
ALTER TABLE "Order" ADD COLUMN "labelUrl" TEXT;

-- When the tax invoice was raised. Distinct from "createdAt": a prepaid order
-- is invoiced when its payment webhook confirms it, which can be a different
-- day and — for an order placed near 31 March — a different financial year.
ALTER TABLE "Order" ADD COLUMN "invoicedAt" TIMESTAMP(3);

-- No index is added for the invoice-series lookup. That query scans by
-- financial-year prefix under an advisory lock on every confirmation, so it
-- does need one — but "Order"."invoiceNumber" is already @unique, and the
-- unique index backing it serves a prefix scan and an ORDER BY DESC exactly as
-- well. A second index on the same column would be pure write cost.
