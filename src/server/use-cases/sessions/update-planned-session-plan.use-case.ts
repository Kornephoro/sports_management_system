import { Prisma } from "@prisma/client";
import { z } from "zod";
import { deriveLegacyDefaultsFromTrainingSets } from "@/lib/training-set-standards";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
} from "@/lib/progression-standards";
import {
  createPlannedUnitForSession,
  deletePlannedUnitsByIds,
  getPlannedSessionWithUnitsAndExecutionCountById,
  getPlannedSessionWithUnitsById,
  listLatestObservationsByMetrics,
  updatePlannedSessionFields,
  updatePlannedUnitForSession,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const PlannedUnitPlanInputSchema = z
  .object({
    id: UuidLikeSchema.optional(),
    selectedExerciseName: z.string().trim().min(1, "动作名称不能为空"),
    exerciseLibraryItemId: UuidLikeSchema.optional(),
    progressTrackKey: z.string().trim().min(1).optional(),
    progressionFamily: z.enum(PROGRESSION_FAMILY_VALUES).optional(),
    progressionPolicyType: z.enum(PROGRESSION_POLICY_TYPE_VALUES).optional(),
    progressionPolicyConfig: z.record(z.string(), z.unknown()).optional(),
    adjustmentPolicyType: z.enum(ADJUSTMENT_POLICY_TYPE_VALUES).optional(),
    adjustmentPolicyConfig: z.record(z.string(), z.unknown()).optional(),
    successCriteria: z.record(z.string(), z.unknown()).optional(),
    setStructure: z
      .array(
        z.object({
          type: z.string().trim().min(1),
          reps: z
            .union([
              z.number().int().positive(),
              z
                .object({
                  min: z.number().int().positive(),
                  max: z.number().int().positive(),
                })
                .refine((value) => value.min <= value.max, {
                  message: "次数区间下限不能大于上限",
                }),
            ])
            .optional(),
          durationSeconds: z.number().int().positive().optional(),
          weightMode: z.enum(["absolute", "relative_to_working"]).optional(),
          weight: z.number().min(0).optional(),
          relativeIntensityRatio: z.number().positive().optional(),
          tempo: z
            .tuple([
              z.number().int().min(0),
              z.number().int().min(0),
              z.number().int().min(0),
              z.number().int().min(0),
            ])
            .optional(),
          assistWeight: z.number().min(0).optional(),
          rpe: z.number().min(0).max(10).optional(),
          restSeconds: z.number().int().positive().optional(),
          participatesInProgression: z.boolean().optional(),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    sets: z.number().int().positive().default(1),
    reps: z.number().int().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
    loadModel: z.enum(["external", "bodyweight_plus_external"]).default("external"),
    loadValue: z.number().positive().optional(),
    loadUnit: z.enum(["kg", "lbs"]).optional(),
    additionalLoadValue: z.number().positive().optional(),
    additionalLoadUnit: z.enum(["kg", "lbs"]).optional(),
    targetRepsMin: z.number().int().positive().optional(),
    targetRepsMax: z.number().int().positive().optional(),
    rpeMin: z.number().min(0).max(10).optional(),
    rpeMax: z.number().min(0).max(10).optional(),
    notes: z.string().optional(),
    required: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const hasSetStructure = Array.isArray(value.setStructure) && value.setStructure.length > 0;
    if (!hasSetStructure && !value.reps && !value.durationSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "每个动作至少需要配置次数或时长",
        path: ["reps"],
      });
    }
    if (!hasSetStructure && value.reps && value.durationSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "次数动作与时长动作不能同时配置",
        path: ["durationSeconds"],
      });
    }
    if (
      value.targetRepsMin !== undefined &&
      value.targetRepsMax !== undefined &&
      value.targetRepsMin > value.targetRepsMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "目标次数范围下限不能大于上限",
        path: ["targetRepsMin"],
      });
    }
    if (value.rpeMin !== undefined && value.rpeMax !== undefined && value.rpeMin > value.rpeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RPE 范围下限不能大于上限",
        path: ["rpeMin"],
      });
    }
    if (value.loadModel === "external" && value.loadValue !== undefined && !value.loadUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "普通负重动作填写重量数值时必须选择单位",
        path: ["loadUnit"],
      });
    }
    if (
      value.loadModel === "bodyweight_plus_external" &&
      value.additionalLoadValue !== undefined &&
      !value.additionalLoadUnit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自重动作填写附重数值时必须选择单位",
        path: ["additionalLoadUnit"],
      });
    }
  });

const UpdatePlannedSessionPlanInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  plannedDurationMin: z.number().int().positive().optional(),
  objectiveSummary: z.string().optional(),
  notes: z.string().optional(),
  units: z.array(PlannedUnitPlanInputSchema).default([]),
});

export type UpdatePlannedSessionPlanInput = z.input<typeof UpdatePlannedSessionPlanInputSchema>;

