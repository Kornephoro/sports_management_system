import { RecoveryPolicyType, UnitExecutionCompletionStatus } from "@prisma/client";
import { UnitRoleValue } from "@/lib/progression-standards";
import { ProgressOutcome, ProgressTrackState } from "@/lib/progression-types";
import { mapOutcomeToChangeReason } from "@/server/services/progression/progression-policy-runner.service";

export type ProgressTrackOutcomeKind = ProgressOutcome;

export type SessionExecutionSetLike = {
  set_index: number;
  planned_set_type: string | null;
  planned_reps: number | null;
  actual_reps: number | null;
  status: "pending" | "completed" | "skipped" | "extra";
  is_extra_set: boolean;
};

export type UnitSetSummary = {
  plannedSetCount: number;
  completedPlannedCount: number;
  skippedPlannedCount: number;
  pendingPlannedCount: number;
  completionRatio: number;
  coreSetCount: number;
  coreSetFailed: boolean;
  allSkipped: boolean;
  meetsTarget: boolean;
  extraSetCount: number;
  completedExtraSetCount: number;
  completedRepsTotal: number;
  completedDurationTotal: number;
};

export type SetAggregateDelta = {
  completedRepsDelta: number;
  completedDurationDelta: number;
};

type OutcomeCounts = {
  exposure: number;
  success: number;
  failure: number;
};

const UNDER_TARGET_TAGS = new Set(["less_sets", "less_reps", "less_duration"]);

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toPositiveInteger(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === undefined || parsed <= 0) {
    return null;
  }
  return Math.max(1, Math.trunc(parsed));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : ""))
    .filter((item) => item.length > 0);
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

function countByOutcome(outcome: ProgressTrackOutcomeKind): OutcomeCounts {
  switch (outcome) {
    case "success_met":
      return { exposure: 1, success: 1, failure: 0 };
    case "success_unmet":
      return { exposure: 1, success: 0, failure: 0 };
    case "partial":
    case "failed":
      return { exposure: 1, success: 0, failure: 1 };
    case "skipped":
      return { exposure: 0, success: 0, failure: 0 };
    default:
      return { exposure: 0, success: 0, failure: 0 };
  }
}

function readTargetReps(targetPayload: Record<string, unknown> | undefined) {
  if (!targetPayload) {
    return null;
  }
  return toPositiveInteger(targetPayload.reps);
}

function readTargetDurationSeconds(targetPayload: Record<string, unknown> | undefined) {
  if (!targetPayload) {
    return null;
  }
  return toPositiveInteger(targetPayload.duration_seconds);
}

