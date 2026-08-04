-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('TEACHER', 'TRANSPORT', 'OFFICE', 'SUPPORT', 'MANAGEMENT', 'VISITING');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'EXITED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'EARNED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'TEACHER',
    "designation" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "doj" TIMESTAMP(3) NOT NULL,
    "basic" INTEGER NOT NULL DEFAULT 0,
    "special" INTEGER NOT NULL DEFAULT 0,
    "pfEnabled" BOOLEAN NOT NULL DEFAULT true,
    "esiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ptEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tds" INTEGER NOT NULL DEFAULT 0,
    "advance" INTEGER NOT NULL DEFAULT 0,
    "clBalance" INTEGER NOT NULL DEFAULT 12,
    "slBalance" INTEGER NOT NULL DEFAULT 6,
    "elBalance" INTEGER NOT NULL DEFAULT 12,
    "licence" TEXT,
    "licExp" TIMESTAMP(3),
    "vehicle" TEXT,
    "route" TEXT,
    "accountName" TEXT NOT NULL DEFAULT '',
    "accountNo" TEXT NOT NULL DEFAULT '',
    "ifsc" TEXT NOT NULL DEFAULT '',
    "docs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "increments" JSONB NOT NULL DEFAULT '[]',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "exitDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "exitSettled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL DEFAULT 'CASUAL',
    "days" INTEGER NOT NULL DEFAULT 1,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payslipNo" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "lopDays" INTEGER NOT NULL DEFAULT 0,
    "mode" "ExpenseMode" NOT NULL DEFAULT 'BANK',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "basic" INTEGER NOT NULL,
    "da" INTEGER NOT NULL,
    "hra" INTEGER NOT NULL,
    "conveyance" INTEGER NOT NULL,
    "special" INTEGER NOT NULL,
    "gross" INTEGER NOT NULL,
    "lop" INTEGER NOT NULL,
    "pf" INTEGER NOT NULL,
    "esi" INTEGER NOT NULL,
    "pt" INTEGER NOT NULL,
    "tds" INTEGER NOT NULL,
    "advanceRecovered" INTEGER NOT NULL,
    "deductionsTotal" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "daPercent" INTEGER NOT NULL DEFAULT 30,
    "hraPercent" INTEGER NOT NULL DEFAULT 20,
    "pfPercent" INTEGER NOT NULL DEFAULT 12,
    "ptMonthly" INTEGER NOT NULL DEFAULT 20000,
    "conveyance" INTEGER NOT NULL DEFAULT 120000,
    "postToAccounts" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PayrollSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_organizationId_status_idx" ON "Employee"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_organizationId_code_key" ON "Employee"("organizationId", "code");

-- CreateIndex
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_idx" ON "AttendanceRecord"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_month_key" ON "AttendanceRecord"("employeeId", "month");

-- CreateIndex
CREATE INDEX "PayRun_organizationId_month_idx" ON "PayRun"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayRun_organizationId_payslipNo_key" ON "PayRun"("organizationId", "payslipNo");

-- CreateIndex
CREATE UNIQUE INDEX "PayRun_employeeId_month_key" ON "PayRun"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSetting_organizationId_key" ON "PayrollSetting"("organizationId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRun" ADD CONSTRAINT "PayRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRun" ADD CONSTRAINT "PayRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSetting" ADD CONSTRAINT "PayrollSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
