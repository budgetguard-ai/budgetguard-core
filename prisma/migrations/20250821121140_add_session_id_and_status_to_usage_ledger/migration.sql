-- AlterTable
ALTER TABLE "UsageLedger" ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'success';

-- CreateIndex
CREATE INDEX "UsageLedger_status_idx" ON "UsageLedger"("status");

-- CreateIndex
CREATE INDEX "UsageLedger_sessionId_idx" ON "UsageLedger"("sessionId");
