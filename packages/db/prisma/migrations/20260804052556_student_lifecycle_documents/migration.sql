-- CreateEnum
CREATE TYPE "StudentEnrollment" AS ENUM ('APPLICANT', 'ACTIVE', 'TC_ISSUED', 'ALUMNI');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "enrollmentStatus" "StudentEnrollment" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "exitReason" TEXT NOT NULL DEFAULT '';
