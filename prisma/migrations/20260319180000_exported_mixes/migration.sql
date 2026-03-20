CREATE TABLE "exported_mixes" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "totalDurationSeconds" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT,
    "trackIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exported_mixes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exported_mixes_userId_idx" ON "exported_mixes"("userId");

ALTER TABLE "exported_mixes" ADD CONSTRAINT "exported_mixes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
