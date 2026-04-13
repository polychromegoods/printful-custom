-- CreateTable
CREATE TABLE "ProductBase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT,
    "printAreaX" REAL NOT NULL DEFAULT 25,
    "printAreaY" REAL NOT NULL DEFAULT 15,
    "printAreaWidth" REAL NOT NULL DEFAULT 50,
    "printAreaHeight" REAL NOT NULL DEFAULT 35,
    "enableScript" BOOLEAN NOT NULL DEFAULT true,
    "enableBlock" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductBaseImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productBaseId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "variantTitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductBaseImage_productBaseId_fkey" FOREIGN KEY ("productBaseId") REFERENCES "ProductBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProductBase_shop_idx" ON "ProductBase"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBase_shop_shopifyProductId_key" ON "ProductBase"("shop", "shopifyProductId");

-- CreateIndex
CREATE INDEX "ProductBaseImage_productBaseId_idx" ON "ProductBaseImage"("productBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBaseImage_productBaseId_shopifyVariantId_key" ON "ProductBaseImage"("productBaseId", "shopifyVariantId");
