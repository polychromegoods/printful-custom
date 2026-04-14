-- CreateTable
CREATE TABLE "PrintFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "data" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintFile_filename_key" ON "PrintFile"("filename");

-- CreateIndex
CREATE INDEX "PrintFile_filename_idx" ON "PrintFile"("filename");

-- CreateIndex
CREATE INDEX "PrintFile_orderId_idx" ON "PrintFile"("orderId");
