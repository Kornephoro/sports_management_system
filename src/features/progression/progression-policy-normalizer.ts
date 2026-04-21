import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  AdjustmentPolicyTypeValue,
  ProgressionFamilyValue,
} from "@/lib/progression-standards";
import {
  CLASSIC_LINEAR_PERIODIZATION_DEFAULT_STEPS,
  ClassicPolicyType,
  LinearPeriodizationStep,
  getClassicProgressionDefinitionByPolicyType,
  isClassicPolicyType,
} from "@/features/progression/progression-policy-schema";

export type ProgressionConfigValue = {
  progressionFamily: ProgressionFamilyValue | string;
  progressionPolicyType: string;
  progressionPolicyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  adjustmentPolicyType?: AdjustmentPolicyTypeValue | string;
  adjustmentPolicyConfig?: Record<string, unknown>;
  progressTrackKey?: string;
};

export type TrainingZoneConfig = {
  targetRepsMin?: number;
  targetRepsMax?: number;
  rpeMin?: number;
  rpeMax?: number;
};

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return fallback;
}

function toInteger(value: unknown) {
  const parsed = toPositiveNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(1, Math.trunc(parsed));
}

function toNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function toAdjustmentPolicyType(value: unknown): AdjustmentPolicyTypeValue {
  if (
    typeof value === "string" &&
    (ADJUSTMENT_POLICY_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as AdjustmentPolicyTypeValue;
  }
  return "always";
}

const ROTATION_DIVERSIFY_DIMENSIONS = ["primary_muscle", "movement_pattern"] as const;

function normalizeDiversifyDimensions(value: unknown) {
  const fallback = [...ROTATION_DIVERSIFY_DIMENSIONS];
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(
      (item): item is "primary_muscle" | "movement_pattern" =>
        item === "primary_muscle" || item === "movement_pattern",
    );

  const unique = Array.from(new Set(normalized));
  return unique.length > 0 ? unique : fallback;
}

function normalizeAdjustmentPolicyConfig(
  adjustmentPolicyType: AdjustmentPolicyTypeValue,
  configInput: unknown,
) {
  const config = asRecord(configInput);
  const progressionEnabled = toBoolean(config.progression_enabled, true);

  if (adjustmentPolicyType === "rotating_pool") {
    const rotationQuota =
      toInteger(config.rotation_quota ?? config.rotationQuota ?? config.quota) ?? 2;
    return {
      ...config,
      progression_enabled: progressionEnabled,
      rotation_quota: Math.min(Math.max(rotationQuota, 1), 5),
      diversify_dimensions: normalizeDiversifyDimensions(
        config.diversify_dimensions ?? config.diversifyDimensions ?? config.diversity_dimensions,
      ),
    };
  }

  return {
    ...config,
    progression_enabled: progressionEnabled,
  };
}

function toLegacyPhases(steps: LinearPeriodizationStep[]) {
  return steps.map((step, index) => ({
    phase_name: step.name || `phase_${index + 1}`,
    target: {
      current_sets: step.sets,
      current_reps: step.reps,
    },
    load_change: step.loadChange,
  }));
}

function parsePeriodizationSteps(policyConfig: Record<string, unknown>): LinearPeriodizationStep[] {
  if (Array.isArray(policyConfig.steps)) {
    const fromSteps = policyConfig.steps
      .map((entry, index) => {
        const record = asRecord(entry);
        const sets = toInteger(record.sets);
        const reps = toInteger(record.reps);
        if (!sets || !reps) {
          return null;
        }
        return {
          name:
            typeof record.name === "string" && record.name.trim().length > 0
              ? record.name.trim()
              : `Step ${index + 1}`,
          sets,
          reps,
          loadChange: toPositiveNumber(record.loadChange) ?? 0,
        } satisfies LinearPeriodizationStep;
      })
      .filter((entry): entry is LinearPeriodizationStep => Boolean(entry));

    if (fromSteps.length > 0) {
      return fromSteps;
    }
  }

  if (Array.isArray(policyConfig.phases)) {
    const fromPhases = policyConfig.phases
      .map((entry, index) => {
        const record = asRecord(entry);
        const target = asRecord(record.target);
        const sets = toInteger(target.current_sets ?? record.current_sets ?? record.sets);
        const reps = toInteger(target.current_reps ?? record.current_reps ?? record.reps);
        if (!sets || !reps) {
          return null;
        }
        return {
          name:
            typeof record.phase_name === "string" && record.phase_name.trim().length > 0
              ? record.phase_name.trim()
              : `Step ${index + 1}`,
          sets,
          reps,
          loadChange:
            toPositiveNumber(record.load_change) ??
            toPositiveNumber(record.load_percent) ??
            0,
        } satisfies LinearPeriodizationStep;
      })
      .filter((entry): entry is LinearPeriodizationStep => Boolean(entry));

    if (fromPhases.length > 0) {
      return fromPhases;
    }
  }

  return CLASSIC_LINEAR_PERIODIZATION_DEFAULT_STEPS;
}

function normalizeTotalRepsThreshold(
  policyConfig: Record<string, unknown>,
  successCriteria: Record<string, unknown>,
) {
  const threshold =
    toInteger(
      policyConfig.target_total_reps ??
        policyConfig.total_reps_threshold ??
        successCriteria.total_reps_threshold,
    ) ?? 40;
  const progressionStep =
    toPositiveNumber(policyConfig.progression_step ?? policyConfig.load_increment) ?? 2.5;
  const resetReps = toInteger(policyConfig.reset_reps ?? policyConfig.reset_reps_to) ?? 8;
  const nextPolicy = {
    ...policyConfig,
    target_total_reps: threshold,
    total_reps_threshold: threshold,
    base_sets: toInteger(policyConfig.base_sets) ?? 3,
    progression_step: progressionStep,
    load_increment: progressionStep,
    reset_reps: resetReps,
    reset_reps_to: toInteger(policyConfig.reset_reps_to) ?? 8,
    allow_partial_progress: toBoolean(policyConfig.allow_partial_progress, true),
    progression_order:
      policyConfig.progression_order === "sets_first" ? "sets_first" : "reps_first",
    max_sets: toInteger(policyConfig.max_sets) ?? 5,
    max_reps_per_set: toInteger(policyConfig.max_reps_per_set) ?? 15,
    min_rest_seconds: toInteger(policyConfig.min_rest_seconds) ?? 90,
    under_target_path:
      typeof policyConfig.under_target_path === "string"
        ? policyConfig.under_target_path
        : "hold",
  };
  const nextSuccess = {
    ...successCriteria,
    metric: "total_reps",
    threshold,
    total_reps_threshold: threshold,
  };

  return {
    nextPolicy,
    nextSuccess,
  };
}

function normalizeLinearProgression(
  policyConfig: Record<string, unknown>,
  successCriteria: Record<string, unknown>,
) {
  const failureThreshold =
    toInteger(policyConfig.failure_streak_threshold ?? policyConfig.fail_limit) ?? 2;
  const progressionFrequency =
    toInteger(policyConfig.progression_frequency ?? policyConfig.increment_frequency) ?? 1;

  const nextPolicy = {
    ...policyConfig,
    fixed_sets: toInteger(policyConfig.fixed_sets) ?? 3,
    fixed_reps: toInteger(policyConfig.fixed_reps) ?? 5,
    load_increment: toPositiveNumber(policyConfig.load_increment) ?? 2.5,
    failure_streak_threshold: failureThreshold,
    fail_limit: failureThreshold,
    max_attempts_before_hold:
      toInteger(policyConfig.max_attempts_before_hold ?? failureThreshold) ?? failureThreshold,
    deload_percent: toPositiveNumber(policyConfig.deload_percent) ?? 0.9,
    progression_frequency: progressionFrequency,
    increment_frequency: progressionFrequency,
  };

  const nextSuccess = {
    ...successCriteria,
    complete_all_sets: true,
    meet_target_reps: true,
  };

  return {
    nextPolicy,
    nextSuccess,
  };
}

function normalizeLinearPeriodization(
  policyConfig: Record<string, unknown>,
  successCriteria: Record<string, unknown>,
) {
  const steps = parsePeriodizationSteps(policyConfig);
  const canonicalSteps = steps.map((step, index) => ({
    reps: step.reps,
    intensity_level: step.name || `step_${index + 1}`,
  }));
  const advanceBasis =
    typeof policyConfig.advance_basis === "string" && policyConfig.advance_basis === "exposure"
      ? "exposure"
      : "success";
  const advanceMode =
    typeof policyConfig.advance_mode === "string" && policyConfig.advance_mode === "exposure"
      ? "exposure"
      : "step";

  const nextPolicy = {
    ...policyConfig,
    steps,
    progression_steps: canonicalSteps,
    phases: toLegacyPhases(steps),
    progression_trigger: advanceBasis,
    cycle_mode: policyConfig.cycle_mode === "clamp" ? "clamp" : "loop",
    allow_variable_width: toBoolean(policyConfig.allow_variable_width, false),
    advance_mode: advanceMode,
    advance_basis: advanceBasis,
    advance_on: advanceBasis,
    include_deload_step: toBoolean(policyConfig.include_deload_step, false),
    deload_rule:
      typeof policyConfig.deload_rule === "string"
        ? policyConfig.deload_rule
        : "reduce_load_keep_technique",
    restart_mode:
      typeof policyConfig.restart_mode === "string"
        ? policyConfig.restart_mode
        : "loop_with_higher_baseline",
  };

  const nextSuccess = {
    ...successCriteria,
    complete_all_sets: true,
    min_successes_to_advance: toInteger(successCriteria.min_successes_to_advance) ?? 1,
  };

  return {
    nextPolicy,
    nextSuccess,
  };
}

function normalizeDoubleProgression(
  policyConfig: Record<string, unknown>,
  successCriteria: Record<string, unknown>,
) {
  const repRangeMin =
    toInteger(policyConfig.rep_range_min ?? policyConfig.rep_floor ?? successCriteria.target_reps_min) ??
    8;
  const repRangeMax =
    toInteger(policyConfig.rep_range_max ?? policyConfig.rep_ceiling ?? successCriteria.target_reps_max) ??
    Math.max(repRangeMin + 2, 10);
  const correctedMax = Math.max(repRangeMin, repRangeMax);
  const targetSets =
    toInteger(policyConfig.target_sets ?? successCriteria.target_sets ?? successCriteria.base_sets) ??
    3;

  const attainmentMode =
    typeof policyConfig.attainment_mode === "string" &&
    policyConfig.attainment_mode === "total_reps_threshold"
      ? "total_reps_threshold"
      : "all_sets_hit_upper";

  const totalRepsThreshold =
    toInteger(successCriteria.total_reps_threshold ?? policyConfig.total_reps_threshold) ?? 30;

  const nextPolicy = {
    ...policyConfig,
    target_sets: targetSets,
    rep_range_min: repRangeMin,
    rep_range_max: correctedMax,
    rep_floor: repRangeMin,
    rep_ceiling: correctedMax,
    rep_step: toInteger(policyConfig.rep_step) ?? 1,
    progression_step: toPositiveNumber(policyConfig.progression_step ?? policyConfig.load_increment) ?? 2.5,
    load_increment: toPositiveNumber(policyConfig.load_increment) ?? 2.5,
    progression_trigger:
      policyConfig.progression_trigger === "any_set_max" ? "any_set_max" : "all_sets_max",
    reset_to_min_after_load_increase: toBoolean(
      policyConfig.reset_to_min_after_load_increase ??
        policyConfig.post_increment_reset_rule === "back_to_range_floor",
      true,
    ),
    attainment_mode: attainmentMode,
    post_increment_reset_rule:
      typeof policyConfig.post_increment_reset_rule === "string"
        ? policyConfig.post_increment_reset_rule
        : "back_to_range_floor",
    allow_deload_week: toBoolean(policyConfig.allow_deload_week, false),
    total_reps_threshold: totalRepsThreshold,
  };

  const nextSuccess = {
    ...successCriteria,
    complete_all_sets: true,
    target_sets: targetSets,
    target_reps_min: repRangeMin,
    target_reps_max: correctedMax,
    all_sets_reach_rep_range_max: attainmentMode === "all_sets_hit_upper",
    total_reps_threshold: totalRepsThreshold,
  };

  return {
    nextPolicy,
    nextSuccess,
  };
}

function normalizeByPolicyType(
  policyType: ClassicPolicyType,
  policyConfig: Record<string, unknown>,
  successCriteria: Record<string, unknown>,
) {
  switch (policyType) {
    case "total_reps_threshold":
      return normalizeTotalRepsThreshold(policyConfig, successCriteria);
    case "linear_load_step":
      return normalizeLinearProgression(policyConfig, successCriteria);
    case "linear_periodization_step":
      return normalizeLinearPeriodization(policyConfig, successCriteria);
    case "double_progression":
    default:
      return normalizeDoubleProgression(policyConfig, successCriteria);
  }
}

export function extractTrainingZoneFromSuccessCriteria(successCriteriaInput: unknown): TrainingZoneConfig {
  const successCriteria = asRecord(successCriteriaInput);
  const targetRepsMin = toInteger(successCriteria.target_reps_min ?? successCriteria.targetRepsMin);
  const targetRepsMax = toInteger(successCriteria.target_reps_max ?? successCriteria.targetRepsMax);
  const rpeMin = toNonNegativeNumber(successCriteria.rpe_min ?? successCriteria.rpeMin);
  const rpeMax = toNonNegativeNumber(successCriteria.rpe_max ?? successCriteria.rpeMax);
  const clampedRpeMin =
    rpeMin !== undefined ? Math.min(10, Math.max(0, rpeMin)) : undefined;
  const clampedRpeMax =
    rpeMax !== undefined ? Math.min(10, Math.max(0, rpeMax)) : undefined;

  const normalizedMin = targetRepsMin;
  const normalizedMax =
    targetRepsMax !== undefined && normalizedMin !== undefined
      ? Math.max(normalizedMin, targetRepsMax)
      : targetRepsMax;
  const normalizedRpeMin = clampedRpeMin;
  const normalizedRpeMax =
    clampedRpeMax !== undefined && normalizedRpeMin !== undefined
      ? Math.max(normalizedRpeMin, clampedRpeMax)
      : clampedRpeMax;

  return {
    ...(normalizedMin !== undefined ? { targetRepsMin: normalizedMin } : {}),
    ...(normalizedMax !== undefined ? { targetRepsMax: normalizedMax } : {}),
    ...(normalizedRpeMin !== undefined ? { rpeMin: normalizedRpeMin } : {}),
    ...(normalizedRpeMax !== undefined ? { rpeMax: normalizedRpeMax } : {}),
  };
}

export function applyTrainingZoneToSuccessCriteria(
  successCriteriaInput: unknown,
  zoneInput: TrainingZoneConfig,
) {
  const base = { ...asRecord(successCriteriaInput) };
  const zone = extractTrainingZoneFromSuccessCriteria({
    ...base,
    ...(zoneInput.targetRepsMin !== undefined ? { target_reps_min: zoneInput.targetRepsMin } : {}),
    ...(zoneInput.targetRepsMax !== undefined ? { target_reps_max: zoneInput.targetRepsMax } : {}),
    ...(zoneInput.rpeMin !== undefined ? { rpe_min: zoneInput.rpeMin } : {}),
    ...(zoneInput.rpeMax !== undefined ? { rpe_max: zoneInput.rpeMax } : {}),
  });

  delete base.targetRepsMin;
  delete base.targetRepsMax;
  delete base.rpeMin;
  delete base.rpeMax;

  if (zone.targetRepsMin === undefined) {
    delete base.target_reps_min;
  } else {
    base.target_reps_min = zone.targetRepsMin;
  }
  if (zone.targetRepsMax === undefined) {
    delete base.target_reps_max;
  } else {
    base.target_reps_max = zone.targetRepsMax;
  }
  if (zone.rpeMin === undefined) {
    delete base.rpe_min;
  } else {
    base.rpe_min = zone.rpeMin;
  }
  if (zone.rpeMax === undefined) {
    delete base.rpe_max;
  } else {
    base.rpe_max = zone.rpeMax;
  }

  return base;
}

export function normalizePolicyConfig(input: ProgressionConfigValue): ProgressionConfigValue {
  const fallbackPolicyType: ClassicPolicyType = "double_progression";
  const policyType = isClassicPolicyType(input.progressionPolicyType)
    ? input.progressionPolicyType
    : fallbackPolicyType;

  const definition = getClassicProgressionDefinitionByPolicyType(policyType);
  if (!definition) {
    return {
      progressionFamily: "threshold",
      progressionPolicyType: fallbackPolicyType,
      progressionPolicyConfig: {},
      successCriteria: {},
      adjustmentPolicyType: "always",
      adjustmentPolicyConfig: {},
      progressTrackKey: input.progressTrackKey?.trim() ?? "",
    };
  }

  const policyConfig = {
    ...definition.defaults.progressionPolicyConfig,
    ...asRecord(input.progressionPolicyConfig),
  };

  const successCriteria = {
    ...definition.defaults.successCriteria,
    ...asRecord(input.successCriteria),
  };

  const normalized = normalizeByPolicyType(policyType, policyConfig, successCriteria);

  const normalizedSuccessCriteria = applyTrainingZoneToSuccessCriteria(
    normalized.nextSuccess,
    extractTrainingZoneFromSuccessCriteria(normalized.nextSuccess),
  );

  const adjustmentPolicyType = toAdjustmentPolicyType(input.adjustmentPolicyType);
  return {
    progressionFamily: definition.progressionFamily,
    progressionPolicyType: definition.policyType,
    progressionPolicyConfig: normalized.nextPolicy,
    successCriteria: normalizedSuccessCriteria,
    adjustmentPolicyType,
    adjustmentPolicyConfig: normalizeAdjustmentPolicyConfig(
      adjustmentPolicyType,
      input.adjustmentPolicyConfig,
    ),
    progressTrackKey: input.progressTrackKey?.trim() ?? "",
  };
}
