import {
  AdjustmentPolicyTypeValue,
  ProgressionFamilyValue,
  ProgressionPolicyTypeValue,
  UnitRoleValue,
} from "@/lib/progression-standards";

export type ProgressOutcome =
  | "success_met"
  | "success_unmet"
  | "partial"
  | "failed"
  | "skipped";

export type ChangeReason =
  | "normal_progression"
  | "threshold_reached"
  | "cycle_step_advance"
  | "planned_deload"
  | "regression"
  | "hold_no_progress"
  | "not_selected_in_rotation"
  | "retry_pending"
  | "rescheduled_reflow"
  | "manual_override";

export type ChangeType =
  | "no_change"
  | "regular_progress"
  | "realization"
  | "deload"
  | "adjustment";

export type ProgressTrackState = {
  current_phase?: string;
  current_load?: number | null;
  current_sets?: number | null;
  current_reps?: number | null;
  current_duration_seconds?: number | null;
  pending_retry?: boolean;
  cooldown_until?: string | null;
  last_change_reason?: ChangeReason | null;
  cycle_index?: number | null;
  extra_state?: Record<string, unknown>;
};

export type ProgressionSnapshot = {
  before: ProgressTrackState;
  after: ProgressTrackState;
  changed_fields: string[];
  change_reason: ChangeReason;
  change_type: ChangeType;
  outcome: ProgressOutcome;
  policy_type: ProgressionPolicyTypeValue | string;
  progression_family: ProgressionFamilyValue | string;
  track_key: string;
  track_phase?: string | null;
  meta?: {
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
};

export type ProgressionConfigEnvelope = {
  unitRole: UnitRoleValue;
  progressionFamily: ProgressionFamilyValue;
  progressionPolicyType: ProgressionPolicyTypeValue | string;
  progressionPolicyConfig: Record<string, unknown>;
  adjustmentPolicyType: AdjustmentPolicyTypeValue;
  adjustmentPolicyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  progressTrackKey: string;
};
