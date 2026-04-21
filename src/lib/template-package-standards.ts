export const TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES = [
  "single_day",
  "two_way",
  "three_way",
  "four_way",
  "irregular",
  "custom",
] as const;

export type TemplatePackageSplitType = (typeof TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES)[number];

const TEMPLATE_PACKAGE_SPLIT_TYPE_LABEL_MAP: Record<TemplatePackageSplitType, string> = {
  single_day: "1分化",
  two_way: "2分化",
  three_way: "3分化",
  four_way: "4分化",
  irregular: "不规则分化",
  custom: "自定义",
};

export const TEMPLATE_PACKAGE_SPLIT_TYPE_OPTIONS = TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES.map(
  (value) => ({
    value,
    label: TEMPLATE_PACKAGE_SPLIT_TYPE_LABEL_MAP[value],
  }),
);

export function getTemplatePackageSplitTypeLabel(value: string) {
  return TEMPLATE_PACKAGE_SPLIT_TYPE_LABEL_MAP[value as TemplatePackageSplitType] ?? value;
}
