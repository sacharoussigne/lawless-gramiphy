-- DropForeignKey
ALTER TABLE "tracks" DROP CONSTRAINT "tracks_uploaderId_fkey";

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
