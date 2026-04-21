export const MOVEMENT_PATTERN_VALUES = [
  "squat_knee_dominant",
  "hip_hinge",
  "split_lunge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "upper_isolation",
  "lower_isolation",
  "core",
  "carry",
] as const;

export type MovementPatternV1 = (typeof MOVEMENT_PATTERN_VALUES)[number];

const MOVEMENT_PATTERN_LABEL_MAP: Record<MovementPatternV1, string> = {
  squat_knee_dominant: "蹲类 / 膝主导",
  hip_hinge: "髋铰链",
  split_lunge: "分腿 / 弓步",
  horizontal_push: "水平推",
  vertical_push: "垂直推",
  horizontal_pull: "水平拉",
  vertical_pull: "垂直拉",
  upper_isolation: "上肢孤立",
  lower_isolation: "下肢孤立",
  core: "核心",
  carry: "行走 / 搬运",
};

export const MOVEMENT_PATTERN_OPTIONS: Array<{ value: MovementPatternV1; label: string }> =
  MOVEMENT_PATTERN_VALUES.map((value) => ({
    value,
    label: MOVEMENT_PATTERN_LABEL_MAP[value],
  }));

export const MUSCLE_REGION_VALUES = [
  "neck",
  "chest", // Composite
  "chest_upper",
  "chest_mid_lower",
  "traps_mid_upper",
  "rhomboids",
  "rotator_cuff",
  "lats",
  "erector_spinae",
  "delt_front",
  "delt_mid",
  "delt_rear",
  "biceps",
  "biceps_inner",
  "biceps_outer",
  "triceps",
  "forearms",
  "core",
  "abs",
  "obliques",
  "glutes",
  "glutes_max",
  "glutes_med",
  "adductors",
  "quads",
  "it_band",
  "hamstrings",
  "calves",
] as const;

export type MuscleRegionV1 = (typeof MUSCLE_REGION_VALUES)[number];
export type MuscleRegion = MuscleRegionV1;

export interface ExerciseMuscleConfig {
  primary: MuscleRegion[];
  secondary: MuscleRegion[];
}

const MUSCLE_REGION_LABEL_MAP: Record<MuscleRegionV1, string> = {
  neck: "颈部",
  chest: "胸肌",
  chest_upper: "上胸",
  chest_mid_lower: "中下胸",
  traps_mid_upper: "中上斜方",
  rhomboids: "菱形肌",
  rotator_cuff: "肩袖",
  lats: "背阔",
  erector_spinae: "竖脊肌",
  delt_front: "前束",
  delt_mid: "中束",
  delt_rear: "后束",
  biceps: "肱二头肌",
  biceps_inner: "内侧二头",
  biceps_outer: "外侧二头",
  triceps: "三头",
  forearms: "小臂",
  core: "核心肌群",
  abs: "腹肌",
  obliques: "侧腹",
  glutes: "臀部肌群",
  glutes_max: "臀大肌",
  glutes_med: "臀中肌",
  adductors: "内收",
  quads: "股四",
  it_band: "髂胫束",
  hamstrings: "腘绳",
  calves: "小腿",
};

export const MUSCLE_REGION_OPTIONS: Array<{ value: MuscleRegionV1; label: string }> =
  MUSCLE_REGION_VALUES.map((value) => ({
    value,
    label: MUSCLE_REGION_LABEL_MAP[value],
  }));

export const EXERCISE_TAG_VALUES = [
  "unilateral",
  "bilateral",
  "isometric",
  "explosive",
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "rehab",
  "warmup_activation",
] as const;

export type ExerciseTagV1 = (typeof EXERCISE_TAG_VALUES)[number];

const EXERCISE_TAG_LABEL_MAP: Record<ExerciseTagV1, string> = {
  unilateral: "单侧",
  bilateral: "双侧",
  isometric: "静力",
  explosive: "爆发",
  barbell: "杠铃",
  dumbbell: "哑铃",
  cable: "绳索",
  machine: "器械",
  bodyweight: "自重",
  rehab: "康复",
  warmup_activation: "热身 / 激活",
};

export const EXERCISE_TAG_OPTIONS: Array<{ value: ExerciseTagV1; label: string }> =
  EXERCISE_TAG_VALUES.map((value) => ({
    value,
    label: EXERCISE_TAG_LABEL_MAP[value],
  }));

export const EXERCISE_RECORD_MODE_VALUES = ["reps", "duration"] as const;
export const EXERCISE_LOAD_MODEL_VALUES = ["absolute", "bodyweight_plus"] as const;
export const EXERCISE_CATEGORY_VALUES = ["compound", "isolation"] as const;

const RECORD_MODE_LABEL_MAP: Record<(typeof EXERCISE_RECORD_MODE_VALUES)[number], string> = {
  reps: "按次数",
  duration: "按时长",
};

const LOAD_MODEL_LABEL_MAP: Record<(typeof EXERCISE_LOAD_MODEL_VALUES)[number], string> = {
  absolute: "普通负重",
  bodyweight_plus: "自重 + 附重",
};

const CATEGORY_LABEL_MAP: Record<(typeof EXERCISE_CATEGORY_VALUES)[number], string> = {
  compound: "复合动作",
  isolation: "孤立动作",
};

export const EXERCISE_RECORD_MODE_OPTIONS = EXERCISE_RECORD_MODE_VALUES.map((value) => ({
  value,
  label: RECORD_MODE_LABEL_MAP[value],
}));

export const EXERCISE_LOAD_MODEL_OPTIONS = EXERCISE_LOAD_MODEL_VALUES.map((value) => ({
  value,
  label: LOAD_MODEL_LABEL_MAP[value],
}));

export const EXERCISE_CATEGORY_OPTIONS = EXERCISE_CATEGORY_VALUES.map((value) => ({
  value,
  label: CATEGORY_LABEL_MAP[value],
}));

export function getMovementPatternLabel(value: string) {
  return MOVEMENT_PATTERN_LABEL_MAP[value as MovementPatternV1] ?? value;
}

export function getMuscleRegionLabel(value: string) {
  return MUSCLE_REGION_LABEL_MAP[value as MuscleRegionV1] ?? value;
}

export function getExerciseTagLabel(value: string) {
  return EXERCISE_TAG_LABEL_MAP[value as ExerciseTagV1] ?? value;
}

export function getExerciseRecordModeLabel(value: string) {
  if (value === "sets_reps") {
    return RECORD_MODE_LABEL_MAP.reps;
  }
  if (value === "sets_time") {
    return RECORD_MODE_LABEL_MAP.duration;
  }
  return RECORD_MODE_LABEL_MAP[value as (typeof EXERCISE_RECORD_MODE_VALUES)[number]] ?? value;
}

export function getExerciseLoadModelLabel(value: string) {
  if (value === "external") {
    return LOAD_MODEL_LABEL_MAP.absolute;
  }
  if (value === "bodyweight_plus_external") {
    return LOAD_MODEL_LABEL_MAP.bodyweight_plus;
  }
  return LOAD_MODEL_LABEL_MAP[value as (typeof EXERCISE_LOAD_MODEL_VALUES)[number]] ?? value;
}

export function getExerciseCategoryLabel(value: string) {
  return CATEGORY_LABEL_MAP[value as (typeof EXERCISE_CATEGORY_VALUES)[number]] ?? value;
}
