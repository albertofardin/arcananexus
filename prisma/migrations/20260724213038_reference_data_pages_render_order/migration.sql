-- AlterEnum
ALTER TYPE "DataTypeRender" ADD VALUE 'pages';

-- AlterTable
ALTER TABLE "ReferenceData" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
