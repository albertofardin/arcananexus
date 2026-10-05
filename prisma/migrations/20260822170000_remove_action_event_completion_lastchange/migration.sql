-- DropForeignKey
ALTER TABLE "Action" DROP CONSTRAINT "Action_eventId_fkey";

-- DropIndex
DROP INDEX "ActionEventId";

-- AlterTable
ALTER TABLE "Action" DROP COLUMN "completionDate",
DROP COLUMN "eventId",
DROP COLUMN "lastChangeDate";
