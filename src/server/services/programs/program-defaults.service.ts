import {
  Prisma,
  ProgramSource,
  ProgramStatus,
  ProgramType,
  RecoveryPolicyType,
  SportType,
} from "@prisma/client";

type BuildProgramDefaultsParams = {
  name: string;
  userId: string;
  goalId: string;
  sportType: SportType;
  programType?: ProgramType;
  status?: ProgramStatus;
  version?: number;
  parentProgramId?: string;
  startDate: Date;
  endDate?: Date;
  durationWeeks?: number;
  weeklyFrequencyTarget?: number;
  weeklyExposureMix?: Prisma.InputJsonValue;
  defaultRecoveryPolicyType?: RecoveryPolicyType;
  defaultRecoveryPolicyConfig?: Prisma.InputJsonValue;
  defaultAdaptationPolicyConfig?: Prisma.InputJsonValue;
  constraintAwarePlanning?: boolean;
  source?: ProgramSource;
  notes?: string;
};

export function buildProgramCreateDataWithDefaults(
  input: BuildProgramDefaultsParams,
): Prisma.ProgramUncheckedCreateInput {
  return {
    user_id: input.userId,
    goal_id: input.goalId,
    name: input.name,
    sport_type: input.sportType,
    program_type: input.programType ?? "training_cycle",
    status: input.status ?? "draft",
    version: input.version ?? 1,
    parent_program_id: input.parentProgramId,
    start_date: input.startDate,
    end_date: input.endDate,
    duration_weeks: input.durationWeeks,
    weekly_frequency_target: input.weeklyFrequencyTarget,
    weekly_exposure_mix: input.weeklyExposureMix ?? {},
    default_recovery_policy_type: input.defaultRecoveryPolicyType ?? "preserve_order",
    default_recovery_policy_config: input.defaultRecoveryPolicyConfig ?? {},
    default_adaptation_policy_config: input.defaultAdaptationPolicyConfig ?? {},
    constraint_aware_planning: input.constraintAwarePlanning ?? true,
    source: input.source ?? "manual",
    notes: input.notes,
  };
}
