-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "common_name" TEXT NOT NULL,
    "scientific_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "invasive_status" TEXT NOT NULL,
    "regions" TEXT[],
    "light" TEXT[],
    "salt_tolerance" TEXT NOT NULL,
    "water_need" TEXT NOT NULL,
    "attrs" JSONB NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "zip" TEXT,
    "region" TEXT NOT NULL,
    "sun" TEXT NOT NULL,
    "soil" TEXT NOT NULL,
    "drainage" TEXT NOT NULL,
    "coastal_distance_mi" DOUBLE PRECISION NOT NULL,
    "area_sqft" DOUBLE PRECISION NOT NULL,
    "native_target_pct" DOUBLE PRECISION,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Garden" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT,
    "planted_on" DATE NOT NULL,
    "canvas_w_ft" DOUBLE PRECISION NOT NULL,
    "canvas_h_ft" DOUBLE PRECISION NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Garden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "irrigation" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "zone_id" TEXT,
    "x_ft" DOUBLE PRECISION NOT NULL,
    "y_ft" DOUBLE PRECISION NOT NULL,
    "group_id" TEXT,
    "planted_on" DATE NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkin" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "placement_id" TEXT,
    "image_url" TEXT NOT NULL,
    "identify" JSONB NOT NULL,
    "matched_plant_id" TEXT,
    "diagnosis" JSONB NOT NULL,
    "height_ft" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "issue_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "host_plant_id" TEXT,
    "lat_rounded" DOUBLE PRECISION NOT NULL,
    "lon_rounded" DOUBLE PRECISION NOT NULL,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkin_id" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plant_category_idx" ON "Plant"("category");

-- CreateIndex
CREATE INDEX "Plant_origin_idx" ON "Plant"("origin");

-- CreateIndex
CREATE INDEX "Placement_garden_id_idx" ON "Placement"("garden_id");

-- CreateIndex
CREATE INDEX "Checkin_garden_id_idx" ON "Checkin"("garden_id");

-- CreateIndex
CREATE INDEX "Report_created_at_idx" ON "Report"("created_at");

-- AddForeignKey
ALTER TABLE "Garden" ADD CONSTRAINT "Garden_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_matched_plant_id_fkey" FOREIGN KEY ("matched_plant_id") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_host_plant_id_fkey" FOREIGN KEY ("host_plant_id") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "Checkin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
