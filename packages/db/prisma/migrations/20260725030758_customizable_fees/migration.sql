/*
  Warnings:

  - You are about to drop the column `optIn` on the `FeeType` table. All the data in the column will be lost.
  - You are about to drop the column `hasTransport` on the `Student` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FeeType" DROP COLUMN "optIn";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "hasTransport";
