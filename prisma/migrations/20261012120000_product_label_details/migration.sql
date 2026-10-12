-- Label details a product page must show (Legal Metrology packaged-commodity
-- declarations). All nullable: nothing is backfilled, and a product without
-- them shows the seller's standing details instead.
ALTER TABLE "Product" ADD COLUMN "countryOfOrigin" TEXT,
ADD COLUMN "manufacturerName" TEXT,
ADD COLUMN "manufacturerAddress" TEXT,
ADD COLUMN "shelfLife" TEXT,
ADD COLUMN "safetyWarnings" TEXT;
