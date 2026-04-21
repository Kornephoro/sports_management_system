import { Prisma, PrescriptionType } from "@prisma/client";
import { z } from "zod";

import {
  countTrainingUnitTemplateReferences,
  createTrainingUnitTemplate,
  deleteTrainingUnitTemplatesBySessionTemplateId,
  ensureProgressTrackByKeyWithTx,
  getSessionTemplateByIdForUser,
  getTemplateLibraryItemByIdForUser,
  listTrainingUnitTemplatesBySessionTemplate,
  setTemplateLibraryItemLastUsedAt,
} from "@/server/repositories";
import {
  buildInitialProgressTrackState,
  normalizeProgressionConfig,
} from "@/server/services/progression/progression-config.service";
import { deriveLegacyDefaultsFromTrainingSets, TrainingUnitSet } from "@/lib/training-set-standards";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const ApplyTemplateLibraryItemToSessionTemplateInputSchema = z.object({
  userId: UuidLikeSchema,
  templateLibraryItemId: UuidLikeSchema,
  sessionTemplateId: UuidLikeSchema,
  mode: z.enum(["replace", "append"]).default("replace"),
});

export type ApplyTemplateLibraryItemToSessionTemplateInput = z.input<
  typeof ApplyTemplateLibraryItemToSessionTemplateInputSchema
>;

function toNullableText(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProgressTrackKey(name: string, sequenceNo: number) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = Date.now().toString(36);
  return `${slug || "template_unit"}_${sequenceNo}_${suffix}`;
}

