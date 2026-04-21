import { ProgressTrackStatus } from "@prisma/client";
import {
  ChangeReason,
  ChangeType,
  ProgressOutcome,
  ProgressTrackState,
} from "@/lib/progression-types";
import { UnitRoleValue } from "@/lib/progression-standards";
import { mapReasonToChangeType } from "@/server/services/progression/progression-apply.service";

type ProgressionPolicyRunMeta = {
  phase?: string;
  step_index?: number | null;
  retry_flag?: boolean;
  stage_index_before?: number | null;
  stage_index_after?: number | null;
  cycle_step_before?: number | null;
  cycle_step_after?: number | null;
  switch_event?: "phase_advance" | "cycle_advance" | null;
  hold_reason?: string | null;
  selection_reason?: string | null;
  last_outcome_basis?: ProgressOutcome | null;
};

type PolicyContext = {
  unitRole: UnitRoleValue | string;
  policyType: string;
  policyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  selectedInRotationPool: boolean;
  selectedInSupersetBudget: boolean;
  trackStatus: ProgressTrackStatus;
  trackCounts: {
    exposureCount: number;
    successCount: number;
    failureCount: number;
    progressionCount: number;
    lastSuccessAt: Date | null;
    lastProgressionAt: Date | null;
  };
  baselineState: ProgressTrackState;
  now: Date;
};

export type ProgressionPolicyRunInput = {
  unitRole: UnitRoleValue | string;
  policyType: string;
  policyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  selectedInRotationPool: boolean;
  selectedInSupersetBudget: boolean;
  trackStatus: ProgressTrackStatus;
  trackCounts: {
    exposureCount: number;
    successCount: number;
    failureCount: number;
    progressionCount: number;
    lastSuccessAt: Date | null;
    lastProgressionAt: Date | null;
  };
  currentState: ProgressTrackState;
  baselineState: ProgressTrackState;
  now: Date;
};

export type ProgressionPolicyRunResult = {
  beforeState: ProgressTrackState;
  afterState: ProgressTrackState;
  changedFields: string[];
  changeReason: ChangeReason;
  changeType: ChangeType;
  outcome: ProgressOutcome;
  meta: ProgressionPolicyRunMeta;
};

