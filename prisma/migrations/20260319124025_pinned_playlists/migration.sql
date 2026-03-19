-- CreateTable
CREATE TABLE "pinned_playlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinned_playlists_userId_idx" ON "pinned_playlists"("userId");

-- CreateIndex
CREATE INDEX "pinned_playlists_playlistId_idx" ON "pinned_playlists"("playlistId");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_playlists_userId_playlistId_key" ON "pinned_playlists"("userId", "playlistId");

-- AddForeignKey
ALTER TABLE "pinned_playlists" ADD CONSTRAINT "pinned_playlists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_playlists" ADD CONSTRAINT "pinned_playlists_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
