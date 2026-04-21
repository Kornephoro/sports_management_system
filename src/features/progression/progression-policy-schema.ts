import {
  ProgressionFamilyValue,
  ProgressionPolicyTypeValue,
} from "@/lib/progression-standards";

export type ClassicPolicyType = Extract<
  ProgressionPolicyTypeValue,
  "total_reps_threshold" | "linear_load_step" | "linear_periodization_step" | "double_progression"
>;

export type FieldInputType = "number" | "select" | "switch" | "step_table";
export type FieldValueSource = "policy" | "success";

export type StrategyFieldOption = {
  value: string;
  labelZh: string;
  labelEn: string;
};

export type StrategyFieldDef = {
  key: string;
  source: FieldValueSource;
  input: FieldInputType;
  labelZh: string;
  labelEn: string;
  required?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
  options?: StrategyFieldOption[];
};

export type LinearPeriodizationStep = {
  name: string;
  sets: number;
  reps: number;
  loadChange: number;
};

export type ClassicProgressionStrategyDefinition = {
  policyType: ClassicPolicyType;
  progressionFamily: ProgressionFamilyValue;
  labelZh: string;
  labelEn: string;
  intro: string;
  bestFor: string;
  coreLogic: string;
  requiredFields: StrategyFieldDef[];
  optionalFields: StrategyFieldDef[];
  defaults: {
    progressionPolicyConfig: Record<string, unknown>;
    successCriteria: Record<string, unknown>;
    adjustmentPolicyConfig: Record<string, unknown>;
  };
};

const UNDER_TARGET_PATH_OPTIONS: StrategyFieldOption[] = [
  { value: "hold", labelZh: "保持不变", labelEn: "Hold" },
  { value: "add_set_first", labelZh: "先加组", labelEn: "Add Sets First" },
  { value: "add_reps_first", labelZh: "先加次数", labelEn: "Add Reps First" },
  {
    value: "reduce_rest_first",
    labelZh: "先缩短休息时间",
    labelEn: "Reduce Rest First",
  },
];

const INCREMENT_FREQUENCY_OPTIONS: StrategyFieldOption[] = [
  { value: "1", labelZh: "每次成功后加重", labelEn: "Every Successful Exposure" },
  { value: "2", labelZh: "每 2 次成功后加重", labelEn: "Every 2 Successes" },
  { value: "3", labelZh: "每 3 次成功后加重", labelEn: "Every 3 Successes" },
];

const ADVANCE_BASIS_OPTIONS: StrategyFieldOption[] = [
  { value: "success", labelZh: "按达标推进", labelEn: "Advance On Success" },
  { value: "exposure", labelZh: "按暴露推进", labelEn: "Advance On Exposure" },
];

const ADVANCE_MODE_OPTIONS: StrategyFieldOption[] = [
  { value: "step", labelZh: "按步推进", labelEn: "Step-wise" },
  { value: "exposure", labelZh: "按暴露推进", labelEn: "Exposure-based" },
];

const RESTART_MODE_OPTIONS: StrategyFieldOption[] = [
  {
    value: "loop_with_higher_baseline",
    labelZh: "循环并抬高基线",
    labelEn: "Loop With Higher Baseline",
  },
  { value: "restart_from_step_1", labelZh: "回到第一步重启", labelEn: "Restart From Step 1" },
  { value: "hold_last_step", labelZh: "停留在最后一步", labelEn: "Hold At Last Step" },
];

const DELOAD_RULE_OPTIONS: StrategyFieldOption[] = [
  {
    value: "reduce_load_keep_technique",
    labelZh: "减量并保持动作技术",
    labelEn: "Reduce Load, Keep Technique",
  },
  { value: "reduce_sets_first", labelZh: "优先减组", labelEn: "Reduce Sets First" },
  { value: "reduce_reps_first", labelZh: "优先减次", labelEn: "Reduce Reps First" },
];

const DOUBLE_ATTAINMENT_OPTIONS: StrategyFieldOption[] = [
  {
    value: "all_sets_hit_upper",
    labelZh: "所有组都达到区间上限",
    labelEn: "All Sets Reach Upper Bound",
  },
  {
    value: "total_reps_threshold",
    labelZh: "达到总次数阈值后加重",
    labelEn: "Load Up On Total Reps Threshold",
  },
];