type PolicyReasonResult = {
  reason: ChangeReason;
  outcome?: ProgressOutcome;
  meta?: ProgressionPolicyRunMeta;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toPositiveNumber(value: unknown) {
  const parsed = toNumber(value);
  if (parsed !== undefined && parsed > 0) {
    return parsed;
  }
  return undefined;
}

function toInteger(value: unknown) {
  const parsed = toNumber(value);
  if (parsed !== undefined) {
    return Math.trunc(parsed);
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cloneState(state: ProgressTrackState): ProgressTrackState {
  return {
    ...state,
    extra_state:
      state.extra_state && typeof state.extra_state === "object"
        ? { ...state.extra_state }
        : {},
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function collectChangedFields(before: ProgressTrackState, after: ProgressTrackState) {
  const changed: string[] = [];
  const keys: Array<keyof ProgressTrackState> = [
    "current_phase",
    "current_load",
    "current_sets",
    "current_reps",
    "current_duration_seconds",
    "pending_retry",
    "cooldown_until",
    "last_change_reason",
    "cycle_index",
    "extra_state",
  ];

  for (const key of keys) {
    if (key === "extra_state") {
      if (JSON.stringify(before.extra_state ?? {}) !== JSON.stringify(after.extra_state ?? {})) {
        changed.push("extra_state");
      }
      continue;
    }

    if (before[key] !== after[key]) {
      changed.push(key);
    }
  }

  return changed;
}

function isSuccessSignal(ctx: PolicyContext) {
  const hasTimestampSignal =
    ctx.trackCounts.lastSuccessAt !== null &&
    (ctx.trackCounts.lastProgressionAt === null ||
      ctx.trackCounts.lastSuccessAt.getTime() > ctx.trackCounts.lastProgressionAt.getTime());
  const hasCounterSignal = ctx.trackCounts.successCount > ctx.trackCounts.progressionCount;

  let passed = hasTimestampSignal || hasCounterSignal;
  const minSuccessCount = toPositiveNumber(ctx.successCriteria.min_success_count);
  if (minSuccessCount !== undefined) {
    passed = passed && ctx.trackCounts.successCount >= minSuccessCount;
  }
  const minExposureCount = toPositiveNumber(ctx.successCriteria.min_exposure_count);
  if (minExposureCount !== undefined) {
    passed = passed && ctx.trackCounts.exposureCount >= minExposureCount;
  }
  return passed;
}

function isExposureSignal(ctx: PolicyContext) {
  if (ctx.trackCounts.exposureCount > ctx.trackCounts.progressionCount) {
    return true;
  }
  return ctx.trackCounts.successCount > ctx.trackCounts.progressionCount;
}

function parseCurrentIndex(state: ProgressTrackState, key: string) {
  const extraState = asRecord(state.extra_state);
  const parsed = toInteger(extraState[key]);
  return parsed !== undefined && parsed >= 0 ? parsed : 0;
}

function applyStepTarget(
  after: ProgressTrackState,
  step: Record<string, unknown>,
  fallbackState: ProgressTrackState,
) {
  const target = asRecord(step.target);

  const load = toPositiveNumber(target.current_load ?? step.current_load);
  if (load !== undefined) {
    after.current_load = round(load);
  }

  const sets = toInteger(target.current_sets ?? step.current_sets);
  if (sets !== undefined) {
    after.current_sets = Math.max(1, sets);
  }

  const reps = toInteger(target.current_reps ?? step.current_reps);
  if (reps !== undefined) {
    after.current_reps = Math.max(1, reps);
  }

  const duration = toInteger(target.current_duration_seconds ?? step.current_duration_seconds);
  if (duration !== undefined) {
    after.current_duration_seconds = Math.max(1, duration);
  }

  if (
    load === undefined &&
    sets === undefined &&
    reps === undefined &&
    duration === undefined
  ) {
    if (fallbackState.current_load !== undefined) {
      after.current_load = fallbackState.current_load;
    }
    if (fallbackState.current_sets !== undefined) {
      after.current_sets = fallbackState.current_sets;
    }
    if (fallbackState.current_reps !== undefined) {
      after.current_reps = fallbackState.current_reps;
    }
    if (fallbackState.current_duration_seconds !== undefined) {
      after.current_duration_seconds = fallbackState.current_duration_seconds;
    }
  }
}

function parseStepArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0);
}

type LinearPeriodizationStep = {
  reps: number;
  sets?: number;
  intensity_level: string;
};

function parseLinearPeriodizationSteps(policyConfig: Record<string, unknown>) {
  if (Array.isArray(policyConfig.steps)) {
    const parsed = policyConfig.steps
      .map((entry, index) => {
        const record = asRecord(entry);
        const reps = toPositiveInteger(record.reps ?? record.current_reps);
        if (!reps) {
          return null;
        }

        const sets = toPositiveInteger(record.sets ?? record.current_sets);
        const intensity =
          typeof record.intensity_level === "string" && record.intensity_level.trim().length > 0
            ? record.intensity_level.trim()
            : typeof record.name === "string" && record.name.trim().length > 0
              ? record.name.trim()
              : `step_${index + 1}`;

        return {
          reps,
          ...(sets ? { sets } : {}),
          intensity_level: intensity,
        } satisfies LinearPeriodizationStep;
      })
      .filter((entry): entry is LinearPeriodizationStep => Boolean(entry));

    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (Array.isArray(policyConfig.phases)) {
    const parsed = policyConfig.phases
      .map((entry, index) => {
        const record = asRecord(entry);
        const target = asRecord(record.target);
        const reps = toPositiveInteger(target.current_reps ?? record.current_reps ?? record.reps);
        if (!reps) {
          return null;
        }

        const sets = toPositiveInteger(target.current_sets ?? record.current_sets ?? record.sets);
        const intensity =
          typeof record.intensity_level === "string" && record.intensity_level.trim().length > 0
            ? record.intensity_level.trim()
            : typeof record.phase_name === "string" && record.phase_name.trim().length > 0
              ? record.phase_name.trim()
              : `step_${index + 1}`;

        return {
          reps,
          ...(sets ? { sets } : {}),
          intensity_level: intensity,
        } satisfies LinearPeriodizationStep;
      })
      .filter((entry): entry is LinearPeriodizationStep => Boolean(entry));

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [
    { reps: 8, intensity_level: "base" },
    { reps: 7, intensity_level: "build" },
    { reps: 6, intensity_level: "peak" },
  ] satisfies LinearPeriodizationStep[];
}

function gatePassed(ctx: PolicyContext, gate: string | undefined) {
  if (gate === "exposure") {
    return isExposureSignal(ctx);
  }
  if (gate === "always") {
    return true;
  }
  return isSuccessSignal(ctx);
}

function runLinearPeriodizationStep(ctx: PolicyContext, after: ProgressTrackState): PolicyReasonResult {
  const steps = parseLinearPeriodizationSteps(ctx.policyConfig);
  if (steps.length === 0) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "missing_phase_config" },
    };
  }

  const beforeIndexRaw =
    parseCurrentIndex(after, "step_index") ||
    parseCurrentIndex(after, "phase_index") ||
    (toInteger(after.cycle_index) ?? 0);
  const beforeIndex = Math.min(beforeIndexRaw, steps.length - 1);
  const progressionTrigger =
    typeof ctx.policyConfig.progression_trigger === "string"
      ? ctx.policyConfig.progression_trigger
      : typeof ctx.policyConfig.advance_on === "string"
        ? ctx.policyConfig.advance_on
        : typeof ctx.policyConfig.advance_basis === "string"
          ? ctx.policyConfig.advance_basis
          : "success";
  const cycleMode =
    typeof ctx.policyConfig.cycle_mode === "string" && ctx.policyConfig.cycle_mode === "clamp"
      ? "clamp"
      : "loop";
  const passed = gatePassed(ctx, progressionTrigger);

  let afterIndex = beforeIndex;
  let switchEvent: "phase_advance" | "cycle_advance" | null = null;
  if (passed) {
    if (beforeIndex < steps.length - 1) {
      afterIndex = beforeIndex + 1;
      switchEvent = "phase_advance";
    } else if (cycleMode === "loop") {
      afterIndex = 0;
      switchEvent = "cycle_advance";
    }
  }

  const step = steps[afterIndex];
  after.current_reps = step.reps;
  if (step.sets !== undefined) {
    after.current_sets = step.sets;
  }

  if (toBoolean(ctx.policyConfig.allow_variable_width, false)) {
    after.extra_state = {
      ...(asRecord(after.extra_state) ?? {}),
      variable_width_enabled: true,
    };
  }

  after.current_phase = step.intensity_level;
  after.cycle_index = afterIndex;
  after.extra_state = {
    ...(asRecord(after.extra_state) ?? {}),
    step_index: afterIndex,
    phase_index: afterIndex,
  };

  return {
    reason: switchEvent ? "cycle_step_advance" : "hold_no_progress",
    meta: {
      phase: step.intensity_level,
      step_index: afterIndex,
      stage_index_before: beforeIndex,
      stage_index_after: afterIndex,
      switch_event: switchEvent,
      hold_reason: switchEvent ? null : passed ? "phase_end_hold" : "not_met",
    },
  };
}

function runScriptedCycle(ctx: PolicyContext, after: ProgressTrackState): PolicyReasonResult {
  const steps = parseStepArray(ctx.policyConfig.steps);
  if (steps.length === 0) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "missing_cycle_config" },
    };
  }

  const beforeStepRaw = toInteger(after.cycle_index) ?? parseCurrentIndex(after, "cycle_step_index");
  const beforeStep = Math.min(Math.max(beforeStepRaw, 0), steps.length - 1);
  const advanceOn =
    typeof ctx.policyConfig.advance_on === "string" ? ctx.policyConfig.advance_on : "success";
  const cycleMode =
    typeof ctx.policyConfig.cycle_mode === "string" ? ctx.policyConfig.cycle_mode : "loop";
  const passed = gatePassed(ctx, advanceOn);

  let afterStep = beforeStep;
  let switchEvent: "cycle_advance" | null = null;
  if (passed) {
    if (beforeStep + 1 < steps.length) {
      afterStep = beforeStep + 1;
      switchEvent = "cycle_advance";
    } else if (cycleMode === "loop") {
      afterStep = 0;
      switchEvent = "cycle_advance";
    }
  }

  const step = steps[afterStep];
  applyStepTarget(after, step, ctx.baselineState);
  const stepName =
    typeof step.step_name === "string" && step.step_name.trim().length > 0
      ? step.step_name.trim()
      : `cycle_${afterStep + 1}`;
  after.current_phase = stepName;
  after.cycle_index = afterStep;
  after.extra_state = {
    ...(asRecord(after.extra_state) ?? {}),
    cycle_step_index: afterStep,
    step_index: afterStep,
  };

  return {
    reason: switchEvent ? "cycle_step_advance" : "hold_no_progress",
    meta: {
      phase: stepName,
      step_index: afterStep,
      cycle_step_before: beforeStep,
      cycle_step_after: afterStep,
      switch_event: switchEvent,
      hold_reason: switchEvent ? null : passed ? "cycle_end_hold" : "not_met",
    },
  };
}

