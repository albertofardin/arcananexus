-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('in_attesa', 'in_lavorazione', 'risolta', 'chiusa');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'support_new';
ALTER TYPE "NotificationType" ADD VALUE 'support_reply';

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "campaignId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "support_ticket" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'in_attesa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_message" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_ticket_userId_idx" ON "support_ticket"("userId");

-- CreateIndex
CREATE INDEX "support_ticket_status_idx" ON "support_ticket"("status");

-- CreateIndex
CREATE INDEX "support_message_ticketId_idx" ON "support_message"("ticketId");

-- AddForeignKey
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
