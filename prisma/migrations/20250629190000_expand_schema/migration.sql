-- Migration for expanded schema
-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Tenant_name_key" UNIQUE ("name")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApiKey_key_key" UNIQUE ("key"),
    CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

-- CreateTable
CREATE TABLE "Budget" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "amountUsd" DECIMAL(65,30) NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Budget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Budget_tenantId_idx" ON "Budget"("tenantId");

-- CreateTable
CREATE TABLE "PolicyBundle" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "wasmPath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyBundle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PolicyBundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PolicyBundle_tenantId_idx" ON "PolicyBundle"("tenantId");

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "thresholdUsd" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Alert_tenantId_idx" ON "Alert"("tenantId");

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- UsageLedger update
ALTER TABLE "UsageLedger" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "UsageLedger_tenantId_idx" ON "UsageLedger"("tenantId");

-- Seed default tenant
INSERT INTO "Tenant" ("name") VALUES ('public');
