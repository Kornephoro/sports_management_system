import { BlockType, Prisma, SessionCategory, SportType } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import {
  applyActionEntryAnchorSummaryToSetStructure,
  deriveActionEntryAnchorSummary,
} from "@/lib/action-entry-anchor";
import {
  createBlock,
  createSessionTemplate,
  createTrainingUnitTemplate,
  ensureProgressTrackByKeyWithTx,
  getProgramById,
  getTemplateLibraryItemByIdForUser,
  getTemplatePackageByIdForUser,
  setTemplateLibraryItemLastUsedAt,
  setTemplatePackageLastUsedAt,
  updatePlannedUnitTargetPayloadById,
  updateTemplatePackageById,
} from "@/server/repositories";
import { buildInitialProgressTrackState, normalizeProgressionConfig } from "@/server/services/progression/progression-config.service";
import { generatePlannedSessionsUseCase } from "@/server/use-cases/sessions/generate-planned-sessions.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";
import { createProgramWorkflowUseCase } from "@/server/use-cases/programs/create-program-workflow.use-case";

const UnitProgressionOverrideSchema = z.object({
  dayId: z.string().trim().min(1),
  unitSequenceNo: z.number().int().positive(),
  unitRole: z.enum(UNIT_ROLE_VALUES).optional(),
  progressionFamily: z.enum(PROGRESSION_FAMILY_VALUES).optional(),
  progressionPolicyType: z.union([z.enum(PROGRESSION_POLICY_TYPE_VALUES), z.string().trim().min(1)]).optional(),
  progressionPolicyConfig: z.record(z.string(), z.unknown()).optional(),
  adjustmentPolicyType: z.enum(ADJUSTMENT_POLICY_TYPE_VALUES).optional(),
  adjustmentPolicyConfig: z.record(z.string(), z.unknown()).optional(),
  successCriteria: z.record(z.string(), z.unknown()).optional(),
  progressTrackKey: z.string().trim().min(1).optional(),
});

const EntryAnchorOverrideSchema = z.object({
  dayId: z.string().trim().min(1),
  unitSequenceNo: z.number().int().positive(),
  source: z.enum(["template_draft", "stored_anchor", "ai_recommendation", "manual"]),
  candidateKey: z.string().trim().min(1).nullable().optional(),
  trigger: z.enum(["never_used", "long_gap", "logic_changed"]).nullable().optional(),
  setCount: z.number().int().positive().nullable().optional(),
  loadValue: z.number().nonnegative().nullable().optional(),
  additionalLoadValue: z.number().nonnegative().nullable().optional(),
  assistWeight: z.number().nonnegative().nullable().optional(),
  reps: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
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
  recommendedRir: z.number().min(0).max(5).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  logicSummary: z.string().trim().min(1).max(220).nullable().optional(),
  reasons: z.array(z.string().trim().min(1).max(120)).max(4).optional(),
  logicSignature: z.string().trim().min(1).nullable().optional(),
  daysSinceLastPerformed: z.number().int().nonnegative().nullable().optional(),
});

const GenerateTrainingPlanFromPackageInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema,
  startDate: z.coerce.date(),
  durationWeeks: z.number().int().positive().max(52),
  schedulingMode: z.enum(["smart_elastic", "ordered_daily"]).default("smart_elastic"),
  replaceFutureUnexecuted: z.boolean().default(true),
  progressionOverrides: z.array(UnitProgressionOverrideSchema).default([]),
  entryAnchorOverrides: z.array(EntryAnchorOverrideSchema).default([]),
  overrideScope: z.enum(["plan_only", "package_default"]).default("plan_only"),
});

export type GenerateTrainingPlanFromPackageInput = z.input<
  typeof GenerateTrainingPlanFromPackageInputSchema
>;

