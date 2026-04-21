import { TrainingUnitSet } from "@/lib/training-set-standards";

export const RECORDING_MODE_VALUES = [
  "strength",
  "reps_only",
  "duration",
  "bodyweight_load",
  "assisted",
] as const;

export type RecordingModeValue = (typeof RECORDING_MODE_VALUES)[number];

export const RECORDING_MODE_OPTIONS: Array<{
  value: RecordingModeValue;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
}> = [
  {
    value: "strength",
    labelZh: "常规力量训练",
    labelEn: "Strength Training",
    descriptionZh: "以组 × 次 × 重量为核心的标准力量训练记录方式。",
  },
  {
    value: "reps_only",
    labelZh: "仅次数",
    labelEn: "Reps Only",
    descriptionZh: "按组记录次数与组间休息，适合计次动作。",
  },
  {
    value: "duration",
    labelZh: "仅时间",
    labelEn: "Duration",
    descriptionZh: "按组记录时长与组间休息，适合计时类动作。",
  },
  {
    value: "bodyweight_load",
    labelZh: "自重附重",
    labelEn: "Bodyweight + Load",
    descriptionZh: "记录次数与附重，总负荷按体重 + 附重理解。",
  },
  {
    value: "assisted",
    labelZh: "自重辅助",
    labelEn: "Assisted Bodyweight",
    descriptionZh: "记录次数与辅助重量，实际负荷按体重 - 辅助理解。",
  },
];

export function getRecordingModeLabel(mode: RecordingModeValue) {
  const option = RECORDING_MODE_OPTIONS.find((item) => item.value === mode);
  return option ? `${option.labelZh} / ${option.labelEn}` : mode;
}

export function getRecordProfileForMode(mode: RecordingModeValue): {
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
} {
  switch (mode) {
    case "duration":
      return {
        recordMode: "sets_time",
        loadModel: "external",
      };
    case "bodyweight_load":
    case "assisted":
      return {
        recordMode: "sets_reps",
        loadModel: "bodyweight_plus_external",
      };
    case "reps_only":
    case "strength":
    default:
      return {
        recordMode: "sets_reps",
        loadModel: "external",
      };
  }
}

export function inferRecordingModeFromUnit(args: {
  recordingMode?: string | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  sets: TrainingUnitSet[];
}): RecordingModeValue {
  if (
    args.recordingMode &&
    (RECORDING_MODE_VALUES as readonly string[]).includes(args.recordingMode)
  ) {
    return args.recordingMode as RecordingModeValue;
  }

  if (args.loadModel === "bodyweight_plus_external") {
    const hasAssistWeight = args.sets.some(
      (set) => typeof set.assist_weight === "number" && Number.isFinite(set.assist_weight),
    );
    return hasAssistWeight ? "assisted" : "bodyweight_load";
  }

  if (args.recordMode === "sets_time") {
    return "duration";
  }

  if (args.sets.length === 1) {
    const first = args.sets[0];
    const isWorkingSet = (first.type || "working") === "working";
    const hasStrengthOnlyFields =
      first.weight !== undefined ||
      first.relative_intensity_ratio !== undefined ||
      first.rpe !== undefined ||
      first.rest_seconds !== undefined ||
      first.tempo !== undefined;
    if (isWorkingSet && !hasStrengthOnlyFields && typeof first.reps === "number") {
      return "reps_only";
    }
  }

  return "strength";
}

export const EXERCISE_RECORDING_MODE_VALUES = [
  "strength",
  "reps_only",
  "duration_only",
  "bodyweight_load",
  "assisted_bodyweight",
  "intervals_conditioning",
] as const;

export type ExerciseRecordingModeValue = (typeof EXERCISE_RECORDING_MODE_VALUES)[number];

export type ExerciseRecordingModeFieldDef = {
  key: string;
  labelZh: string;
  labelEn: string;
  input: "number" | "tempo4";
};

export type ExerciseRecordingModeDef = {
  value: ExerciseRecordingModeValue;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  fields: ExerciseRecordingModeFieldDef[];
};

export const EXERCISE_RECORDING_MODE_CATALOG: Record<
  ExerciseRecordingModeValue,
  ExerciseRecordingModeDef
