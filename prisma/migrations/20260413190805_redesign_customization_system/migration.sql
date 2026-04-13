/*
  Warnings:

  - You are about to drop the `ProductBase` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductBaseImage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "ProductBase_shop_shopifyProductId_key";

-- DropIndex
DROP INDEX "ProductBase_shop_idx";

-- DropIndex
DROP INDEX "ProductBaseImage_productBaseId_shopifyVariantId_key";

-- DropIndex
DROP INDEX "ProductBaseImage_productBaseId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProductBase";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ProductBaseImage";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ProductTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT,
    "productBaseSlug" TEXT NOT NULL,
    "technique" TEXT NOT NULL,
    "placementKey" TEXT NOT NULL,
    "printAreaX" REAL NOT NULL DEFAULT 25,
    "printAreaY" REAL NOT NULL DEFAULT 15,
    "printAreaWidth" REAL NOT NULL DEFAULT 50,
    "printAreaHeight" REAL NOT NULL DEFAULT 35,
    "enabledFonts" TEXT NOT NULL DEFAULT '["script","block"]',
    "enabledThreadColors" TEXT NOT NULL DEFAULT '[]',
    "enabledVariantColors" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateLayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "layerType" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Custom Text',
    "customerEditable" BOOLEAN NOT NULL DEFAULT true,
    "positionX" REAL NOT NULL DEFAULT 10,
    "positionY" REAL NOT NULL DEFAULT 10,
    "positionWidth" REAL NOT NULL DEFAULT 80,
    "positionHeight" REAL NOT NULL DEFAULT 80,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maxChars" INTEGER DEFAULT 3,
    "placeholder" TEXT DEFAULT 'ABC',
    "enabledFonts" TEXT,
    "defaultFont" TEXT DEFAULT 'script',
    "defaultColor" TEXT DEFAULT '#000000',
    "acceptedFileTypes" TEXT DEFAULT '["image/png","image/jpeg"]',
    "maxFileSizeMb" REAL DEFAULT 10,
    "fixedImageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TemplateLayer_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MockupImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "variantColor" TEXT NOT NULL,
    "variantColorHex" TEXT,
    "shopifyVariantId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MockupImage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PersonalizationOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "templateId" TEXT,
    "productBaseSlug" TEXT,
    "technique" TEXT,
    "placementKey" TEXT,
    "personalizationData" TEXT NOT NULL DEFAULT '{}',
    "monogramText" TEXT,
    "monogramStyle" TEXT DEFAULT 'script',
    "threadColor" TEXT DEFAULT '#000000',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "printFileUrl" TEXT,
    "printfulFileId" TEXT,
    "printfulOrderId" TEXT,
    "printfulStatus" TEXT,
    "printfulVariantId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PersonalizationOrder" ("createdAt", "customerEmail", "customerName", "errorMessage", "id", "monogramStyle", "monogramText", "printFileUrl", "printfulFileId", "printfulOrderId", "printfulStatus", "shop", "shopifyOrderId", "shopifyOrderName", "shopifyVariantId", "status", "threadColor", "updatedAt") SELECT "createdAt", "customerEmail", "customerName", "errorMessage", "id", "monogramStyle", "monogramText", "printFileUrl", "printfulFileId", "printfulOrderId", "printfulStatus", "shop", "shopifyOrderId", "shopifyOrderName", "shopifyVariantId", "status", "threadColor", "updatedAt" FROM "PersonalizationOrder";
DROP TABLE "PersonalizationOrder";
ALTER TABLE "new_PersonalizationOrder" RENAME TO "PersonalizationOrder";
CREATE INDEX "PersonalizationOrder_shop_idx" ON "PersonalizationOrder"("shop");
CREATE INDEX "PersonalizationOrder_shopifyOrderId_idx" ON "PersonalizationOrder"("shopifyOrderId");
CREATE INDEX "PersonalizationOrder_status_idx" ON "PersonalizationOrder"("status");
CREATE INDEX "PersonalizationOrder_templateId_idx" ON "PersonalizationOrder"("templateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductTemplate_shop_idx" ON "ProductTemplate"("shop");

-- CreateIndex
CREATE INDEX "ProductTemplate_productBaseSlug_idx" ON "ProductTemplate"("productBaseSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTemplate_shop_shopifyProductId_key" ON "ProductTemplate"("shop", "shopifyProductId");

-- CreateIndex
CREATE INDEX "TemplateLayer_templateId_idx" ON "TemplateLayer"("templateId");

-- CreateIndex
CREATE INDEX "MockupImage_templateId_idx" ON "MockupImage"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MockupImage_templateId_variantColor_key" ON "MockupImage"("templateId", "variantColor");
