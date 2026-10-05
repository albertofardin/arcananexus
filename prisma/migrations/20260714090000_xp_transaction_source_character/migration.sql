-- AlterTable
ALTER TABLE "XpTransaction" ADD COLUMN     "sourceCharacterId" INTEGER;

-- CreateIndex
CREATE INDEX "XpTransactionSourceCharacterId" ON "XpTransaction"("sourceCharacterId");

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