> = {
  strength: {
    value: "strength",
    labelZh: "常规力量训练",
    labelEn: "Strength Training",
    descriptionZh: "标准组次重训练，支持组数、次数、重量、RPE、休息与动作节奏。",
    fields: [
      { key: "sets", labelZh: "组数", labelEn: "Sets", input: "number" },
      { key: "reps", labelZh: "次数", labelEn: "Reps", input: "number" },
      { key: "weight", labelZh: "重量", labelEn: "Weight", input: "number" },
      { key: "rpe", labelZh: "RPE", labelEn: "RPE", input: "number" },
      { key: "rest_seconds", labelZh: "休息（秒）", labelEn: "Rest (s)", input: "number" },
      { key: "tempo", labelZh: "动作节奏", labelEn: "Tempo", input: "tempo4" },
    ],
  },
  reps_only: {
    value: "reps_only",
    labelZh: "仅次数",
    labelEn: "Reps Only",
    descriptionZh: "按组记录次数与组间休息。",
    fields: [{ key: "total_reps", labelZh: "总次数", labelEn: "Total Reps", input: "number" }],
  },
  duration_only: {
    value: "duration_only",
    labelZh: "仅时间",
    labelEn: "Duration Only",
    descriptionZh: "按组记录时长与组间休息，适合计时类动作。",
    fields: [{ key: "duration", labelZh: "时长（秒）", labelEn: "Duration (s)", input: "number" }],
  },
  bodyweight_load: {
    value: "bodyweight_load",
    labelZh: "自重附重",
    labelEn: "Bodyweight + Load",
    descriptionZh: "记录体重基础上的附重训练。",
    fields: [
      { key: "sets", labelZh: "组数", labelEn: "Sets", input: "number" },
      { key: "reps", labelZh: "次数", labelEn: "Reps", input: "number" },
      { key: "extra_load", labelZh: "附重", labelEn: "Extra Load", input: "number" },
      { key: "rpe", labelZh: "RPE", labelEn: "RPE", input: "number" },
      { key: "rest_seconds", labelZh: "休息（秒）", labelEn: "Rest (s)", input: "number" },
    ],
  },
  assisted_bodyweight: {
    value: "assisted_bodyweight",
    labelZh: "自重辅助",
    labelEn: "Assisted Bodyweight",
    descriptionZh: "记录体重减辅助的训练方式。",
    fields: [
      { key: "sets", labelZh: "组数", labelEn: "Sets", input: "number" },
      { key: "reps", labelZh: "次数", labelEn: "Reps", input: "number" },
      { key: "assist_weight", labelZh: "辅助重量", labelEn: "Assist Weight", input: "number" },
      { key: "rpe", labelZh: "RPE", labelEn: "RPE", input: "number" },
    ],
  },
  intervals_conditioning: {
    value: "intervals_conditioning",
    labelZh: "混合体能 / 间歇",
    labelEn: "Intervals / Conditioning",
    descriptionZh: "记录轮次、工作时长和休息时长的体能模式。",
    fields: [
      { key: "rounds", labelZh: "轮次", labelEn: "Rounds", input: "number" },
      { key: "work_time", labelZh: "工作时长（秒）", labelEn: "Work Time (s)", input: "number" },
      { key: "rest_time", labelZh: "休息时长（秒）", labelEn: "Rest Time (s)", input: "number" },
    ],
  },
};

export const EXERCISE_RECORDING_MODE_OPTIONS = EXERCISE_RECORDING_MODE_VALUES.map(
  (value) => EXERCISE_RECORDING_MODE_CATALOG[value],
);

export function mapModeToLegacy(mode: ExerciseRecordingModeValue): {
  defaultRecordMode: "reps" | "duration";
  defaultLoadModel: "absolute" | "bodyweight_plus";
} {
  switch (mode) {
    case "duration_only":
    case "intervals_conditioning":
      return {
        defaultRecordMode: "duration",
        defaultLoadModel: "absolute",
      };
    case "bodyweight_load":
    case "assisted_bodyweight":
      return {
        defaultRecordMode: "reps",
        defaultLoadModel: "bodyweight_plus",
      };
    case "reps_only":
    case "strength":
    default:
      return {
        defaultRecordMode: "reps",
        defaultLoadModel: "absolute",
      };
  }
}

export function inferExerciseRecordingMode(args: {
  recordingMode?: string | null;
  defaultRecordMode: "reps" | "duration";
  defaultLoadModel: "absolute" | "bodyweight_plus";
}): ExerciseRecordingModeValue {
  if (
    args.recordingMode &&
    (EXERCISE_RECORDING_MODE_VALUES as readonly string[]).includes(args.recordingMode)
  ) {
    return args.recordingMode as ExerciseRecordingModeValue;
  }
  if (args.defaultRecordMode === "duration") {
    return "duration_only";
  }
  if (args.defaultLoadModel === "bodyweight_plus") {
    return "bodyweight_load";
  }
  return "strength";
}
