/*
  Warnings:

  - You are about to drop the `Data` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "DataTypeKind" AS ENUM ('generic', 'race', 'talent', 'religion', 'faction', 'document');

-- CreateEnum
CREATE TYPE "DataCardinality" AS ENUM ('single', 'multi');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('requires', 'blocks');

-- CreateEnum
CREATE TYPE "DataTypeRender" AS ENUM ('catalog', 'documents');

-- CreateEnum
CREATE TYPE "XpReason" AS ENUM ('initialGrant', 'purchase', 'refund', 'deathRecovery', 'adjustment');

-- DropForeignKey
ALTER TABLE "Data" DROP CONSTRAINT "Data_characterId_fkey";

-- DropForeignKey
ALTER TABLE "Data" DROP CONSTRAINT "Data_dataTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Data" DROP CONSTRAINT "Data_userId_fkey";

-- DropForeignKey
ALTER TABLE "Data" DROP CONSTRAINT "Data_visibilityConditionId_fkey";

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "eventId" INTEGER,
ALTER COLUMN "creationDate" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "DataType" ADD COLUMN     "cardinality" "DataCardinality" NOT NULL DEFAULT 'multi',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "kind" "DataTypeKind" NOT NULL DEFAULT 'generic',
ADD COLUMN     "playerAssignable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "renderAs" "DataTypeRender" NOT NULL DEFAULT 'catalog',
ADD COLUMN     "showInSidebar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sidebarOrder" INTEGER;

-- DropTable
DROP TABLE "Data";

-- CreateTable
CREATE TABLE "ReferenceData" (
    "id" SERIAL NOT NULL,
    "dataTypeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flags" JSONB,
    "visibility" "DataVisibility" NOT NULL DEFAULT 'hidden',
    "visibilityConditionId" INTEGER,
    "fileUrl" TEXT,
    "externalId" TEXT,

    CONSTRAINT "ReferenceData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterData" (
    "id" SERIAL NOT NULL,
    "characterId" INTEGER,
    "userId" TEXT,
    "referenceDataId" INTEGER NOT NULL,
    "dataTypeId" INTEGER NOT NULL,
    "value" JSONB,
    "visibility" "DataVisibility" NOT NULL DEFAULT 'hidden',
    "visibilityConditionId" INTEGER,
    "grantedById" TEXT,
    "grantedByOverride" BOOLEAN NOT NULL DEFAULT false,
    "actionId" INTEGER,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequirement" (
    "id" SERIAL NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "requiredDefinitionId" INTEGER NOT NULL,
    "type" "RequirementType" NOT NULL,

    CONSTRAINT "DataRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpTransaction" (
    "id" SERIAL NOT NULL,
    "characterId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "XpReason" NOT NULL,
    "referenceDataId" INTEGER,
    "actionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenceDataDataTypeId" ON "ReferenceData"("dataTypeId");

-- CreateIndex
CREATE INDEX "CharacterDataCharacterId" ON "CharacterData"("characterId");

-- CreateIndex
CREATE INDEX "CharacterDataUserId" ON "CharacterData"("userId");

-- CreateIndex
CREATE INDEX "CharacterDataReferenceDataId" ON "CharacterData"("referenceDataId");

-- CreateIndex
CREATE INDEX "CharacterDataDataTypeId" ON "CharacterData"("dataTypeId");

-- CreateIndex
CREATE INDEX "DataRequirementDefinitionId" ON "DataRequirement"("definitionId");

-- CreateIndex
CREATE INDEX "DataRequirementRequiredDefinitionId" ON "DataRequirement"("requiredDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "DataRequirement_definitionId_requiredDefinitionId_type_key" ON "DataRequirement"("definitionId", "requiredDefinitionId", "type");

-- CreateIndex
CREATE INDEX "XpTransactionCharacterId" ON "XpTransaction"("characterId");

-- CreateIndex
CREATE INDEX "ActionEventId" ON "Action"("eventId");

-- AddForeignKey
ALTER TABLE "ReferenceData" ADD CONSTRAINT "ReferenceData_dataTypeId_fkey" FOREIGN KEY ("dataTypeId") REFERENCES "DataType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceData" ADD CONSTRAINT "ReferenceData_visibilityConditionId_fkey" FOREIGN KEY ("visibilityConditionId") REFERENCES "VisibilityCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_referenceDataId_fkey" FOREIGN KEY ("referenceDataId") REFERENCES "ReferenceData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_dataTypeId_fkey" FOREIGN KEY ("dataTypeId") REFERENCES "DataType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_visibilityConditionId_fkey" FOREIGN KEY ("visibilityConditionId") REFERENCES "VisibilityCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterData" ADD CONSTRAINT "CharacterData_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequirement" ADD CONSTRAINT "DataRequirement_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReferenceData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequirement" ADD CONSTRAINT "DataRequirement_requiredDefinitionId_fkey" FOREIGN KEY ("requiredDefinitionId") REFERENCES "ReferenceData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_referenceDataId_fkey" FOREIGN KEY ("referenceDataId") REFERENCES "ReferenceData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
