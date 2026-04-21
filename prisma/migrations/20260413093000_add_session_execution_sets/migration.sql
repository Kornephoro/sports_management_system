-- CreateEnum
CREATE TYPE "SessionExecutionSetStatus" AS ENUM ('pending', 'completed', 'skipped', 'extra');

-- CreateTable
CREATE TABLE "SessionExecutionSet" (
    "id" UUID NOT NULL,
    "session_execution_id" UUID NOT NULL,
    "planned_unit_id" UUID,
    "set_index" INTEGER NOT NULL,
    "planned_set_type" TEXT,
    "planned_reps" INTEGER,
    "planned_weight" DECIMAL(10,3),
    "planned_rpe" DECIMAL(3,1),
    "planned_rest_seconds" INTEGER,
    "planned_tempo" TEXT,
    "actual_reps" INTEGER,
    "actual_weight" DECIMAL(10,3),
    "actual_rpe" DECIMAL(3,1),
    "actual_rest_seconds" INTEGER,
    "actual_tempo" TEXT,
    "status" "SessionExecutionSetStatus" NOT NULL,
    "is_extra_set" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SessionExecutionSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionExecutionSet_session_execution_id_planned_unit_id_set_index_key" ON "SessionExecutionSet"("session_execution_id", "planned_unit_id", "set_index");

-- CreateIndex
CREATE INDEX "SessionExecutionSet_session_execution_id_idx" ON "SessionExecutionSet"("session_execution_id");

-- CreateIndex
CREATE INDEX "SessionExecutionSet_session_execution_id_planned_unit_id_idx" ON "SessionExecutionSet"("session_execution_id", "planned_unit_id");

-- CreateIndex
CREATE INDEX "SessionExecutionSet_planned_unit_id_idx" ON "SessionExecutionSet"("planned_unit_id");

-- AddForeignKey
ALTER TABLE "SessionExecutionSet" ADD CONSTRAINT "SessionExecutionSet_session_execution_id_fkey" FOREIGN KEY ("session_execution_id") REFERENCES "SessionExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExecutionSet" ADD CONSTRAINT "SessionExecutionSet_planned_unit_id_fkey" FOREIGN KEY ("planned_unit_id") REFERENCES "PlannedUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
