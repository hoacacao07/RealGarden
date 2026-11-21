-- AlterTable
ALTER TABLE "Garden" ADD COLUMN     "demo_forecast" TEXT,
ADD COLUMN     "morning_push_on" DATE;

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "plant_group_id" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "limits" JSONB NOT NULL,
    "weather_summary" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "changed_because" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareLog" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "plant_group_id" TEXT,
    "kind" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" TEXT,
    "amount_gal" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyPlan_garden_id_version_idx" ON "DailyPlan"("garden_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_garden_id_version_plant_group_id_date_key" ON "DailyPlan"("garden_id", "version", "plant_group_id", "date");

-- CreateIndex
CREATE INDEX "CareLog_garden_id_date_idx" ON "CareLog"("garden_id", "date");

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLog" ADD CONSTRAINT "CareLog_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

