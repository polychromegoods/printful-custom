-- Fix: Make "name" column nullable on ProductBaseVariant
-- The Prisma schema no longer includes this column, but the DB still has it as NOT NULL.
-- We make it nullable so imports don't fail, and backfill existing nulls with the color value.

-- Step 1: Make name nullable
ALTER TABLE "ProductBaseVariant" ALTER COLUMN "name" DROP NOT NULL;

-- Step 2: Set default for any future rows
ALTER TABLE "ProductBaseVariant" ALTER COLUMN "name" SET DEFAULT '';

-- Step 3: Backfill any existing rows that might have empty name
UPDATE "ProductBaseVariant" SET "name" = "color" WHERE "name" IS NULL OR "name" = '';
