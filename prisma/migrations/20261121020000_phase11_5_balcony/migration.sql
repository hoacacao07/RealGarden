-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "container_gal" DOUBLE PRECISION,
ADD COLUMN     "mount" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "balcony_l_ft" DOUBLE PRECISION,
ADD COLUMN     "balcony_w_ft" DOUBLE PRECISION,
ADD COLUMN     "facing_deg" DOUBLE PRECISION,
ADD COLUMN     "floor_level" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'yard',
ADD COLUMN     "overhang_depth_ft" DOUBLE PRECISION,
ADD COLUMN     "overhang_height_ft" DOUBLE PRECISION,
ADD COLUMN     "railing_ft" DOUBLE PRECISION,
ADD COLUMN     "rules" JSONB;