function asProgressionFamily(value: string): "strict_load" | "threshold" | "exposure" | "performance" | "autoregulated" {
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

function buildLoadText(unit: {
  load_model: "external" | "bodyweight_plus_external";
  default_load_value: number | null;
  default_load_unit: "kg" | "lbs" | null;
  default_additional_load_value: number | null;
  default_additional_load_unit: "kg" | "lbs" | null;
}, overrides?: {
  defaultLoadValue: number | null;
  defaultAdditionalLoadValue: number | null;
}) {
  const defaultLoadValue = overrides?.defaultLoadValue ?? unit.default_load_value;
  const defaultAdditionalLoadValue =
    overrides?.defaultAdditionalLoadValue ?? unit.default_additional_load_value;

  if (unit.load_model === "bodyweight_plus_external") {
    if (defaultAdditionalLoadValue && unit.default_additional_load_unit) {
      return `自重 + 附重${defaultAdditionalLoadValue}${unit.default_additional_load_unit}`;
    }
    return "自重";
  }

  if (defaultLoadValue && unit.default_load_unit) {
    return `${defaultLoadValue}${unit.default_load_unit}`;
  }

  return undefined;
}

function buildPrescriptionPayload(
  unit: {
    exercise_library_item_id: string;
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
    sets: TrainingUnitSet[];
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
  },
  templateLibraryItemId: string,
) {
  const legacyFromSets = deriveLegacyDefaultsFromTrainingSets(unit.sets, {
    loadModel: unit.load_model,
    recordMode: unit.record_mode,
  });
  const effectiveSets = legacyFromSets?.defaultSets ?? unit.default_sets;
  const effectiveReps = legacyFromSets?.defaultReps ?? unit.default_reps;
  const effectiveDurationSeconds =
    legacyFromSets?.defaultDurationSeconds ?? unit.default_duration_seconds;
  const effectiveLoadValue = legacyFromSets?.defaultLoadValue ?? unit.default_load_value;
  const effectiveAdditionalLoadValue =
    legacyFromSets?.defaultAdditionalLoadValue ?? unit.default_additional_load_value;

  const payload: Record<string, unknown> = {
    sets: effectiveSets,
    load_model: unit.load_model,
    exercise_library_item_id: unit.exercise_library_item_id,
    source_template_library_item_id: templateLibraryItemId,
    record_mode: unit.record_mode,
    load_text: buildLoadText(unit, {
      defaultLoadValue: effectiveLoadValue,
      defaultAdditionalLoadValue: effectiveAdditionalLoadValue,
    }),
    set_structure: unit.sets,
  };

  if (unit.record_mode === "sets_time") {
    payload.duration_seconds = effectiveDurationSeconds ?? 60;
    payload.reps_applicable = false;
    payload.prescription_type = "sets_time";
  } else {
    payload.reps = effectiveReps ?? 8;
    payload.prescription_type = "sets_reps";
  }

  if (unit.target_reps_min !== null) {
    payload.target_reps_min = unit.target_reps_min;
  }
  if (unit.target_reps_max !== null) {
    payload.target_reps_max = unit.target_reps_max;
  }
  if (unit.rpe_min !== null) {
    payload.rpe_min = unit.rpe_min;
  }
  if (unit.rpe_max !== null) {
    payload.rpe_max = unit.rpe_max;
  }

  if (unit.load_model === "external") {
    if (effectiveLoadValue !== null) {
      payload.load_value = effectiveLoadValue;
    }
    if (unit.default_load_unit !== null) {
      payload.load_unit = unit.default_load_unit;
    }
    if (effectiveLoadValue !== null || unit.default_load_unit !== null) {
      payload.default_load = {
        value: effectiveLoadValue ?? "自重",
        unit: unit.default_load_unit ?? "bodyweight",
      };
    }
  } else {
    payload.load_unit = "bodyweight";
    if (effectiveAdditionalLoadValue !== null) {
      payload.additional_load_value = effectiveAdditionalLoadValue;
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

async function applyTemplateToSessionTemplate(
  input: z.infer<typeof ApplyTemplateLibraryItemToSessionTemplateInputSchema>,
  tx?: Prisma.TransactionClient,
) {
  const [template, sessionTemplate] = await Promise.all([
    getTemplateLibraryItemByIdForUser(input.templateLibraryItemId, input.userId),
    getSessionTemplateByIdForUser(input.sessionTemplateId, input.userId),
  ]);

  if (!template) {
    throw notFoundError("Template library item not found");
  }
  if (!template.enabled) {
    throw badRequestError("模板已归档，不能用于导入");
  }
  if (!sessionTemplate) {
    throw notFoundError("Session template not found");
  }

  let startSequenceNo = 1;
  if (input.mode === "replace") {
    const existingUnits = await listTrainingUnitTemplatesBySessionTemplate(input.sessionTemplateId, tx);

    for (const unit of existingUnits) {
      const ref = await countTrainingUnitTemplateReferences(unit.id);
      if (ref.plannedUnitCount > 0 || ref.unitExecutionCount > 0) {
        throw badRequestError(
          "目标训练日模板存在已安排或已执行引用，不能覆盖导入。请新建训练日模板或先清理引用。",
        );
      }
    }

    await deleteTrainingUnitTemplatesBySessionTemplateId(input.sessionTemplateId, tx);
    startSequenceNo = 1;
  } else {
    const existingUnits = await listTrainingUnitTemplatesBySessionTemplate(input.sessionTemplateId, tx);
    startSequenceNo = existingUnits.length + 1;
  }

  for (const [index, unit] of template.units.entries()) {
    const sequenceNo = startSequenceNo + index;
    const prescriptionType: PrescriptionType =
      unit.record_mode === "sets_time" ? "sets_time" : "sets_reps";
    const progression = normalizeProgressionConfig({
      unitRole: unit.unit_role,
      progressionFamily: unit.progression_family,
      progressionPolicyType: unit.progression_policy_type,
      progressionPolicyConfig: unit.progression_policy_config,
      adjustmentPolicyType: unit.adjustment_policy_type,
      adjustmentPolicyConfig: unit.adjustment_policy_config,
      successCriteria: unit.success_criteria,
      progressTrackKey: unit.progress_track_key,
      progressTrackKeyFallback: buildProgressTrackKey(unit.exercise_name_snapshot, sequenceNo),
    });
    const prescriptionPayload = buildPrescriptionPayload(unit, template.id);

    await ensureProgressTrackByKeyWithTx(
      {
        user_id: input.userId,
        program_id: sessionTemplate.block.program_id,
        track_key: progression.progressTrackKey,
        name: unit.exercise_name_snapshot,
        sport_type: sessionTemplate.sport_type,
        progression_family: asProgressionFamily(progression.progressionFamily),
        progression_policy_type: progression.progressionPolicyType,
        progression_policy_config: progression.progressionPolicyConfig as Prisma.InputJsonValue,
        current_state: buildInitialProgressTrackState({
          prescriptionType,
          payload:
            typeof prescriptionPayload === "object" &&
            prescriptionPayload !== null &&
            !Array.isArray(prescriptionPayload)
              ? (prescriptionPayload as Record<string, unknown>)
              : {},
        }) as Prisma.InputJsonValue,
      },
      tx,
    );

    await createTrainingUnitTemplate(
      {
        session_template_id: input.sessionTemplateId,
        sequence_no: sequenceNo,
        name: unit.exercise_name_snapshot,
        display_name: unit.exercise_name_snapshot,
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
        optional: !unit.required,
        priority_score_base: new Prisma.Decimal(1),
        progress_track_key: progression.progressTrackKey,
        progression_family: asProgressionFamily(progression.progressionFamily),
        progression_policy_type: progression.progressionPolicyType,
        progression_policy_config: progression.progressionPolicyConfig as Prisma.InputJsonValue,
        adjustment_policy_type: progression.adjustmentPolicyType,
        adjustment_policy_config: progression.adjustmentPolicyConfig as Prisma.InputJsonValue,
        prescription_type: prescriptionType,
        prescription_payload: prescriptionPayload,
        success_criteria: progression.successCriteria as Prisma.InputJsonValue,
        min_spacing_sessions: null,
        adjustment_cooldown_exposures: null,
        notes: toNullableText(unit.notes),
      },
      tx,
    );
  }

  await setTemplateLibraryItemLastUsedAt(template.id, input.userId, new Date().toISOString());

  return {
    templateLibraryItemId: template.id,
    sessionTemplateId: input.sessionTemplateId,
    mode: input.mode,
    appliedUnitCount: template.units.length,
  };
}

export async function applyTemplateLibraryItemToSessionTemplateUseCase(
  rawInput: ApplyTemplateLibraryItemToSessionTemplateInput,
) {
  const input = ApplyTemplateLibraryItemToSessionTemplateInputSchema.parse(rawInput);
  return applyTemplateToSessionTemplate(input);
}

export async function applyTemplateLibraryItemToSessionTemplateWithTx(
  rawInput: ApplyTemplateLibraryItemToSessionTemplateInput,
  tx: Prisma.TransactionClient,
) {
  const input = ApplyTemplateLibraryItemToSessionTemplateInputSchema.parse(rawInput);
  return applyTemplateToSessionTemplate(input, tx);
}
