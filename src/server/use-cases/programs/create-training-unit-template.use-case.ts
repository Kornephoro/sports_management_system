import { Prisma, PrescriptionType } from "@prisma/client";
import { z } from "zod";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import {
  createTrainingUnitTemplate,
  ensureProgressTrackByKey,
  getNextTrainingUnitTemplateSequenceNo,
  getSessionTemplateByIdForUser,
  setTemplateLibraryItemLastUsedAt,
} from "@/server/repositories";
import {
  buildInitialProgressTrackState,
  normalizeProgressionConfig,
} from "@/server/services/progression/progression-config.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const CreateTrainingUnitTemplateInputSchema = z.object({
  userId: UuidLikeSchema,
  sessionTemplateId: UuidLikeSchema,
  name: z.string().trim().min(1),
  exerciseLibraryItemId: UuidLikeSchema.optional(),
  sourceTemplateLibraryItemId: UuidLikeSchema.optional(),
  prescriptionType: z.nativeEnum(PrescriptionType).optional(),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
  loadValue: z.union([z.number(), z.string()]).optional(),
  loadUnit: z.string().trim().min(1).optional(),
  targetRepsMin: z.number().int().positive().optional(),
  targetRepsMax: z.number().int().positive().optional(),
  rpeMin: z.number().min(0).max(10).optional(),
  rpeMax: z.number().min(0).max(10).optional(),
  unitRole: z.enum(UNIT_ROLE_VALUES).optional(),
  progressionFamily: z.enum(PROGRESSION_FAMILY_VALUES).optional(),
  progressionPolicyType: z.enum(PROGRESSION_POLICY_TYPE_VALUES).optional(),
  progressionPolicyConfig: z.record(z.string(), z.unknown()).optional(),
  adjustmentPolicyType: z.enum(ADJUSTMENT_POLICY_TYPE_VALUES).optional(),
  adjustmentPolicyConfig: z.record(z.string(), z.unknown()).optional(),
  successCriteria: z.record(z.string(), z.unknown()).optional(),
  progressTrackKey: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
});

export type CreateTrainingUnitTemplateInput = z.input<
  typeof CreateTrainingUnitTemplateInputSchema
>;

