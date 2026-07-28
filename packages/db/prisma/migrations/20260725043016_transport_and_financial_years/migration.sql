-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BUS', 'VAN');

-- CreateEnum
CREATE TYPE "TransportShift" AS ENUM ('BOTH', 'MORNING', 'EVENING');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "transportShift" "TransportShift",
ADD COLUMN     "transportStopId" TEXT;

-- CreateTable
CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleNumber" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'BUS',
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportStop" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bothWayFare" INTEGER NOT NULL DEFAULT 0,
    "oneWayFare" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportRoute_organizationId_academicYearId_idx" ON "TransportRoute"("organizationId", "academicYearId");

-- CreateIndex
CREATE INDEX "TransportStop_routeId_idx" ON "TransportStop"("routeId");

-- CreateIndex
CREATE INDEX "TransportStop_organizationId_idx" ON "TransportStop"("organizationId");

-- CreateIndex
CREATE INDEX "Student_transportStopId_idx" ON "Student"("transportStopId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_transportStopId_fkey" FOREIGN KEY ("transportStopId") REFERENCES "TransportStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