const POST_INCREMENT_RESET_OPTIONS: StrategyFieldOption[] = [
  {
    value: "back_to_range_floor",
    labelZh: "加重后回到区间下限",
    labelEn: "Reset To Range Floor",
  },
  {
    value: "back_to_floor_minus_one",
    labelZh: "加重后回到下限-1（保守）",
    labelEn: "Reset To Floor - 1",
  },
  {
    value: "keep_mid_range",
    labelZh: "加重后维持中位次数",
    labelEn: "Keep Mid Range",
  },
];

export const CLASSIC_LINEAR_PERIODIZATION_DEFAULT_STEPS: LinearPeriodizationStep[] = [
  { name: "Step 1", sets: 3, reps: 9, loadChange: 0 },
  { name: "Step 2", sets: 3, reps: 8, loadChange: 2.5 },
  { name: "Step 3", sets: 4, reps: 7, loadChange: 5 },
  { name: "Step 4", sets: 4, reps: 6, loadChange: 7.5 },
];

export const CLASSIC_PROGRESSION_DEFINITIONS: ClassicProgressionStrategyDefinition[] = [
  {
    policyType: "total_reps_threshold",
    progressionFamily: "threshold",
    labelZh: "总次数阈值进阶",
    labelEn: "Total Reps Threshold Progression",
    intro:
      "总次数阈值进阶 / Total Reps Threshold Progression\n先在当前重量或难度下，把整次训练的总次数做到预设阈值（例如 30 / 40 / 50 次），再提高重量或难度。适合高位下拉、划船、俯卧撑等更适合“攒够再进阶”的动作。",
    bestFor: "辅助复合动作、自重动作、器械动作",
    coreLogic: "先攒总量，再进阶；更关注总次数目标与容量推进路径。",
    requiredFields: [
      {
        key: "total_reps_threshold",
        source: "policy",
        input: "number",
        labelZh: "总次数阈值",
        labelEn: "Total Reps Threshold",
        required: true,
        min: 1,
        step: 1,
        unit: "reps",
      },
      {
        key: "base_sets",
        source: "policy",
        input: "number",
        labelZh: "当前基础组数",
        labelEn: "Base Sets",
        required: true,
        min: 1,
        step: 1,
        unit: "sets",
      },
      {
        key: "load_increment",
        source: "policy",
        input: "number",
        labelZh: "加重步长",
        labelEn: "Load Increment",
        required: true,
        min: 0.1,
        step: 0.5,
        unit: "kg",
      },
      {
        key: "reset_reps_to",
        source: "policy",
        input: "number",
        labelZh: "达阈值后回退起点",
        labelEn: "Reset Reps To",
        required: true,
        min: 1,
        step: 1,
        unit: "reps",
      },
    ],
    optionalFields: [
      {
        key: "max_sets",
        source: "policy",
        input: "number",
        labelZh: "最大组数",
        labelEn: "Max Sets",
        min: 1,
        step: 1,
        unit: "sets",
      },
      {
        key: "max_reps_per_set",
        source: "policy",
        input: "number",
        labelZh: "最大每组次数",
        labelEn: "Max Reps Per Set",
        min: 1,
        step: 1,
        unit: "reps",
      },
      {
        key: "min_rest_seconds",
        source: "policy",
        input: "number",
        labelZh: "最短休息时间",
        labelEn: "Min Rest Time",
        min: 10,
        step: 5,
        unit: "sec",
      },
      {
        key: "under_target_path",
        source: "policy",
        input: "select",
        labelZh: "未达标时推进路径",
        labelEn: "Under-target Path",
        options: UNDER_TARGET_PATH_OPTIONS,
      },
    ],
    defaults: {
      progressionPolicyConfig: {
        total_reps_threshold: 40,
        base_sets: 3,
        load_increment: 2.5,
        reset_reps_to: 8,
        max_sets: 5,
        max_reps_per_set: 15,
        min_rest_seconds: 90,
        under_target_path: "hold",
      },
      successCriteria: {
        metric: "total_reps",
        total_reps_threshold: 40,
      },
      adjustmentPolicyConfig: {},
    },
  },
  {
    policyType: "linear_load_step",
    progressionFamily: "strict_load",
    labelZh: "线性进步",
    labelEn: "Linear Progression",
    intro:
      "线性进步 / Linear Progression\n在固定组数和次数目标下，只要训练成功完成，下次就直接增加重量；如果未完成，则维持同重量再试，连续失败后再减载。适合新手阶段的主项复合动作。",
    bestFor: "新手主项、恢复较快的主项复合动作",
    coreLogic: "固定组次 + 达标即加重；失败累计后减量回调。",
    requiredFields: [
      {
        key: "fixed_sets",
        source: "policy",
        input: "number",
        labelZh: "固定组数",
        labelEn: "Fixed Sets",
        required: true,
        min: 1,
        step: 1,
      },
      {
        key: "fixed_reps",
        source: "policy",
        input: "number",
        labelZh: "固定次数",
        labelEn: "Fixed Reps",
        required: true,
        min: 1,
        step: 1,
      },
      {
        key: "load_increment",
        source: "policy",
        input: "number",
        labelZh: "加重步长",
        labelEn: "Load Increment",
        required: true,
        min: 0.1,
        step: 0.5,
        unit: "kg",
      },
    ],
    optionalFields: [
      {
        key: "failure_streak_threshold",
        source: "policy",
        input: "number",
        labelZh: "连续失败阈值",
        labelEn: "Failure Streak Threshold",
        min: 1,
        step: 1,
      },
      {
        key: "deload_percent",
        source: "policy",
        input: "number",
        labelZh: "减量比例",
        labelEn: "Deload Percent",
        min: 0.5,
        max: 1,
        step: 0.01,
        unit: "ratio",
      },
      {
        key: "increment_frequency",
        source: "policy",
        input: "select",
        labelZh: "加重频率",
        labelEn: "Increment Frequency",
        options: INCREMENT_FREQUENCY_OPTIONS,
      },
    ],
    defaults: {
      progressionPolicyConfig: {
        fixed_sets: 3,
        fixed_reps: 5,
        load_increment: 2.5,
        failure_streak_threshold: 2,
        deload_percent: 0.9,
        increment_frequency: 1,
      },
      successCriteria: {
        complete_all_sets: true,
        meet_target_reps: true,
      },
      adjustmentPolicyConfig: {},
    },
  },
  {
    policyType: "linear_periodization_step",
    progressionFamily: "strict_load",
    labelZh: "线性周期",
    labelEn: "Linear Periodization",
    intro:
      "线性周期 / Linear Periodization\n按周或按阶段推进训练，在一个周期内逐步提高强度、降低次数或容量，并在周期结束或减量后，以更高基线进入下一轮。适合中级训练者的主项或重点动作。",
    bestFor: "中级主项、需要阶段化推进与疲劳管理的重点动作",
    coreLogic: "通过自定义 steps 阶段推进，不固定死板模板。",
    requiredFields: [
      {
        key: "steps",
        source: "policy",
        input: "step_table",
        labelZh: "周期步结构",
        labelEn: "Cycle Steps",
        required: true,
        helpText: "每步可独立设置组数、次数与负重变化。",
      },
      {
        key: "advance_mode",
        source: "policy",
        input: "select",
        labelZh: "推进方式",
        labelEn: "Advance Mode",
        required: true,
        options: ADVANCE_MODE_OPTIONS,
      },
      {
        key: "advance_basis",
        source: "policy",
        input: "select",
        labelZh: "推进依据",
        labelEn: "Advance Basis",
        required: true,
        options: ADVANCE_BASIS_OPTIONS,
      },
    ],
    optionalFields: [
      {
        key: "include_deload_step",
        source: "policy",
        input: "switch",
        labelZh: "包含减量步",
        labelEn: "Include Deload Step",
      },
      {
        key: "deload_rule",
        source: "policy",
        input: "select",
        labelZh: "减量规则",
        labelEn: "Deload Rule",
        options: DELOAD_RULE_OPTIONS,
      },
      {
        key: "restart_mode",
        source: "policy",
        input: "select",
        labelZh: "周期结束后重启方式",
        labelEn: "Restart Mode",
        options: RESTART_MODE_OPTIONS,
      },
    ],
    defaults: {
      progressionPolicyConfig: {
        advance_mode: "step",
        advance_basis: "success",
        include_deload_step: false,
        deload_rule: "reduce_load_keep_technique",
        restart_mode: "loop_with_higher_baseline",
        steps: CLASSIC_LINEAR_PERIODIZATION_DEFAULT_STEPS,
      },
      successCriteria: {
        complete_all_sets: true,
        min_successes_to_advance: 1,
      },
      adjustmentPolicyConfig: {},
    },
  },
  {
    policyType: "double_progression",
    progressionFamily: "threshold",
    labelZh: "双进阶",
    labelEn: "Double Progression",
    intro:
      "双进阶 / Double Progression\n先在当前重量下，把目标组数逐步推到次数区间上限；当所有目标组都达到区间上限后，再增加重量，并把次数回到区间低端重新开始。适合大多数孤立动作和肌肥大辅助动作。",
    bestFor: "孤立动作、小负重动作、肌肥大辅助动作",
    coreLogic: "先升次数后升重量，区间宽度可配置。",
    requiredFields: [
      {
        key: "target_sets",
        source: "policy",
        input: "number",
        labelZh: "目标组数",
        labelEn: "Target Sets",
        required: true,
        min: 1,
        step: 1,
      },
      {
        key: "rep_range_min",
        source: "policy",
        input: "number",
        labelZh: "次数区间下限",
        labelEn: "Rep Range Min",
        required: true,
        min: 1,
        step: 1,
      },
      {
        key: "rep_range_max",
        source: "policy",
        input: "number",
        labelZh: "次数区间上限",
        labelEn: "Rep Range Max",
        required: true,
        min: 1,
        step: 1,
      },
      {
        key: "load_increment",
        source: "policy",
        input: "number",
        labelZh: "加重步长",
        labelEn: "Load Increment",
        required: true,
        min: 0.1,
        step: 0.5,
        unit: "kg",
      },
    ],
    optionalFields: [
      {
        key: "attainment_mode",
        source: "policy",
        input: "select",
        labelZh: "达标模式",
        labelEn: "Attainment Mode",
        options: DOUBLE_ATTAINMENT_OPTIONS,
      },
      {
        key: "post_increment_reset_rule",
        source: "policy",
        input: "select",
        labelZh: "加重后回退规则",
        labelEn: "Post-Increment Reset",
        options: POST_INCREMENT_RESET_OPTIONS,
      },
      {
        key: "allow_deload_week",
        source: "policy",
        input: "switch",
        labelZh: "允许减量周",
        labelEn: "Allow Deload Week",
      },
      {
        key: "total_reps_threshold",
        source: "success",
        input: "number",
        labelZh: "总次数阈值（总次数达标模式）",
        labelEn: "Total Reps Threshold",
        min: 1,
        step: 1,
      },
    ],
    defaults: {
      progressionPolicyConfig: {
        target_sets: 3,
        rep_range_min: 8,
        rep_range_max: 12,
        load_increment: 2.5,
        attainment_mode: "all_sets_hit_upper",
        post_increment_reset_rule: "back_to_range_floor",
        allow_deload_week: false,
      },
      successCriteria: {
        complete_all_sets: true,
        all_sets_reach_rep_range_max: true,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
      },
      adjustmentPolicyConfig: {},
    },
  },
];

const CLASSIC_DEFINITION_MAP = new Map<ClassicPolicyType, ClassicProgressionStrategyDefinition>(
  CLASSIC_PROGRESSION_DEFINITIONS.map((item) => [item.policyType, item]),
);

export function isClassicPolicyType(value: string): value is ClassicPolicyType {
  return CLASSIC_DEFINITION_MAP.has(value as ClassicPolicyType);
}

export function getClassicProgressionDefinitionByPolicyType(policyType: string) {
  return CLASSIC_DEFINITION_MAP.get(policyType as ClassicPolicyType) ?? null;
}

export function getClassicProgressionDefinitions() {
  return CLASSIC_PROGRESSION_DEFINITIONS;
}

export const CLASSIC_POLICY_TYPE_OPTIONS = CLASSIC_PROGRESSION_DEFINITIONS.map(
  (definition) => definition.policyType,
);
