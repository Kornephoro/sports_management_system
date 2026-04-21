import {
  buildTrainingSetsFromLegacyDefaults,
  deriveLegacyDefaultsFromTrainingSets,
  normalizeTrainingUnitSets,
  TrainingUnitSet,
} from "@/lib/training-set-standards";
import { RecordingModeValue } from "@/lib/recording-mode-standards";

export type ActionEntryAnchorTempo = [number, number, number, number];

export type ActionEntryAnchorSummary = {
  recordingMode: RecordingModeValue | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  setCount: number;
  reps: number | null;
  durationSeconds: number | null;
  loadValue: number | null;
  additionalLoadValue: number | null;
  assistWeight: number | null;
  restSeconds: number | null;
  tempo: ActionEntryAnchorTempo | null;
  targetRpe: number | null;
  recommendedRir: number | null;
  setStructure: TrainingUnitSet[];
};

type ActionEntryAnchorFallback = {
  defaultSets?: number | null;
  defaultReps?: number | null;
  defaultDurationSeconds?: number | null;
  defaultLoadValue?: number | null;
  defaultAdditionalLoadValue?: number | null;
  defaultRestSeconds?: number | null;
  defaultTempo?: ActionEntryAnchorTempo | null;
  targetRpe?: number | null;
  recommendedRir?: number | null;
};

function normalizeRecordingMode(
  value?: string | null,
): RecordingModeValue | null {
  if (
    value === "strength" ||
    value === "reps_only" ||
    value === "duration" ||
    value === "bodyweight_load" ||
    value === "assisted"
  ) {
    return value;
  }
  return null;
}

export function isAssistedActionEntryMode(recordingMode?: string | null) {
  return recordingMode === "assisted" || recordingMode === "assisted_bodyweight";
}

function toTempo(value: unknown): ActionEntryAnchorTempo | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const normalized = value.map((item) =>
    typeof item === "number" && Number.isFinite(item) && item >= 0 ? Math.trunc(item) : null,
  );
  if (normalized.some((item) => item === null)) {
    return null;
  }
  return normalized as ActionEntryAnchorTempo;
}

function toTargetRpeFromRir(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Number(Math.max(6, Math.min(10, 10 - value)).toFixed(1));
}

function toRecommendedRirFromRpe(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Number(Math.max(0, Math.min(5, 10 - value)).toFixed(1));
}

function buildFallbackSetStructure(args: {
  recordingMode?: string | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  fallback?: ActionEntryAnchorFallback;
}) {
  const fallback = args.fallback ?? {};
  return buildTrainingSetsFromLegacyDefaults({
    defaultSets: fallback.defaultSets ?? 3,
    defaultReps: args.recordMode === "sets_reps" ? (fallback.defaultReps ?? 8) : null,
    defaultDurationSeconds:
      args.recordMode === "sets_time" ? (fallback.defaultDurationSeconds ?? 60) : null,
    defaultLoadValue: fallback.defaultLoadValue ?? null,
    defaultAdditionalLoadValue: fallback.defaultAdditionalLoadValue ?? null,
    defaultRestSeconds: fallback.defaultRestSeconds ?? null,
    defaultTempo: fallback.defaultTempo ?? null,
    defaultRpe:
      fallback.targetRpe ?? toTargetRpeFromRir(fallback.recommendedRir) ?? null,
    loadModel: args.loadModel,
    recordMode: args.recordMode,
    recordingMode: args.recordingMode,
  });
}

export function deriveActionEntryAnchorSummary(args: {
  recordingMode?: string | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  setStructure?: unknown;
  fallback?: ActionEntryAnchorFallback;
}): ActionEntryAnchorSummary {
  const normalizedSets = normalizeTrainingUnitSets(args.setStructure);
  const effectiveSets =
    normalizedSets.length > 0
      ? normalizedSets
      : buildFallbackSetStructure({
          recordingMode: args.recordingMode,
          recordMode: args.recordMode,
          loadModel: args.loadModel,
          fallback: args.fallback,
        });
  const legacy = deriveLegacyDefaultsFromTrainingSets(effectiveSets, {
    loadModel: args.loadModel,
    recordMode: args.recordMode,
    recordingMode: args.recordingMode,
  });
  const progressionSet =
    effectiveSets.find((set) => set.participates_in_progression !== false) ?? effectiveSets[0] ?? null;
  const targetRpe =
    progressionSet?.rpe ??
    args.fallback?.targetRpe ??
    toTargetRpeFromRir(args.fallback?.recommendedRir) ??
    null;
  const recordingMode = normalizeRecordingMode(args.recordingMode);
  const assisted = isAssistedActionEntryMode(args.recordingMode);
  const additionalLoadValue =
    args.loadModel === "bodyweight_plus_external" && !assisted
      ? (legacy?.defaultAdditionalLoadValue ?? args.fallback?.defaultAdditionalLoadValue ?? null)
      : null;
  const assistWeight =
    args.loadModel === "bodyweight_plus_external" && assisted
      ? (legacy?.defaultAdditionalLoadValue ?? args.fallback?.defaultAdditionalLoadValue ?? null)
      : null;

  return {
    recordingMode,
    recordMode: args.recordMode,
    loadModel: args.loadModel,
    setCount: legacy?.defaultSets ?? Math.max(1, effectiveSets.length || args.fallback?.defaultSets || 1),
    reps:
      args.recordMode === "sets_reps"
        ? (legacy?.defaultReps ?? args.fallback?.defaultReps ?? null)
        : null,
    durationSeconds:
      args.recordMode === "sets_time"
        ? (legacy?.defaultDurationSeconds ?? args.fallback?.defaultDurationSeconds ?? null)
        : null,
    loadValue:
      args.loadModel === "external"
        ? (legacy?.defaultLoadValue ?? args.fallback?.defaultLoadValue ?? null)
        : null,
    additionalLoadValue,
    assistWeight,
    restSeconds: legacy?.defaultRestSeconds ?? args.fallback?.defaultRestSeconds ?? null,
    tempo: toTempo(legacy?.defaultTempo ?? args.fallback?.defaultTempo ?? null),
    targetRpe,
    recommendedRir:
      toRecommendedRirFromRpe(targetRpe) ?? args.fallback?.recommendedRir ?? null,
    setStructure: effectiveSets,
  };
}

