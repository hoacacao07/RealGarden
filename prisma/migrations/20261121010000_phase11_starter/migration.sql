-- AlterTable
ALTER TABLE "Garden" ADD COLUMN     "budget_usd" DOUBLE PRECISION,
ADD COLUMN     "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hours_week" TEXT,
ADD COLUMN     "space" TEXT,
ADD COLUMN     "target_harvest" DATE;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "bed" TEXT,
ADD COLUMN     "depth_in" DOUBLE PRECISION,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'landscape';