export function summarizeUnitFromExecutionSets(args: {
  sets: SessionExecutionSetLike[];
  targetPayload?: Record<string, unknown>;
}): UnitSetSummary {
  const nonExtraSets = args.sets.filter((setRow) => !setRow.is_extra_set);
  const plannedSetCount = nonExtraSets.length;
  const completedPlannedSets = nonExtraSets.filter((setRow) => setRow.status === "completed");
  const skippedPlannedCount = nonExtraSets.filter((setRow) => setRow.status === "skipped").length;
  const completedPlannedCount = completedPlannedSets.length;
  const pendingPlannedCount = Math.max(0, plannedSetCount - completedPlannedCount - skippedPlannedCount);
  const completionRatio = plannedSetCount > 0 ? completedPlannedCount / plannedSetCount : 0;
  const allSkipped = plannedSetCount > 0 && skippedPlannedCount === plannedSetCount;

  const coreSetsByType = nonExtraSets.filter((setRow) => {
    if (!setRow.planned_set_type) {
      return false;
    }
    return setRow.planned_set_type === "top_set" || setRow.planned_set_type === "working";
  });
  const fallbackCoreSet = coreSetsByType.length === 0 && nonExtraSets.length > 0 ? [nonExtraSets[0]] : [];
  const coreSets = coreSetsByType.length > 0 ? coreSetsByType : fallbackCoreSet;
  const coreSetFailed = coreSets.some((setRow) => setRow.status !== "completed");

  const targetReps = readTargetReps(args.targetPayload);
  const meetsTarget = completedPlannedSets.every((setRow) => {
    const plannedReps = setRow.planned_reps ?? targetReps;
    if (plannedReps === null) {
      return true;
    }
    const actualReps = setRow.actual_reps ?? plannedReps;
    return actualReps >= plannedReps;
  });

  const completedSets = args.sets.filter((setRow) => setRow.status === "completed");
  const completedRepsTotal = completedSets.reduce((sum, setRow) => {
    const reps = setRow.actual_reps ?? setRow.planned_reps ?? targetReps;
    if (reps === null || reps <= 0) {
      return sum;
    }
    return sum + reps;
  }, 0);

  const durationPerSet = readTargetDurationSeconds(args.targetPayload);
  const completedDurationTotal =
    durationPerSet === null ? 0 : completedSets.length * durationPerSet;

  const extraSets = args.sets.filter((setRow) => setRow.is_extra_set);
  const completedExtraSetCount = extraSets.filter((setRow) => setRow.status === "completed").length;

  return {
    plannedSetCount,
    completedPlannedCount,
    skippedPlannedCount,
    pendingPlannedCount,
    completionRatio,
    coreSetCount: coreSets.length,
    coreSetFailed,
    allSkipped,
    meetsTarget,
    extraSetCount: extraSets.length,
    completedExtraSetCount,
    completedRepsTotal,
    completedDurationTotal,
  };
}

export function classifyTrackOutcomeFromSetSummary(
  summary: UnitSetSummary,
): ProgressTrackOutcomeKind {
  if (summary.allSkipped) {
    return "skipped";
  }

  if (summary.plannedSetCount === 0 && summary.completedPlannedCount === 0) {
    return "skipped";
  }

  if (summary.completedPlannedCount === summary.plannedSetCount && summary.meetsTarget) {
    return "success_met";
  }

  if (summary.coreSetFailed) {
    return "failed";
  }

  if (summary.completionRatio >= 0.7) {
    return "partial";
  }

  return "failed";
}

function shouldPendingRetry(args: {
  outcome: ProgressTrackOutcomeKind;
  recoveryPolicy: RecoveryPolicyType;
  unitRole: UnitRoleValue | string;
}) {
  if (args.outcome === "success_met" || args.outcome === "success_unmet") {
    return false;
  }

  if (args.recoveryPolicy === "preserve_order" || args.recoveryPolicy === "manual") {
    return true;
  }

  if (args.recoveryPolicy === "preserve_calendar") {
    return false;
  }

  if (args.recoveryPolicy === "smart_merge") {
    return args.unitRole === "main" || args.unitRole === "secondary";
  }

  return false;
}

export function classifyTrackOutcomeFromExecution(args: {
  completionStatus: UnitExecutionCompletionStatus | string;
  resultFlags?: unknown;
}): ProgressTrackOutcomeKind {
  if (args.completionStatus === "skipped") {
    return "skipped";
  }

  if (args.completionStatus === "failed") {
    return "failed";
  }

  if (args.completionStatus === "partial") {
    return "partial";
  }

  if (args.completionStatus === "replaced") {
    return "partial";
  }

  if (args.completionStatus === "completed") {
    const resultFlags = asRecord(args.resultFlags);
    const checkoffV1 = asRecord(resultFlags.checkoff_v1);
    const deviationTags = asStringArray(checkoffV1.deviation_tags);
    const hasUnderTargetTag = deviationTags.some((tag) => UNDER_TARGET_TAGS.has(tag));
    return hasUnderTargetTag ? "success_unmet" : "success_met";
  }

  return "partial";
}

export type ProgressTrackOutcomeDelta = {
  exposureDelta: number;
  successDelta: number;
  failureDelta: number;
  lastExposureAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  nextState: ProgressTrackState;
};

