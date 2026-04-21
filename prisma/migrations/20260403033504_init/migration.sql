-- CreateEnum
CREATE TYPE "SportType" AS ENUM ('strength', 'hypertrophy', 'running', 'swimming', 'racket', 'functional', 'mixed');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('strength', 'hypertrophy', 'fat_loss', 'endurance', 'performance', 'health', 'habit', 'return_to_training');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('accumulation', 'intensification', 'peaking', 'deload', 'maintenance', 'technique', 'base', 'return_to_training');

-- CreateEnum
CREATE TYPE "SessionCategory" AS ENUM ('strength', 'hypertrophy', 'conditioning', 'endurance', 'skill', 'mixed', 'recovery', 'mobility');

-- CreateEnum
CREATE TYPE "UnitRole" AS ENUM ('main', 'secondary', 'accessory', 'skill', 'conditioning', 'warmup', 'cooldown', 'mobility', 'prehab');

-- CreateEnum
CREATE TYPE "UnitCategory" AS ENUM ('exercise', 'intervals', 'continuous', 'circuit', 'wod', 'drill', 'test', 'mobility', 'stability', 'activation');

-- CreateEnum
CREATE TYPE "ProgressionFamily" AS ENUM ('strict_load', 'threshold', 'exposure', 'performance', 'autoregulated');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('planned', 'ready', 'completed', 'partial', 'skipped', 'canceled');

-- CreateEnum
CREATE TYPE "UnitState" AS ENUM ('planned', 'completed', 'partial', 'skipped', 'failed', 'replaced', 'dropped');

-- CreateEnum
CREATE TYPE "ObservationDomain" AS ENUM ('body', 'recovery', 'nutrition', 'health', 'lifestyle', 'rehab');

