export const TRAINING_SET_TYPE_OPTIONS = [
  { value: "warmup", labelZh: "热身组", labelEn: "Warm-up" },
  { value: "working", labelZh: "正式组", labelEn: "Working" },
  { value: "backoff", labelZh: "回退组", labelEn: "Back-off" },
  { value: "dropset", labelZh: "递减组", labelEn: "Drop Set" },
  { value: "failure", labelZh: "力竭组", labelEn: "Failure" },
  { value: "amrap", labelZh: "尽可能多次数组", labelEn: "AMRAP" },
  { value: "tempo", labelZh: "节奏控制组", labelEn: "Tempo" },
  { value: "ramp", labelZh: "递增热身组", labelEn: "Ramp" },
  { value: "top_set", labelZh: "顶组", labelEn: "Top Set" },
  { value: "volume", labelZh: "容量组", labelEn: "Volume" },
  { value: "pause", labelZh: "停顿组", labelEn: "Pause" },
  { value: "cluster", labelZh: "簇状组", labelEn: "Cluster" },
] as const;

export type TrainingSetTypeValue = (typeof TRAINING_SET_TYPE_OPTIONS)[number]["value"];

export const TRAINING_SET_WEIGHT_MODE_OPTIONS = [
  { value: "absolute", labelZh: "固定重量", labelEn: "Absolute Weight" },
  { value: "relative_to_working", labelZh: "相对主工作组", labelEn: "Relative To Working" },
] as const;

export type TrainingSetWeightModeValue = (typeof TRAINING_SET_WEIGHT_MODE_OPTIONS)[number]["value"];

export type TrainingSetRepsValue =
  | number
  | {
      min: number;
      max: number;
    };

export type TrainingUnitSet = {
  type: TrainingSetTypeValue | string;
  reps?: TrainingSetRepsValue;
  duration_seconds?: number;
  weight_mode?: TrainingSetWeightModeValue;
  weight?: number;
  relative_intensity_ratio?: number;
  tempo?: [number, number, number, number];
  assist_weight?: number;
  rpe?: number;
  rest_seconds?: number;
  participates_in_progression?: boolean;
  notes?: string;
};

function isAssistedRecordingMode(recordingMode?: string | null) {
  return recordingMode === "assisted" || recordingMode === "assisted_bodyweight";
}

function toPositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function toNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function toPositiveInt(value: unknown) {
  const parsed = toPositiveNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(1, Math.trunc(parsed));
}

function toNonNegativeInt(value: unknown) {
  const parsed = toNonNegativeNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(0, Math.trunc(parsed));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizeTempo(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const normalized = value.map((item) => toNonNegativeInt(item));
  if (normalized.some((item) => item === undefined)) {
    return undefined;
  }
  return normalized as [number, number, number, number];
}

export function getDefaultProgressionParticipationBySetType(type: string) {
  switch (type) {
    case "working":
    case "top_set":
    case "volume":
    case "backoff":
    case "amrap":
    case "tempo":
    case "pause":
    case "cluster":
      return true;
    case "warmup":
    case "ramp":
    case "dropset":
    case "failure":
    default:
      return false;
  }
}

export function normalizeTrainingSetReps(value: unknown): TrainingSetRepsValue | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const maybe = Number(value);
    if (Number.isFinite(maybe) && maybe > 0) {
      return Math.max(1, Math.trunc(maybe));
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const min = toPositiveInt(record.min);
    const max = toPositiveInt(record.max);
    if (min && max) {
      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
      };
    }
  }
  return undefined;
}

export function normalizeTrainingUnitSet(value: unknown): TrainingUnitSet | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const typeRaw = typeof record.type === "string" ? record.type : "working";
  const type = typeRaw.trim().length > 0 ? typeRaw.trim() : "working";
  const weightMode =
    record.weight_mode === "relative_to_working" ? "relative_to_working" : "absolute";
  const reps = normalizeTrainingSetReps(record.reps);
  const durationSeconds = toPositiveInt(record.duration_seconds);
  const weight = toNonNegativeNumber(record.weight);
  const relativeIntensityRatio = toPositiveNumber(record.relative_intensity_ratio);
  const tempo = normalizeTempo(record.tempo);
  const assistWeight = toNonNegativeNumber(record.assist_weight);
  const rpe = toNonNegativeNumber(record.rpe);
  const restSeconds = toPositiveInt(record.rest_seconds);
  const notes =
    typeof record.notes === "string" && record.notes.trim().length > 0
      ? record.notes.trim()
      : undefined;
  const participatesInProgression =
    typeof record.participates_in_progression === "boolean"
      ? record.participates_in_progression
      : getDefaultProgressionParticipationBySetType(type);

  return {
    type,
    ...(reps ? { reps } : {}),
    ...(durationSeconds ? { duration_seconds: durationSeconds } : {}),
    weight_mode: weightMode,
    ...(weightMode === "absolute" && weight !== undefined ? { weight } : {}),
    ...(weightMode === "relative_to_working" && relativeIntensityRatio
      ? { relative_intensity_ratio: relativeIntensityRatio }
      : {}),
    ...(tempo ? { tempo } : {}),
    ...(assistWeight !== undefined ? { assist_weight: assistWeight } : {}),
    ...(rpe !== undefined ? { rpe } : {}),
    ...(restSeconds ? { rest_seconds: restSeconds } : {}),
    participates_in_progression: participatesInProgression,
    ...(notes ? { notes } : {}),
  };
}

