-- Add rate limit column to Tenant
ALTER TABLE "Tenant" ADD COLUMN "rateLimitPerMin" INTEGER;