function toNullableText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPositiveNumber(value: unknown) {
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number((value as { toString: () => string }).toString());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildLegacyLoadText(unit: z.infer<typeof PlannedUnitPlanInputSchema>, bodyweightSnapshotKg?: number) {
  if (unit.loadModel === "bodyweight_plus_external") {
    if (bodyweightSnapshotKg && unit.additionalLoadValue) {
      return `自重${bodyweightSnapshotKg}kg + 附重${unit.additionalLoadValue}${unit.additionalLoadUnit ?? "kg"}`;
    }
    if (bodyweightSnapshotKg) {
      return `自重${bodyweightSnapshotKg}kg`;
    }
    if (unit.additionalLoadValue) {
      return `自重 + 附重${unit.additionalLoadValue}${unit.additionalLoadUnit ?? "kg"}`;
    }
    return "自重";
  }

  if (unit.loadValue && unit.loadUnit) {
    return `${unit.loadValue}${unit.loadUnit}`;
  }
  return undefined;
}

function buildTargetPayload(
  unit: z.infer<typeof PlannedUnitPlanInputSchema>,
  bodyweightContext?: {
    observationId: string;
    observedAt: string;
    snapshotKg: number;
  },
  existingTargetPayload?: unknown,
) {
  const existingPayload = toPayloadRecord(existingTargetPayload);
  const setStructure = Array.isArray(unit.setStructure)
    ? unit.setStructure.map((setItem) => ({
        type: setItem.type,
        ...(setItem.reps !== undefined ? { reps: setItem.reps } : {}),
        ...(setItem.durationSeconds !== undefined
          ? { duration_seconds: setItem.durationSeconds }
          : {}),
        ...(setItem.weightMode !== undefined ? { weight_mode: setItem.weightMode } : {}),
        ...(setItem.weight !== undefined ? { weight: setItem.weight } : {}),
        ...(setItem.relativeIntensityRatio !== undefined
          ? { relative_intensity_ratio: setItem.relativeIntensityRatio }
          : {}),
        ...(setItem.tempo !== undefined ? { tempo: setItem.tempo } : {}),
        ...(setItem.assistWeight !== undefined ? { assist_weight: setItem.assistWeight } : {}),
        ...(setItem.rpe !== undefined ? { rpe: setItem.rpe } : {}),
        ...(setItem.restSeconds !== undefined ? { rest_seconds: setItem.restSeconds } : {}),
        ...(setItem.participatesInProgression !== undefined
          ? { participates_in_progression: setItem.participatesInProgression }
          : {}),
        ...(setItem.notes ? { notes: setItem.notes } : {}),
      }))
    : [];
  const inferredRecordModeFromSetStructure = setStructure.some(
    (setItem) => typeof setItem.duration_seconds === "number",
  )
    ? "sets_time"
    : "sets_reps";
  const legacyDefaultsFromSetStructure =
    setStructure.length > 0
      ? deriveLegacyDefaultsFromTrainingSets(setStructure, {
          loadModel: unit.loadModel,
          recordMode: inferredRecordModeFromSetStructure,
        })
      : null;
  const effectiveRecordMode = legacyDefaultsFromSetStructure
    ? inferredRecordModeFromSetStructure
    : unit.durationSeconds
      ? "sets_time"
      : "sets_reps";
  const effectiveSets = legacyDefaultsFromSetStructure?.defaultSets ?? unit.sets;
  const effectiveReps = legacyDefaultsFromSetStructure?.defaultReps ?? unit.reps;
  const effectiveDurationSeconds =
    legacyDefaultsFromSetStructure?.defaultDurationSeconds ?? unit.durationSeconds;
  const effectiveExternalLoadValue =
    legacyDefaultsFromSetStructure?.defaultLoadValue ?? unit.loadValue;
  const effectiveAdditionalLoadValue =
    legacyDefaultsFromSetStructure?.defaultAdditionalLoadValue ?? unit.additionalLoadValue;
  const effectiveLegacyLoadText = buildLegacyLoadText(
    {
      ...unit,
      loadValue: effectiveExternalLoadValue,
      additionalLoadValue: effectiveAdditionalLoadValue,
    },
    bodyweightContext?.snapshotKg,
  );
  const payload: Record<string, unknown> = {
    ...existingPayload,
    prescription_type: effectiveRecordMode,
    sets: effectiveSets,
    load_model: unit.loadModel,
    load_text: effectiveLegacyLoadText,
    ...(setStructure.length > 0 ? { set_structure: setStructure } : {}),
  };

  if (effectiveRecordMode === "sets_time" && effectiveDurationSeconds) {
    payload.duration_seconds = effectiveDurationSeconds;
    delete payload.reps;
  } else {
    payload.reps = effectiveReps;
    delete payload.duration_seconds;
  }

  if (unit.loadModel === "external") {
    payload.load_value = effectiveExternalLoadValue;
    payload.load_unit = unit.loadUnit;
    delete payload.bodyweight_ref;
    delete payload.bodyweight_snapshot_kg;
    delete payload.additional_load_value;
    delete payload.additional_load_unit;
  } else {
    payload.load_unit = "bodyweight";
    payload.bodyweight_ref = bodyweightContext
      ? {
          source: "latest_observation",
          metric_key: "bodyweight",
          observation_id: bodyweightContext.observationId,
          observed_at: bodyweightContext.observedAt,
        }
      : {
          source: "latest_observation",
          metric_key: "bodyweight",
        };
    payload.bodyweight_snapshot_kg = bodyweightContext?.snapshotKg;
    payload.additional_load_value = effectiveAdditionalLoadValue;
    payload.additional_load_unit = unit.additionalLoadUnit;
    delete payload.load_value;
  }

  if (unit.targetRepsMin !== undefined) payload.target_reps_min = unit.targetRepsMin;
  else delete payload.target_reps_min;
  if (unit.targetRepsMax !== undefined) payload.target_reps_max = unit.targetRepsMax;
  else delete payload.target_reps_max;
  if (unit.rpeMin !== undefined) payload.rpe_min = unit.rpeMin;
  else delete payload.rpe_min;
  if (unit.rpeMax !== undefined) payload.rpe_max = unit.rpeMax;
  else delete payload.rpe_max;

  if (unit.exerciseLibraryItemId) {
    payload.exercise_library_item_id = unit.exerciseLibraryItemId;
  }
  if (unit.progressTrackKey) {
    payload.progress_track_key = unit.progressTrackKey;
  }
  if (unit.progressionFamily) {
    payload.progression_family = unit.progressionFamily;
  }
  if (unit.progressionPolicyType) {
    payload.progression_policy_type = unit.progressionPolicyType;
  }
  if (unit.progressionPolicyConfig) {
    payload.progression_policy_config = unit.progressionPolicyConfig;
  }
  if (unit.adjustmentPolicyType) {
    payload.adjustment_policy_type = unit.adjustmentPolicyType;
  }
  if (unit.adjustmentPolicyConfig) {
    payload.adjustment_policy_config = unit.adjustmentPolicyConfig;
  }
  if (unit.successCriteria) {
    payload.success_criteria = unit.successCriteria;
  }

  return payload as Prisma.InputJsonValue;
}

export async function updatePlannedSessionPlanUseCase(rawInput: UpdatePlannedSessionPlanInput) {
  const input = UpdatePlannedSessionPlanInputSchema.parse(rawInput);

  const plannedSession = await getPlannedSessionWithUnitsAndExecutionCountById(
    input.plannedSessionId,
    input.userId,
  );
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  if (plannedSession._count.session_executions > 0) {
    throw badRequestError("该训练已存在执行记录，不能再修改本次动作清单。请改期后再执行。");
  }

  const needsBodyweight = input.units.some((unit) => unit.loadModel === "bodyweight_plus_external");
  let bodyweightContext:
    | {
        observationId: string;
        observedAt: string;
        snapshotKg: number;
      }
    | undefined;

  if (needsBodyweight) {
    const latestBodyweight = await listLatestObservationsByMetrics(input.userId, ["bodyweight"]);
    const bodyweight = latestBodyweight[0];
    const snapshotKg = bodyweight ? toPositiveNumber(bodyweight.value_numeric) : null;
    if (!bodyweight || snapshotKg === null) {
      throw badRequestError("检测到自重动作，但未找到有效体重记录。请先到“身体状态记录”录入体重。");
    }

    bodyweightContext = {
      observationId: bodyweight.id,
      observedAt: bodyweight.observed_at.toISOString(),
      snapshotKg,
    };
  }

  await updatePlannedSessionFields(input.plannedSessionId, input.userId, {
    planned_duration_min: input.plannedDurationMin ?? null,
    objective_summary: toNullableText(input.objectiveSummary),
    notes: toNullableText(input.notes),
  });

  const existingUnitById = new Map(plannedSession.planned_units.map((unit) => [unit.id, unit]));
  const incomingExistingIds = new Set<string>();

  for (const [index, unit] of input.units.entries()) {
    const sequenceNo = index + 1;
    const existingPayload = unit.id ? existingUnitById.get(unit.id)?.target_payload : undefined;
    const targetPayload = buildTargetPayload(unit, bodyweightContext, existingPayload);
    const notes = toNullableText(unit.notes);

    if (unit.id) {
      const existing = existingUnitById.get(unit.id);
      if (!existing) {
        throw badRequestError(`未找到可编辑动作：${unit.id}`);
      }
      incomingExistingIds.add(unit.id);
      await updatePlannedUnitForSession(input.plannedSessionId, unit.id, {
        sequence_no: sequenceNo,
        selected_exercise_name: unit.selectedExerciseName,
        target_payload: targetPayload,
        required: unit.required,
        notes,
      });
      continue;
    }

    await createPlannedUnitForSession(input.plannedSessionId, {
      sequence_no: sequenceNo,
      selected_exercise_name: unit.selectedExerciseName,
      target_payload: targetPayload,
      required: unit.required,
      notes,
    });
  }

  const toDeleteIds = plannedSession.planned_units
    .filter((unit) => !incomingExistingIds.has(unit.id))
    .map((unit) => unit.id);
  await deletePlannedUnitsByIds(input.plannedSessionId, toDeleteIds);

  return getPlannedSessionWithUnitsById(input.plannedSessionId, input.userId);
}
