import { z } from "zod";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import { RECORDING_MODE_VALUES } from "@/lib/recording-mode-standards";
import {
  normalizeSupersetProgressionBudget,
  SUPERSET_SELECTION_MODE_VALUES,
} from "@/lib/template-library-superset";
import {
  getExerciseLibraryItemByIdForUser,
  listTemplateLibraryFoldersByUser,
  listTemplateLibrarySplitTypesByUser,
  getTemplateLibraryItemByIdForUser,
  updateTemplateLibraryItemById,
} from "@/server/repositories";
import {
  buildTrainingSetsFromLegacyDefaults,
  deriveLegacyDefaultsFromTrainingSets,
  TRAINING_SET_TYPE_OPTIONS,
  TRAINING_SET_WEIGHT_MODE_OPTIONS,
} from "@/lib/training-set-standards";
import { applyActionEntryAnchorSummaryToSetStructure } from "@/lib/action-entry-anchor";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toTemplateLibraryItemDto } from "./shared";

const TRAINING_SET_TYPE_VALUES = TRAINING_SET_TYPE_OPTIONS.map((item) => item.value) as [
  string,
  ...string[],
];
const TRAINING_SET_WEIGHT_MODE_VALUES = TRAINING_SET_WEIGHT_MODE_OPTIONS.map((item) => item.value) as [
  string,
  ...string[],
];

const TemplateSetInputSchema = z
  .object({
    type: z.enum(TRAINING_SET_TYPE_VALUES).default("working"),
    reps: z
      .union([
        z.number().int().positive(),
        z.object({
          min: z.number().int().positive(),
          max: z.number().int().positive(),
        }),
      ])
      .optional(),
    durationSeconds: z.number().int().positive().optional(),
    weightMode: z.enum(TRAINING_SET_WEIGHT_MODE_VALUES).default("absolute"),
    weight: z.number().nonnegative().optional(),
    relativeIntensityRatio: z.number().positive().optional(),
    tempo: z
      .tuple([
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
      ])
      .optional(),
    assistWeight: z.number().nonnegative().optional(),
    rpe: z.number().min(0).max(10).optional(),
    restSeconds: z.number().int().positive().optional(),
    participatesInProgression: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.reps && !value.durationSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "每组至少需要配置次数或时长",
        path: ["reps"],
      });
    }
    if (value.reps && value.durationSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "每组不能同时配置次数和时长",
        path: ["durationSeconds"],
      });
    }
    if (typeof value.reps === "object" && value.reps.min > value.reps.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "次数区间下限不能大于上限",
        path: ["reps"],
      });
    }
    if (value.weightMode === "relative_to_working" && value.relativeIntensityRatio === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "相对主工作组模式需要填写比例",
        path: ["relativeIntensityRatio"],
      });
    }
  });

const TemplateAnchorDraftInputSchema = z.object({
  setCount: z.number().int().positive().nullable().optional(),
  reps: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  loadValue: z.number().nonnegative().nullable().optional(),
  additionalLoadValue: z.number().nonnegative().nullable().optional(),
  assistWeight: z.number().nonnegative().nullable().optional(),
  restSeconds: z.number().int().positive().nullable().optional(),
  tempo: z
    .tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ])
    .nullable()
    .optional(),
  targetRpe: z.number().min(0).max(10).nullable().optional(),
  recommendedRir: z.number().min(0).max(5).nullable().optional(),
  setStructure: z.array(TemplateSetInputSchema).optional(),
});

