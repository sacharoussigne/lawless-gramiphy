ALTER TABLE "tracks" ADD COLUMN "fileSizeMb" DOUBLE PRECISION;

UPDATE "tracks" SET "fileSizeMb" = ROUND((CAST("fileSizeBytes" AS DOUBLE PRECISION) / 1048576.0)::numeric, 4)
WHERE "fileSizeBytes" IS NOT NULL;

ALTER TABLE "tracks" DROP COLUMN "fileSizeBytes";
