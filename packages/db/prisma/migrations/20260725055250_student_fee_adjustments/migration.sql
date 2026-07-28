-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "discountValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "feeExempt" BOOLEAN NOT NULL DEFAULT false;
