import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_DEFAULT_POLICY_MAP,
  UNIT_ROLE_VALUES,
  AdjustmentPolicyTypeValue,
  ProgressionFamilyValue,
  ProgressionPolicyTypeValue,
  UnitRoleValue,
} from "@/lib/progression-standards";
import {
  ProgressTrackState,
  ProgressOutcome,
  ProgressionConfigEnvelope,
  ProgressionSnapshot,
} from "@/lib/progression-types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function toPositiveInteger(value: unknown) {
  const parsed = toPositiveNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(1, Math.trunc(parsed));
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

function asRoleOrDefault(value: unknown): UnitRoleValue {
  if (typeof value === "string" && (UNIT_ROLE_VALUES as readonly string[]).includes(value)) {
    return value as UnitRoleValue;
  }
  return "accessory";
}

function asFamilyOrDefault(value: unknown, fallback: ProgressionFamilyValue) {
  if (
    typeof value === "string" &&
    (PROGRESSION_FAMILY_VALUES as readonly string[]).includes(value)
  ) {
    return value as ProgressionFamilyValue;
  }
  return fallback;
}

function asPolicyOrDefault(value: unknown, fallback: ProgressionPolicyTypeValue) {
  if (
    typeof value === "string" &&
    (PROGRESSION_POLICY_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as ProgressionPolicyTypeValue;
  }
  return fallback;
}

function asAdjustmentPolicyOrDefault(value: unknown): AdjustmentPolicyTypeValue {
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

function normalizeAdjustmentPolicyConfig(args: {
  adjustmentPolicyType: AdjustmentPolicyTypeValue;
  adjustmentPolicyConfig: Record<string, unknown>;
}) {
  const { adjustmentPolicyType, adjustmentPolicyConfig } = args;
  const progressionEnabled = toBoolean(adjustmentPolicyConfig.progression_enabled, true);

  if (adjustmentPolicyType === "rotating_pool") {
    const rotationQuota =
      toPositiveInteger(
        adjustmentPolicyConfig.rotation_quota ??
          adjustmentPolicyConfig.rotationQuota ??
          adjustmentPolicyConfig.quota,
      ) ?? 2;

    return {
      ...adjustmentPolicyConfig,
      progression_enabled: progressionEnabled,
      rotation_quota: Math.min(Math.max(rotationQuota, 1), 5),
      diversify_dimensions: normalizeDiversifyDimensions(
        adjustmentPolicyConfig.diversify_dimensions ??
          adjustmentPolicyConfig.diversifyDimensions ??
          adjustmentPolicyConfig.diversity_dimensions,
      ),
    };
  }

  return {
    ...adjustmentPolicyConfig,
    progression_enabled: progressionEnabled,
  };
}

function parseTrackKey(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function normalizeLinearPeriodizationSteps(policyConfig: Record<string, unknown>) {
  const fallback = [
    { reps: 8, intensity_level: "base" },
    { reps: 7, intensity_level: "build" },
    { reps: 6, intensity_level: "peak" },
  ];

  if (Array.isArray(policyConfig.steps)) {
    const parsed = policyConfig.steps
      .map((step, index) => {
        if (!isPlainObject(step)) {
          return null;
        }
        const reps = toPositiveInteger(step.reps ?? step.current_reps);
        if (!reps) {
          return null;
        }
        const intensity =
          typeof step.intensity_level === "string" && step.intensity_level.trim().length > 0
            ? step.intensity_level.trim()
            : typeof step.phase_name === "string" && step.phase_name.trim().length > 0
              ? step.phase_name.trim()
              : `step_${index + 1}`;
        return {
          reps,
          intensity_level: intensity,
        };
      })
      .filter((step): step is { reps: number; intensity_level: string } => Boolean(step));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (Array.isArray(policyConfig.phases)) {
    const parsed = policyConfig.phases
      .map((phase, index) => {
        if (!isPlainObject(phase)) {
          return null;
        }
        const target = isPlainObject(phase.target) ? phase.target : {};
        const reps = toPositiveInteger(target.current_reps ?? phase.current_reps ?? phase.reps);
        if (!reps) {
          return null;
        }
        const intensity =
          typeof phase.intensity_level === "string" && phase.intensity_level.trim().length > 0
            ? phase.intensity_level.trim()
            : typeof phase.phase_name === "string" && phase.phase_name.trim().length > 0
              ? phase.phase_name.trim()
              : `step_${index + 1}`;
        return {
          reps,
          intensity_level: intensity,
        };
      })
      .filter((step): step is { reps: number; intensity_level: string } => Boolean(step));
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeProgressionPolicyConfig(args: {
  policyType: ProgressionPolicyTypeValue | string;
  policyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
}) {
  const { policyType, policyConfig, successCriteria } = args;

  switch (policyType) {
    case "total_reps_threshold": {
      const targetTotalReps =
        toPositiveInteger(
          policyConfig.target_total_reps ??
            policyConfig.total_reps_threshold ??
            successCriteria.total_reps_threshold,
        ) ?? 30;
      const progressionStep =
        toPositiveNumber(policyConfig.progression_step ?? policyConfig.load_increment) ?? 2.5;
      const resetReps =
        toPositiveInteger(
          policyConfig.reset_reps ?? policyConfig.reset_reps_to ?? successCriteria.target_reps_min,
        ) ?? 8;
      const allowPartialProgress = toBoolean(policyConfig.allow_partial_progress, true);
      const progressionOrder =
        policyConfig.progression_order === "sets_first" ? "sets_first" : "reps_first";

      return {
        ...policyConfig,
        target_total_reps: targetTotalReps,
        progression_step: progressionStep,
        reset_reps: resetReps,
        allow_partial_progress: allowPartialProgress,
        progression_order: progressionOrder,
      };
    }
    case "double_progression": {
      const repRangeMin =
        toPositiveInteger(
          policyConfig.rep_range_min ??
            policyConfig.rep_floor ??
            successCriteria.target_reps_min,
        ) ?? 8;
      const repRangeMax =
        toPositiveInteger(
          policyConfig.rep_range_max ??
            policyConfig.rep_ceiling ??
            successCriteria.target_reps_max,
        ) ?? Math.max(repRangeMin + 2, 10);
      const correctedRepRangeMax = Math.max(repRangeMin, repRangeMax);
      const progressionStep =
        toPositiveNumber(policyConfig.progression_step ?? policyConfig.load_increment) ?? 2.5;
      const progressionTrigger =
        policyConfig.progression_trigger === "any_set_max" ? "any_set_max" : "all_sets_max";
      const resetToMinAfterLoadIncrease = toBoolean(
        policyConfig.reset_to_min_after_load_increase ??
          policyConfig.post_increment_reset_rule === "back_to_range_floor",
        true,
      );

      return {
        ...policyConfig,
        rep_range_min: repRangeMin,
        rep_range_max: correctedRepRangeMax,
        progression_step: progressionStep,
        progression_trigger: progressionTrigger,
        reset_to_min_after_load_increase: resetToMinAfterLoadIncrease,
      };
    }
    case "linear_load_step": {
      const loadIncrement =
        toPositiveNumber(policyConfig.load_increment ?? policyConfig.progression_step) ?? 2.5;
      const progressionFrequency =
        toPositiveInteger(policyConfig.progression_frequency ?? policyConfig.increment_frequency) ??
        1;
      const maxAttemptsBeforeHold =
        toPositiveInteger(
          policyConfig.max_attempts_before_hold ??
            policyConfig.failure_streak_threshold ??
            policyConfig.fail_limit,
        ) ?? 2;

      return {
        ...policyConfig,
        load_increment: loadIncrement,
        progression_frequency: progressionFrequency,
        max_attempts_before_hold: maxAttemptsBeforeHold,
      };
    }
    case "linear_periodization_step": {
      const steps = normalizeLinearPeriodizationSteps(policyConfig);
      const progressionTrigger =
        policyConfig.progression_trigger === "exposure" ||
        policyConfig.advance_on === "exposure" ||
        policyConfig.advance_basis === "exposure"
          ? "exposure"
          : "success";
      const cycleMode = policyConfig.cycle_mode === "clamp" ? "clamp" : "loop";
      const allowVariableWidth = toBoolean(policyConfig.allow_variable_width, false);

      return {
        ...policyConfig,
        steps,
        progression_trigger: progressionTrigger,
        cycle_mode: cycleMode,
        allow_variable_width: allowVariableWidth,
      };
    }
    default:
      return policyConfig;
  }
}

export function mapUnitRoleToDefaultPolicySuggestions(unitRoleInput: unknown) {
  const role = asRoleOrDefault(unitRoleInput);
  return {
    unitRole: role,
    ...UNIT_ROLE_DEFAULT_POLICY_MAP[role],
  };
}

export function parseSuccessCriteria(value: unknown, fallback?: Record<string, unknown>) {
  if (isPlainObject(value)) {
    return value;
  }
  return fallback ?? { complete_all_sets: true };
}

export function normalizeProgressionConfig(input: {
  unitRole?: unknown;
  progressionFamily?: unknown;
  progressionPolicyType?: unknown;
  progressionPolicyConfig?: unknown;
  adjustmentPolicyType?: unknown;
  adjustmentPolicyConfig?: unknown;
  successCriteria?: unknown;
  progressTrackKey?: unknown;
  progressTrackKeyFallback: string;
}): ProgressionConfigEnvelope {
  const defaults = mapUnitRoleToDefaultPolicySuggestions(input.unitRole);

  const progressionFamily = asFamilyOrDefault(input.progressionFamily, defaults.family);
  const progressionPolicyType = asPolicyOrDefault(
    input.progressionPolicyType,
    defaults.policyType,
  );

  const successCriteria = parseSuccessCriteria(input.successCriteria, defaults.successCriteria);
  const rawPolicyConfig = isPlainObject(input.progressionPolicyConfig)
    ? input.progressionPolicyConfig
    : defaults.config;

  const adjustmentPolicyType = asAdjustmentPolicyOrDefault(input.adjustmentPolicyType);
  const rawAdjustmentPolicyConfig = isPlainObject(input.adjustmentPolicyConfig)
    ? input.adjustmentPolicyConfig
    : {};

  return {
    unitRole: defaults.unitRole,
    progressionFamily,
    progressionPolicyType,
    progressionPolicyConfig: normalizeProgressionPolicyConfig({
      policyType: progressionPolicyType,
      policyConfig: rawPolicyConfig,
      successCriteria,
    }),
    adjustmentPolicyType,
    adjustmentPolicyConfig: normalizeAdjustmentPolicyConfig({
      adjustmentPolicyType,
      adjustmentPolicyConfig: rawAdjustmentPolicyConfig,
    }),
    successCriteria,
    progressTrackKey: parseTrackKey(input.progressTrackKey, input.progressTrackKeyFallback),
  };
}

export function buildInitialProgressTrackState(unit: {
  prescriptionType: "sets_reps" | "sets_time" | string;
  payload: Record<string, unknown>;
}): ProgressTrackState {
  const sets = toPositiveNumber(unit.payload.sets) ?? null;
  const reps = toPositiveNumber(unit.payload.reps) ?? null;
  const durationSeconds = toPositiveNumber(unit.payload.duration_seconds) ?? null;
  const load = toPositiveNumber(unit.payload.load_value) ?? null;

  return {
    current_phase: "baseline",
    current_load: load,
    current_sets: sets,
    current_reps: unit.prescriptionType === "sets_reps" ? reps : null,
    current_duration_seconds: unit.prescriptionType === "sets_time" ? durationSeconds : null,
    pending_retry: false,
    cooldown_until: null,
    last_change_reason: "hold_no_progress",
    cycle_index: 0,
    extra_state: {
      last_outcome: "skipped" as ProgressOutcome,
    },
  };
}

export function buildInitialProgressionSnapshot(args: {
  trackKey: string;
  family: string;
  policyType: string;
  state: ProgressTrackState;
}): ProgressionSnapshot {
  return {
    before: args.state,
    after: args.state,
    changed_fields: [],
    change_reason: "hold_no_progress",
    change_type: "no_change",
    outcome: "skipped",
    policy_type: args.policyType,
    progression_family: args.family,
    track_key: args.trackKey,
    track_phase: args.state.current_phase ?? null,
    meta: {
      phase: args.state.current_phase ?? undefined,
      step_index: args.state.cycle_index ?? 0,
      retry_flag: args.state.pending_retry === true,
    },
  };
}