type TemplateDayWithItem = {
  id: string;
  dayCode: string;
  sequenceInMicrocycle: number;
  label: string | null;
  templateLibraryItemId: string;
  progressionOverrides: Array<{
    unitSequenceNo: number;
    unitRole?: string;
    progressionFamily?: string;
    progressionPolicyType?: string;
    progressionPolicyConfig?: Record<string, unknown>;
    adjustmentPolicyType?: string;
    adjustmentPolicyConfig?: Record<string, unknown>;
    successCriteria?: Record<string, unknown>;
    progressTrackKey?: string;
  }>;
  templateItem: NonNullable<Awaited<ReturnType<typeof getTemplateLibraryItemByIdForUser>>>;
};

type MicrocycleSlot = {
  slotIndex: number;
  type: "train" | "rest";
  dayCode: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNullableText(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapSessionCategory(sportType: SportType): SessionCategory {
  if (sportType === "hypertrophy") {
    return "hypertrophy";
  }
  if (sportType === "running" || sportType === "swimming") {
    return "endurance";
  }
  return "strength";
}

function mapBlockType(sportType: SportType): BlockType {
  if (sportType === "running" || sportType === "swimming") {
    return "base";
  }
  return "accumulation";
}

function asProgressionFamily(value: string):
  | "strict_load"
  | "threshold"
  | "exposure"
  | "performance"
  | "autoregulated" {
  if (
    value === "strict_load" ||
    value === "threshold" ||
    value === "exposure" ||
    value === "performance" ||
    value === "autoregulated"
  ) {
    return value;
  }
  return "strict_load";
}

function buildProgressTrackKey(name: string, sequenceNo: number) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "plan_unit"}_${sequenceNo}_${Date.now().toString(36)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeMicrocycleSlots(
  slots: Array<{ slot_index: number; type: "train" | "rest"; day_code: string | null }>,
  templateDays: TemplateDayWithItem[],
): MicrocycleSlot[] {
  const validDayCodes = new Set(templateDays.map((day) => day.dayCode.toUpperCase()));
  const sorted = [...slots]
    .sort((a, b) => a.slot_index - b.slot_index)
    .map((slot, index) => ({
      slotIndex: index + 1,
      type: slot.type,
      dayCode: slot.day_code?.toUpperCase() ?? null,
    }))
    .filter((slot) => slot.type === "rest" || (slot.dayCode !== null && validDayCodes.has(slot.dayCode)));

  const hasTrain = sorted.some((slot) => slot.type === "train");
  if (!hasTrain) {
    return templateDays.map((day, index) => ({
      slotIndex: index + 1,
      type: "train",
      dayCode: day.dayCode.toUpperCase(),
    }));
  }
  return sorted;
}

function buildTrainingWindowSchedule(
  startDate: Date,
  durationWeeks: number,
  slots: MicrocycleSlot[],
) {
  const windowDays = durationWeeks * 7;
  const firstTrainIndex = slots.findIndex((slot) => slot.type === "train");
  const startSlotIndex = firstTrainIndex >= 0 ? firstTrainIndex : 0;
  const sessionDates: Date[] = [];
  const sessionTemplateCodes: string[] = [];

  for (let offset = 0; offset < windowDays; offset += 1) {
    const slot = slots[(startSlotIndex + offset) % slots.length];
    if (slot.type !== "train" || !slot.dayCode) {
      continue;
    }
    sessionDates.push(addDays(startDate, offset));
    sessionTemplateCodes.push(slot.dayCode);
  }

  return {
    sessionDates,
    sessionTemplateCodes,
  };
}

function buildLoadText(unit: {
  recording_mode?: string | null;
  load_model: "external" | "bodyweight_plus_external";
  default_load_value: number | null;
  default_load_unit: "kg" | "lbs" | null;
  default_additional_load_value: number | null;
  default_additional_load_unit: "kg" | "lbs" | null;
}) {
  if (unit.load_model === "bodyweight_plus_external") {
    if (unit.default_additional_load_value && unit.default_additional_load_unit) {
      if (unit.recording_mode === "assisted" || unit.recording_mode === "assisted_bodyweight") {
        return `自重 + 辅助${unit.default_additional_load_value}${unit.default_additional_load_unit}`;
      }
      return `自重 + 附重${unit.default_additional_load_value}${unit.default_additional_load_unit}`;
    }
    return "自重";
  }
  if (unit.default_load_value && unit.default_load_unit) {
    return `${unit.default_load_value}${unit.default_load_unit}`;
  }
  return undefined;
}

function buildPrescriptionPayload(unit: {
  exercise_library_item_id: string;
  recording_mode?: string | null;
  record_mode: "sets_reps" | "sets_time";
  load_model: "external" | "bodyweight_plus_external";
  default_sets: number;
  default_reps: number | null;
  default_duration_seconds: number | null;
  default_load_value: number | null;
  default_load_unit: "kg" | "lbs" | null;
  default_additional_load_value: number | null;
  default_additional_load_unit: "kg" | "lbs" | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rpe_min: number | null;
  rpe_max: number | null;
  sets: unknown;
  superset_group?: {
    group_id: string;
    group_name: string | null;
    order_index: number;
    total_units: number;
    between_exercises_rest_seconds: number | null;
    between_rounds_rest_seconds: number | null;
    progression_budget_per_exposure: number;
    selection_mode: "auto_rotation" | "fixed_order" | "manual";
  } | null;
}, sourceTemplateLibraryItemId: string) {
  const payload: Record<string, unknown> = {
    sets: unit.default_sets,
    load_model: unit.load_model,
    recording_mode: unit.recording_mode ?? null,
    exercise_library_item_id: unit.exercise_library_item_id,
    source_template_library_item_id: sourceTemplateLibraryItemId,
    record_mode: unit.record_mode,
    load_text: buildLoadText(unit),
    set_structure: unit.sets,
  };

  if (unit.record_mode === "sets_time") {
    payload.duration_seconds = unit.default_duration_seconds ?? 60;
    payload.reps_applicable = false;
    payload.prescription_type = "sets_time";
  } else {
    payload.reps = unit.default_reps ?? 8;
    payload.prescription_type = "sets_reps";
  }

  if (unit.target_reps_min !== null) payload.target_reps_min = unit.target_reps_min;
  if (unit.target_reps_max !== null) payload.target_reps_max = unit.target_reps_max;
  if (unit.rpe_min !== null) payload.rpe_min = unit.rpe_min;
  if (unit.rpe_max !== null) payload.rpe_max = unit.rpe_max;

  if (unit.load_model === "external") {
    if (unit.default_load_value !== null) payload.load_value = unit.default_load_value;
    if (unit.default_load_unit !== null) payload.load_unit = unit.default_load_unit;
  } else {
    payload.load_unit = "bodyweight";
    if (unit.default_additional_load_value !== null) {
      payload.additional_load_value = unit.default_additional_load_value;
    }
    if (unit.default_additional_load_unit !== null) {
      payload.additional_load_unit = unit.default_additional_load_unit;
    }
  }

  if (unit.superset_group) {
    payload.superset = {
      group_id: unit.superset_group.group_id,
      group_name: unit.superset_group.group_name,
      order_index: unit.superset_group.order_index,
      total_units: unit.superset_group.total_units,
      between_exercises_rest_seconds:
        unit.superset_group.between_exercises_rest_seconds,
      between_rounds_rest_seconds:
        unit.superset_group.between_rounds_rest_seconds,
      progression_budget_per_exposure:
        unit.superset_group.progression_budget_per_exposure,
      selection_mode: unit.superset_group.selection_mode,
    };
  }

  return payload as Prisma.InputJsonValue;
}

function buildLoadTextFromPayload(payload: Record<string, unknown>) {
  const loadModel = typeof payload.load_model === "string" ? payload.load_model : "external";
  const recordingMode =
    typeof payload.recording_mode === "string" ? payload.recording_mode : null;
  if (loadModel === "bodyweight_plus_external") {
    const assistWeight =
      typeof payload.assist_weight === "number"
        ? payload.assist_weight
        : Number(payload.assist_weight);
    const additionalLoadValue =
      typeof payload.additional_load_value === "number"
        ? payload.additional_load_value
        : Number(payload.additional_load_value);
    const additionalLoadUnit =
      typeof payload.additional_load_unit === "string" ? payload.additional_load_unit : "kg";
    if (
      (recordingMode === "assisted" || recordingMode === "assisted_bodyweight") &&
      Number.isFinite(assistWeight) &&
      assistWeight > 0
    ) {
      return `自重 + 辅助${assistWeight}${additionalLoadUnit}`;
    }
    if (Number.isFinite(additionalLoadValue) && additionalLoadValue > 0) {
      return `自重 + 附重${additionalLoadValue}${additionalLoadUnit}`;
    }
    return "自重";
  }

  const loadValue =
    typeof payload.load_value === "number" ? payload.load_value : Number(payload.load_value);
  const loadUnit = typeof payload.load_unit === "string" ? payload.load_unit : "kg";
  if (Number.isFinite(loadValue) && loadValue > 0) {
    return `${loadValue}${loadUnit}`;
  }
  return undefined;
}

function toTargetRpeFromRir(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Number(Math.max(6, Math.min(10, 10 - value)).toFixed(1));
}

function applyEntryAnchorOverrideToPayload(
  payloadValue: Prisma.InputJsonValue,
  override: z.infer<typeof EntryAnchorOverrideSchema>,
) {
  const payload = {
    ...asRecord(payloadValue),
  };
  const recordMode =
    typeof payload.record_mode === "string" && payload.record_mode === "sets_time"
      ? "sets_time"
      : "sets_reps";
  const loadModel =
    typeof payload.load_model === "string" && payload.load_model === "bodyweight_plus_external"
      ? "bodyweight_plus_external"
      : "external";
  const recordingMode =
    typeof payload.recording_mode === "string" ? payload.recording_mode : null;
  const nextSetStructure = applyActionEntryAnchorSummaryToSetStructure({
    recordingMode,
    recordMode,
    loadModel,
    baseSetStructure: payload.set_structure,
    summary: {
      setCount: override.setCount ?? undefined,
      reps: override.reps ?? undefined,
      durationSeconds: override.durationSeconds ?? undefined,
      loadValue: override.loadValue ?? undefined,
      additionalLoadValue: override.additionalLoadValue ?? undefined,
      assistWeight: override.assistWeight ?? undefined,
      restSeconds: override.restSeconds ?? undefined,
      tempo: override.tempo ?? undefined,
      recommendedRir: override.recommendedRir ?? undefined,
    },
  });
  const summary = deriveActionEntryAnchorSummary({
    recordingMode,
    recordMode,
    loadModel,
    setStructure: nextSetStructure,
  });
  const targetRpe = summary.targetRpe ?? toTargetRpeFromRir(summary.recommendedRir);

  payload.set_structure = nextSetStructure;
  payload.sets = summary.setCount;

  if (recordMode === "sets_time") {
    payload.duration_seconds = summary.durationSeconds;
    delete payload.reps;
  } else {
    payload.reps = summary.reps;
    delete payload.duration_seconds;
  }

  if (summary.restSeconds !== null) {
    payload.rest_seconds = summary.restSeconds;
  }
  if (summary.tempo !== null) {
    payload.tempo = summary.tempo;
  }

  if (loadModel === "bodyweight_plus_external") {
    if (summary.assistWeight !== null) {
      payload.assist_weight = summary.assistWeight;
      payload.additional_load_value = summary.assistWeight;
    } else {
      delete payload.assist_weight;
      payload.additional_load_value = summary.additionalLoadValue;
    }
  } else {
    payload.load_value = summary.loadValue;
    delete payload.assist_weight;
    delete payload.additional_load_value;
  }

  if (targetRpe !== null) {
    payload.rpe_min = targetRpe;
    payload.rpe_max = targetRpe;
  }

  payload.load_text = buildLoadTextFromPayload(payload);

  if (override.source === "ai_recommendation" && override.candidateKey && override.trigger) {
    payload.ai_anchor = {
      source: "planning_ai_v1",
      candidate_key: override.candidateKey,
      trigger: override.trigger,
      confidence: override.confidence ?? "medium",
      logic_summary: override.logicSummary ?? "AI 已生成排期前入口锚点建议。",
      reasons:
        override.reasons && override.reasons.length > 0
          ? override.reasons
          : ["根据动作历史、当前逻辑与共享因子生成临时起点。"],
      logic_signature: override.logicSignature ?? null,
      days_since_last_performed: override.daysSinceLastPerformed ?? null,
      recommended_rir: summary.recommendedRir ?? null,
      pending_confirmation: false,
      generated_at: new Date().toISOString(),
    };
  } else {
    delete payload.ai_anchor;
  }

  return payload as Prisma.InputJsonValue;
}

function mergeOverrides(
  base: Array<{ dayId: string; unitSequenceNo: number } & Record<string, unknown>>,
  incoming: z.infer<typeof UnitProgressionOverrideSchema>[],
) {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of base) {
    map.set(`${item.dayId}:${item.unitSequenceNo}`, item);
  }
  for (const item of incoming) {
    map.set(`${item.dayId}:${item.unitSequenceNo}`, {
      ...map.get(`${item.dayId}:${item.unitSequenceNo}`),
      ...item,
    });
  }
  return map;
}

function toPackageOverrideRecord(value: Record<string, unknown>) {
  return {
    unit_sequence_no: Number(value.unitSequenceNo),
    unit_role: typeof value.unitRole === "string" ? value.unitRole : undefined,
    progression_family:
      typeof value.progressionFamily === "string" ? value.progressionFamily : undefined,
    progression_policy_type:
      typeof value.progressionPolicyType === "string" ? value.progressionPolicyType : undefined,
    progression_policy_config: asRecord(value.progressionPolicyConfig),
    adjustment_policy_type:
      typeof value.adjustmentPolicyType === "string" ? value.adjustmentPolicyType : undefined,
    adjustment_policy_config: asRecord(value.adjustmentPolicyConfig),
    success_criteria: asRecord(value.successCriteria),
    progress_track_key:
      typeof value.progressTrackKey === "string" ? value.progressTrackKey : undefined,
  };
}

async function resolveOrCreateProgram(
  userId: string,
  packageRecord: NonNullable<Awaited<ReturnType<typeof getTemplatePackageByIdForUser>>>,
  startDate: Date,
) {
  if (packageRecord.linked_program_id) {
    const existing = await getProgramById(packageRecord.linked_program_id, userId);
    if (existing) {
      return existing;
    }
  }

  const workflow = await createProgramWorkflowUseCase({
    userId,
    programName: `${packageRecord.name}计划`,
    structure: "weekly_1_day",
    sportType: "strength",
    startDate,
  });
  return workflow.program;
}

export async function generateTrainingPlanFromPackageUseCase(
  rawInput: GenerateTrainingPlanFromPackageInput,
) {
  const input = GenerateTrainingPlanFromPackageInputSchema.parse(rawInput);
  const packageRecord = await getTemplatePackageByIdForUser(input.packageId, input.userId);
  if (!packageRecord) {
    throw notFoundError("Template package not found");
  }
  if (!packageRecord.enabled) {
    throw badRequestError("模板包已停用，请先启用后再生成计划");
  }
  if (packageRecord.days.length === 0) {
    throw badRequestError("模板包中没有训练日，请先配置训练日");
  }

  const templateDays: TemplateDayWithItem[] = [];
  for (const day of packageRecord.days) {
    const templateItem = await getTemplateLibraryItemByIdForUser(day.template_library_item_id, input.userId);
    if (!templateItem) {
      throw badRequestError(`模板包中的训练日引用了不存在的模板：${day.template_library_item_id}`);
    }
    if (!templateItem.enabled) {
      throw badRequestError(`模板包中的模板已停用：${templateItem.name}`);
    }
    templateDays.push({
      id: day.id,
      dayCode: day.day_code,
      sequenceInMicrocycle: day.sequence_in_microcycle,
      label: day.label,
      templateLibraryItemId: day.template_library_item_id,
      progressionOverrides: day.progression_overrides.map((override) => ({
        unitSequenceNo: override.unit_sequence_no,
        unitRole: override.unit_role,
        progressionFamily: override.progression_family,
        progressionPolicyType: override.progression_policy_type,
        progressionPolicyConfig: override.progression_policy_config ?? {},
        adjustmentPolicyType: override.adjustment_policy_type,
        adjustmentPolicyConfig: override.adjustment_policy_config ?? {},
        successCriteria: override.success_criteria ?? {},
        progressTrackKey: override.progress_track_key,
      })),
      templateItem,
    });
  }
  templateDays.sort((a, b) => a.sequenceInMicrocycle - b.sequenceInMicrocycle);

  const microcycleSlots = normalizeMicrocycleSlots(
    packageRecord.microcycle_slots,
    templateDays,
  );
  const trainingWindow = buildTrainingWindowSchedule(
    input.startDate,
    input.durationWeeks,
    microcycleSlots,
  );
  if (trainingWindow.sessionDates.length === 0) {
    throw badRequestError("当前模板包微周期没有可生成的训练日，请检查训练/休息槽位配置");
  }

  const baseOverrides = templateDays.flatMap((day) =>
    day.progressionOverrides.map((override) => ({
      dayId: day.id,
      ...override,
    })),
  );
  const mergedOverrideMap = mergeOverrides(baseOverrides, input.progressionOverrides);
  const entryAnchorOverrideMap = new Map(
    input.entryAnchorOverrides.map((override) => [
      `${override.dayId}:${override.unitSequenceNo}`,
      override,
    ] as const),
  );

  const program = await resolveOrCreateProgram(input.userId, packageRecord, input.startDate);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const existingBlock = await tx.block.findFirst({
      where: {
        program_id: program.id,
      },
      orderBy: {
        sequence_no: "asc",
      },
    });

    const block =
      existingBlock ??
      (await createBlock(
        {
          program_id: program.id,
          sequence_no: 1,
          name: "第1训练阶段",
          block_type: mapBlockType(program.sport_type as SportType),
          start_date: input.startDate,
          volume_target: {},
          intensity_target: {},
          progression_focus: {},
          notes: "自动创建：模板包计划生成。",
        },
        tx,
      ));

    await tx.sessionTemplate.updateMany({
      where: {
        block_id: block.id,
        enabled: true,
      },
      data: {
        enabled: false,
      },
    });

    for (const [index, day] of templateDays.entries()) {
      const sessionTemplate = await createSessionTemplate(
        {
          block_id: block.id,
          code: day.dayCode.toUpperCase(),
          name: day.label ?? `训练日 ${day.dayCode.toUpperCase()}`,
          sequence_in_microcycle: index + 1,
          microcycle_anchor: "ordered_rotation",
          preferred_weekday: null,
          sport_type: program.sport_type as SportType,
          session_category: mapSessionCategory(program.sport_type as SportType),
          theme_tags: [],
          objective_summary: `${packageRecord.name} · ${day.dayCode.toUpperCase()}`,
          expected_duration_min: 60,
          fatigue_cost: "medium",
          priority: 1,
          scheduling_policy_type: "ordered_rotation",
          scheduling_policy_config: {
            source: "template_package",
            package_id: packageRecord.id,
            day_code: day.dayCode,
          },
          enabled: true,
          notes: "自动生成：模板包编排向导。",
        },
        tx,
      );

      for (const templateUnit of day.templateItem.units) {
        const override = mergedOverrideMap.get(`${day.id}:${templateUnit.sequence_no}`);
        const progression = normalizeProgressionConfig({
          unitRole:
            typeof override?.unitRole === "string"
              ? override.unitRole
              : templateUnit.unit_role,
          progressionFamily:
            typeof override?.progressionFamily === "string"
              ? override.progressionFamily
              : templateUnit.progression_family,
          progressionPolicyType:
            typeof override?.progressionPolicyType === "string"
              ? override.progressionPolicyType
              : templateUnit.progression_policy_type,
          progressionPolicyConfig:
            override?.progressionPolicyConfig && Object.keys(override.progressionPolicyConfig).length > 0
              ? override.progressionPolicyConfig
              : templateUnit.progression_policy_config,
          adjustmentPolicyType:
            typeof override?.adjustmentPolicyType === "string"
              ? override.adjustmentPolicyType
              : templateUnit.adjustment_policy_type,
          adjustmentPolicyConfig:
            override?.adjustmentPolicyConfig && Object.keys(override.adjustmentPolicyConfig).length > 0
              ? override.adjustmentPolicyConfig
              : templateUnit.adjustment_policy_config,
          successCriteria:
            override?.successCriteria && Object.keys(override.successCriteria).length > 0
              ? override.successCriteria
              : templateUnit.success_criteria,
          progressTrackKey:
            typeof override?.progressTrackKey === "string"
              ? override.progressTrackKey
              : templateUnit.progress_track_key,
          progressTrackKeyFallback: buildProgressTrackKey(
            templateUnit.exercise_name_snapshot,
            templateUnit.sequence_no,
          ),
        });

        const prescriptionType =
          templateUnit.record_mode === "sets_time" ? "sets_time" : "sets_reps";
        const payload = (() => {
          const basePayload = buildPrescriptionPayload(templateUnit, day.templateLibraryItemId);
          const entryAnchorOverride = entryAnchorOverrideMap.get(
            `${day.id}:${templateUnit.sequence_no}`,
          );
          if (!entryAnchorOverride) {
            return basePayload;
          }
          return applyEntryAnchorOverrideToPayload(basePayload, entryAnchorOverride);
        })();

        await ensureProgressTrackByKeyWithTx(
          {
            user_id: input.userId,
            program_id: program.id,
            track_key: progression.progressTrackKey,
            name: templateUnit.exercise_name_snapshot,
            sport_type: program.sport_type as SportType,
            progression_family: asProgressionFamily(progression.progressionFamily),
            progression_policy_type: progression.progressionPolicyType,
            progression_policy_config:
              progression.progressionPolicyConfig as Prisma.InputJsonValue,
            current_state: buildInitialProgressTrackState({
              prescriptionType,
              payload: asRecord(payload),
            }) as Prisma.InputJsonValue,
          },
          tx,
        );

        await createTrainingUnitTemplate(
          {
            session_template_id: sessionTemplate.id,
            sequence_no: templateUnit.sequence_no,
            name: templateUnit.exercise_name_snapshot,
            display_name: templateUnit.exercise_name_snapshot,
            sport_type: program.sport_type as SportType,
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
            optional: !templateUnit.required,
            priority_score_base: new Prisma.Decimal(1),
            progress_track_key: progression.progressTrackKey,
            progression_family: asProgressionFamily(progression.progressionFamily),
            progression_policy_type: progression.progressionPolicyType,
            progression_policy_config:
              progression.progressionPolicyConfig as Prisma.InputJsonValue,
            adjustment_policy_type: progression.adjustmentPolicyType,
            adjustment_policy_config:
              progression.adjustmentPolicyConfig as Prisma.InputJsonValue,
            prescription_type: prescriptionType,
            prescription_payload: payload,
            success_criteria: progression.successCriteria as Prisma.InputJsonValue,
            min_spacing_sessions: null,
            adjustment_cooldown_exposures: null,
            notes: toNullableText(templateUnit.notes),
          },
          tx,
        );
      }
    }
  });

  if (input.overrideScope === "package_default" && input.progressionOverrides.length > 0) {
    const mergedDays = templateDays.map((day) => {
      const unitSeqSet = new Set<number>();
      const mergedOverrides = Array.from(mergedOverrideMap.values())
        .filter(
          (override) =>
            typeof override.dayId === "string" &&
            override.dayId === day.id &&
            typeof override.unitSequenceNo === "number" &&
            override.unitSequenceNo > 0,
        )
        .map((override) => toPackageOverrideRecord(override))
        .filter((override) => {
          if (unitSeqSet.has(override.unit_sequence_no)) return false;
          unitSeqSet.add(override.unit_sequence_no);
          return true;
        })
        .sort((a, b) => a.unit_sequence_no - b.unit_sequence_no);

      return {
        id: day.id,
        day_code: day.dayCode,
        sequence_in_microcycle: day.sequenceInMicrocycle,
        template_library_item_id: day.templateLibraryItemId,
        label: day.label ?? null,
        notes: null,
        progression_overrides: mergedOverrides,
      };
    });

    await updateTemplatePackageById(packageRecord.id, input.userId, {
      days: mergedDays,
    });
  }

  const sessionCount = trainingWindow.sessionDates.length;
  const generatedSessions = await generatePlannedSessionsUseCase({
    userId: input.userId,
    programId: program.id,
    startDate: input.startDate,
    sessionCount,
    replaceFutureUnexecuted: input.replaceFutureUnexecuted,
    schedulingMode: "ordered_daily",
    generationReason: "initial_generation",
    sessionDateSequence: trainingWindow.sessionDates,
    sessionTemplateCodeSequence: trainingWindow.sessionTemplateCodes,
  });

  if (input.entryAnchorOverrides.length > 0) {
    const pendingByCandidateKey = new Set<string>();
    for (const session of generatedSessions) {
      for (const unit of session.planned_units) {
        const payload = asRecord(unit.target_payload);
        const aiAnchor = asRecord(payload.ai_anchor);
        const candidateKey =
          typeof aiAnchor.candidate_key === "string" ? aiAnchor.candidate_key : null;
        if (!candidateKey || pendingByCandidateKey.has(candidateKey)) {
          continue;
        }
        pendingByCandidateKey.add(candidateKey);
        await updatePlannedUnitTargetPayloadById(unit.id, {
          ...payload,
          ai_anchor: {
            ...aiAnchor,
            pending_confirmation: true,
          },
        } as Prisma.InputJsonValue);
      }
    }
  }

  await Promise.all([
    setTemplatePackageLastUsedAt(packageRecord.id, input.userId, now.toISOString()),
    updateTemplatePackageById(packageRecord.id, input.userId, {
      linked_program_id: program.id,
    }),
    ...templateDays.map((day) =>
      setTemplateLibraryItemLastUsedAt(day.templateLibraryItemId, input.userId, now.toISOString()),
    ),
  ]);

  return {
    packageId: packageRecord.id,
    programId: program.id,
    generatedSessionCount: generatedSessions.length,
    firstSessionDate:
      generatedSessions[0]?.session_date instanceof Date
        ? generatedSessions[0].session_date.toISOString().slice(0, 10)
        : null,
    startDate: input.startDate.toISOString().slice(0, 10),
    durationWeeks: input.durationWeeks,
    schedulingMode: "ordered_daily" as const,
    replaceFutureUnexecuted: input.replaceFutureUnexecuted,
    generatedAt: new Date().toISOString(),
  };
}