export function buildProgressTrackOutcomeDelta(args: {
  previousOutcome: ProgressTrackOutcomeKind | null;
  nextOutcome: ProgressTrackOutcomeKind;
  recoveryPolicy: RecoveryPolicyType;
  unitRole: UnitRoleValue | string;
  currentState: ProgressTrackState;
  setSummary?: UnitSetSummary;
  setAggregateDelta?: SetAggregateDelta;
  now: Date;
}): ProgressTrackOutcomeDelta {
  const previousCounts = args.previousOutcome
    ? countByOutcome(args.previousOutcome)
    : { exposure: 0, success: 0, failure: 0 };
  const nextCounts = countByOutcome(args.nextOutcome);

  const exposureDelta = nextCounts.exposure - previousCounts.exposure;
  const successDelta = nextCounts.success - previousCounts.success;
  const failureDelta = nextCounts.failure - previousCounts.failure;

  const nextState = cloneState(args.currentState);
  const extraState = asRecord(nextState.extra_state);
  const rawSkippedCount = extraState.skipped_count;
  const currentSkippedCount =
    typeof rawSkippedCount === "number" && Number.isFinite(rawSkippedCount)
      ? rawSkippedCount
      : 0;

  let nextSkippedCount = currentSkippedCount;
  if (args.previousOutcome === "skipped" && args.nextOutcome !== "skipped") {
    nextSkippedCount = Math.max(0, nextSkippedCount - 1);
  }
  if (args.previousOutcome !== "skipped" && args.nextOutcome === "skipped") {
    nextSkippedCount += 1;
  }

  nextState.pending_retry = shouldPendingRetry({
    outcome: args.nextOutcome,
    recoveryPolicy: args.recoveryPolicy,
    unitRole: args.unitRole,
  });
  nextState.last_change_reason = mapOutcomeToChangeReason({
    outcome: args.nextOutcome,
    preferredReason:
      args.nextOutcome === "success_met"
        ? "normal_progression"
        : args.nextOutcome === "success_unmet"
          ? "hold_no_progress"
          : args.nextOutcome === "partial"
            ? "retry_pending"
            : args.nextOutcome === "failed"
              ? "regression"
              : "rescheduled_reflow",
    changedFieldsCount: args.nextOutcome === "success_met" ? 1 : 0,
  });

  const repsAccumulated = toNumber(extraState.total_reps_completed) ?? 0;
  const durationAccumulated = toNumber(extraState.total_duration_completed) ?? 0;
  const repsDelta = args.setAggregateDelta?.completedRepsDelta ?? 0;
  const durationDelta = args.setAggregateDelta?.completedDurationDelta ?? 0;

  nextState.extra_state = {
    ...extraState,
    last_outcome: args.nextOutcome,
    skipped_count: nextSkippedCount,
    total_reps_completed: Math.max(0, repsAccumulated + repsDelta),
    total_duration_completed: Math.max(0, durationAccumulated + durationDelta),
    ...(args.setSummary
      ? {
          last_set_summary: {
            planned_set_count: args.setSummary.plannedSetCount,
            completed_planned_count: args.setSummary.completedPlannedCount,
            skipped_planned_count: args.setSummary.skippedPlannedCount,
            pending_planned_count: args.setSummary.pendingPlannedCount,
            completion_ratio: args.setSummary.completionRatio,
            core_set_count: args.setSummary.coreSetCount,
            core_set_failed: args.setSummary.coreSetFailed,
            all_skipped: args.setSummary.allSkipped,
            meets_target: args.setSummary.meetsTarget,
            extra_set_count: args.setSummary.extraSetCount,
            completed_extra_set_count: args.setSummary.completedExtraSetCount,
          },
        }
      : {}),
  };

  return {
    exposureDelta,
    successDelta,
    failureDelta,
    lastExposureAt:
      args.nextOutcome === "success_met" ||
      args.nextOutcome === "success_unmet" ||
      args.nextOutcome === "partial"
        ? args.now
        : null,
    lastSuccessAt: args.nextOutcome === "success_met" ? args.now : null,
    lastFailureAt: args.nextOutcome === "partial" || args.nextOutcome === "failed" ? args.now : null,
    nextState,
  };
}