function runLinearLoadStep(ctx: PolicyContext, after: ProgressTrackState) {
  if (!isSuccessSignal(ctx)) {
    return { reason: "hold_no_progress", meta: { hold_reason: "not_met" } } satisfies PolicyReasonResult;
  }

  if (after.current_load === null || after.current_load === undefined) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "missing_baseline" },
    } satisfies PolicyReasonResult;
  }

  const progressionFrequency =
    toPositiveInteger(ctx.policyConfig.progression_frequency ?? ctx.policyConfig.increment_frequency) ??
    1;
  const maxAttemptsBeforeHold =
    toPositiveInteger(
      ctx.policyConfig.max_attempts_before_hold ??
        ctx.policyConfig.failure_streak_threshold ??
        ctx.policyConfig.fail_limit,
    ) ?? 2;

  if (maxAttemptsBeforeHold > 0 && ctx.trackCounts.failureCount >= maxAttemptsBeforeHold) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "max_attempts_reached" },
    } satisfies PolicyReasonResult;
  }

  const attemptsSinceLastProgress = Math.max(
    0,
    ctx.trackCounts.exposureCount - ctx.trackCounts.progressionCount,
  );
  if (progressionFrequency > 1 && attemptsSinceLastProgress + 1 < progressionFrequency) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "frequency_gate" },
    } satisfies PolicyReasonResult;
  }

  const increment =
    toPositiveNumber(ctx.policyConfig.load_increment ?? ctx.policyConfig.progression_step) ??
    toPositiveNumber((ctx.policyConfig.step as Record<string, unknown> | undefined)?.load_increment) ??
    2.5;
  after.current_load = round((after.current_load ?? 0) + increment);
  return { reason: "normal_progression" } satisfies PolicyReasonResult;
}

