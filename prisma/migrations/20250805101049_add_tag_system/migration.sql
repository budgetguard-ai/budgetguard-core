-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "path" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagBudget" (
    "id" SERIAL NOT NULL,
    "tagId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "amountUsd" DECIMAL(65,30) NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "alertThresholds" JSONB,
    "inheritanceMode" TEXT NOT NULL DEFAULT 'LENIENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestTag" (
    "id" BIGSERIAL NOT NULL,
    "usageLedgerId" BIGINT NOT NULL,
    "tagId" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "assignedBy" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "RequestTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaggingRule" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaggingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_path_idx" ON "Tag"("tenantId", "path");

-- CreateIndex
CREATE INDEX "Tag_tenantId_isActive_idx" ON "Tag"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_path_key" ON "Tag"("tenantId", "path");

-- CreateIndex
CREATE INDEX "TagBudget_tagId_idx" ON "TagBudget"("tagId");

-- CreateIndex
CREATE INDEX "TagBudget_tagId_isActive_idx" ON "TagBudget"("tagId", "isActive");

-- CreateIndex
CREATE INDEX "RequestTag_tagId_idx" ON "RequestTag"("tagId");

-- CreateIndex
CREATE INDEX "RequestTag_usageLedgerId_idx" ON "RequestTag"("usageLedgerId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestTag_usageLedgerId_tagId_key" ON "RequestTag"("usageLedgerId", "tagId");

-- CreateIndex
CREATE INDEX "TaggingRule_tenantId_isActive_idx" ON "TaggingRule"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaggingRule_tenantId_name_key" ON "TaggingRule"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagBudget" ADD CONSTRAINT "TagBudget_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTag" ADD CONSTRAINT "RequestTag_usageLedgerId_fkey" FOREIGN KEY ("usageLedgerId") REFERENCES "UsageLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestTag" ADD CONSTRAINT "RequestTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaggingRule" ADD CONSTRAINT "TaggingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
