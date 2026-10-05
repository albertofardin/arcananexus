-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "authorUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
