-- AlterEnum
ALTER TYPE "FeePeriod" ADD VALUE 'DUE_DATE';

-- AlterTable
ALTER TABLE "FeeType" ADD COLUMN     "dueDate" TIMESTAMP(3);
