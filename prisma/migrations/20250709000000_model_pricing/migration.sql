-- Add ModelPricing table
CREATE TABLE "ModelPricing" (
    "id" SERIAL NOT NULL,
    "model" TEXT NOT NULL,
    "versionTag" TEXT NOT NULL,
    "inputPrice" DECIMAL(65,30) NOT NULL,
    "cachedInputPrice" DECIMAL(65,30) NOT NULL,
    "outputPrice" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ModelPricing_model_key" UNIQUE ("model")
);