-- CreateEnum
CREATE TYPE "EvidenceParseStatus" AS ENUM ('pending', 'parsed', 'needs_review', 'confirmed', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "ConstraintStatus" AS ENUM ('active', 'monitoring', 'resolved');

-- CreateEnum
CREATE TYPE "ConstraintDomain" AS ENUM ('mobility', 'stability', 'pain', 'injury', 'load_tolerance', 'return_to_training');

-- CreateEnum
CREATE TYPE "InjuryStatus" AS ENUM ('acute', 'monitoring', 'recovering', 'resolved', 'recurring');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('training_cycle', 'maintenance', 'travel', 'return', 'prep');

-- CreateEnum
CREATE TYPE "RecoveryPolicyType" AS ENUM ('preserve_order', 'preserve_calendar', 'smart_merge', 'manual');

-- CreateEnum
CREATE TYPE "ProgramSource" AS ENUM ('manual', 'ai_generated', 'template', 'imported');

-- CreateEnum
CREATE TYPE "MicrocycleAnchor" AS ENUM ('fixed_weekday', 'ordered_rotation', 'flexible');

-- CreateEnum
CREATE TYPE "FatigueCost" AS ENUM ('low', 'medium', 'high', 'very_high');

-- CreateEnum
CREATE TYPE "SchedulingPolicyType" AS ENUM ('fixed', 'ordered_rotation', 'flexible_window');

-- CreateEnum
CREATE TYPE "AdjustmentPolicyType" AS ENUM ('always', 'rotating_pool', 'gated', 'manual');

-- CreateEnum
CREATE TYPE "PrescriptionType" AS ENUM ('sets_reps', 'sets_time', 'intervals', 'distance_time', 'rounds', 'amrap', 'emom', 'freeform');

-- CreateEnum
CREATE TYPE "ProgressTrackStatus" AS ENUM ('active', 'paused', 'reset', 'completed');

-- CreateEnum
CREATE TYPE "PlannedSessionGenerationReason" AS ENUM ('initial_generation', 'rescheduled', 'manual_add', 'adapted');

-- CreateEnum
CREATE TYPE "SessionExecutionCompletionStatus" AS ENUM ('completed', 'partial', 'skipped', 'aborted', 'extra');

-- CreateEnum
CREATE TYPE "UnitExecutionCompletionStatus" AS ENUM ('completed', 'partial', 'skipped', 'failed', 'replaced');

-- CreateEnum
CREATE TYPE "ObservationSource" AS ENUM ('manual', 'device', 'image_parse', 'import');

-- CreateEnum
CREATE TYPE "EvidenceAssetType" AS ENUM ('image', 'screenshot', 'pdf', 'other');

-- CreateEnum
CREATE TYPE "EvidenceDomainHint" AS ENUM ('training', 'nutrition', 'body_metric', 'health', 'rehab', 'other');

-- CreateEnum
CREATE TYPE "EvidenceLinkedEntityType" AS ENUM ('session_execution', 'unit_execution', 'observation', 'injury_incident', 'none');

-- CreateEnum
CREATE TYPE "ConstraintSeverity" AS ENUM ('low', 'moderate', 'high');

-- CreateEnum
CREATE TYPE "ConstraintDetectedFrom" AS ENUM ('manual', 'coach', 'system_inference', 'image_parse');

-- CreateEnum
CREATE TYPE "InjuryIncidentType" AS ENUM ('pain', 'strain', 'sprain', 'overuse', 'mobility_loss', 'other');

-- CreateEnum
CREATE TYPE "ReturnReadinessStatus" AS ENUM ('not_ready', 'limited', 'graded_return', 'ready');

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal_type" "GoalType" NOT NULL,
    "primary_sport" "SportType" NOT NULL,
    "status" "ProgramStatus" NOT NULL,
    "priority" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "target_date" DATE,
    "target_payload" JSONB NOT NULL,
    "success_metrics" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sport_type" "SportType" NOT NULL,
    "program_type" "ProgramType" NOT NULL,
    "status" "ProgramStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "parent_program_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "duration_weeks" INTEGER,
    "weekly_frequency_target" INTEGER,
    "weekly_exposure_mix" JSONB NOT NULL,
    "default_recovery_policy_type" "RecoveryPolicyType" NOT NULL,
    "default_recovery_policy_config" JSONB NOT NULL,
    "default_adaptation_policy_config" JSONB NOT NULL,
    "constraint_aware_planning" BOOLEAN NOT NULL,
    "source" "ProgramSource" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "block_type" "BlockType" NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "objective_summary" TEXT,
    "volume_target" JSONB NOT NULL,
    "intensity_target" JSONB NOT NULL,
    "progression_focus" JSONB NOT NULL,
    "entry_criteria" JSONB,
    "exit_criteria" JSONB,
    "recovery_overrides" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTemplate" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence_in_microcycle" INTEGER NOT NULL,
    "microcycle_anchor" "MicrocycleAnchor" NOT NULL,
    "preferred_weekday" INTEGER,
    "sport_type" "SportType" NOT NULL,
    "session_category" "SessionCategory" NOT NULL,
    "theme_tags" JSONB NOT NULL,
    "objective_summary" TEXT,
    "expected_duration_min" INTEGER,
    "fatigue_cost" "FatigueCost" NOT NULL,
    "priority" INTEGER NOT NULL,
    "scheduling_policy_type" "SchedulingPolicyType" NOT NULL,
    "scheduling_policy_config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingUnitTemplate" (
    "id" UUID NOT NULL,
    "session_template_id" UUID NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "sport_type" "SportType" NOT NULL,
    "unit_role" "UnitRole" NOT NULL,
    "unit_category" "UnitCategory" NOT NULL,
    "movement_pattern_tags" JSONB NOT NULL,
    "muscle_tags" JSONB NOT NULL,
    "capability_tags" JSONB NOT NULL,
    "function_support_tags" JSONB NOT NULL,
    "fatigue_tags" JSONB NOT NULL,
    "conflict_tags" JSONB NOT NULL,
    "contraindication_tags" JSONB NOT NULL,
    "prerequisite_function_tags" JSONB NOT NULL,
    "is_key_unit" BOOLEAN NOT NULL,
    "optional" BOOLEAN NOT NULL,
    "priority_score_base" DECIMAL(6,2) NOT NULL,
    "progress_track_key" TEXT NOT NULL,
    "progression_family" "ProgressionFamily" NOT NULL,
    "progression_policy_type" TEXT NOT NULL,
    "progression_policy_config" JSONB NOT NULL,
    "adjustment_policy_type" "AdjustmentPolicyType" NOT NULL,
    "adjustment_policy_config" JSONB NOT NULL,
    "prescription_type" "PrescriptionType" NOT NULL,
    "prescription_payload" JSONB NOT NULL,
    "success_criteria" JSONB NOT NULL,
    "min_spacing_sessions" INTEGER,
    "adjustment_cooldown_exposures" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TrainingUnitTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressTrack" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "program_id" UUID,
    "track_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport_type" "SportType" NOT NULL,
    "progression_family" "ProgressionFamily" NOT NULL,
    "progression_policy_type" TEXT NOT NULL,
    "progression_policy_config" JSONB NOT NULL,
    "current_state" JSONB NOT NULL,
    "exposure_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL,
    "failure_count" INTEGER NOT NULL,
    "progression_count" INTEGER NOT NULL,
    "last_exposure_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "last_progression_at" TIMESTAMPTZ(6),
    "status" "ProgressTrackStatus" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProgressTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedSession" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "block_id" UUID,
    "session_template_id" UUID,
    "sequence_index" INTEGER NOT NULL,
    "session_date" DATE NOT NULL,
    "status" "SessionState" NOT NULL,
    "generation_reason" "PlannedSessionGenerationReason" NOT NULL,
    "source_session_id" UUID,
    "planned_start_at" TIMESTAMPTZ(6),
    "planned_duration_min" INTEGER,
    "objective_summary" TEXT,
    "adaptation_snapshot" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlannedSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedUnit" (
    "id" UUID NOT NULL,
    "planned_session_id" UUID NOT NULL,
    "unit_template_id" UUID,
    "sequence_no" INTEGER NOT NULL,
    "status" "UnitState" NOT NULL,
    "selected_exercise_name" TEXT,
    "selected_variant_tags" JSONB,
    "progress_track_id" UUID,
    "target_payload" JSONB NOT NULL,
    "progression_snapshot" JSONB,
    "constraint_snapshot" JSONB,
    "required" BOOLEAN NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlannedUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionExecution" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "planned_session_id" UUID,
    "program_id" UUID,
    "block_id" UUID,
    "performed_at" TIMESTAMPTZ(6) NOT NULL,
    "completion_status" "SessionExecutionCompletionStatus" NOT NULL,
    "actual_duration_min" INTEGER,
    "session_rpe" DECIMAL(3,1),
    "pre_session_state" JSONB,
    "post_session_state" JSONB,
    "deviation_reason" TEXT,
    "notes" TEXT,
    "imported_from_evidence_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SessionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitExecution" (
    "id" UUID NOT NULL,
    "session_execution_id" UUID NOT NULL,
    "planned_unit_id" UUID,
    "unit_template_id" UUID,
    "progress_track_id" UUID,
    "sequence_no" INTEGER NOT NULL,
    "completion_status" "UnitExecutionCompletionStatus" NOT NULL,
    "actual_unit_name" TEXT,
    "actual_payload" JSONB NOT NULL,
    "set_logs" JSONB,
    "result_flags" JSONB,
    "symptom_tags" JSONB,
    "perceived_exertion" DECIMAL(3,1),
    "pain_score" INTEGER,
    "auto_progression_candidate" BOOLEAN,
    "notes" TEXT,
    "imported_from_evidence_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UnitExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "observation_domain" "ObservationDomain" NOT NULL,
    "metric_key" TEXT NOT NULL,
    "value_numeric" DECIMAL(10,3),
    "value_text" TEXT,
    "value_json" JSONB,
    "unit" TEXT,
    "source" "ObservationSource" NOT NULL,
    "confidence" DECIMAL(4,3),
    "linked_program_id" UUID,
    "linked_session_execution_id" UUID,
    "evidence_asset_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceAsset" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_type" "EvidenceAssetType" NOT NULL,
    "source_app" TEXT,
    "domain_hint" "EvidenceDomainHint" NOT NULL,
    "captured_at" TIMESTAMPTZ(6),
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL,
    "storage_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_hash" TEXT,
    "parse_status" "EvidenceParseStatus" NOT NULL,
    "parser_version" TEXT,
    "parsed_summary" JSONB,
    "confidence" DECIMAL(4,3),
    "linked_entity_type" "EvidenceLinkedEntityType",
    "linked_entity_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EvidenceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstraintProfile" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ConstraintStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "domain" "ConstraintDomain" NOT NULL,
    "body_region_tags" JSONB NOT NULL,
    "movement_tags" JSONB NOT NULL,
    "severity" "ConstraintSeverity" NOT NULL,
    "description" TEXT,
    "symptom_summary" TEXT,
    "restriction_rules" JSONB NOT NULL,
    "training_implications" JSONB NOT NULL,
    "rehab_focus_tags" JSONB NOT NULL,
    "maintenance_requirement" JSONB,
    "detected_from" "ConstraintDetectedFrom" NOT NULL,
    "linked_injury_incident_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConstraintProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InjuryIncident" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "linked_session_execution_id" UUID,
    "linked_unit_execution_id" UUID,
    "evidence_asset_id" UUID,
    "status" "InjuryStatus" NOT NULL,
    "incident_type" "InjuryIncidentType" NOT NULL,
    "title" TEXT NOT NULL,
    "body_region_tags" JSONB NOT NULL,
    "movement_context_tags" JSONB NOT NULL,
    "onset_at" TIMESTAMPTZ(6),
    "pain_level_initial" INTEGER,
    "mechanism_summary" TEXT,
    "symptom_summary" TEXT,
    "suspected_causes" JSONB NOT NULL,
    "clinical_diagnosis" TEXT,
    "current_restrictions" JSONB NOT NULL,
    "return_readiness_status" "ReturnReadinessStatus" NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "retrospective_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InjuryIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_user_id_status_idx" ON "Goal"("user_id", "status");

-- CreateIndex
CREATE INDEX "Goal_goal_type_idx" ON "Goal"("goal_type");

-- CreateIndex
CREATE INDEX "Program_user_id_status_idx" ON "Program"("user_id", "status");

-- CreateIndex
CREATE INDEX "Program_goal_id_idx" ON "Program"("goal_id");

-- CreateIndex
CREATE INDEX "Program_parent_program_id_idx" ON "Program"("parent_program_id");

-- CreateIndex
CREATE INDEX "Block_program_id_idx" ON "Block"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "Block_program_id_sequence_no_key" ON "Block"("program_id", "sequence_no");

-- CreateIndex
CREATE INDEX "SessionTemplate_block_id_idx" ON "SessionTemplate"("block_id");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTemplate_block_id_code_key" ON "SessionTemplate"("block_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTemplate_block_id_sequence_in_microcycle_key" ON "SessionTemplate"("block_id", "sequence_in_microcycle");

-- CreateIndex
CREATE INDEX "TrainingUnitTemplate_session_template_id_idx" ON "TrainingUnitTemplate"("session_template_id");

-- CreateIndex
CREATE INDEX "TrainingUnitTemplate_progress_track_key_idx" ON "TrainingUnitTemplate"("progress_track_key");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingUnitTemplate_session_template_id_sequence_no_key" ON "TrainingUnitTemplate"("session_template_id", "sequence_no");

-- CreateIndex
CREATE INDEX "ProgressTrack_user_id_idx" ON "ProgressTrack"("user_id");

-- CreateIndex
CREATE INDEX "ProgressTrack_program_id_idx" ON "ProgressTrack"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTrack_user_id_track_key_key" ON "ProgressTrack"("user_id", "track_key");

-- CreateIndex
CREATE INDEX "PlannedSession_user_id_session_date_idx" ON "PlannedSession"("user_id", "session_date");

-- CreateIndex
CREATE INDEX "PlannedSession_program_id_idx" ON "PlannedSession"("program_id");

-- CreateIndex
CREATE INDEX "PlannedSession_block_id_idx" ON "PlannedSession"("block_id");

-- CreateIndex
CREATE INDEX "PlannedSession_session_template_id_idx" ON "PlannedSession"("session_template_id");

-- CreateIndex
CREATE INDEX "PlannedSession_source_session_id_idx" ON "PlannedSession"("source_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedSession_program_id_sequence_index_key" ON "PlannedSession"("program_id", "sequence_index");

-- CreateIndex
CREATE INDEX "PlannedUnit_planned_session_id_idx" ON "PlannedUnit"("planned_session_id");

-- CreateIndex
CREATE INDEX "PlannedUnit_unit_template_id_idx" ON "PlannedUnit"("unit_template_id");

-- CreateIndex
CREATE INDEX "PlannedUnit_progress_track_id_idx" ON "PlannedUnit"("progress_track_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedUnit_planned_session_id_sequence_no_key" ON "PlannedUnit"("planned_session_id", "sequence_no");

-- CreateIndex
CREATE INDEX "SessionExecution_user_id_performed_at_idx" ON "SessionExecution"("user_id", "performed_at");

-- CreateIndex
CREATE INDEX "SessionExecution_planned_session_id_idx" ON "SessionExecution"("planned_session_id");

-- CreateIndex
CREATE INDEX "SessionExecution_program_id_idx" ON "SessionExecution"("program_id");

-- CreateIndex
CREATE INDEX "SessionExecution_block_id_idx" ON "SessionExecution"("block_id");

-- CreateIndex
CREATE INDEX "SessionExecution_imported_from_evidence_id_idx" ON "SessionExecution"("imported_from_evidence_id");

-- CreateIndex
CREATE INDEX "UnitExecution_session_execution_id_idx" ON "UnitExecution"("session_execution_id");

-- CreateIndex
CREATE INDEX "UnitExecution_planned_unit_id_idx" ON "UnitExecution"("planned_unit_id");

-- CreateIndex
CREATE INDEX "UnitExecution_unit_template_id_idx" ON "UnitExecution"("unit_template_id");

-- CreateIndex
CREATE INDEX "UnitExecution_progress_track_id_idx" ON "UnitExecution"("progress_track_id");

-- CreateIndex
CREATE INDEX "UnitExecution_imported_from_evidence_id_idx" ON "UnitExecution"("imported_from_evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "UnitExecution_session_execution_id_sequence_no_key" ON "UnitExecution"("session_execution_id", "sequence_no");

-- CreateIndex
CREATE INDEX "Observation_user_id_metric_key_observed_at_idx" ON "Observation"("user_id", "metric_key", "observed_at");

-- CreateIndex
CREATE INDEX "Observation_linked_program_id_idx" ON "Observation"("linked_program_id");

-- CreateIndex
CREATE INDEX "Observation_linked_session_execution_id_idx" ON "Observation"("linked_session_execution_id");

-- CreateIndex
CREATE INDEX "Observation_evidence_asset_id_idx" ON "Observation"("evidence_asset_id");

-- CreateIndex
CREATE INDEX "EvidenceAsset_user_id_parse_status_idx" ON "EvidenceAsset"("user_id", "parse_status");

-- CreateIndex
CREATE INDEX "EvidenceAsset_uploaded_at_idx" ON "EvidenceAsset"("uploaded_at");

-- CreateIndex
CREATE INDEX "EvidenceAsset_linked_entity_type_linked_entity_id_idx" ON "EvidenceAsset"("linked_entity_type", "linked_entity_id");

-- CreateIndex
CREATE INDEX "EvidenceAsset_file_hash_idx" ON "EvidenceAsset"("file_hash");

-- CreateIndex
CREATE INDEX "ConstraintProfile_user_id_status_idx" ON "ConstraintProfile"("user_id", "status");

-- CreateIndex
CREATE INDEX "ConstraintProfile_domain_idx" ON "ConstraintProfile"("domain");

-- CreateIndex
CREATE INDEX "ConstraintProfile_linked_injury_incident_id_idx" ON "ConstraintProfile"("linked_injury_incident_id");

-- CreateIndex
CREATE INDEX "InjuryIncident_user_id_status_idx" ON "InjuryIncident"("user_id", "status");

-- CreateIndex
CREATE INDEX "InjuryIncident_linked_session_execution_id_idx" ON "InjuryIncident"("linked_session_execution_id");

-- CreateIndex
CREATE INDEX "InjuryIncident_linked_unit_execution_id_idx" ON "InjuryIncident"("linked_unit_execution_id");

-- CreateIndex
CREATE INDEX "InjuryIncident_evidence_asset_id_idx" ON "InjuryIncident"("evidence_asset_id");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_parent_program_id_fkey" FOREIGN KEY ("parent_program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTemplate" ADD CONSTRAINT "SessionTemplate_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingUnitTemplate" ADD CONSTRAINT "TrainingUnitTemplate_session_template_id_fkey" FOREIGN KEY ("session_template_id") REFERENCES "SessionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressTrack" ADD CONSTRAINT "ProgressTrack_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_session_template_id_fkey" FOREIGN KEY ("session_template_id") REFERENCES "SessionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_source_session_id_fkey" FOREIGN KEY ("source_session_id") REFERENCES "PlannedSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedUnit" ADD CONSTRAINT "PlannedUnit_planned_session_id_fkey" FOREIGN KEY ("planned_session_id") REFERENCES "PlannedSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedUnit" ADD CONSTRAINT "PlannedUnit_unit_template_id_fkey" FOREIGN KEY ("unit_template_id") REFERENCES "TrainingUnitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedUnit" ADD CONSTRAINT "PlannedUnit_progress_track_id_fkey" FOREIGN KEY ("progress_track_id") REFERENCES "ProgressTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExecution" ADD CONSTRAINT "SessionExecution_planned_session_id_fkey" FOREIGN KEY ("planned_session_id") REFERENCES "PlannedSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExecution" ADD CONSTRAINT "SessionExecution_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExecution" ADD CONSTRAINT "SessionExecution_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExecution" ADD CONSTRAINT "SessionExecution_imported_from_evidence_id_fkey" FOREIGN KEY ("imported_from_evidence_id") REFERENCES "EvidenceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitExecution" ADD CONSTRAINT "UnitExecution_session_execution_id_fkey" FOREIGN KEY ("session_execution_id") REFERENCES "SessionExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitExecution" ADD CONSTRAINT "UnitExecution_planned_unit_id_fkey" FOREIGN KEY ("planned_unit_id") REFERENCES "PlannedUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitExecution" ADD CONSTRAINT "UnitExecution_unit_template_id_fkey" FOREIGN KEY ("unit_template_id") REFERENCES "TrainingUnitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitExecution" ADD CONSTRAINT "UnitExecution_progress_track_id_fkey" FOREIGN KEY ("progress_track_id") REFERENCES "ProgressTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitExecution" ADD CONSTRAINT "UnitExecution_imported_from_evidence_id_fkey" FOREIGN KEY ("imported_from_evidence_id") REFERENCES "EvidenceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_linked_program_id_fkey" FOREIGN KEY ("linked_program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_linked_session_execution_id_fkey" FOREIGN KEY ("linked_session_execution_id") REFERENCES "SessionExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_evidence_asset_id_fkey" FOREIGN KEY ("evidence_asset_id") REFERENCES "EvidenceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstraintProfile" ADD CONSTRAINT "ConstraintProfile_linked_injury_incident_id_fkey" FOREIGN KEY ("linked_injury_incident_id") REFERENCES "InjuryIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryIncident" ADD CONSTRAINT "InjuryIncident_linked_session_execution_id_fkey" FOREIGN KEY ("linked_session_execution_id") REFERENCES "SessionExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryIncident" ADD CONSTRAINT "InjuryIncident_linked_unit_execution_id_fkey" FOREIGN KEY ("linked_unit_execution_id") REFERENCES "UnitExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryIncident" ADD CONSTRAINT "InjuryIncident_evidence_asset_id_fkey" FOREIGN KEY ("evidence_asset_id") REFERENCES "EvidenceAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
