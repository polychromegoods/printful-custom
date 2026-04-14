-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT,
    "productBaseSlug" TEXT NOT NULL,
    "technique" TEXT NOT NULL,
    "placementKey" TEXT NOT NULL,
    "printAreaX" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "printAreaY" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "printAreaWidth" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "printAreaHeight" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "enabledFonts" TEXT NOT NULL DEFAULT '["script","block"]',
    "enabledThreadColors" TEXT NOT NULL DEFAULT '[]',
    "enabledVariantColors" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateLayer" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "layerType" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Custom Text',
    "customerEditable" BOOLEAN NOT NULL DEFAULT true,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "positionWidth" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "positionHeight" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maxChars" INTEGER DEFAULT 3,
    "placeholder" TEXT DEFAULT 'ABC',
    "enabledFonts" TEXT,
    "defaultFont" TEXT DEFAULT 'script',
    "defaultColor" TEXT DEFAULT '#000000',
    "acceptedFileTypes" TEXT DEFAULT '["image/png","image/jpeg"]',
    "maxFileSizeMb" DOUBLE PRECISION DEFAULT 10,
    "fixedImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockupImage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "variantColor" TEXT NOT NULL,
    "variantColorHex" TEXT,
    "shopifyVariantId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockupImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizationOrder" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductTemplate_shop_shopifyProductId_key" ON "ProductTemplate"("shop", "shopifyProductId");

-- CreateIndex
CREATE INDEX "ProductTemplate_shop_idx" ON "ProductTemplate"("shop");

-- CreateIndex
CREATE INDEX "ProductTemplate_productBaseSlug_idx" ON "ProductTemplate"("productBaseSlug");

-- CreateIndex
CREATE INDEX "TemplateLayer_templateId_idx" ON "TemplateLayer"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MockupImage_templateId_variantColor_key" ON "MockupImage"("templateId", "variantColor");

-- CreateIndex
CREATE INDEX "MockupImage_templateId_idx" ON "MockupImage"("templateId");

-- CreateIndex
CREATE INDEX "PersonalizationOrder_shop_idx" ON "PersonalizationOrder"("shop");

-- CreateIndex
CREATE INDEX "PersonalizationOrder_shopifyOrderId_idx" ON "PersonalizationOrder"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "PersonalizationOrder_status_idx" ON "PersonalizationOrder"("status");

-- CreateIndex
CREATE INDEX "PersonalizationOrder_templateId_idx" ON "PersonalizationOrder"("templateId");

-- AddForeignKey
ALTER TABLE "TemplateLayer" ADD CONSTRAINT "TemplateLayer_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockupImage" ADD CONSTRAINT "MockupImage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