export function normalizeTrainingUnitSets(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as TrainingUnitSet[];
  }
  return value
    .map((item) => normalizeTrainingUnitSet(item))
    .filter((item): item is TrainingUnitSet => Boolean(item));
}

export function buildTrainingSetsFromLegacyDefaults(args: {
  defaultSets: number;
  defaultReps: number | null;
  defaultDurationSeconds: number | null;
  defaultLoadValue: number | null;
  defaultAdditionalLoadValue: number | null;
  loadModel: "external" | "bodyweight_plus_external";
  recordMode: "sets_reps" | "sets_time";
  recordingMode?: string | null;
  defaultRestSeconds?: number | null;
  defaultTempo?: [number, number, number, number] | null;
  defaultRpe?: number | null;
}) {
  const count = Math.max(1, Math.trunc(args.defaultSets));
  const weight =
    args.loadModel === "external" ? args.defaultLoadValue : args.defaultAdditionalLoadValue;
  const useAssistWeight =
    args.loadModel === "bodyweight_plus_external" && isAssistedRecordingMode(args.recordingMode);

  const sets: TrainingUnitSet[] = [];
  for (let index = 0; index < count; index += 1) {
    sets.push({
      type: "working",
      ...(args.recordMode === "sets_reps" && args.defaultReps ? { reps: args.defaultReps } : {}),
      ...(args.recordMode === "sets_time" && args.defaultDurationSeconds
        ? { duration_seconds: args.defaultDurationSeconds }
        : {}),
      weight_mode: "absolute",
      ...(weight
        ? useAssistWeight
          ? { assist_weight: weight }
          : { weight }
        : {}),
      ...(args.defaultRestSeconds ? { rest_seconds: args.defaultRestSeconds } : {}),
      ...(args.defaultTempo ? { tempo: args.defaultTempo } : {}),
      ...(args.defaultRpe !== null && args.defaultRpe !== undefined ? { rpe: args.defaultRpe } : {}),
      participates_in_progression: true,
    });
  }
  return sets;
}

export function deriveLegacyDefaultsFromTrainingSets(
  setsInput: unknown,
  args: {
    loadModel: "external" | "bodyweight_plus_external";
    recordMode: "sets_reps" | "sets_time";
    recordingMode?: string | null;
  },
) {
  const sets = normalizeTrainingUnitSets(setsInput);
  if (sets.length === 0) {
    return null;
  }

  const primaryCandidates = sets.filter((set) => set.participates_in_progression);
  const workingCandidates = primaryCandidates.length > 0 ? primaryCandidates : sets;
  const reference = workingCandidates[0] ?? sets[0];

  let defaultReps: number | null = null;
  if (args.recordMode === "sets_reps" && reference?.reps !== undefined) {
    if (typeof reference.reps === "number") {
      defaultReps = reference.reps;
    } else {
      defaultReps = reference.reps.min;
    }
  }

  const defaultDurationSeconds =
    args.recordMode === "sets_time" ? (reference?.duration_seconds ?? null) : null;
  const useAssistWeight =
    args.loadModel === "bodyweight_plus_external" && isAssistedRecordingMode(args.recordingMode);
  const absoluteWeight = (() => {
    if (useAssistWeight) {
      if (reference?.assist_weight !== undefined) {
        return reference.assist_weight;
      }
      return sets.find((item) => item.assist_weight !== undefined)?.assist_weight ?? null;
    }
    if ((reference?.weight_mode ?? "absolute") === "absolute" && reference?.weight) {
      return reference.weight;
    }
    return sets.find((item) => (item.weight_mode ?? "absolute") === "absolute" && item.weight)
      ?.weight ?? null;
  })();

  return {
    defaultSets: workingCandidates.length > 0 ? workingCandidates.length : sets.length,
    defaultReps,
    defaultDurationSeconds,
    defaultRestSeconds: reference?.rest_seconds ?? null,
    defaultTempo: reference?.tempo ?? null,
    defaultRpe: reference?.rpe ?? null,
    defaultLoadValue: args.loadModel === "external" ? absoluteWeight : null,
    defaultAdditionalLoadValue:
      args.loadModel === "bodyweight_plus_external" ? absoluteWeight : null,
    defaultAssistValue:
      args.loadModel === "bodyweight_plus_external" && useAssistWeight ? absoluteWeight : null,
  };
}

export function getTrainingSetTypeMetaMap() {
  return new Map(TRAINING_SET_TYPE_OPTIONS.map((item) => [item.value, item]));
}

export function getTrainingSetTypeLabel(type: string) {
  const meta = getTrainingSetTypeMetaMap().get(type as TrainingSetTypeValue);
  if (!meta) {
    return type;
  }
  return `${meta.labelZh} / ${meta.labelEn}`;
}

export function asTrainingSetRecord(value: unknown) {
  return asRecord(value);
}
