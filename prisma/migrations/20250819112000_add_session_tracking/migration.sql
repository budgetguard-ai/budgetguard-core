-- AddColumn: Add defaultSessionBudgetUsd to Tenant table
ALTER TABLE "Tenant" ADD COLUMN "defaultSessionBudgetUsd" DECIMAL(12,6);

-- CreateTable: Add Session table
CREATE TABLE "Session" (
    "sessionId" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT,
    "path" TEXT,
    "effectiveBudgetUsd" DECIMAL(12,6),
    "currentCostUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sessionId")
);

-- Add Tag session budget column
ALTER TABLE "Tag" ADD COLUMN "sessionBudgetUsd" DECIMAL(12,6);

-- CreateTable: Add SessionTags many-to-many relation
CREATE TABLE "_SessionTags" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "Session_tenantId_idx" ON "Session"("tenantId");

-- CreateIndex
CREATE INDEX "Session_sessionId_idx" ON "Session"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "_SessionTags_AB_unique" ON "_SessionTags"("A", "B");

-- CreateIndex
CREATE INDEX "_SessionTags_B_index" ON "_SessionTags"("B");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SessionTags" ADD CONSTRAINT "_SessionTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Session"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SessionTags" ADD CONSTRAINT "_SessionTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;