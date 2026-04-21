import { normalizePolicyConfig, ProgressionConfigValue } from "@/features/progression/progression-policy-normalizer";
import { getClassicProgressionDefinitionByPolicyType } from "@/features/progression/progression-policy-schema";

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

export function summarizeProgressionPolicyConfig(value: ProgressionConfigValue) {
  const normalized = normalizePolicyConfig(value);
  const definition = getClassicProgressionDefinitionByPolicyType(normalized.progressionPolicyType);
  const cfg = normalized.progressionPolicyConfig;

  if (!definition) {
    return "未配置标准策略";
  }

  switch (definition.policyType) {
    case "total_reps_threshold": {
      const threshold = toNumber(cfg.target_total_reps ?? cfg.total_reps_threshold) ?? 40;
      const sets = toNumber(cfg.base_sets) ?? 3;
      const increment = toNumber(cfg.progression_step ?? cfg.load_increment) ?? 2.5;
      return `阈值 ${threshold} 次，基础 ${sets} 组，加重 ${increment}kg`;
    }
    case "linear_load_step": {
      const sets = toNumber(cfg.fixed_sets) ?? 3;
      const reps = toNumber(cfg.fixed_reps) ?? 5;
      const increment = toNumber(cfg.load_increment) ?? 2.5;
      return `${sets}x${reps}，成功后 +${increment}kg`;
    }
    case "linear_periodization_step": {
      const steps = Array.isArray(cfg.steps)
        ? cfg.steps
        : Array.isArray(cfg.progression_steps)
          ? cfg.progression_steps
          : [];
      if (steps.length === 0) {
        return "周期步未配置";
      }
      const compact = steps
        .slice(0, 3)
        .map((step) => {
          const record = typeof step === "object" && step !== null ? (step as Record<string, unknown>) : {};
          const sets = toNumber(record.sets) ?? 3;
          const reps = toNumber(record.reps) ?? 0;
          return `${sets}x${reps}`;
        })
        .join(" -> ");
      const suffix = steps.length > 3 ? ` 等 ${steps.length} 步` : "";
      return `${compact}${suffix}`;
    }
    case "double_progression": {
      const sets = toNumber(cfg.target_sets) ?? 3;
      const min = toNumber(cfg.rep_range_min) ?? 8;
      const max = toNumber(cfg.rep_range_max) ?? 12;
      const increment = toNumber(cfg.progression_step ?? cfg.load_increment) ?? 2.5;
      return `${sets} 组，${min}-${max} 次，+${increment}kg`;
    }
    default:
      return `${definition.labelZh} / ${definition.labelEn}`;
  }
}
