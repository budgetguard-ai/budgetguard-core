-- CreateTable
CREATE TABLE "UsageLedger" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "usd" DECIMAL(65,30) NOT NULL,
    "promptTok" INTEGER NOT NULL,
    "compTok" INTEGER NOT NULL,

    CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);
