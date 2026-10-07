-- Close Supabase's auto-generated REST API (PostgREST) over every table.
--
-- Supabase exposes the `public` schema at /rest/v1 to its `anon` and
-- `authenticated` roles, and the anon key is public by design. Prisma creates
-- its tables in `public` with no row-level security, so on a fresh project
-- every table — User password hashes, Order, Address, Setting — was readable
-- with the anon key (found 28 September 2026, before any data was loaded).
--
-- This app never uses the REST API: it reaches Postgres only through Prisma,
-- connected as the table owner, which RLS does not restrict. So the fix is to
-- shut the door entirely, twice over:
--   1. RLS on with no policies — PostgREST sees zero rows, and Supabase's
--      security advisor is satisfied.
--   2. Table privileges revoked from anon/authenticated, now and for every
--      table a future migration creates.
-- A future table still needs its own ENABLE ROW LEVEL SECURITY; the test in
-- src/lib/rls-migrations.test.ts fails until it has one.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Combo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComboItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Discount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Retailer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- The Supabase roles do not exist on a plain Postgres (local Docker, CI), so
-- the revokes run only where they do.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
