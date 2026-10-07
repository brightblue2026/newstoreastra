-- Box sizes for Shiprocket, pickup/manifest tracking, and the auto-push error.
ALTER TABLE "ProductVariant" ADD COLUMN "lengthCm" INTEGER,
ADD COLUMN "breadthCm" INTEGER,
ADD COLUMN "heightCm" INTEGER;

ALTER TABLE "Combo" ADD COLUMN "weightGrams" INTEGER,
ADD COLUMN "lengthCm" INTEGER,
ADD COLUMN "breadthCm" INTEGER,
ADD COLUMN "heightCm" INTEGER;

ALTER TABLE "Order" ADD COLUMN "manifestUrl" TEXT,
ADD COLUMN "pickupRequestedAt" TIMESTAMP(3),
ADD COLUMN "shiprocketError" TEXT;
