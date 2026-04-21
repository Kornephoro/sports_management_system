import { Prisma } from "@prisma/client";
import {
  ChangeReason,
  ChangeType,
  ProgressOutcome,
  ProgressTrackState,
  ProgressionSnapshot,
} from "@/lib/progression-types";
import { normalizeTrainingUnitSets } from "@/lib/training-set-standards";

function asRecord(value: unknown): Record<string, unknown> {
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

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function buildLoadText(payload: Record<string, unknown>) {
  const loadModel = payload.load_model;
  if (loadModel === "bodyweight_plus_external") {
    const additionalLoadValue = toPositiveNumber(payload.additional_load_value);
    const additionalLoadUnit =
      typeof payload.additional_load_unit === "string" ? payload.additional_load_unit : "kg";
    if (additionalLoadValue !== undefined) {
      return `自重 + 附重${additionalLoadValue}${additionalLoadUnit}`;
    }
    return "自重";
  }

  const loadValue = toPositiveNumber(payload.load_value);
  const loadUnit = typeof payload.load_unit === "string" ? payload.load_unit : "kg";
  if (loadValue !== undefined) {
    return `${loadValue}${loadUnit}`;
  }
  return "自重";
}

export function applyProgressionStateToTargetPayload(params: {
  originalTargetPayload: Prisma.JsonValue | Prisma.InputJsonValue;
  afterState: ProgressTrackState;
  prescriptionType: string;
}) {
  const nextPayload = {
    ...asRecord(params.originalTargetPayload),
  };

  if (typeof params.afterState.current_sets === "number") {
    nextPayload.sets = Math.max(1, Math.trunc(params.afterState.current_sets));
  }

  if (params.prescriptionType === "sets_time") {
    if (typeof params.afterState.current_duration_seconds === "number") {
      nextPayload.duration_seconds = Math.max(1, Math.trunc(params.afterState.current_duration_seconds));
    }
  } else if (typeof params.afterState.current_reps === "number") {
    nextPayload.reps = Math.max(1, Math.trunc(params.afterState.current_reps));
  }

  const loadModel =
    typeof nextPayload.load_model === "string" ? nextPayload.load_model : "external";
  if (typeof params.afterState.current_load === "number") {
    if (loadModel === "bodyweight_plus_external") {
      nextPayload.additional_load_value = round(params.afterState.current_load);
      if (typeof nextPayload.additional_load_unit !== "string") {
        nextPayload.additional_load_unit = "kg";
      }
    } else {
      nextPayload.load_value = round(params.afterState.current_load);
      if (typeof nextPayload.load_unit !== "string") {
        nextPayload.load_unit = "kg";
      }
      nextPayload.default_load = {
        value: round(params.afterState.current_load),
        unit: nextPayload.load_unit,
      };
    }
  }

  const normalizedSets = normalizeTrainingUnitSets(nextPayload.set_structure);
  if (normalizedSets.length > 0) {
    nextPayload.set_structure = normalizedSets.map((set) => {
      if (set.participates_in_progression === false) {
        return set;
      }
      return {
        ...set,
        ...(params.prescriptionType === "sets_time" &&
        typeof nextPayload.duration_seconds === "number"
          ? { duration_seconds: nextPayload.duration_seconds }
          : {}),
        ...(params.prescriptionType !== "sets_time" && typeof nextPayload.reps === "number"
          ? { reps: nextPayload.reps }
          : {}),
        ...((set.weight_mode ?? "absolute") === "absolute" &&
        loadModel === "bodyweight_plus_external" &&
        typeof nextPayload.additional_load_value === "number"
          ? { weight: nextPayload.additional_load_value }
          : {}),
        ...((set.weight_mode ?? "absolute") === "absolute" &&
        loadModel !== "bodyweight_plus_external" &&
        typeof nextPayload.load_value === "number"
          ? { weight: nextPayload.load_value }
          : {}),
      };
    });
  }

  nextPayload.load_text = buildLoadText(nextPayload);
  return nextPayload as Prisma.InputJsonValue;
}

export function buildProgressionSnapshot(params: {
  beforeState: ProgressTrackState;
  afterState: ProgressTrackState;
  changedFields: string[];
  changeReason: ChangeReason;
  changeType?: ChangeType;
  outcome: ProgressOutcome;
  policyType: string;
  progressionFamily: string;
  trackKey: string;
  meta?: ProgressionSnapshot["meta"];
}): ProgressionSnapshot {
  const resolvedChangeType =
    params.changeType ?? mapReasonToChangeType(params.changeReason, params.changedFields);

  return {
    before: params.beforeState,
    after: params.afterState,
    changed_fields: params.changedFields,
    change_reason: params.changeReason,
    change_type: resolvedChangeType,
    outcome: params.outcome,
    policy_type: params.policyType,
    progression_family: params.progressionFamily,
    track_key: params.trackKey,
    track_phase: params.afterState.current_phase ?? null,
    meta: {
      ...params.meta,
      phase: params.meta?.phase ?? params.afterState.current_phase ?? undefined,
      step_index:
        params.meta?.step_index ??
        params.meta?.cycle_step_after ??
        params.afterState.cycle_index ??
        0,
      retry_flag: params.meta?.retry_flag ?? params.afterState.pending_retry === true,
    },
  };
}

export function mapReasonToChangeType(
  reason: ChangeReason,
  changedFields: string[],
): ChangeType {
  if (changedFields.length === 0) {
    return "no_change";
  }

  if (reason === "threshold_reached") {
    return "realization";
  }

  if (reason === "planned_deload") {
    return "deload";
  }

  if (
    reason === "manual_override" ||
    reason === "not_selected_in_rotation" ||
    reason === "retry_pending" ||
    reason === "rescheduled_reflow" ||
    reason === "regression"
  ) {
    return "adjustment";
  }

  return "regular_progress";
}
