-- Replace isPersistent flag by expiresAt timestamp
ALTER TABLE "mixes" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "mixes" DROP COLUMN IF EXISTS "isPersistent";

-- Backfill existing rows: default to 24h after creation
UPDATE "mixes"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours'
WHERE "expiresAt" IS NULL;

