-- Org-wide transport fare settings (stop vs distance, per-km rates).
CREATE TABLE "TransportSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fareBasis" TEXT NOT NULL DEFAULT 'STOP',
    "ratePerKmBoth" INTEGER NOT NULL DEFAULT 0,
    "ratePerKmOne" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TransportSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransportSetting_organizationId_key" ON "TransportSetting"("organizationId");
ALTER TABLE "TransportSetting" ADD CONSTRAINT "TransportSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