function normalizeNotes(notes: string | undefined) {
  if (notes === undefined) {
    return undefined;
  }
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProgressTrackKey(name: string, sequenceNo: number) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = Date.now().toString(36);
  return `${slug || "unit"}_${sequenceNo}_${suffix}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildPrescriptionPayload(
  input: z.infer<typeof CreateTrainingUnitTemplateInputSchema>,
  resolvedPrescriptionType: PrescriptionType,
) {
  const payload: Record<string, unknown> = {};
  const sets = input.sets ?? 3;
  payload.sets = sets;

  if (resolvedPrescriptionType === "sets_time") {
    payload.duration_seconds = input.durationSeconds ?? 60;
  } else {
    payload.reps = input.reps ?? 8;
  }

  if (input.targetRepsMin !== undefined && input.targetRepsMax !== undefined) {
    payload.target_reps_range = [input.targetRepsMin, input.targetRepsMax];
  }

  if (input.rpeMin !== undefined && input.rpeMax !== undefined) {
    payload.rpe_range = [input.rpeMin, input.rpeMax];
  }

  if (input.loadValue !== undefined || input.loadUnit !== undefined) {
    payload.default_load = {
      value: input.loadValue ?? "自重",
      unit: input.loadUnit ?? "bodyweight",
    };
    if (typeof input.loadValue === "number") {
      payload.load_value = input.loadValue;
    }
    if (input.loadUnit !== undefined) {
      payload.load_unit = input.loadUnit;
    }
  }

  if (input.loadUnit === "bodyweight") {
    payload.load_model = "bodyweight_plus_external";
  } else if (input.loadValue !== undefined || input.loadUnit !== undefined) {
    payload.load_model = "external";
  }

  if (input.exerciseLibraryItemId) {
    payload.exercise_library_item_id = input.exerciseLibraryItemId;
  }
  if (input.sourceTemplateLibraryItemId) {
    payload.source_template_library_item_id = input.sourceTemplateLibraryItemId;
  }

  if (resolvedPrescriptionType === "sets_time") {
    payload.reps_applicable = false;
  }

  return payload as Prisma.InputJsonValue;
}

export async function createTrainingUnitTemplateUseCase(
  rawInput: CreateTrainingUnitTemplateInput,
) {
  const input = CreateTrainingUnitTemplateInputSchema.parse(rawInput);

  const sessionTemplate = await getSessionTemplateByIdForUser(
    input.sessionTemplateId,
    input.userId,
  );
  if (!sessionTemplate) {
    throw notFoundError("Session template not found");
  }

  const sequenceNo = await getNextTrainingUnitTemplateSequenceNo(input.sessionTemplateId);
  const resolvedPrescriptionType =
    input.prescriptionType ?? (input.durationSeconds !== undefined ? "sets_time" : "sets_reps");
  const fallbackTrackKey = buildProgressTrackKey(input.name, sequenceNo);
  const progression = normalizeProgressionConfig({
    unitRole: input.unitRole,
    progressionFamily: input.progressionFamily,
    progressionPolicyType: input.progressionPolicyType,
    progressionPolicyConfig: input.progressionPolicyConfig,
    adjustmentPolicyType: input.adjustmentPolicyType,
    adjustmentPolicyConfig: input.adjustmentPolicyConfig,
    successCriteria: input.successCriteria,
    progressTrackKey: input.progressTrackKey,
    progressTrackKeyFallback: fallbackTrackKey,
  });

  const created = await createTrainingUnitTemplate({
    session_template_id: input.sessionTemplateId,
    sequence_no: sequenceNo,
    name: input.name,
    display_name: input.name,
    sport_type: sessionTemplate.sport_type,
    unit_role: progression.unitRole,
    unit_category: "exercise",
    movement_pattern_tags: [],
    muscle_tags: [],
    capability_tags: [],
    function_support_tags: [],
    fatigue_tags: [],
    conflict_tags: [],
    contraindication_tags: [],
    prerequisite_function_tags: [],
    is_key_unit: true,
    optional: false,
    priority_score_base: new Prisma.Decimal(1),
    progress_track_key: progression.progressTrackKey,
    progression_family: progression.progressionFamily,
    progression_policy_type: progression.progressionPolicyType,
    progression_policy_config: progression.progressionPolicyConfig as Prisma.InputJsonValue,
    adjustment_policy_type: progression.adjustmentPolicyType,
    adjustment_policy_config: progression.adjustmentPolicyConfig as Prisma.InputJsonValue,
    prescription_type: resolvedPrescriptionType,
    prescription_payload: buildPrescriptionPayload(input, resolvedPrescriptionType),
    success_criteria: progression.successCriteria as Prisma.InputJsonValue,
    min_spacing_sessions: null,
    adjustment_cooldown_exposures: null,
    notes: normalizeNotes(input.notes),
  });

  const payloadForTrack = isPlainObject(created.prescription_payload)
    ? created.prescription_payload
    : {};
  await ensureProgressTrackByKey({
    user_id: input.userId,
    program_id: sessionTemplate.block.program_id,
    track_key: progression.progressTrackKey,
    name: input.name.trim(),
    sport_type: sessionTemplate.sport_type,
    progression_family: progression.progressionFamily as
      | "strict_load"
      | "threshold"
      | "exposure"
      | "performance"
      | "autoregulated",
    progression_policy_type: progression.progressionPolicyType,
    progression_policy_config: progression.progressionPolicyConfig as Prisma.InputJsonValue,
    current_state: buildInitialProgressTrackState({
      prescriptionType: resolvedPrescriptionType,
      payload: payloadForTrack,
    }) as Prisma.InputJsonValue,
  });

  if (input.sourceTemplateLibraryItemId) {
    await setTemplateLibraryItemLastUsedAt(
      input.sourceTemplateLibraryItemId,
      input.userId,
      new Date().toISOString(),
    );
  }

  if (!isPlainObject(created.prescription_payload)) {
    return {
      ...created,
      prescription_payload: {},
    };
  }

  return created;
}
