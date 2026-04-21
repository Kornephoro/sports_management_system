import { Prisma, PrescriptionType } from "@prisma/client";
import { z } from "zod";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import {
  ensureProgressTrackByKey,
  getSessionTemplateByIdForUser,
  getTrainingUnitTemplateByIdForUser,
  setTemplateLibraryItemLastUsedAt,
  updateTrainingUnitTemplateById,
} from "@/server/repositories";
import {
  buildInitialProgressTrackState,
  normalizeProgressionConfig,
} from "@/server/services/progression/progression-config.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdateTrainingUnitTemplateInputSchema = z
  .object({
    userId: UuidLikeSchema,
    unitTemplateId: UuidLikeSchema,
    name: z.string().trim().min(1).optional(),
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
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.prescriptionType !== undefined ||
      value.sets !== undefined ||
      value.reps !== undefined ||
      value.durationSeconds !== undefined ||
      value.loadValue !== undefined ||
      value.loadUnit !== undefined ||
      value.targetRepsMin !== undefined ||
      value.targetRepsMax !== undefined ||
      value.rpeMin !== undefined ||
      value.rpeMax !== undefined ||
      value.notes !== undefined ||
      value.exerciseLibraryItemId !== undefined ||
      value.sourceTemplateLibraryItemId !== undefined ||
      value.unitRole !== undefined ||
      value.progressionFamily !== undefined ||
      value.progressionPolicyType !== undefined ||
      value.progressionPolicyConfig !== undefined ||
      value.adjustmentPolicyType !== undefined ||
      value.adjustmentPolicyConfig !== undefined ||
      value.successCriteria !== undefined ||
      value.progressTrackKey !== undefined,
    {
      message: "At least one editable field is required",
    },
  );

export type UpdateTrainingUnitTemplateInput = z.input<
  typeof UpdateTrainingUnitTemplateInputSchema
>;

function normalizeNotes(notes: string | undefined) {
  if (notes === undefined) {
    return undefined;
  }
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPayloadRecord(payload: unknown) {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return { ...payload } as Record<string, unknown>;
  }
  return {};
}

export async function updateTrainingUnitTemplateUseCase(
  rawInput: UpdateTrainingUnitTemplateInput,
) {
  const input = UpdateTrainingUnitTemplateInputSchema.parse(rawInput);

  const existing = await getTrainingUnitTemplateByIdForUser(input.unitTemplateId, input.userId);
  if (!existing) {
    throw notFoundError("Training unit template not found");
  }
  const sessionTemplate = await getSessionTemplateByIdForUser(
    existing.session_template_id,
    input.userId,
  );
  if (!sessionTemplate) {
    throw notFoundError("Session template not found");
  }

  const nextPayload = toPayloadRecord(existing.prescription_payload);

  if (input.sets !== undefined) {
    nextPayload.sets = input.sets;
  }
  if (input.reps !== undefined) {
    nextPayload.reps = input.reps;
  }
  if (input.durationSeconds !== undefined) {
    nextPayload.duration_seconds = input.durationSeconds;
  }

  if (input.loadValue !== undefined || input.loadUnit !== undefined) {
    const previousLoad =
      typeof nextPayload.default_load === "object" &&
      nextPayload.default_load !== null &&
      !Array.isArray(nextPayload.default_load)
        ? (nextPayload.default_load as Record<string, unknown>)
        : {};

    nextPayload.default_load = {
      value: input.loadValue ?? previousLoad.value ?? "自重",
      unit: input.loadUnit ?? previousLoad.unit ?? "bodyweight",
    };
  }

  if (input.targetRepsMin !== undefined && input.targetRepsMax !== undefined) {
    nextPayload.target_reps_range = [input.targetRepsMin, input.targetRepsMax];
  }

  if (input.exerciseLibraryItemId !== undefined) {
    nextPayload.exercise_library_item_id = input.exerciseLibraryItemId;
  }
  if (input.sourceTemplateLibraryItemId !== undefined) {
    nextPayload.source_template_library_item_id = input.sourceTemplateLibraryItemId;
  }

  if (input.rpeMin !== undefined && input.rpeMax !== undefined) {
    nextPayload.rpe_range = [input.rpeMin, input.rpeMax];
  }

  const resolvedPrescriptionType = input.prescriptionType ?? existing.prescription_type;
  const progression = normalizeProgressionConfig({
    unitRole: input.unitRole ?? existing.unit_role,
    progressionFamily: input.progressionFamily ?? existing.progression_family,
    progressionPolicyType: input.progressionPolicyType ?? existing.progression_policy_type,
    progressionPolicyConfig: input.progressionPolicyConfig ?? existing.progression_policy_config,
    adjustmentPolicyType: input.adjustmentPolicyType ?? existing.adjustment_policy_type,
    adjustmentPolicyConfig: input.adjustmentPolicyConfig ?? existing.adjustment_policy_config,
    successCriteria: input.successCriteria ?? existing.success_criteria,
    progressTrackKey: input.progressTrackKey ?? existing.progress_track_key,
    progressTrackKeyFallback: existing.progress_track_key,
  });

  if (resolvedPrescriptionType === "sets_time") {
    delete nextPayload.reps;
    nextPayload.reps_applicable = false;
    if (nextPayload.duration_seconds === undefined) {
      nextPayload.duration_seconds = 60;
    }
  } else if (resolvedPrescriptionType === "sets_reps") {
    delete nextPayload.duration_seconds;
    delete nextPayload.reps_applicable;
    if (nextPayload.reps === undefined) {
      nextPayload.reps = 8;
    }
  }

  const updateData: Prisma.TrainingUnitTemplateUncheckedUpdateInput = {
    ...(input.name !== undefined
      ? {
          name: input.name,
          display_name: input.name,
        }
      : {}),
    ...(input.notes !== undefined ? { notes: normalizeNotes(input.notes) } : {}),
    unit_role: progression.unitRole,
    progress_track_key: progression.progressTrackKey,
    progression_family: progression.progressionFamily,
    progression_policy_type: progression.progressionPolicyType,
    progression_policy_config: progression.progressionPolicyConfig as Prisma.InputJsonValue,
    adjustment_policy_type: progression.adjustmentPolicyType,
    adjustment_policy_config: progression.adjustmentPolicyConfig as Prisma.InputJsonValue,
    success_criteria: progression.successCriteria as Prisma.InputJsonValue,
    prescription_type: resolvedPrescriptionType,
    prescription_payload: nextPayload as Prisma.InputJsonValue,
  };

  if (Object.keys(updateData).length === 0) {
    throw badRequestError("No changes to update");
  }

  await ensureProgressTrackByKey({
    user_id: input.userId,
    program_id: sessionTemplate.block.program_id,
    track_key: progression.progressTrackKey,
    name: (input.name ?? existing.name).trim(),
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
      payload: nextPayload,
    }) as Prisma.InputJsonValue,
  });

  const updated = await updateTrainingUnitTemplateById(existing.id, updateData);

  if (input.sourceTemplateLibraryItemId) {
    await setTemplateLibraryItemLastUsedAt(
      input.sourceTemplateLibraryItemId,
      input.userId,
      new Date().toISOString(),
    );
  }

  return updated;
}
