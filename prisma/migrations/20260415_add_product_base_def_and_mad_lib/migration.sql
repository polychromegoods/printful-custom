-- Add Mad Lib fields to TemplateLayer
ALTER TABLE "TemplateLayer" ADD COLUMN IF NOT EXISTS "madLibTemplate" TEXT;
ALTER TABLE "TemplateLayer" ADD COLUMN IF NOT EXISTS "madLibPrompts" TEXT;

-- CreateTable ProductBaseDef
CREATE TABLE IF NOT EXISTS "ProductBaseDef" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "technique" TEXT NOT NULL DEFAULT 'dtg',
    "printifyBlueprintId" INTEGER,
    "printifyProviderId" INTEGER,
    "printfulProductId" INTEGER,
    "printAreaX" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "printAreaY" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "printAreaWidth" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "printAreaHeight" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "printFileWidth" INTEGER NOT NULL DEFAULT 4500,
    "printFileHeight" INTEGER NOT NULL DEFAULT 5100,
    "printFileDpi" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductBaseDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductBaseDef_shop_slug_key" ON "ProductBaseDef"("shop", "slug");

-- CreateTable ProductBaseVariant
CREATE TABLE IF NOT EXISTS "ProductBaseVariant" (
    "id" TEXT NOT NULL,
    "productBaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL DEFAULT '#FFFFFF',
    "size" TEXT,
    "printifyVariantId" INTEGER,
    "printfulVariantId" INTEGER,
    "mockupImageUrl" TEXT,
    "mockupPrintAreaX" DOUBLE PRECISION,
    "mockupPrintAreaY" DOUBLE PRECISION,
    "mockupPrintAreaWidth" DOUBLE PRECISION,
    "mockupPrintAreaHeight" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductBaseVariant_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductBaseVariant" ADD CONSTRAINT "ProductBaseVariant_productBaseId_fkey" 
    FOREIGN KEY ("productBaseId") REFERENCES "ProductBaseDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