function runDoubleProgression(ctx: PolicyContext, after: ProgressTrackState) {
  if (!isSuccessSignal(ctx)) {
    return { reason: "hold_no_progress", meta: { hold_reason: "not_met" } } satisfies PolicyReasonResult;
  }

  const repCeiling =
    toPositiveNumber(
      ctx.policyConfig.rep_range_max ?? ctx.policyConfig.rep_ceiling ?? ctx.successCriteria.target_reps_max,
    ) ??
    toPositiveNumber(ctx.successCriteria.target_reps_max) ??
    toPositiveNumber(after.current_reps) ??
    10;
  const repFloor =
    toPositiveNumber(
      ctx.policyConfig.rep_range_min ?? ctx.policyConfig.rep_floor ?? ctx.successCriteria.target_reps_min,
    ) ??
    toPositiveNumber(ctx.successCriteria.target_reps_min) ??
    Math.max(1, repCeiling - 2);
  const repStep = toInteger(ctx.policyConfig.rep_step) ?? 1;
  const loadIncrement =
    toPositiveNumber(ctx.policyConfig.progression_step ?? ctx.policyConfig.load_increment) ?? 2.5;
  const progressionTrigger =
    typeof ctx.policyConfig.progression_trigger === "string"
      ? ctx.policyConfig.progression_trigger
      : "all_sets_max";
  const reachedRepMax =
    progressionTrigger === "any_set_max"
      ? (after.current_reps ?? 0) >= repCeiling
      : (after.current_reps ?? 0) >= repCeiling;

  if (!reachedRepMax) {
    after.current_reps = Math.max(1, (after.current_reps ?? repFloor) + repStep);
    return { reason: "normal_progression" } satisfies PolicyReasonResult;
  }

  if (after.current_load === null || after.current_load === undefined) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "missing_baseline" },
    } satisfies PolicyReasonResult;
  }

  after.current_load = round((after.current_load ?? 0) + loadIncrement);
  if (toBoolean(ctx.policyConfig.reset_to_min_after_load_increase, true)) {
    after.current_reps = repFloor;
  }
  return { reason: "threshold_reached" } satisfies PolicyReasonResult;
}

