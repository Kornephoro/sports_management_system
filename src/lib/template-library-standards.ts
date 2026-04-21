export const TEMPLATE_SPLIT_TYPE_VALUES = [
  "full_body",
  "upper_lower",
  "push_pull_legs",
  "custom",
] as const;

export type BuiltinTemplateSplitType = (typeof TEMPLATE_SPLIT_TYPE_VALUES)[number];
export type TemplateSplitType = string;

const TEMPLATE_SPLIT_TYPE_LABEL_MAP: Record<BuiltinTemplateSplitType, string> = {
  full_body: "全身",
  upper_lower: "上下肢分化",
  push_pull_legs: "推拉腿",
  custom: "自定义",
};

export const TEMPLATE_SPLIT_TYPE_OPTIONS: Array<{ value: string; label: string }> =
  TEMPLATE_SPLIT_TYPE_VALUES.map((value) => ({
    value,
    label: TEMPLATE_SPLIT_TYPE_LABEL_MAP[value],
  }));

export function getTemplateSplitTypeLabel(value: string) {
  return TEMPLATE_SPLIT_TYPE_LABEL_MAP[value as BuiltinTemplateSplitType] ?? value;
}
