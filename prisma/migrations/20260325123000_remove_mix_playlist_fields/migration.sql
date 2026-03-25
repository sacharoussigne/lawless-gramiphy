-- Drop playlist column and related constraints/indexes from mixes
ALTER TABLE "mixes" DROP CONSTRAINT IF EXISTS "mixes_playlistId_fkey";
DROP INDEX IF EXISTS "mixes_playlistId_idx";
ALTER TABLE "mixes" DROP COLUMN IF EXISTS "playlistId";