function runTotalRepsThreshold(ctx: PolicyContext, after: ProgressTrackState) {
  const extraState = (after.extra_state ?? {}) as Record<string, unknown>;
  const threshold =
    toPositiveNumber(
      ctx.policyConfig.target_total_reps ??
        ctx.successCriteria.total_reps_threshold ??
        ctx.policyConfig.total_reps_threshold,
    ) ??
    30;
  const progressionStep =
    toPositiveNumber(ctx.policyConfig.progression_step ?? ctx.policyConfig.load_increment) ?? 2.5;
  const resetReps =
    toPositiveInteger(ctx.policyConfig.reset_reps ?? ctx.policyConfig.reset_reps_to) ?? 8;
  const allowPartialProgress = toBoolean(ctx.policyConfig.allow_partial_progress, true);
  const progressionOrder =
    ctx.policyConfig.progression_order === "sets_first" ? "sets_first" : "reps_first";
  const completed = toPositiveNumber(extraState.total_reps_completed) ?? 0;

  if (!isSuccessSignal(ctx) || completed < threshold) {
    if (!allowPartialProgress) {
      after.extra_state = {
        ...extraState,
        total_reps_completed: 0,
      };
    }
    return { reason: "hold_no_progress", meta: { hold_reason: "not_met" } } satisfies PolicyReasonResult;
  }

  let progressed = false;

  if (after.current_load !== null && after.current_load !== undefined) {
    after.current_load = round(after.current_load + progressionStep);
    if (after.current_reps !== null && after.current_reps !== undefined) {
      after.current_reps = resetReps;
    }
    progressed = true;
  } else if (progressionOrder === "sets_first") {
    if (after.current_sets !== null && after.current_sets !== undefined) {
      after.current_sets = Math.max(1, after.current_sets + 1);
      progressed = true;
    } else if (after.current_reps !== null && after.current_reps !== undefined) {
      after.current_reps = Math.max(1, after.current_reps + 1);
      progressed = true;
    }
  } else if (
    after.current_reps !== null &&
    after.current_reps !== undefined
  ) {
    after.current_reps = Math.max(1, after.current_reps + 1);
    progressed = true;
  } else if (after.current_sets !== null && after.current_sets !== undefined) {
    after.current_sets = Math.max(1, after.current_sets + 1);
    progressed = true;
  }

  if (!progressed && after.current_duration_seconds !== null && after.current_duration_seconds !== undefined) {
    after.current_duration_seconds = Math.max(
      1,
      after.current_duration_seconds + Math.max(1, Math.trunc(progressionStep)),
    );
    progressed = true;
  }

  if (!progressed) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "missing_baseline" },
    } satisfies PolicyReasonResult;
  }

  after.extra_state = {
    ...extraState,
    total_reps_completed: allowPartialProgress ? Math.max(0, completed - threshold) : 0,
  };
  return { reason: "threshold_reached" } satisfies PolicyReasonResult;
}

function runAddSetThenLoad(ctx: PolicyContext, after: ProgressTrackState) {
  if (!isSuccessSignal(ctx)) {
    return { reason: "hold_no_progress", meta: { hold_reason: "not_met" } } satisfies PolicyReasonResult;
  }

  const baseSets =
    toInteger(ctx.policyConfig.base_sets) ??
    toInteger(ctx.successCriteria.base_sets) ??
    toInteger(ctx.baselineState.current_sets) ??
    3;
  const advancedSets =
    toInteger(ctx.policyConfig.advanced_sets) ??
    toInteger(ctx.successCriteria.advanced_sets) ??
    Math.max(baseSets + 1, 4);
  const loadIncrement = toPositiveNumber(ctx.policyConfig.load_increment) ?? 2.5;
  const currentSets = toInteger(after.current_sets) ?? baseSets;

  if (currentSets < advancedSets) {
    after.current_sets = Math.min(advancedSets, currentSets + 1);
    after.current_phase = "set_expansion";
    return { reason: "normal_progression" } satisfies PolicyReasonResult;
  }

  if (after.current_load === null || after.current_load === undefined) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "missing_baseline" },
    } satisfies PolicyReasonResult;
  }

  after.current_load = round(after.current_load + loadIncrement);
  after.current_sets = baseSets;
  after.current_phase = "load_progression";
  after.cycle_index = (after.cycle_index ?? 0) + 1;
  return { reason: "threshold_reached" } satisfies PolicyReasonResult;
}

