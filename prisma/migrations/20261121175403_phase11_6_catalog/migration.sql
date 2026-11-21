-- AlterTable
ALTER TABLE "Garden" ADD COLUMN     "hardiness_zone" TEXT,
ADD COLUMN     "prefer_natives" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "themes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "HardinessZone" (
    "zip" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "temperature_range" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardinessZone_pkey" PRIMARY KEY ("zip")
);