const TemplateLibraryUnitInputSchema = z
  .object({
    exerciseLibraryItemId: UuidLikeSchema,
    exerciseNameSnapshot: z.string().trim().min(1),
    sequenceNo: z.number().int().positive(),
    unitRole: z.enum(UNIT_ROLE_VALUES).default("accessory"),
    progressTrackKey: z.string().trim().min(1).optional(),
    progressionFamily: z.enum(PROGRESSION_FAMILY_VALUES).default("strict_load"),
    progressionPolicyType: z.enum(PROGRESSION_POLICY_TYPE_VALUES).default("manual"),
    progressionPolicyConfig: z.record(z.string(), z.unknown()).default({}),
    adjustmentPolicyType: z.enum(ADJUSTMENT_POLICY_TYPE_VALUES).default("always"),
    adjustmentPolicyConfig: z.record(z.string(), z.unknown()).default({}),
    successCriteria: z.record(z.string(), z.unknown()).default({ complete_all_sets: true }),
    recordingMode: z.enum(RECORDING_MODE_VALUES).optional(),
    recordMode: z.enum(["sets_reps", "sets_time"]),
    loadModel: z.enum(["external", "bodyweight_plus_external"]),
    defaultSets: z.number().int().positive(),
    defaultReps: z.number().int().positive().optional(),
    defaultDurationSeconds: z.number().int().positive().optional(),
    defaultLoadValue: z.number().positive().optional(),
    defaultLoadUnit: z.enum(["kg", "lbs"]).optional(),
    defaultAdditionalLoadValue: z.number().positive().optional(),
    defaultAdditionalLoadUnit: z.enum(["kg", "lbs"]).optional(),
    targetRepsMin: z.number().int().positive().optional(),
    targetRepsMax: z.number().int().positive().optional(),
    rpeMin: z.number().min(0).max(10).optional(),
    rpeMax: z.number().min(0).max(10).optional(),
    sets: z.array(TemplateSetInputSchema).optional(),
    anchorDraft: TemplateAnchorDraftInputSchema.nullable().optional(),
    notes: z.string().optional(),
    required: z.boolean().default(true),
    supersetGroup: z
      .object({
        groupId: z.string().trim().min(1),
        groupName: z.string().trim().min(1).nullable().optional(),
        orderIndex: z.number().int().positive(),
        totalUnits: z.number().int().min(2).max(3),
        betweenExercisesRestSeconds: z.number().int().positive().nullable().optional(),
        betweenRoundsRestSeconds: z.number().int().positive().nullable().optional(),
        progressionBudgetPerExposure: z.number().int().min(1).max(3).optional(),
        selectionMode: z.enum(SUPERSET_SELECTION_MODE_VALUES).optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.recordMode === "sets_reps" && value.defaultReps === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "按次数动作必须填写默认次数",
        path: ["defaultReps"],
      });
    }
    if (value.recordMode === "sets_time" && value.defaultDurationSeconds === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "按时长动作必须填写默认时长",
        path: ["defaultDurationSeconds"],
      });
    }
    if (value.loadModel === "external" && value.defaultLoadValue !== undefined && !value.defaultLoadUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "普通负重动作填写默认负重时必须选择单位",
        path: ["defaultLoadUnit"],
      });
    }
    if (
      value.loadModel === "bodyweight_plus_external" &&
      value.defaultAdditionalLoadValue !== undefined &&
      !value.defaultAdditionalLoadUnit
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "自重动作填写默认附重时必须选择单位",
        path: ["defaultAdditionalLoadUnit"],
      });
    }
    if (
      value.targetRepsMin !== undefined &&
      value.targetRepsMax !== undefined &&
      value.targetRepsMin > value.targetRepsMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "目标次数下限不能大于上限",
        path: ["targetRepsMin"],
      });
    }
    if (value.rpeMin !== undefined && value.rpeMax !== undefined && value.rpeMin > value.rpeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RPE 下限不能大于上限",
        path: ["rpeMin"],
      });
    }
    if (value.sets && value.sets.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "组结构不能为空",
        path: ["sets"],
      });
    }
  });

const UpdateTemplateLibraryItemInputSchema = z
  .object({
    userId: UuidLikeSchema,
    itemId: UuidLikeSchema,
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    splitType: z.string().trim().min(1).max(48).optional(),
    folderKey: z.string().trim().min(1).max(64).optional().nullable(),
    aliases: z.array(z.string().trim().min(1)).optional(),
    enabled: z.boolean().optional(),
    notes: z.string().optional(),
    units: z.array(TemplateLibraryUnitInputSchema).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.splitType !== undefined ||
      value.folderKey !== undefined ||
      value.aliases !== undefined ||
      value.enabled !== undefined ||
      value.notes !== undefined ||
      value.units !== undefined,
    { message: "至少需要提供一个可编辑字段" },
  );

export type UpdateTemplateLibraryItemInput = z.input<typeof UpdateTemplateLibraryItemInputSchema>;

function normalizeText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(items: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(trimmed);
  }
  return values;
}

