-- Rename exported mixes table
ALTER TABLE "exported_mixes" RENAME TO "mixes";

-- Optional: keep index names consistent
ALTER INDEX IF EXISTS "exported_mixes_userId_idx" RENAME TO "mixes_userId_idx";

-- Add persistence flag
ALTER TABLE "mixes" ADD COLUMN "isPersistent" BOOLEAN NOT NULL DEFAULT FALSE;

-- Add FK to playlists (previously just a scalar)
CREATE INDEX IF NOT EXISTS "mixes_playlistId_idx" ON "mixes"("playlistId");
ALTER TABLE "mixes"
  ADD CONSTRAINT "mixes_playlistId_fkey"
  FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create join table for tracks in a mix (ordered)
CREATE TABLE "mix_tracks" (
    "id" TEXT NOT NULL,
    "mixId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mix_tracks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mix_tracks_mixId_trackId_key" ON "mix_tracks"("mixId", "trackId");
CREATE INDEX "mix_tracks_mixId_idx" ON "mix_tracks"("mixId");
CREATE INDEX "mix_tracks_trackId_idx" ON "mix_tracks"("trackId");

ALTER TABLE "mix_tracks"
  ADD CONSTRAINT "mix_tracks_mixId_fkey"
  FOREIGN KEY ("mixId") REFERENCES "mixes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mix_tracks"
  ADD CONSTRAINT "mix_tracks_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill join table from previous trackIds array
INSERT INTO "mix_tracks" ("id", "mixId", "trackId", "position")
SELECT
  ("mixes"."id" || '_' || (t.ord - 1))::TEXT AS "id",
  "mixes"."id" AS "mixId",
  t."trackId" AS "trackId",
  (t.ord - 1)::INTEGER AS "position"
FROM "mixes"
JOIN LATERAL unnest(COALESCE("mixes"."trackIds", ARRAY[]::TEXT[])) WITH ORDINALITY AS t("trackId", ord) ON TRUE
JOIN "tracks" ON "tracks"."id" = t."trackId";

-- Drop old array column
ALTER TABLE "mixes" DROP COLUMN "trackIds";