function runBodyweightRepsProgression(ctx: PolicyContext, after: ProgressTrackState) {
  if (!isSuccessSignal(ctx)) {
    return { reason: "hold_no_progress", meta: { hold_reason: "not_met" } } satisfies PolicyReasonResult;
  }

  const repTarget =
    toPositiveNumber(ctx.policyConfig.rep_target) ??
    toPositiveNumber(ctx.successCriteria.rep_target) ??
    Math.max(1, (after.current_reps ?? 8) + 1);
  const repStep = toInteger(ctx.policyConfig.rep_step) ?? 1;
  const allowExternal = (ctx.policyConfig.allow_external_load as boolean | undefined) === true;
  const externalIncrement = toPositiveNumber(ctx.policyConfig.external_load_increment) ?? 2.5;
  const repsResetTo =
    toPositiveNumber(ctx.policyConfig.reps_reset_to) ??
    toPositiveNumber(ctx.successCriteria.target_reps_min) ??
    Math.max(1, repTarget - 2);

  if ((after.current_reps ?? 0) < repTarget) {
    after.current_reps = Math.max(1, (after.current_reps ?? repsResetTo) + repStep);
    after.current_phase = "reps_progression";
    return { reason: "normal_progression" } satisfies PolicyReasonResult;
  }

  if (!allowExternal) {
    return {
      reason: "hold_no_progress",
      meta: { hold_reason: "threshold_locked" },
    } satisfies PolicyReasonResult;
  }

  after.current_load = round((after.current_load ?? 0) + externalIncrement);
  after.current_reps = repsResetTo;
  after.current_phase = "external_load_progression";
  return { reason: "threshold_reached" } satisfies PolicyReasonResult;
}

function runDurationThreshold(ctx: PolicyContext, after: ProgressTrackState) {
  const extraState = (after.extra_state ?? {}) as Record<string, unknown>;
  const threshold =
    toPositiveNumber(ctx.successCriteria.total_duration_threshold) ??
    toPositiveNumber(ctx.policyConfig.duration_threshold_seconds) ??
    toPositiveNumber(after.current_duration_seconds) ??
    60;
  const completed =
    toPositiveNumber(extraState.total_duration_completed) ??
    toPositiveNumber(after.current_duration_seconds) ??
    0;

  if (!isSuccessSignal(ctx) || completed < threshold) {
    return { reason: "hold_no_progress", meta: { hold_reason: "not_met" } } satisfies PolicyReasonResult;
  }

  const durationIncrement = toInteger(ctx.policyConfig.duration_increment_seconds) ?? 5;
  const baseDuration = toPositiveNumber(after.current_duration_seconds) ?? threshold;
  after.current_duration_seconds = Math.max(1, baseDuration + durationIncrement);
  after.current_phase = "duration_progression";
  after.extra_state = {
    ...extraState,
    total_duration_completed: 0,
  };
  return { reason: "threshold_reached" } satisfies PolicyReasonResult;
}

function isProgressOutcome(value: unknown): value is ProgressOutcome {
  return (
    value === "success_met" ||
    value === "success_unmet" ||
    value === "partial" ||
    value === "failed" ||
    value === "skipped"
  );
}

function getLastOutcomeBasis(state: ProgressTrackState): ProgressOutcome | null {
  const extraState = asRecord(state.extra_state);
  const value = extraState.last_outcome;
  return isProgressOutcome(value) ? value : null;
}

function inferOutcomeFromContext(ctx: PolicyContext): ProgressOutcome {
  if (ctx.trackStatus === "paused" || ctx.trackStatus === "completed") {
    return "skipped";
  }

  if (isSuccessSignal(ctx)) {
    return "success_met";
  }

  if (ctx.trackCounts.failureCount > 0 && ctx.trackCounts.failureCount >= ctx.trackCounts.successCount) {
    return "failed";
  }

  if (ctx.trackCounts.failureCount > 0) {
    return "partial";
  }

  if (ctx.trackCounts.exposureCount > 0) {
    return "success_unmet";
  }

  return "skipped";
}

