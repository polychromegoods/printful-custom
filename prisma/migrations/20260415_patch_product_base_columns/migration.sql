-- Patch: Add missing columns to ProductBaseDef that were in schema but not in initial migration

-- Core identifier columns
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "brand" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "model" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "fulfillmentProvider" TEXT NOT NULL DEFAULT 'printify';

-- Techniques and placements (JSON arrays)
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "techniques" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "placements" TEXT NOT NULL DEFAULT '[]';

-- Rename/add print area columns to match schema
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "defaultPrintAreaX" DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "defaultPrintAreaY" DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "defaultPrintAreaWidth" DOUBLE PRECISION NOT NULL DEFAULT 60;
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "defaultPrintAreaHeight" DOUBLE PRECISION NOT NULL DEFAULT 60;

-- Mockup and catalog
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "defaultMockupUrl" TEXT;
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "catalogImages" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductBaseDef" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Patch ProductBaseVariant: add missing columns
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;

-- ProductBaseVariant: rename mockupPrintArea* columns to printArea* to match schema
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "printAreaX" DOUBLE PRECISION;
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "printAreaY" DOUBLE PRECISION;
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "printAreaWidth" DOUBLE PRECISION;
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "printAreaHeight" DOUBLE PRECISION;
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProductBaseVariant" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add unique constraint for productBaseId + color + size
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductBaseVariant_productBaseId_color_size_key'
  ) THEN
    ALTER TABLE "ProductBaseVariant" ADD CONSTRAINT "ProductBaseVariant_productBaseId_color_size_key" 
      UNIQUE ("productBaseId", "color", "size");
  END IF;
END $$;
