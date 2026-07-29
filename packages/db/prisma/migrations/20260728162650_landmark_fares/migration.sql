-- Landmarks now carry their own fares: [{ name, bothWayFare, oneWayFare }].
ALTER TABLE "TransportStop" DROP COLUMN IF EXISTS "landmarks";
ALTER TABLE "TransportStop" ADD COLUMN "landmarks" JSONB NOT NULL DEFAULT '[]';
