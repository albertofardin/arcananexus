-- CreateTable
CREATE TABLE "CharacterTalentUnlock" (
    "id" SERIAL NOT NULL,
    "characterId" INTEGER NOT NULL,
    "referenceDataId" INTEGER NOT NULL,
    "unlockedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterTalentUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterTalentUnlockCharacterId" ON "CharacterTalentUnlock"("characterId");

-- CreateIndex
CREATE INDEX "CharacterTalentUnlockReferenceDataId" ON "CharacterTalentUnlock"("referenceDataId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterTalentUnlock_characterId_referenceDataId_key" ON "CharacterTalentUnlock"("characterId", "referenceDataId");

-- AddForeignKey
ALTER TABLE "CharacterTalentUnlock" ADD CONSTRAINT "CharacterTalentUnlock_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTalentUnlock" ADD CONSTRAINT "CharacterTalentUnlock_referenceDataId_fkey" FOREIGN KEY ("referenceDataId") REFERENCES "ReferenceData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTalentUnlock" ADD CONSTRAINT "CharacterTalentUnlock_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
