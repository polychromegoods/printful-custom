-- AlterTable: Add fulfillment provider and Printify fields
ALTER TABLE "PersonalizationOrder" ADD COLUMN IF NOT EXISTS "fulfillmentProvider" TEXT NOT NULL DEFAULT 'printful';
ALTER TABLE "PersonalizationOrder" ADD COLUMN IF NOT EXISTS "printifyImageId" TEXT;
ALTER TABLE "PersonalizationOrder" ADD COLUMN IF NOT EXISTS "printifyOrderId" TEXT;
ALTER TABLE "PersonalizationOrder" ADD COLUMN IF NOT EXISTS "printifyStatus" TEXT;
ALTER TABLE "PersonalizationOrder" ADD COLUMN IF NOT EXISTS "printifyVariantId" INTEGER;
