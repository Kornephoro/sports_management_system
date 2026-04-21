"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";

import {
  RECORDING_MODE_OPTIONS,
  RecordingModeValue,
  getRecordProfileForMode,
} from "@/lib/recording-mode-standards";
import {
  TRAINING_SET_TYPE_OPTIONS,
  TrainingSetTypeValue,
  TrainingUnitSet,
  getDefaultProgressionParticipationBySetType,
} from "@/lib/training-set-standards";
import { getTrainingSetTypeLabel } from "@/features/shared/ui-zh";

type TemplateUnitSetsEditorProps = {
  sets: TrainingUnitSet[];
  recordingMode: RecordingModeValue;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  weightUnit?: "kg" | "lbs";
  defaultCollapsed?: boolean;
  disabled?: boolean;
  onChange: (next: TrainingUnitSet[]) => void;
  onWeightUnitChange?: (nextUnit: "kg" | "lbs") => void;
  onRecordingModeChange: (next: {
    recordingMode: RecordingModeValue;
    recordMode: "sets_reps" | "sets_time";
    loadModel: "external" | "bodyweight_plus_external";
    sets: TrainingUnitSet[];
  }) => void;
};

type MultiSetMode =
  | "strength"
  | "reps_only"
  | "duration"
  | "bodyweight_load"
  | "assisted";

const DEFAULT_SET_CARD_TONE_CLASS =
  "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/50";

const SET_TYPE_TONE_CLASS_MAP: Record<string, string> = {
  warmup:
    "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30",
  working:
    "border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/30",
  dropset:
    "border-fuchsia-200 bg-fuchsia-50/70 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30",
};

const COLLAPSE_TOGGLE_INTERACTIVE_SELECTOR =
  "input,select,textarea,button,[role='button'],[data-interactive='true'],a,label";

function isInteractiveEventTarget(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest(COLLAPSE_TOGGLE_INTERACTIVE_SELECTOR));
}

function toInputNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return "";
}

function toOptionalPositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function toOptionalNonNegativeNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function toOptionalPositiveInt(value: string) {
  const parsed = toOptionalPositiveNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(1, Math.trunc(parsed));
}

function toOptionalNonNegativeInt(value: string) {
  const parsed = toOptionalNonNegativeNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.max(0, Math.trunc(parsed));
}

function normalizeTempo(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const normalized = value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0) {
      return undefined;
    }
    return Math.trunc(item);
  });
  if (normalized.some((item) => item === undefined)) {
    return undefined;
  }
  return normalized as [number, number, number, number];
}

function normalizeSet(set: TrainingUnitSet): TrainingUnitSet {
  return {
    type: set.type || "working",
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
    ...(set.duration_seconds !== undefined ? { duration_seconds: set.duration_seconds } : {}),
    ...(set.weight !== undefined ? { weight: set.weight } : {}),
    ...(set.relative_intensity_ratio !== undefined
      ? { relative_intensity_ratio: set.relative_intensity_ratio }
      : {}),
    ...(set.tempo !== undefined ? { tempo: normalizeTempo(set.tempo) } : {}),
    ...(set.assist_weight !== undefined ? { assist_weight: set.assist_weight } : {}),
    ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
    ...(set.rest_seconds !== undefined ? { rest_seconds: set.rest_seconds } : {}),
    participates_in_progression:
      typeof set.participates_in_progression === "boolean"
        ? set.participates_in_progression
        : getDefaultProgressionParticipationBySetType(set.type),
    ...(set.notes?.trim() ? { notes: set.notes.trim() } : {}),
  };
}

function buildStrengthDefaultSets(): TrainingUnitSet[] {
  return Array.from({ length: 3 }, () => ({
    type: "working",
    reps: 8,
    rest_seconds: 90,
    tempo: [3, 1, 1, 0] as [number, number, number, number],
    participates_in_progression: true,
  }));
}

