-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "awc" DOUBLE PRECISION,
ADD COLUMN     "clay_pct" DOUBLE PRECISION,
ADD COLUMN     "component" TEXT,
ADD COLUMN     "drainage_class" TEXT,
ADD COLUMN     "is_fill" BOOLEAN,
ADD COLUMN     "om_pct" DOUBLE PRECISION,
ADD COLUMN     "ph" DOUBLE PRECISION,
ADD COLUMN     "sand_pct" DOUBLE PRECISION,
ADD COLUMN     "soil_source" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "survey_name" TEXT;