function isPlannedDeload(
  before: ProgressTrackState,
  after: ProgressTrackState,
  changedFields: string[],
) {
  const candidateFields = [
    "current_load",
    "current_sets",
    "current_reps",
    "current_duration_seconds",
  ];
  const affected = changedFields.filter((field) => candidateFields.includes(field));
  if (affected.length === 0) {
    return false;
  }

  return affected.every((field) => {
    const beforeValue = toNumber((before as Record<string, unknown>)[field]);
    const afterValue = toNumber((after as Record<string, unknown>)[field]);
    return beforeValue !== undefined && afterValue !== undefined && afterValue < beforeValue;
  });
}

function inferHoldReasonFromChangeReason(reason: ChangeReason): string | null {
  if (reason === "not_selected_in_rotation") return "not_selected";
  if (reason === "retry_pending") return "pending_retry";
  if (reason === "manual_override") return "manual";
  if (reason === "rescheduled_reflow") return "rescheduled";
  if (reason === "regression") return "failed";
  if (reason === "hold_no_progress") return "not_met";
  return null;
}

export function mapOutcomeToChangeReason(args: {
  outcome: ProgressOutcome;
  preferredReason?: ChangeReason | null;
  changedFieldsCount: number;
}): ChangeReason {
  if (args.preferredReason && args.preferredReason !== "hold_no_progress") {
    return args.preferredReason;
  }

  if (args.preferredReason === "hold_no_progress") {
    return "hold_no_progress";
  }

  if (args.outcome === "success_met") {
    return args.changedFieldsCount > 0 ? "normal_progression" : "hold_no_progress";
  }
  if (args.outcome === "success_unmet") {
    return "hold_no_progress";
  }
  if (args.outcome === "partial") {
    return "retry_pending";
  }
  if (args.outcome === "failed") {
    return "regression";
  }
  return "rescheduled_reflow";
}