function buildRepsOnlyDefaultSets(): TrainingUnitSet[] {
  return Array.from({ length: 3 }, () => ({
    type: "working",
    reps: 12,
    rest_seconds: 60,
    participates_in_progression: true,
  }));
}

function buildDurationDefaultSets(): TrainingUnitSet[] {
  return Array.from({ length: 3 }, () => ({
    type: "working",
    duration_seconds: 60,
    rest_seconds: 60,
    participates_in_progression: true,
  }));
}

function buildBodyweightLoadDefaultSets(): TrainingUnitSet[] {
  return Array.from({ length: 3 }, () => ({
    type: "working",
    reps: 8,
    weight: 10,
    rest_seconds: 90,
    tempo: [3, 1, 1, 0] as [number, number, number, number],
    participates_in_progression: true,
  }));
}

function buildAssistedDefaultSets(): TrainingUnitSet[] {
  return Array.from({ length: 3 }, () => ({
    type: "working",
    reps: 8,
    assist_weight: 20,
    rest_seconds: 90,
    tempo: [3, 1, 1, 0] as [number, number, number, number],
    participates_in_progression: true,
  }));
}

function buildPresetSets(mode: RecordingModeValue): TrainingUnitSet[] {
  switch (mode) {
    case "reps_only":
      return buildRepsOnlyDefaultSets();
    case "duration":
      return buildDurationDefaultSets();
    case "bodyweight_load":
      return buildBodyweightLoadDefaultSets();
    case "assisted":
      return buildAssistedDefaultSets();
    case "strength":
    default:
      return buildStrengthDefaultSets();
  }
}

function toMultiSetMode(mode: RecordingModeValue): MultiSetMode {
  switch (mode) {
    case "reps_only":
      return "reps_only";
    case "duration":
      return "duration";
    case "bodyweight_load":
      return "bodyweight_load";
    case "assisted":
      return "assisted";
    case "strength":
    default:
      return "strength";
  }
}

function createRowByMode(mode: MultiSetMode): TrainingUnitSet {
  switch (mode) {
    case "reps_only":
      return {
        type: "working",
        reps: 12,
        rest_seconds: 60,
        participates_in_progression: true,
      };
    case "duration":
      return {
        type: "working",
        duration_seconds: 60,
        rest_seconds: 60,
        participates_in_progression: true,
      };
    case "bodyweight_load":
      return {
        type: "working",
        reps: 8,
        weight: 10,
        rest_seconds: 90,
        tempo: [3, 1, 1, 0],
        participates_in_progression: true,
      };
    case "assisted":
      return {
        type: "working",
        reps: 8,
        assist_weight: 20,
        rest_seconds: 90,
        tempo: [3, 1, 1, 0],
        participates_in_progression: true,
      };
    case "strength":
    default:
      return {
        type: "working",
        reps: 8,
        weight: 20,
        rest_seconds: 90,
        tempo: [3, 1, 1, 0],
        participates_in_progression: true,
      };
  }
}

function hasLoadField(mode: MultiSetMode) {
  return mode === "strength" || mode === "bodyweight_load" || mode === "assisted";
}

function hasTempoField(mode: MultiSetMode) {
  return mode === "strength" || mode === "bodyweight_load" || mode === "assisted";
}

function hasRpeField(mode: MultiSetMode) {
  return mode === "strength" || mode === "bodyweight_load" || mode === "assisted";
}

function getLoadLabel(mode: MultiSetMode) {
  if (mode === "assisted") {
    return "辅助重量";
  }
  if (mode === "bodyweight_load") {
    return "附重";
  }
  return "重量";
}

function getSetLoadValue(set: TrainingUnitSet, mode: MultiSetMode) {
  if (mode === "assisted") {
    return set.assist_weight;
  }
  return set.weight;
}