export function applyActionEntryAnchorSummaryToSetStructure(args: {
  recordingMode?: string | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  baseSetStructure?: unknown;
  summary: Partial<
    Pick<
      ActionEntryAnchorSummary,
      | "setCount"
      | "reps"
      | "durationSeconds"
      | "loadValue"
      | "additionalLoadValue"
      | "assistWeight"
      | "restSeconds"
      | "tempo"
      | "targetRpe"
      | "recommendedRir"
    >
  >;
}) {
  const normalizedBase = normalizeTrainingUnitSets(args.baseSetStructure);
  const nextTargetRpe =
    args.summary.targetRpe ?? toTargetRpeFromRir(args.summary.recommendedRir) ?? null;
  const desiredSetCount =
    typeof args.summary.setCount === "number" && Number.isFinite(args.summary.setCount)
      ? Math.max(1, Math.trunc(args.summary.setCount))
      : normalizedBase.length > 0
        ? normalizedBase.length
        : 3;
  const shouldRebuild =
    normalizedBase.length === 0 ||
    (typeof args.summary.setCount === "number" && normalizedBase.length !== desiredSetCount);
  const base =
    !shouldRebuild
      ? normalizedBase
      : buildTrainingSetsFromLegacyDefaults({
          defaultSets: desiredSetCount,
          defaultReps:
            args.recordMode === "sets_reps" ? (args.summary.reps ?? 8) : null,
          defaultDurationSeconds:
            args.recordMode === "sets_time" ? (args.summary.durationSeconds ?? 60) : null,
          defaultLoadValue: args.summary.loadValue ?? null,
          defaultAdditionalLoadValue:
            args.summary.assistWeight ?? args.summary.additionalLoadValue ?? null,
          defaultRestSeconds: args.summary.restSeconds ?? null,
          defaultTempo: args.summary.tempo ?? null,
          defaultRpe: nextTargetRpe,
          loadModel: args.loadModel,
          recordMode: args.recordMode,
          recordingMode: args.recordingMode,
        });
  const assisted = isAssistedActionEntryMode(args.recordingMode);

  return base.map((set) => ({
    ...set,
    ...(args.summary.restSeconds !== undefined
      ? { rest_seconds: args.summary.restSeconds ?? undefined }
      : {}),
    ...(args.summary.tempo !== undefined ? { tempo: args.summary.tempo ?? undefined } : {}),
    ...(set.participates_in_progression !== false && args.recordMode === "sets_reps"
      ? { reps: args.summary.reps ?? set.reps }
      : {}),
    ...(set.participates_in_progression !== false && args.recordMode === "sets_time"
      ? { duration_seconds: args.summary.durationSeconds ?? set.duration_seconds }
      : {}),
    ...(set.participates_in_progression !== false && nextTargetRpe !== null
      ? { rpe: nextTargetRpe }
      : {}),
    ...(set.participates_in_progression !== false &&
    args.loadModel === "external" &&
    args.summary.loadValue !== undefined
      ? { weight: args.summary.loadValue ?? undefined, assist_weight: undefined }
      : {}),
    ...(set.participates_in_progression !== false &&
    args.loadModel === "bodyweight_plus_external" &&
    assisted &&
    args.summary.assistWeight !== undefined
      ? {
          assist_weight: args.summary.assistWeight ?? undefined,
          weight: undefined,
        }
      : {}),
    ...(set.participates_in_progression !== false &&
    args.loadModel === "bodyweight_plus_external" &&
    !assisted &&
    args.summary.additionalLoadValue !== undefined
      ? {
          weight: args.summary.additionalLoadValue ?? undefined,
          assist_weight: undefined,
        }
      : {}),
  }));
}
