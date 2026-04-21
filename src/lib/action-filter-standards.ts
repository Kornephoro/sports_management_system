import { MovementPatternV1, MuscleRegionV1 } from "@/lib/exercise-library-standards";

export const ACTION_CATEGORY_FILTER_VALUES = [
  "upper_body",
  "lower_body",
  "core",
  "full_body",
] as const;

export type ActionCategoryFilterValue = (typeof ACTION_CATEGORY_FILTER_VALUES)[number];

export const ACTION_MOVEMENT_FILTER_VALUES = [
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "squat",
  "hip_hinge",
  "lunge",
  "core_stability",
  "rotation",
  "flexion",
] as const;

export type ActionMovementFilterValue = (typeof ACTION_MOVEMENT_FILTER_VALUES)[number];

export const ACTION_PRIMARY_MUSCLE_FILTER_VALUES = [
  "chest",
  "lats",
  "quads",
  "glutes",
  "hamstrings",
  "delts",
  "biceps",
  "triceps",
  "core",
] as const;

export type ActionPrimaryMuscleFilterValue = (typeof ACTION_PRIMARY_MUSCLE_FILTER_VALUES)[number];

export const ACTION_CATEGORY_FILTER_OPTIONS: Array<{
  value: ActionCategoryFilterValue;
  label: string;
}> = [
  { value: "upper_body", label: "上肢" },
  { value: "lower_body", label: "下肢" },
  { value: "core", label: "核心" },
  { value: "full_body", label: "全身" },
];

export const ACTION_MOVEMENT_FILTER_OPTIONS: Array<{
  value: ActionMovementFilterValue;
  label: string;
}> = [
  { value: "horizontal_push", label: "水平推" },
  { value: "horizontal_pull", label: "水平拉" },
  { value: "vertical_push", label: "垂直推" },
  { value: "vertical_pull", label: "垂直拉" },
  { value: "squat", label: "蹲类" },
  { value: "hip_hinge", label: "髋主导" },
  { value: "lunge", label: "弓步" },
  { value: "core_stability", label: "核心稳定" },
  { value: "rotation", label: "旋转" },
  { value: "flexion", label: "屈曲" },
];

export const ACTION_PRIMARY_MUSCLE_FILTER_OPTIONS: Array<{
  value: ActionPrimaryMuscleFilterValue;
  label: string;
}> = [
  { value: "chest", label: "胸肌" },
  { value: "lats", label: "背阔肌" },
  { value: "quads", label: "股四头肌" },
  { value: "glutes", label: "臀大肌" },
  { value: "hamstrings", label: "腘绳肌" },
  { value: "delts", label: "三角肌" },
  { value: "biceps", label: "肱二头肌" },
  { value: "triceps", label: "肱三头肌" },
  { value: "core", label: "核心" },
];

export const ACTION_MOVEMENT_FILTER_TO_PATTERNS: Record<
  ActionMovementFilterValue,
  MovementPatternV1[]
> = {
  horizontal_push: ["horizontal_push"],
  horizontal_pull: ["horizontal_pull"],
  vertical_push: ["vertical_push"],
  vertical_pull: ["vertical_pull"],
  squat: ["squat_knee_dominant"],
  hip_hinge: ["hip_hinge"],
  lunge: ["split_lunge"],
  core_stability: ["core"],
  rotation: ["core"],
  flexion: ["core"],
};

export const ACTION_PRIMARY_MUSCLE_TO_REGIONS: Record<
  ActionPrimaryMuscleFilterValue,
  MuscleRegionV1[]
> = {
  chest: ["chest", "chest_upper", "chest_mid_lower"],
  lats: ["lats"],
  quads: ["quads"],
  glutes: ["glutes"],
  hamstrings: ["hamstrings"],
  delts: ["delt_front", "delt_mid", "delt_rear"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  core: ["core", "abs", "obliques", "erector_spinae"],
};

const UPPER_PATTERNS: MovementPatternV1[] = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "upper_isolation",
];

const LOWER_PATTERNS: MovementPatternV1[] = [
  "squat_knee_dominant",
  "hip_hinge",
  "split_lunge",
  "lower_isolation",
];

const CORE_REGIONS = new Set<MuscleRegionV1>(["core", "abs", "obliques", "erector_spinae"]);

export function inferActionCategory(input: {
  movementPattern: MovementPatternV1;
  primaryRegions: MuscleRegionV1[];
  secondaryRegions?: MuscleRegionV1[];
}): ActionCategoryFilterValue {
  if (input.movementPattern === "carry") {
    return "full_body";
  }
  if (input.movementPattern === "core") {
    return "core";
  }
  if (LOWER_PATTERNS.includes(input.movementPattern)) {
    return "lower_body";
  }
  if (UPPER_PATTERNS.includes(input.movementPattern)) {
    return "upper_body";
  }

  const regions = [...input.primaryRegions, ...(input.secondaryRegions ?? [])];
  if (regions.some((region) => CORE_REGIONS.has(region))) {
    return "core";
  }
  return "upper_body";
}

function parseBooleanFlag(noteText: string, key: string) {
  const match = noteText.match(new RegExp(`${key}=(true|false)`));
  if (!match) {
    return null;
  }
  return match[1] === "true";
}

export function inferActionCapabilities(input: {
  notes: string | null;
  tags: string[];
  defaultLoadModel: "absolute" | "bodyweight_plus";
}) {
  const noteText = input.notes ?? "";
  const parsedIsBodyweight = parseBooleanFlag(noteText, "is_bodyweight");
  const parsedAllowExtraLoad = parseBooleanFlag(noteText, "allow_extra_load");
  const parsedAllowAssistance = parseBooleanFlag(noteText, "allow_assistance");

  return {
    isBodyweight:
      parsedIsBodyweight ?? (input.tags.includes("bodyweight") || input.defaultLoadModel === "bodyweight_plus"),
    allowExtraLoad: parsedAllowExtraLoad ?? input.defaultLoadModel === "bodyweight_plus",
    allowAssistance: parsedAllowAssistance ?? false,
  };
}

const REGION_TO_PRIMARY_MUSCLE_LABEL: Partial<Record<MuscleRegionV1, string>> = {
  chest: "胸肌",
  chest_upper: "胸肌",
  chest_mid_lower: "胸肌",
  lats: "背阔肌",
  quads: "股四头肌",
  glutes: "臀大肌",
  hamstrings: "腘绳肌",
  delt_front: "三角肌",
  delt_mid: "三角肌",
  delt_rear: "三角肌",
  biceps: "肱二头肌",
  triceps: "肱三头肌",
  core: "核心",
  abs: "核心",
  obliques: "核心",
  erector_spinae: "核心",
};

export function toPrimaryMuscleLabels(primaryRegions: MuscleRegionV1[], limit = 2) {
  const labels: string[] = [];
  for (const region of primaryRegions) {
    const label = REGION_TO_PRIMARY_MUSCLE_LABEL[region];
    if (!label || labels.includes(label)) {
      continue;
    }
    labels.push(label);
    if (labels.length >= limit) {
      break;
    }
  }
  return labels;
}

export function getActionCategoryFilterLabel(value: ActionCategoryFilterValue) {
  return ACTION_CATEGORY_FILTER_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function getActionMovementFilterLabel(value: ActionMovementFilterValue) {
  return ACTION_MOVEMENT_FILTER_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function getActionPrimaryMuscleFilterLabel(value: ActionPrimaryMuscleFilterValue) {
  return ACTION_PRIMARY_MUSCLE_FILTER_OPTIONS.find((item) => item.value === value)?.label ?? value;
}