export function runProgressionPolicy(input: ProgressionPolicyRunInput): ProgressionPolicyRunResult {
  const before = cloneState(input.currentState);
  const after = cloneState(input.currentState);

  const context: PolicyContext = {
    unitRole: input.unitRole,
    policyType: input.policyType,
    policyConfig: input.policyConfig,
    successCriteria: input.successCriteria,
    selectedInRotationPool: input.selectedInRotationPool,
    selectedInSupersetBudget: input.selectedInSupersetBudget,
    trackStatus: input.trackStatus,
    trackCounts: input.trackCounts,
    baselineState: input.baselineState,
    now: input.now,
  };

  const defaultSelectionReason =
    context.unitRole === "accessory" ||
    (context.unitRole === "secondary" &&
      (context.policyConfig.enable_rotation as boolean | undefined) === true)
      ? context.selectedInRotationPool
        ? "selected_in_rotation_pool"
        : "not_selected_in_rotation_pool"
      : "not_in_rotation_pool";

  let reasonResult: PolicyReasonResult;

  if (context.trackStatus === "paused") {
    reasonResult = {
      reason: "rescheduled_reflow",
      outcome: "skipped",
      meta: { hold_reason: "paused", selection_reason: defaultSelectionReason },
    };
  } else if (context.trackStatus === "completed") {
    reasonResult = {
      reason: "rescheduled_reflow",
      outcome: "skipped",
      meta: { hold_reason: "track_completed", selection_reason: defaultSelectionReason },
    };
  } else if (
    context.unitRole === "skill" ||
    context.unitRole === "conditioning" ||
    context.unitRole === "warmup" ||
    context.unitRole === "cooldown" ||
    context.unitRole === "mobility" ||
    context.unitRole === "prehab"
  ) {
    reasonResult = {
      reason: "manual_override",
      meta: { hold_reason: "manual", selection_reason: defaultSelectionReason },
    };
  } else if (before.pending_retry === true) {
    reasonResult = {
      reason: "retry_pending",
      outcome: "partial",
      meta: { hold_reason: "pending_retry", selection_reason: defaultSelectionReason },
    };
  } else {
    const canJoinPool =
      context.unitRole === "accessory" ||
      (context.unitRole === "secondary" &&
        (context.policyConfig.enable_rotation as boolean | undefined) === true);

    if (canJoinPool && !context.selectedInRotationPool) {
      reasonResult = {
        reason: "not_selected_in_rotation",
        outcome: "skipped",
        meta: { hold_reason: "not_selected", selection_reason: "not_selected_in_rotation_pool" },
      };
    } else if (!context.selectedInSupersetBudget) {
      reasonResult = {
        reason: "hold_no_progress",
        meta: {
          hold_reason: "superset_budget_gate",
          selection_reason: "superset_budget_gate",
        },
      };
    } else {
      switch (context.policyType) {
        case "linear_load_step":
          reasonResult = runLinearLoadStep(context, after);
          break;
        case "linear_periodization_step":
          reasonResult = runLinearPeriodizationStep(context, after);
          break;
        case "scripted_cycle":
          reasonResult = runScriptedCycle(context, after);
          break;
        case "double_progression":
          reasonResult = runDoubleProgression(context, after);
          break;
        case "total_reps_threshold":
          reasonResult = runTotalRepsThreshold(context, after);
          break;
        case "add_set_then_load":
          reasonResult = runAddSetThenLoad(context, after);
          break;
        case "bodyweight_reps_progression":
          reasonResult = runBodyweightRepsProgression(context, after);
          break;
        case "duration_threshold":
          reasonResult = runDurationThreshold(context, after);
          break;
        case "manual":
        case "hold_or_manual":
          reasonResult = {
            reason: "manual_override",
            meta: { hold_reason: "manual", selection_reason: defaultSelectionReason },
          };
          break;
        default:
          reasonResult = {
            reason: "hold_no_progress",
            meta: { hold_reason: "policy_not_implemented", selection_reason: defaultSelectionReason },
          };
          break;
      }
    }
  }

  const changedFields = collectChangedFields(before, after);
  let outcome: ProgressOutcome =
    reasonResult.outcome ?? getLastOutcomeBasis(before) ?? inferOutcomeFromContext(context);

  if (
    changedFields.length > 0 &&
    (reasonResult.reason === "normal_progression" ||
      reasonResult.reason === "threshold_reached" ||
      reasonResult.reason === "cycle_step_advance")
  ) {
    outcome = "success_met";
  }
  if (reasonResult.reason === "retry_pending" && outcome === "success_met") {
    outcome = "partial";
  }
  if (reasonResult.reason === "regression" && outcome === "success_met") {
    outcome = "failed";
  }

  let changeReason = mapOutcomeToChangeReason({
    outcome,
    preferredReason: reasonResult.reason,
    changedFieldsCount: changedFields.length,
  });
  if (isPlannedDeload(before, after, changedFields)) {
    changeReason = "planned_deload";
  }
  after.last_change_reason = changeReason;

  const stageIndexBefore = parseCurrentIndex(before, "phase_index");
  const stageIndexAfter = parseCurrentIndex(after, "phase_index");
  const cycleStepBefore = toInteger(before.cycle_index) ?? parseCurrentIndex(before, "cycle_step_index");
  const cycleStepAfter = toInteger(after.cycle_index) ?? parseCurrentIndex(after, "cycle_step_index");
  const stepIndex =
    parseCurrentIndex(after, "step_index") || cycleStepAfter || stageIndexAfter || 0;

  const meta: ProgressionPolicyRunMeta = {
    phase: after.current_phase ?? undefined,
    step_index: stepIndex,
    retry_flag: after.pending_retry === true,
    stage_index_before: stageIndexBefore,
    stage_index_after: stageIndexAfter,
    cycle_step_before: cycleStepBefore,
    cycle_step_after: cycleStepAfter,
    switch_event: reasonResult.meta?.switch_event ?? null,
    hold_reason:
      reasonResult.meta?.hold_reason ??
      (changedFields.length === 0 ? inferHoldReasonFromChangeReason(changeReason) : null),
    selection_reason: reasonResult.meta?.selection_reason ?? defaultSelectionReason,
    last_outcome_basis: reasonResult.meta?.last_outcome_basis ?? getLastOutcomeBasis(before),
  };

  const changeType = mapReasonToChangeType(changeReason, changedFields);

  return {
    beforeState: before,
    afterState: after,
    changedFields,
    changeReason,
    changeType,
    outcome,
    meta,
  };
}
