import { ProgressionFamilyValue, ProgressionPolicyTypeValue } from "@/lib/progression-standards";
import {
  CLASSIC_POLICY_TYPE_OPTIONS,
  CLASSIC_PROGRESSION_DEFINITIONS,
  ClassicPolicyType,
  getClassicProgressionDefinitionByPolicyType,
} from "@/features/progression/progression-policy-schema";

export type ClassicProgressionStrategyId =
  | "total_reps_threshold_progression"
  | "linear_progression"
  | "linear_periodization"
  | "double_progression";

export type ClassicProgressionStrategy = {
  id: ClassicProgressionStrategyId;
  policyType: ProgressionPolicyTypeValue;
  progressionFamily: ProgressionFamilyValue;
  labelZh: string;
  labelEn: string;
  intro: string;
  bestFor: string;
  coreLogic: string;
  defaultPolicyConfig: Record<string, unknown>;
  defaultSuccessCriteria: Record<string, unknown>;
};

const POLICY_TO_ID_MAP: Record<ClassicPolicyType, ClassicProgressionStrategyId> = {
  total_reps_threshold: "total_reps_threshold_progression",
  linear_load_step: "linear_progression",
  linear_periodization_step: "linear_periodization",
  double_progression: "double_progression",
};

export const CLASSIC_PROGRESSION_STRATEGIES: ClassicProgressionStrategy[] =
  CLASSIC_PROGRESSION_DEFINITIONS.map((definition) => ({
    id: POLICY_TO_ID_MAP[definition.policyType],
    policyType: definition.policyType,
    progressionFamily: definition.progressionFamily,
    labelZh: definition.labelZh,
    labelEn: definition.labelEn,
    intro: definition.intro,
    bestFor: definition.bestFor,
    coreLogic: definition.coreLogic,
    defaultPolicyConfig: definition.defaults.progressionPolicyConfig,
    defaultSuccessCriteria: definition.defaults.successCriteria,
  }));

const CLASSIC_POLICY_TYPE_SET = new Set(CLASSIC_POLICY_TYPE_OPTIONS);

export function isClassicProgressionPolicyType(value: string): value is ProgressionPolicyTypeValue {
  return CLASSIC_POLICY_TYPE_SET.has(value as ClassicPolicyType);
}

export function getClassicProgressionStrategyByPolicyType(policyType: string) {
  const definition = getClassicProgressionDefinitionByPolicyType(policyType);
  if (!definition) {
    return null;
  }
  return (
    CLASSIC_PROGRESSION_STRATEGIES.find((strategy) => strategy.policyType === definition.policyType) ??
    null
  );
}
