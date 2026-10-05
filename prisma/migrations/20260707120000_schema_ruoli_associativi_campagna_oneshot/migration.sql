-- CreateEnum
CREATE TYPE "AssociationRole" AS ENUM ('registered', 'member', 'board', 'treasurer', 'vice_president', 'secretary', 'president');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'banned');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('campaign', 'oneShot');

-- AlterEnum
-- Ridefinisce i livelli di ruolo campagna a 3 livelli (era: admin, helper).
-- Mapping dati esistenti: admin -> head_master, helper -> supporter.
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('head_master', 'master', 'supporter');
ALTER TABLE "Grant" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'admin' THEN 'head_master'
    WHEN 'helper' THEN 'supporter'
    ELSE "role"::text
  END::"Role_new"
);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "associationRole" "AssociationRole" NOT NULL DEFAULT 'registered',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "type" "CampaignType" NOT NULL DEFAULT 'campaign';
