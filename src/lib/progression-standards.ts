export const UNIT_ROLE_VALUES = [
  "main",
  "secondary",
  "accessory",
  "skill",
  "conditioning",
  "warmup",
  "cooldown",
  "mobility",
  "prehab",
] as const;

export type UnitRoleValue = (typeof UNIT_ROLE_VALUES)[number];

export const PROGRESSION_FAMILY_VALUES = [
  "strict_load",
  "threshold",
  "exposure",
  "performance",
  "autoregulated",
] as const;

export type ProgressionFamilyValue = (typeof PROGRESSION_FAMILY_VALUES)[number];

export const PROGRESSION_POLICY_TYPE_VALUES = [
  "linear_load_step",
  "linear_periodization_step",
  "scripted_cycle",
  "double_progression",
  "total_reps_threshold",
  "add_set_then_load",
  "reps_then_external_load",
  "duration_threshold",
  "bodyweight_reps_progression",
  "hold_or_manual",
  "manual",
] as const;

export type ProgressionPolicyTypeValue = (typeof PROGRESSION_POLICY_TYPE_VALUES)[number];

export const ADJUSTMENT_POLICY_TYPE_VALUES = [
  "always",
  "rotating_pool",
  "gated",
  "manual",
] as const;

export type AdjustmentPolicyTypeValue = (typeof ADJUSTMENT_POLICY_TYPE_VALUES)[number];

export const UNIT_ROLE_DEFAULT_POLICY_MAP: Record<
  UnitRoleValue,
  {
    family: ProgressionFamilyValue;
    policyType: ProgressionPolicyTypeValue;
    config: Record<string, unknown>;
    successCriteria: Record<string, unknown>;
  }
> = {
  main: {
    family: "strict_load",
    policyType: "linear_load_step",
    config: { step: { load_increment: 2.5 } },
    successCriteria: { complete_all_sets: true },
  },
  secondary: {
    family: "strict_load",
    policyType: "double_progression",
    config: { rep_target_mode: "range_first" },
    successCriteria: { complete_all_sets: true },
  },
  accessory: {
    family: "threshold",
    policyType: "add_set_then_load",
    config: { set_cap: 5, load_increment: 2.5 },
    successCriteria: { complete_all_sets: true },
  },
  skill: {
    family: "performance",
    policyType: "hold_or_manual",
    config: {},
    successCriteria: { complete_all_sets: true },
  },
  conditioning: {
    family: "exposure",
    policyType: "duration_threshold",
    config: { duration_increment_seconds: 5 },
    successCriteria: { complete_all_sets: true },
  },
  warmup: {
    family: "performance",
    policyType: "manual",
    config: {},
    successCriteria: { complete_all_sets: true },
  },
  cooldown: {
    family: "performance",
    policyType: "manual",
    config: {},
    successCriteria: { complete_all_sets: true },
  },
  mobility: {
    family: "performance",
    policyType: "manual",
    config: {},
    successCriteria: { complete_all_sets: true },
  },
  prehab: {
    family: "performance",
    policyType: "hold_or_manual",
    config: {},
    successCriteria: { complete_all_sets: true },
  },
};