function buildSetSummary(
  set: TrainingUnitSet,
  setIndex: number,
  mode: MultiSetMode,
  weightUnit: "kg" | "lbs",
) {
  const typeLabel = getTrainingSetTypeLabel(set.type);
  const parts: string[] = [`#${setIndex + 1} ${typeLabel}`];
  if (mode === "duration") {
    parts.push(
      typeof set.duration_seconds === "number" ? `${set.duration_seconds}秒` : "时长-",
    );
  } else {
    parts.push(typeof set.reps === "number" ? `${set.reps}次` : "次数-");
  }
  if (hasLoadField(mode)) {
    const loadValue = getSetLoadValue(set, mode);
    const loadText =
      typeof loadValue === "number" ? `${loadValue}${weightUnit}` : "-";
    parts.push(`${getLoadLabel(mode)} ${loadText}`);
  }
  if (hasRpeField(mode)) {
    parts.push(typeof set.rpe === "number" ? `RPE ${set.rpe}` : "RPE -");
  }
  parts.push(
    typeof set.rest_seconds === "number" ? `休息 ${set.rest_seconds}秒` : "休息 -",
  );
  if (hasTempoField(mode)) {
    const tempo = normalizeTempo(set.tempo);
    parts.push(tempo ? `动作节奏 ${tempo.join("-")}` : "动作节奏 -");
  }
  return parts.join(" · ");
}

