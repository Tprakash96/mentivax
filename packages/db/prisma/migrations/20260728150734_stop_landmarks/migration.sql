-- Replace single landmark with a list of pickup landmarks per stop.
ALTER TABLE "TransportStop" DROP COLUMN IF EXISTS "landmark";
ALTER TABLE "TransportStop" ADD COLUMN "landmarks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
