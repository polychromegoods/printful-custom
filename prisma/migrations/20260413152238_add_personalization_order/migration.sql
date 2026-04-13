-- CreateTable
CREATE TABLE "PersonalizationOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "monogramText" TEXT NOT NULL,
    "monogramStyle" TEXT NOT NULL DEFAULT 'script',
    "threadColor" TEXT NOT NULL DEFAULT '#000000',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "printFileUrl" TEXT,
    "printfulFileId" TEXT,
    "printfulOrderId" TEXT,
    "printfulStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PersonalizationOrder_shop_idx" ON "PersonalizationOrder"("shop");

-- CreateIndex
CREATE INDEX "PersonalizationOrder_shopifyOrderId_idx" ON "PersonalizationOrder"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "PersonalizationOrder_status_idx" ON "PersonalizationOrder"("status");