function buildProgressTrackKey(name: string, sequenceNo: number) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "template_unit"}_${sequenceNo}`;
}

function toStoredTrainingSet(set: z.infer<typeof TemplateSetInputSchema>) {
  return {
    type: set.type,
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
    ...(set.durationSeconds !== undefined ? { duration_seconds: set.durationSeconds } : {}),
    weight_mode: (set.weightMode ?? "absolute") as "absolute" | "relative_to_working",
    ...(set.weight !== undefined ? { weight: set.weight } : {}),
    ...(set.relativeIntensityRatio !== undefined
      ? { relative_intensity_ratio: set.relativeIntensityRatio }
      : {}),
    ...(set.tempo !== undefined ? { tempo: set.tempo } : {}),
    ...(set.assistWeight !== undefined ? { assist_weight: set.assistWeight } : {}),
    ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
    ...(set.restSeconds !== undefined ? { rest_seconds: set.restSeconds } : {}),
    ...(set.participatesInProgression !== undefined
      ? { participates_in_progression: set.participatesInProgression }
      : {}),
    ...(set.notes?.trim() ? { notes: set.notes.trim() } : {}),
  };
}

export async function updateTemplateLibraryItemUseCase(rawInput: UpdateTemplateLibraryItemInput) {
  const input = UpdateTemplateLibraryItemInputSchema.parse(rawInput);

  const existing = await getTemplateLibraryItemByIdForUser(input.itemId, input.userId);
  if (!existing) {
    throw notFoundError("Template library item not found");
  }

  if (input.splitType !== undefined) {
    const splitTypes = await listTemplateLibrarySplitTypesByUser(input.userId);
    if (!splitTypes.some((item) => item.key === input.splitType)) {
      throw badRequestError(`分化类型不存在：${input.splitType}`);
    }
  }

  if (input.folderKey) {
    const folders = await listTemplateLibraryFoldersByUser(input.userId);
    if (!folders.some((item) => item.key === input.folderKey)) {
      throw badRequestError(`文件夹不存在：${input.folderKey}`);
    }
  }

  if (input.units) {
    for (const unit of input.units) {
      const exercise = await getExerciseLibraryItemByIdForUser(unit.exerciseLibraryItemId, input.userId);
      if (!exercise || !exercise.enabled) {
        throw badRequestError(`模板动作引用的动作库条目不可用：${unit.exerciseLibraryItemId}`);
      }
    }
  }

  const units = input.units
    ? input.units
        .slice()
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
        .map((unit, index) => {
          const fallbackSets = buildTrainingSetsFromLegacyDefaults({
            defaultSets: unit.anchorDraft?.setCount ?? unit.defaultSets,
            defaultReps:
              unit.recordMode === "sets_reps"
                ? (unit.anchorDraft?.reps ?? unit.defaultReps ?? null)
                : null,
            defaultDurationSeconds:
              unit.recordMode === "sets_time"
                ? (unit.anchorDraft?.durationSeconds ?? unit.defaultDurationSeconds ?? null)
                : null,
            defaultLoadValue: unit.anchorDraft?.loadValue ?? unit.defaultLoadValue ?? null,
            defaultAdditionalLoadValue:
              unit.anchorDraft?.assistWeight ??
              unit.anchorDraft?.additionalLoadValue ??
              unit.defaultAdditionalLoadValue ??
              null,
            defaultRestSeconds: unit.anchorDraft?.restSeconds ?? null,
            defaultTempo: unit.anchorDraft?.tempo ?? null,
            defaultRpe: unit.anchorDraft?.targetRpe ?? null,
            loadModel: unit.loadModel,
            recordMode: unit.recordMode,
            recordingMode: unit.recordingMode ?? null,
          });
          const baseSets =
            unit.anchorDraft?.setStructure && unit.anchorDraft.setStructure.length > 0
              ? unit.anchorDraft.setStructure.map((set) => toStoredTrainingSet(set))
              : unit.sets && unit.sets.length > 0
                ? unit.sets.map((set) => toStoredTrainingSet(set))
                : fallbackSets;
          const normalizedSets =
            unit.anchorDraft
              ? applyActionEntryAnchorSummaryToSetStructure({
                  recordingMode: unit.recordingMode ?? null,
                  recordMode: unit.recordMode,
                  loadModel: unit.loadModel,
                  baseSetStructure: baseSets,
                  summary: {
                    setCount: unit.anchorDraft.setCount ?? undefined,
                    reps: unit.anchorDraft.reps ?? undefined,
                    durationSeconds: unit.anchorDraft.durationSeconds ?? undefined,
                    loadValue: unit.anchorDraft.loadValue ?? undefined,
                    additionalLoadValue: unit.anchorDraft.additionalLoadValue ?? undefined,
                    assistWeight: unit.anchorDraft.assistWeight ?? undefined,
                    restSeconds: unit.anchorDraft.restSeconds ?? undefined,
                    tempo: unit.anchorDraft.tempo ?? undefined,
                    targetRpe: unit.anchorDraft.targetRpe ?? undefined,
                    recommendedRir: unit.anchorDraft.recommendedRir ?? undefined,
                  },
                })
              : baseSets;
          const legacyFromSets = deriveLegacyDefaultsFromTrainingSets(normalizedSets, {
            loadModel: unit.loadModel,
            recordMode: unit.recordMode,
            recordingMode: unit.recordingMode ?? null,
          });

          return {
            exercise_library_item_id: unit.exerciseLibraryItemId,
            exercise_name_snapshot: unit.exerciseNameSnapshot,
            sequence_no: index + 1,
            unit_role: unit.unitRole,
            progress_track_key:
              unit.progressTrackKey?.trim() ||
              buildProgressTrackKey(unit.exerciseNameSnapshot, index + 1),
            progression_family: unit.progressionFamily,
            progression_policy_type: unit.progressionPolicyType,
            progression_policy_config: unit.progressionPolicyConfig,
            adjustment_policy_type: unit.adjustmentPolicyType,
            adjustment_policy_config: unit.adjustmentPolicyConfig,
            success_criteria: unit.successCriteria,
            recording_mode: unit.recordingMode ?? null,
            record_mode: unit.recordMode,
            load_model: unit.loadModel,
            default_sets: legacyFromSets?.defaultSets ?? unit.defaultSets,
            default_reps:
              unit.recordMode === "sets_reps"
                ? (legacyFromSets?.defaultReps ?? unit.defaultReps ?? null)
                : null,
            default_duration_seconds:
              unit.recordMode === "sets_time"
                ? (legacyFromSets?.defaultDurationSeconds ?? unit.defaultDurationSeconds ?? null)
                : null,
            default_load_value:
              unit.loadModel === "external"
                ? (legacyFromSets?.defaultLoadValue ?? unit.defaultLoadValue ?? null)
                : null,
            default_load_unit: unit.defaultLoadUnit ?? null,
            default_additional_load_value:
              unit.loadModel === "bodyweight_plus_external"
                ? (legacyFromSets?.defaultAdditionalLoadValue ??
                  unit.defaultAdditionalLoadValue ??
                  null)
                : null,
            default_additional_load_unit: unit.defaultAdditionalLoadUnit ?? null,
            target_reps_min: unit.targetRepsMin ?? null,
            target_reps_max: unit.targetRepsMax ?? null,
            rpe_min: unit.rpeMin ?? null,
            rpe_max: unit.rpeMax ?? null,
            sets: normalizedSets,
            notes: normalizeText(unit.notes) ?? null,
            required: unit.required,
                superset_group: unit.supersetGroup
                  ? {
                      group_id: unit.supersetGroup.groupId,
                      group_name:
                        normalizeText(unit.supersetGroup.groupName ?? undefined) ?? null,
                      order_index: unit.supersetGroup.orderIndex,
                  total_units: unit.supersetGroup.totalUnits,
                  between_exercises_rest_seconds:
                    unit.supersetGroup.betweenExercisesRestSeconds ?? null,
                  between_rounds_rest_seconds:
                    unit.supersetGroup.betweenRoundsRestSeconds ?? null,
                  progression_budget_per_exposure: normalizeSupersetProgressionBudget(
                    unit.supersetGroup.progressionBudgetPerExposure,
                    1,
                  ),
                  selection_mode: unit.supersetGroup.selectionMode ?? "auto_rotation",
                }
              : null,
          };
        })
    : undefined;

  await updateTemplateLibraryItemById(input.itemId, input.userId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: normalizeText(input.description) } : {}),
    ...(input.splitType !== undefined ? { split_type: input.splitType } : {}),
    ...(input.folderKey !== undefined ? { folder_key: input.folderKey ?? null } : {}),
    ...(input.aliases !== undefined ? { aliases: normalizeStringArray(input.aliases) } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.notes !== undefined ? { notes: normalizeText(input.notes) } : {}),
    ...(units !== undefined ? { units } : {}),
  });

  const updated = await getTemplateLibraryItemByIdForUser(input.itemId, input.userId);
  if (!updated) {
    throw notFoundError("Template library item not found after update");
  }

  return toTemplateLibraryItemDto(updated);
}
