-- CreateEnum
CREATE TYPE "VoucherReason" AS ENUM ('grant', 'refund', 'payment');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'voucher';

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" "VoucherReason" NOT NULL,
    "eventId" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voucher_userId_year_idx" ON "Voucher"("userId", "year");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