export function TemplateUnitSetsEditor({
  sets,
  recordingMode,
  weightUnit = "kg",
  defaultCollapsed = true,
  disabled = false,
  onChange,
  onWeightUnitChange,
  onRecordingModeChange,
}: TemplateUnitSetsEditorProps) {
  const normalizedSets = useMemo(() => {
    if (!Array.isArray(sets) || sets.length === 0) {
      return buildPresetSets(recordingMode);
    }
    return sets.map((set) => normalizeSet(set));
  }, [recordingMode, sets]);

  const mode = toMultiSetMode(recordingMode);

  const [expandedSetIds, setExpandedSetIds] = useState<Set<number>>(
    () => new Set<number>(),
  );

  useEffect(() => {
    if (!defaultCollapsed) {
      setExpandedSetIds(new Set(normalizedSets.map((_, index) => index)));
      return;
    }
    setExpandedSetIds((current) => {
      const next = new Set<number>();
      for (let index = 0; index < normalizedSets.length; index += 1) {
        if (current.has(index)) {
          next.add(index);
        }
      }
      return next;
    });
  }, [defaultCollapsed, normalizedSets.length]);

  const [quickInitSetCount, setQuickInitSetCount] = useState("3");
  const [quickInitReps, setQuickInitReps] = useState("8");
  const [quickInitDurationSeconds, setQuickInitDurationSeconds] = useState("60");
  const [quickInitLoad, setQuickInitLoad] = useState("");
  const [quickInitRestSeconds, setQuickInitRestSeconds] = useState("60");
  const [quickInitTempoE, setQuickInitTempoE] = useState("3");
  const [quickInitTempoB, setQuickInitTempoB] = useState("1");
  const [quickInitTempoC, setQuickInitTempoC] = useState("1");
  const [quickInitTempoT, setQuickInitTempoT] = useState("0");
  const [recordingModeExpanded, setRecordingModeExpanded] = useState<boolean>(
    () => !defaultCollapsed,
  );
  const [quickInitExpanded, setQuickInitExpanded] = useState<boolean>(
    () => !defaultCollapsed,
  );

  const handleToggleFromCardSpace = (
    event: MouseEvent<HTMLElement>,
    toggle: () => void,
  ) => {
    if (isInteractiveEventTarget(event)) {
      return;
    }
    toggle();
  };

  const updateRow = (index: number, patch: Partial<TrainingUnitSet>) => {
    const next = [...normalizedSets];
    const current = next[index];
    if (!current) {
      return;
    }
    next[index] = normalizeSet({
      ...current,
      ...patch,
    });
    onChange(next);
  };

  const removeRow = (index: number) => {
    if (normalizedSets.length <= 1) {
      return;
    }
    onChange(normalizedSets.filter((_, rowIndex) => rowIndex !== index));
    setExpandedSetIds((current) => {
      const next = new Set<number>();
      current.forEach((item) => {
        if (item < index) {
          next.add(item);
        } else if (item > index) {
          next.add(item - 1);
        }
      });
      return next;
    });
  };

  const copyRow = (index: number) => {
    const row = normalizedSets[index];
    if (!row) {
      return;
    }
    const next = [...normalizedSets];
    next.splice(index + 1, 0, normalizeSet(row));
    onChange(next);
    setExpandedSetIds((current) => new Set([...Array.from(current), index + 1]));
  };

  const moveRow = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= normalizedSets.length) {
      return;
    }
    const next = [...normalizedSets];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
    setExpandedSetIds((current) => {
      const nextSet = new Set<number>();
      current.forEach((item) => {
        if (item === index) {
          nextSet.add(targetIndex);
        } else if (item === targetIndex) {
          nextSet.add(index);
        } else {
          nextSet.add(item);
        }
      });
      return nextSet;
    });
  };

  const appendRow = (currentMode: MultiSetMode) => {
    onChange([...normalizedSets, createRowByMode(currentMode)]);
  };

  const toggleSetExpanded = (index: number) => {
    setExpandedSetIds((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleRecordingModeChange = (nextMode: RecordingModeValue) => {
    const profile = getRecordProfileForMode(nextMode);
    onRecordingModeChange({
      recordingMode: nextMode,
      recordMode: profile.recordMode,
      loadModel: profile.loadModel,
      sets: buildPresetSets(nextMode),
    });
    setExpandedSetIds(new Set<number>());
  };

  const applyQuickInit = (currentMode: MultiSetMode) => {
    const setCount = toOptionalPositiveInt(quickInitSetCount) ?? 3;
    const reps = toOptionalPositiveInt(quickInitReps) ?? 8;
    const durationSeconds = toOptionalPositiveInt(quickInitDurationSeconds) ?? 60;
    const load = toOptionalNonNegativeNumber(quickInitLoad);
    const restSeconds = toOptionalPositiveInt(quickInitRestSeconds);
    const tempo: [number, number, number, number] = [
      toOptionalNonNegativeInt(quickInitTempoE) ?? 3,
      toOptionalNonNegativeInt(quickInitTempoB) ?? 1,
      toOptionalNonNegativeInt(quickInitTempoC) ?? 1,
      toOptionalNonNegativeInt(quickInitTempoT) ?? 0,
    ];

    const nextSets: TrainingUnitSet[] = [];
    for (let index = 0; index < setCount; index += 1) {
      if (currentMode === "duration") {
        nextSets.push({
          type: "working",
          duration_seconds: durationSeconds,
          ...(restSeconds !== undefined ? { rest_seconds: restSeconds } : {}),
          participates_in_progression: true,
        });
        continue;
      }

      if (currentMode === "reps_only") {
        nextSets.push({
          type: "working",
          reps,
          ...(restSeconds !== undefined ? { rest_seconds: restSeconds } : {}),
          participates_in_progression: true,
        });
        continue;
      }

      if (currentMode === "assisted") {
        nextSets.push({
          type: "working",
          reps,
          ...(load !== undefined ? { assist_weight: load } : {}),
          ...(restSeconds !== undefined ? { rest_seconds: restSeconds } : {}),
          tempo,
          participates_in_progression: true,
        });
        continue;
      }

      nextSets.push({
        type: "working",
        reps,
        ...(load !== undefined ? { weight: load } : {}),
        ...(restSeconds !== undefined ? { rest_seconds: restSeconds } : {}),
        ...(hasTempoField(currentMode) ? { tempo } : {}),
        participates_in_progression: true,
      });
    }

    onChange(nextSets);
    setExpandedSetIds(new Set<number>());
  };

  const renderUnitToggle = (className?: string) => (
    <div
      data-interactive="true"
      className={`grid h-9 grid-cols-2 rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900 ${className ?? ""}`}
    >
      {(["kg", "lbs"] as const).map((unit) => {
        const active = weightUnit === unit;
        return (
          <button
            key={unit}
            type="button"
            disabled={disabled}
            onClick={() => onWeightUnitChange?.(unit)}
            className={`rounded-md px-2 text-sm font-black uppercase transition-colors disabled:opacity-60 ${
              active
                ? "bg-blue-600 text-white"
                : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            {unit}
          </button>
        );
      })}
    </div>
  );

  const renderSetActions = (index: number) => (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        disabled={disabled || index === 0}
        onClick={() => moveRow(index, "up")}
        className="rounded-lg border border-zinc-300 px-2 py-1 text-[10px] font-bold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        上移
      </button>
      <button
        type="button"
        disabled={disabled || index === normalizedSets.length - 1}
        onClick={() => moveRow(index, "down")}
        className="rounded-lg border border-zinc-300 px-2 py-1 text-[10px] font-bold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        下移
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => copyRow(index)}
        className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/35 dark:text-blue-300"
      >
        复制
      </button>
      <button
        type="button"
        disabled={disabled || normalizedSets.length <= 1}
        onClick={() => removeRow(index)}
        className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      >
        删除
      </button>
    </div>
  );

  const quickInitSummary = useMemo(() => {
    const summaryParts: string[] = [`${toOptionalPositiveInt(quickInitSetCount) ?? 3}组`];
    if (mode === "duration") {
      summaryParts.push(`${toOptionalPositiveInt(quickInitDurationSeconds) ?? 60}秒/组`);
    } else {
      summaryParts.push(`${toOptionalPositiveInt(quickInitReps) ?? 8}次`);
    }

    if (hasLoadField(mode)) {
      const loadValue = toOptionalNonNegativeNumber(quickInitLoad);
      summaryParts.push(
        loadValue !== undefined ? `${loadValue}${weightUnit}` : `未设${getLoadLabel(mode)}`,
      );
    }

    summaryParts.push(
      toOptionalPositiveInt(quickInitRestSeconds) !== undefined
        ? `休息${toOptionalPositiveInt(quickInitRestSeconds)}秒`
        : "休息-",
    );

    if (hasTempoField(mode)) {
      summaryParts.push(
        `动作节奏 ${toOptionalNonNegativeInt(quickInitTempoE) ?? 3}-${toOptionalNonNegativeInt(quickInitTempoB) ?? 1}-${toOptionalNonNegativeInt(quickInitTempoC) ?? 1}-${toOptionalNonNegativeInt(quickInitTempoT) ?? 0}`,
      );
    }

    return summaryParts.join(" · ");
  }, [
    mode,
    quickInitDurationSeconds,
    quickInitLoad,
    quickInitReps,
    quickInitRestSeconds,
    quickInitSetCount,
    quickInitTempoB,
    quickInitTempoC,
    quickInitTempoE,
    quickInitTempoT,
    weightUnit,
  ]);

  const recordingModeLabel =
    RECORDING_MODE_OPTIONS.find((option) => option.value === recordingMode)?.labelZh ??
    "记录模式";
  const recordingModeSummary = `${recordingModeLabel} · ${normalizedSets.length}组结构`;

  return (
    <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div
        className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/45"
        onClick={(event) =>
          handleToggleFromCardSpace(event, () =>
            setRecordingModeExpanded((current) => !current),
          )
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-200">记录模式</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
              {recordingModeSummary}
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {recordingModeExpanded ? "收起" : "展开"}
          </span>
        </div>

        {recordingModeExpanded ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {RECORDING_MODE_OPTIONS.map((option) => {
              const active = option.value === recordingMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRecordingModeChange(option.value)}
                  className={`rounded-xl border px-2 py-2 text-left transition disabled:opacity-60 ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                      : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  <p className="text-[11px] font-black leading-tight">{option.labelZh}</p>
                  <p className="mt-1 text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                    {option.descriptionZh}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        {mode === "bodyweight_load" ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
            体重自动读取 | 总负荷 = 体重 + 附重
          </div>
        ) : null}
        {mode === "assisted" ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            体重自动读取 | 实际负荷 = 体重 - 辅助
          </div>
        ) : null}

        <div
          className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/40"
          onClick={(event) =>
            handleToggleFromCardSpace(event, () =>
              setQuickInitExpanded((current) => !current),
            )
          }
        >
          <div className="flex items-start justify-between gap-2 rounded-xl px-1 py-1">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                快速初始化
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-zinc-700 dark:text-zinc-300">
                {quickInitSummary}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {quickInitExpanded ? "收起" : "展开"}
            </span>
          </div>

          {quickInitExpanded ? (
            <div className="mt-2 grid grid-cols-2 gap-2" data-interactive="true">
              <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                组数
                <input
                  type="number"
                  min={1}
                  value={quickInitSetCount}
                  disabled={disabled}
                  onChange={(event) => setQuickInitSetCount(event.target.value)}
                  className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              {mode === "duration" ? (
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                  时长(秒)
                  <input
                    type="number"
                    min={1}
                    value={quickInitDurationSeconds}
                    disabled={disabled}
                    onChange={(event) => setQuickInitDurationSeconds(event.target.value)}
                    className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              ) : (
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                  次数
                  <input
                    type="number"
                    min={1}
                    value={quickInitReps}
                    disabled={disabled}
                    onChange={(event) => setQuickInitReps(event.target.value)}
                    className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              )}

              {hasLoadField(mode) ? (
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 col-span-2">
                  {getLoadLabel(mode)}
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={quickInitLoad}
                      disabled={disabled}
                      onChange={(event) => setQuickInitLoad(event.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    {renderUnitToggle()}
                  </div>
                </label>
              ) : null}

              <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                休息(秒)
                <input
                  type="number"
                  min={1}
                  value={quickInitRestSeconds}
                  disabled={disabled}
                  onChange={(event) => setQuickInitRestSeconds(event.target.value)}
                  className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              {hasTempoField(mode) ? (
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 col-span-2">
                  动作节奏 (E/B/C/T)
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    <input
                      type="number"
                      min={0}
                      value={quickInitTempoE}
                      disabled={disabled}
                      onChange={(event) => setQuickInitTempoE(event.target.value)}
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-1 text-center text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <input
                      type="number"
                      min={0}
                      value={quickInitTempoB}
                      disabled={disabled}
                      onChange={(event) => setQuickInitTempoB(event.target.value)}
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-1 text-center text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <input
                      type="number"
                      min={0}
                      value={quickInitTempoC}
                      disabled={disabled}
                      onChange={(event) => setQuickInitTempoC(event.target.value)}
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-1 text-center text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <input
                      type="number"
                      min={0}
                      value={quickInitTempoT}
                      disabled={disabled}
                      onChange={(event) => setQuickInitTempoT(event.target.value)}
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-1 text-center text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </div>
                </label>
              ) : null}

              <button
                type="button"
                disabled={disabled}
                onClick={() => applyQuickInit(mode)}
                className="col-span-2 mt-1 w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 disabled:opacity-60 dark:border-blue-700 dark:bg-blue-950/35 dark:text-blue-300"
              >
                一键生成工作组
              </button>
            </div>
          ) : null}
        </div>

        {normalizedSets.map((set, index) => {
          const isExpanded = expandedSetIds.has(index);
          const loadValue = getSetLoadValue(set, mode);
          const tempo = normalizeTempo(set.tempo) ?? [3, 1, 1, 0];
          const setToneClass =
            SET_TYPE_TONE_CLASS_MAP[typeof set.type === "string" ? set.type : ""] ??
            DEFAULT_SET_CARD_TONE_CLASS;
          return (
            <div
              key={`${mode}-${set.type}-${index}`}
              className={`rounded-2xl border p-3 ${setToneClass}`}
              onClick={(event) =>
                handleToggleFromCardSpace(event, () => toggleSetExpanded(index))
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    第 {index + 1} 组
                  </p>
                  <p className="line-clamp-2 text-[11px] font-bold leading-4 text-zinc-600 dark:text-zinc-300">
                    {buildSetSummary(set, index, mode, weightUnit)}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {isExpanded ? "收起" : "展开"}
                </span>
              </div>

              <div className="mt-2">{renderSetActions(index)}</div>

              {isExpanded ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 col-span-2">
                    组类型
                    <select
                      disabled={disabled}
                      value={set.type}
                      onChange={(event) =>
                        updateRow(index, {
                          type: event.target.value as TrainingSetTypeValue,
                          participates_in_progression: getDefaultProgressionParticipationBySetType(
                            event.target.value,
                          ),
                        })
                      }
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {TRAINING_SET_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {getTrainingSetTypeLabel(option.value)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {mode === "duration" ? (
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                      时长(秒)
                      <input
                        type="number"
                        min={1}
                        disabled={disabled}
                        value={toInputNumber(set.duration_seconds)}
                        onChange={(event) =>
                          updateRow(index, {
                            duration_seconds: toOptionalPositiveInt(event.target.value),
                          })
                        }
                        className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                  ) : (
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                      次数
                      <input
                        type="number"
                        min={1}
                        disabled={disabled}
                        value={toInputNumber(set.reps)}
                        onChange={(event) =>
                          updateRow(index, {
                            reps: toOptionalPositiveInt(event.target.value),
                          })
                        }
                        className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                  )}

                  {hasLoadField(mode) ? (
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 col-span-2">
                      {getLoadLabel(mode)}
                      <div className="mt-1 grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={disabled}
                          value={toInputNumber(loadValue)}
                          onChange={(event) =>
                            updateRow(index, {
                              ...(mode === "assisted"
                                ? { assist_weight: toOptionalNonNegativeNumber(event.target.value) }
                                : { weight: toOptionalNonNegativeNumber(event.target.value) }),
                            })
                          }
                          className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                        />
                        {renderUnitToggle()}
                      </div>
                    </label>
                  ) : null}

                  {hasRpeField(mode) ? (
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                      RPE
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        disabled={disabled}
                        value={toInputNumber(set.rpe)}
                        onChange={(event) =>
                          updateRow(index, {
                            rpe: toOptionalNonNegativeNumber(event.target.value),
                          })
                        }
                        className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                  ) : null}

                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                    休息(秒)
                    <input
                      type="number"
                      min={1}
                      disabled={disabled}
                      value={toInputNumber(set.rest_seconds)}
                      onChange={(event) =>
                        updateRow(index, {
                          rest_seconds: toOptionalPositiveInt(event.target.value),
                        })
                      }
                      className="mt-1 h-8 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={Boolean(set.participates_in_progression)}
                      onChange={(event) =>
                        updateRow(index, {
                          participates_in_progression: event.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    参与进步
                  </label>

                  {hasTempoField(mode) ? (
                    <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 col-span-2">
                      动作节奏 (E/B/C/T)
                      <div className="mt-1 grid grid-cols-4 gap-1">
                        {tempo.map((value, tempoIndex) => (
                          <input
                            key={`tempo-${index}-${tempoIndex}`}
                            type="number"
                            min={0}
                            disabled={disabled}
                            value={value}
                            onChange={(event) => {
                              const parsed = toOptionalNonNegativeNumber(event.target.value);
                              const nextTempo = [...tempo] as [number, number, number, number];
                              nextTempo[tempoIndex] = parsed === undefined ? 0 : Math.trunc(parsed);
                              updateRow(index, { tempo: nextTempo });
                            }}
                            className="h-8 rounded-lg border border-zinc-300 bg-white px-1 text-center text-xs dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        ))}
                      </div>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => appendRow(mode)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          添加一组
        </button>
      </div>
    </section>
  );
}
