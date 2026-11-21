-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "sent" TIMESTAMP(3),
    "event" TEXT NOT NULL,
    "severity" TEXT,
    "urgency" TEXT,
    "certainty" TEXT,
    "headline" TEXT NOT NULL,
    "instruction" TEXT,
    "onset" TIMESTAMP(3),
    "ends" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "alert_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "closed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "garden_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "feedback" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_garden_id_active_idx" ON "Alert"("garden_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_garden_id_dedupe_key_key" ON "Alert"("garden_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "Task_garden_id_done_idx" ON "Task"("garden_id", "done");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "ChatMessage_garden_id_created_at_idx" ON "ChatMessage"("garden_id", "created_at");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_garden_id_fkey" FOREIGN KEY ("garden_id") REFERENCES "Garden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
