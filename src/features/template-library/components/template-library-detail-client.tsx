"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import {
  ExerciseLibraryItem,
  listExerciseLibraryItems,
} from "@/features/exercise-library/exercise-library-api";
import {
  TemplateLibraryItemDetail,
  TemplateLibrarySplitTypeItem,
  createTemplateLibrarySplitType,
  deleteTemplateLibrarySplitType,
  getTemplateLibraryItem,
  listTemplateLibrarySplitTypes,
  setTemplateLibraryItemEnabled,
  updateTemplateLibrarySplitType,
  updateTemplateLibraryItem,
  UpsertTemplateLibraryUnitPayload,
  TemplateLibraryUnit,
  TemplateUnitSetPayload,
} from "@/features/template-library/template-library-api";
import { getTemplateSplitTypeLabel } from "@/lib/template-library-standards";
import {
  getMovementPatternLabel,
  getExerciseRecordModeLabel,
} from "@/lib/exercise-library-standards";
import { toPrimaryMuscleLabels } from "@/lib/action-filter-standards";
import {
  deriveLegacyDefaultsFromTrainingSets,
  normalizeTrainingUnitSets,
  TrainingUnitSet,
  buildTrainingSetsFromLegacyDefaults,
} from "@/lib/training-set-standards";
import { ActionEntryAnchorSummary, deriveActionEntryAnchorSummary } from "@/lib/action-entry-anchor";
import { RecordingModeValue } from "@/lib/recording-mode-standards";
import {
  countLogicalTemplateSlots,
  normalizeSupersetProgressionBudget,
  SupersetGroupValue,
  SupersetSelectionMode,
} from "@/lib/template-library-superset";
import {
  UNIT_ROLE_DEFAULT_POLICY_MAP,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import {
  getAdjustmentPolicyTypeLabel,
  getProgressionFamilyLabel,
  getProgressionPolicyTypeLabel,
  getUnitRoleLabel,
  translateUiError,
} from "@/features/shared/ui-zh";
import {
  AppCard,
  EmptyState,
  InlineAlert,
  SkeletonRows,
} from "@/features/shared/components/ui-primitives";
import { ProgressionPolicyConfigDrawer } from "@/features/progression/components/progression-policy-config-drawer";
import {
  normalizePolicyConfig,
  ProgressionConfigValue,
} from "@/features/progression/progression-policy-normalizer";
import { ActionArsenalDrawer } from "./action-arsenal-drawer";
import { TemplateUnitSetsEditor } from "./template-unit-sets-editor";

type TemplateLibraryDetailClientProps = {
  userId: string;
  itemId: string;
};

type UnitDraft = Omit<
  TemplateLibraryUnit,
  "progressionPolicyConfig" | "adjustmentPolicyConfig" | "successCriteria" | "sets"
> & {
  progressionPolicyConfigText: string;
  adjustmentPolicyConfigText: string;
  successCriteriaText: string;
  sets: TrainingUnitSet[];
  recordingMode: RecordingModeValue;
  anchorDraft: ActionEntryAnchorSummary;
};

type DefinitionDraft = {
  name: string;
  description: string;
  splitType: string;
  aliases: string[];
  notes: string;
  units: UnitDraft[];
};

type SlotView =
  | {
      kind: "single";
      index: number;
      unit: UnitDraft;
    }
  | {
      kind: "superset";
      groupId: string;
      unitIndexes: number[];
      units: UnitDraft[];
      meta: SupersetGroupValue;
    };

type SupersetDraft = {
  groupId: string;
  groupName: string;
  betweenExercisesRestSeconds: number | null;
  betweenRoundsRestSeconds: number | null;
  progressionBudgetPerExposure: number;
  selectionMode: SupersetSelectionMode;
  units: UnitDraft[];
};

type ConfirmStatItem = {
  label: string;
  count: number;
};

type ConfirmSingleItem = {
  type: "single";
  key: string;
  title: string;
  setLines: string[];
  progressionSummary: string;
};

type ConfirmSupersetRoundLine =
  | {
      type: "action";
      key: string;
      title: string;
      detail: string;
    }
  | {
      type: "rest";
      key: string;
      label: string;
    };

type ConfirmSupersetRound = {
  key: string;
  title: string;
  lines: ConfirmSupersetRoundLine[];
};

type ConfirmSupersetItem = {
  type: "superset";
  key: string;
  title: string;
  rounds: ConfirmSupersetRound[];
  progressionSummary: string;
};

type TemplateArrangementSummary = {
  movementStats: ConfirmStatItem[];
  muscleStats: ConfirmStatItem[];
  items: Array<ConfirmSingleItem | ConfirmSupersetItem>;
};

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObjectSafe(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function deriveRecordingMode(unit: TemplateLibraryUnit): RecordingModeValue {
  if (unit.recordingMode) {
    return unit.recordingMode;
  }
  if (unit.recordMode === "sets_time") {
    return "duration";
  }
  if (unit.loadModel === "bodyweight_plus_external") {
    return "bodyweight_load";
  }
  return "strength";
}

function buildProgressTrackKey(name: string, sequenceNo: number) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "template_unit"}_${sequenceNo}`;
}

function buildSupersetGroupId() {
  return `superset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const KG_TO_LBS_FACTOR = 2.2046226218;

function toRoundedLoadNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return Math.trunc(rounded);
  }
  return Number(rounded.toFixed(1));
}

function convertLoadNumber(
  value: number,
  fromUnit: "kg" | "lbs",
  toUnit: "kg" | "lbs",
) {
  if (!Number.isFinite(value) || fromUnit === toUnit) {
    return value;
  }
  const converted =
    fromUnit === "kg" ? value * KG_TO_LBS_FACTOR : value / KG_TO_LBS_FACTOR;
  return toRoundedLoadNumber(converted);
}

function getUnitWeightUnit(unit: UnitDraft): "kg" | "lbs" {
  if (unit.loadModel === "external") {
    return unit.defaultLoadUnit ?? "kg";
  }
  return unit.defaultAdditionalLoadUnit ?? "kg";
}

function applyWeightUnitToUnitDraft(
  unit: UnitDraft,
  nextUnit: "kg" | "lbs",
): UnitDraft {
  const currentUnit = getUnitWeightUnit(unit);
  if (currentUnit === nextUnit) {
    return unit;
  }

  if (unit.loadModel === "external") {
    return {
      ...unit,
      defaultLoadUnit: nextUnit,
      defaultLoadValue:
        typeof unit.defaultLoadValue === "number"
          ? convertLoadNumber(unit.defaultLoadValue, currentUnit, nextUnit)
          : unit.defaultLoadValue,
      sets: unit.sets.map((set) => ({
        ...set,
        ...(typeof set.weight === "number"
          ? { weight: convertLoadNumber(set.weight, currentUnit, nextUnit) }
          : {}),
      })),
    };
  }

  return {
    ...unit,
    defaultAdditionalLoadUnit: nextUnit,
    defaultAdditionalLoadValue:
      typeof unit.defaultAdditionalLoadValue === "number"
        ? convertLoadNumber(unit.defaultAdditionalLoadValue, currentUnit, nextUnit)
        : unit.defaultAdditionalLoadValue,
    sets: unit.sets.map((set) => ({
      ...set,
      ...(typeof set.weight === "number"
        ? { weight: convertLoadNumber(set.weight, currentUnit, nextUnit) }
        : {}),
      ...(typeof set.assist_weight === "number"
        ? { assist_weight: convertLoadNumber(set.assist_weight, currentUnit, nextUnit) }
        : {}),
    })),
  };
}

function toTemplateSetPayload(set: TrainingUnitSet): TemplateUnitSetPayload {
  return {
    type: set.type as TemplateUnitSetPayload["type"],
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
    ...(set.duration_seconds !== undefined
      ? { durationSeconds: set.duration_seconds }
      : {}),
    ...(set.weight_mode !== undefined ? { weightMode: set.weight_mode } : {}),
    ...(set.weight !== undefined ? { weight: set.weight } : {}),
    ...(set.relative_intensity_ratio !== undefined
      ? { relativeIntensityRatio: set.relative_intensity_ratio }
      : {}),
    ...(set.tempo !== undefined ? { tempo: set.tempo } : {}),
    ...(set.assist_weight !== undefined ? { assistWeight: set.assist_weight } : {}),
    ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
    ...(set.rest_seconds !== undefined ? { restSeconds: set.rest_seconds } : {}),
    ...(set.participates_in_progression !== undefined
      ? { participatesInProgression: set.participates_in_progression }
      : {}),
    ...(set.notes?.trim() ? { notes: set.notes.trim() } : {}),
  };
}

function buildUnitDraftFromAction(
  action: ExerciseLibraryItem,
  sequenceNo: number,
  supersetGroup?: SupersetGroupValue | null,
): UnitDraft {
  const roleDefaults = UNIT_ROLE_DEFAULT_POLICY_MAP.accessory;
  const recordMode = action.defaultRecordMode === "duration" ? "sets_time" : "sets_reps";
  const loadModel =
    action.defaultLoadModel === "bodyweight_plus"
      ? "bodyweight_plus_external"
      : "external";
  const recordingMode: RecordingModeValue =
    action.recordingMode === "duration_only" ||
    action.recordingMode === "intervals_conditioning"
      ? "duration"
      : action.recordingMode === "bodyweight_load"
        ? "bodyweight_load"
        : action.recordingMode === "assisted_bodyweight"
          ? "assisted"
          : action.recordingMode === "reps_only"
            ? "reps_only"
            : "strength";
  const defaultReps = recordMode === "sets_reps" ? 8 : null;
  const defaultDurationSeconds = recordMode === "sets_time" ? 60 : null;
  const generatedSets = buildTrainingSetsFromLegacyDefaults({
    defaultSets: 3,
    defaultReps,
    defaultDurationSeconds,
    defaultLoadValue: null,
    defaultAdditionalLoadValue: null,
    loadModel,
    recordMode,
    recordingMode,
  });
  const anchorDraft = deriveActionEntryAnchorSummary({
    recordingMode,
    recordMode,
    loadModel,
    setStructure: generatedSets,
  });

  return {
    exerciseLibraryItemId: action.id,
    exerciseNameSnapshot: action.name,
    sequenceNo,
    unitRole: "accessory",
    progressTrackKey: buildProgressTrackKey(action.name, sequenceNo),
    progressionFamily: roleDefaults.family,
    progressionPolicyType: roleDefaults.policyType,
    progressionPolicyConfigText: stringifyJson(roleDefaults.config),
    adjustmentPolicyType: "always",
    adjustmentPolicyConfigText: "{}",
    successCriteriaText: stringifyJson(roleDefaults.successCriteria),
    recordingMode,
    recordMode,
    loadModel,
    defaultSets: 3,
    defaultReps,
    defaultDurationSeconds,
    defaultLoadValue: null,
    defaultLoadUnit: null,
    defaultAdditionalLoadValue: null,
    defaultAdditionalLoadUnit: null,
    targetRepsMin: null,
    targetRepsMax: null,
    rpeMin: null,
    rpeMax: null,
    sets: generatedSets,
    anchorDraft,
    notes: null,
    required: true,
    supersetGroup: supersetGroup ?? null,
  };
}

function toUnitDraft(unit: TemplateLibraryUnit): UnitDraft {
  const anchorDraft =
    unit.anchorDraft ??
    deriveActionEntryAnchorSummary({
      recordingMode: deriveRecordingMode(unit),
      recordMode: unit.recordMode,
      loadModel: unit.loadModel,
      setStructure: unit.sets,
      fallback: {
        defaultSets: unit.defaultSets,
        defaultReps: unit.defaultReps,
        defaultDurationSeconds: unit.defaultDurationSeconds,
        defaultLoadValue: unit.defaultLoadValue,
        defaultAdditionalLoadValue: unit.defaultAdditionalLoadValue,
        targetRpe:
          unit.rpeMin !== null && unit.rpeMin === unit.rpeMax ? unit.rpeMin : null,
      },
    });
  return {
    ...unit,
    progressionPolicyConfigText: stringifyJson(unit.progressionPolicyConfig),
    adjustmentPolicyConfigText: stringifyJson(unit.adjustmentPolicyConfig),
    successCriteriaText: stringifyJson(unit.successCriteria),
    sets: normalizeTrainingUnitSets(unit.sets),
    recordingMode: deriveRecordingMode(unit),
    anchorDraft,
    notes: unit.notes ?? null,
    supersetGroup: unit.supersetGroup ?? null,
  };
}

function cloneTrainingSet(set: TrainingUnitSet): TrainingUnitSet {
  return {
    ...set,
    ...(Array.isArray(set.tempo) ? { tempo: [...set.tempo] as [number, number, number, number] } : {}),
  };
}

function cloneUnitDraft(unit: UnitDraft): UnitDraft {
  return {
    ...unit,
    sets: unit.sets.map((set) => cloneTrainingSet(set)),
    anchorDraft: {
      ...unit.anchorDraft,
      setStructure: unit.anchorDraft.setStructure.map((set) => cloneTrainingSet(set)),
    },
    supersetGroup: unit.supersetGroup ? { ...unit.supersetGroup } : null,
  };
}

function applySetsToUnitDraft(
  unit: UnitDraft,
  nextSets: TrainingUnitSet[],
  override?: {
    recordingMode: RecordingModeValue;
    recordMode: "sets_reps" | "sets_time";
    loadModel: "external" | "bodyweight_plus_external";
  },
): UnitDraft {
  const nextRecordMode = override?.recordMode ?? unit.recordMode;
  const nextLoadModel = override?.loadModel ?? unit.loadModel;
  const derived = deriveLegacyDefaultsFromTrainingSets(nextSets, {
    recordMode: nextRecordMode,
    loadModel: nextLoadModel,
  });

  const nextDefaultLoadUnit =
    nextLoadModel === "external" && (derived?.defaultLoadValue ?? null) !== null
      ? (unit.defaultLoadUnit ?? "kg")
      : null;
  const nextDefaultAdditionalLoadUnit =
    nextLoadModel === "bodyweight_plus_external" &&
    (derived?.defaultAdditionalLoadValue ?? null) !== null
      ? (unit.defaultAdditionalLoadUnit ?? "kg")
      : null;

  return {
    ...unit,
    recordingMode: override?.recordingMode ?? unit.recordingMode,
    recordMode: nextRecordMode,
    loadModel: nextLoadModel,
    sets: nextSets,
    anchorDraft: deriveActionEntryAnchorSummary({
      recordingMode: override?.recordingMode ?? unit.recordingMode,
      recordMode: nextRecordMode,
      loadModel: nextLoadModel,
      setStructure: nextSets,
    }),
    defaultSets: derived?.defaultSets ?? Math.max(1, nextSets.length),
    defaultReps: derived?.defaultReps ?? null,
    defaultDurationSeconds: derived?.defaultDurationSeconds ?? null,
    defaultLoadValue: derived?.defaultLoadValue ?? null,
    defaultLoadUnit: nextDefaultLoadUnit,
    defaultAdditionalLoadValue: derived?.defaultAdditionalLoadValue ?? null,
    defaultAdditionalLoadUnit: nextDefaultAdditionalLoadUnit,
  };
}

function formatSlotSetSummary(unit: UnitDraft) {
  const setCount = Math.max(1, unit.sets.length || unit.defaultSets || 1);
  if (unit.recordMode === "sets_time") {
    const duration =
      unit.sets.find((set) => typeof set.duration_seconds === "number")?.duration_seconds ??
      unit.defaultDurationSeconds;
    return duration ? `${setCount} x ${duration}s` : `${setCount} 组`;
  }
  const reps =
    unit.sets.find((set) => typeof set.reps === "number")?.reps ?? unit.defaultReps;
  return reps ? `${setCount} x ${reps}` : `${setCount} 组`;
}

function buildSlotViews(units: UnitDraft[]) {
  const slots: SlotView[] = [];
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const groupId = unit.supersetGroup?.groupId;
    if (!groupId) {
      slots.push({
        kind: "single",
        index,
        unit,
      });
      continue;
    }

    const groupedIndexes = [index];
    const groupedUnits = [unit];
    for (let cursor = index + 1; cursor < units.length; cursor += 1) {
      const candidate = units[cursor];
      if (candidate.supersetGroup?.groupId !== groupId) {
        break;
      }
      groupedIndexes.push(cursor);
      groupedUnits.push(candidate);
    }
    const meta = groupedUnits[0]?.supersetGroup;
    if (!meta) {
      slots.push({
        kind: "single",
        index,
        unit,
      });
      continue;
    }
    slots.push({
      kind: "superset",
      groupId,
      unitIndexes: groupedIndexes,
      units: groupedUnits,
      meta,
    });
    index += groupedIndexes.length - 1;
  }
  return slots;
}

function formatTempoValue(tempo: TrainingUnitSet["tempo"]) {
  if (!Array.isArray(tempo) || tempo.length !== 4) {
    return null;
  }
  return tempo.join("-");
}

function formatLoadValue(unit: UnitDraft, set: TrainingUnitSet) {
  if (unit.loadModel === "bodyweight_plus_external") {
    if (typeof set.assist_weight === "number") {
      return `辅助 ${set.assist_weight}${getUnitWeightUnit(unit)}`;
    }
    if (typeof set.weight === "number") {
      return `附重 ${set.weight}${getUnitWeightUnit(unit)}`;
    }
    return null;
  }

  if (typeof set.weight === "number") {
    return `${set.weight}${getUnitWeightUnit(unit)}`;
  }
  return null;
}

function formatSetCoreSummary(unit: UnitDraft, set: TrainingUnitSet, setIndex: number) {
  const parts: string[] = [`第${setIndex + 1}组`];
  if (typeof set.reps === "number") {
    parts.push(`${set.reps}次`);
  } else if (
    set.reps &&
    typeof set.reps === "object" &&
    typeof set.reps.min === "number" &&
    typeof set.reps.max === "number"
  ) {
    parts.push(`${set.reps.min}-${set.reps.max}次`);
  } else if (typeof set.duration_seconds === "number") {
    parts.push(`${set.duration_seconds}秒`);
  }

  const load = formatLoadValue(unit, set);
  if (load) {
    parts.push(load);
  }
  if (typeof set.rest_seconds === "number") {
    parts.push(`休息${set.rest_seconds}秒`);
  }
  if (typeof set.rpe === "number") {
    parts.push(`RPE ${set.rpe}`);
  }
  const tempo = formatTempoValue(set.tempo);
  if (tempo) {
    parts.push(`动作节奏 ${tempo}`);
  }
  return parts.join(" · ");
}

function buildSingleArrangementLines(unit: UnitDraft) {
  if (unit.sets.length > 0) {
    return unit.sets.map((set, index) => formatSetCoreSummary(unit, set, index));
  }
  return [formatSlotSetSummary(unit)];
}

function buildProgressionSummary(unit: UnitDraft) {
  return `${getProgressionFamilyLabel(unit.progressionFamily)} / ${getProgressionPolicyTypeLabel(
    unit.progressionPolicyType,
  )}`;
}

function buildTemplateArrangementSummary(
  slots: SlotView[],
  exerciseById: Map<string, ExerciseLibraryItem>,
) {
  const movementCounts = new Map<string, number>();
  const muscleCounts = new Map<string, number>();

  const countExercise = (unit: UnitDraft, exercise: ExerciseLibraryItem | null) => {
    if (!exercise) {
      return;
    }
    const setCount = Math.max(unit.sets.length, unit.defaultSets || 1, 1);
    const movementLabel = getMovementPatternLabel(exercise.movementPattern);
    movementCounts.set(movementLabel, (movementCounts.get(movementLabel) ?? 0) + setCount);
    for (const label of toPrimaryMuscleLabels(exercise.primaryRegions, 2)) {
      muscleCounts.set(label, (muscleCounts.get(label) ?? 0) + setCount);
    }
  };

  const items = slots.map<ConfirmSingleItem | ConfirmSupersetItem>((slot) => {
    if (slot.kind === "single") {
      countExercise(slot.unit, exerciseById.get(slot.unit.exerciseLibraryItemId) ?? null);
      return {
        type: "single",
        key: `single:${slot.index}`,
        title: slot.unit.exerciseNameSnapshot,
        setLines: buildSingleArrangementLines(slot.unit),
        progressionSummary: buildProgressionSummary(slot.unit),
      };
    }

    slot.units.forEach((unit) =>
      countExercise(unit, exerciseById.get(unit.exerciseLibraryItemId) ?? null),
    );
    const hasExplicitSets = slot.units.some((unit) => unit.sets.length > 0);
    const roundCount = Math.max(
      ...slot.units.map((unit) =>
        hasExplicitSets ? Math.max(unit.sets.length, 1) : Math.max(unit.defaultSets || 1, 1),
      ),
      1,
    );
    const rounds: ConfirmSupersetRound[] = Array.from({ length: roundCount }, (_, roundIndex) => {
      const lines: ConfirmSupersetRoundLine[] = [];
      slot.units.forEach((unit, unitIndex) => {
        const set = unit.sets[roundIndex];
        const detail =
          set !== undefined
            ? formatSetCoreSummary(unit, set, roundIndex).replace(/^第\d+组 · /, "")
            : unit.sets.length === 0
              ? formatSlotSetSummary(unit)
              : null;
        if (!detail) {
          return;
        }
        lines.push({
          type: "action",
          key: `${slot.groupId}:round:${roundIndex}:unit:${unitIndex}`,
          title: `${String.fromCharCode(65 + unitIndex)} ${unit.exerciseNameSnapshot}`,
          detail,
        });
        if (unitIndex < slot.units.length - 1 && (slot.meta.betweenExercisesRestSeconds ?? 0) > 0) {
          lines.push({
            type: "rest",
            key: `${slot.groupId}:round:${roundIndex}:rest:between:${unitIndex}`,
            label: `动作间休息 ${slot.meta.betweenExercisesRestSeconds}秒`,
          });
        }
      });

      if ((slot.meta.betweenRoundsRestSeconds ?? 0) > 0 && roundIndex < roundCount - 1) {
        lines.push({
          type: "rest",
          key: `${slot.groupId}:round:${roundIndex}:rest:round`,
          label: `回合间休息 ${slot.meta.betweenRoundsRestSeconds}秒`,
        });
      }

      return {
        key: `${slot.groupId}:round:${roundIndex}`,
        title: `第${roundIndex + 1}轮`,
        lines,
      };
    });

    return {
      type: "superset",
      key: `superset:${slot.groupId}`,
      title:
        slot.meta.groupName ??
        slot.units.map((unit) => unit.exerciseNameSnapshot).join(" + "),
      rounds,
      progressionSummary: `同次最多推进 ${slot.meta.progressionBudgetPerExposure} 个子动作 / ${
        slot.meta.selectionMode === "fixed_order"
          ? "固定顺序"
          : slot.meta.selectionMode === "manual"
            ? "手动保留"
            : "自动轮转"
      }`,
    };
  });

  const toStats = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
      .map(([label, count]) => ({ label, count }));

  return {
    movementStats: toStats(movementCounts),
    muscleStats: toStats(muscleCounts),
    items,
  } satisfies TemplateArrangementSummary;
}

type SlotEditorBottomSheetProps = {
  open: boolean;
  unit: UnitDraft | null;
  exercise: ExerciseLibraryItem | null;
  weightUnit: "kg" | "lbs";
  onChange: (nextUnit: UnitDraft) => void;
  onWeightUnitChange: (nextUnit: "kg" | "lbs") => void;
  onClose: () => void;
  onApply: () => void;
  onOpenProgression: () => void;
};

function SlotEditorBottomSheet({
  open,
  unit,
  exercise,
  weightUnit,
  onChange,
  onWeightUnitChange,
  onClose,
  onApply,
  onOpenProgression,
}: SlotEditorBottomSheetProps) {
  if (!open || !unit) {
    return null;
  }

  const primaryMuscleLabels = exercise ? toPrimaryMuscleLabels(exercise.primaryRegions, 4) : [];

  return (
    <div className="fixed inset-0 z-[98] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <section className="relative flex h-[min(92dvh,820px)] w-full flex-col overflow-hidden rounded-t-[2.2rem] border border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-300 dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div>
            <p className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              槽位编辑
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {exercise?.name ?? unit.exerciseNameSnapshot}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <AppCard emphasis="soft" className="space-y-2 p-3">
            <p className="text-[11px] font-black text-zinc-500">动作库引用（只读）</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/35 dark:text-blue-300">
                {exercise
                  ? getMovementPatternLabel(exercise.movementPattern)
                  : "动作模式未同步"}
              </span>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {exercise
                  ? exercise.category === "compound"
                    ? "复合动作"
                    : "孤立动作"
                  : "技术分类未同步"}
              </span>
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {exercise
                  ? getExerciseRecordModeLabel(exercise.defaultRecordMode)
                  : getExerciseRecordModeLabel(unit.recordMode === "sets_time" ? "duration" : "reps")}
              </span>
              {(primaryMuscleLabels.length > 0 ? primaryMuscleLabels : ["肌群未配置"]).map((label) => (
                <span
                  key={`${unit.exerciseLibraryItemId}:sheet:${label}`}
                  className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {label}
                </span>
              ))}
            </div>
          </AppCard>

          <AppCard emphasis="soft" className="space-y-2 p-3">
            <p className="text-[11px] font-black text-zinc-500">训练角色</p>
            <div className="flex flex-wrap gap-1.5">
              {UNIT_ROLE_VALUES.map((role) => {
                const active = unit.unitRole === role;
                return (
                  <button
                    key={`${unit.exerciseLibraryItemId}:sheet:role:${role}`}
                    type="button"
                    onClick={() => onChange({ ...unit, unitRole: role })}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {getUnitRoleLabel(role)}
                  </button>
                );
              })}
            </div>
          </AppCard>

          <AppCard emphasis="soft" className="space-y-2 p-3">
            <div className="space-y-1">
              <p className="text-[11px] font-black text-zinc-500">起算锚点草稿</p>
              <p className="text-[10px] font-medium text-zinc-400">
                这里填写的是首次真正上计划时的默认起点，不是模板永久处方；应用排期前系统会再统一核对一次。
              </p>
            </div>
            <TemplateUnitSetsEditor
              sets={unit.sets}
              recordingMode={unit.recordingMode}
              recordMode={unit.recordMode}
              loadModel={unit.loadModel}
              weightUnit={weightUnit}
              onWeightUnitChange={onWeightUnitChange}
              defaultCollapsed
              onChange={(nextSets) => onChange(applySetsToUnitDraft(unit, nextSets))}
              onRecordingModeChange={(nextValue) =>
                onChange(applySetsToUnitDraft(unit, nextValue.sets, nextValue))
              }
            />
          </AppCard>

          <AppCard emphasis="soft" className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-[11px] font-black text-zinc-500">进步逻辑</p>
                <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                  {getProgressionFamilyLabel(unit.progressionFamily)} /{" "}
                  {getProgressionPolicyTypeLabel(unit.progressionPolicyType)}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  调整策略：{getAdjustmentPolicyTypeLabel(unit.adjustmentPolicyType)}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenProgression}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-600 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/45"
              >
                <Settings2 className="h-3.5 w-3.5" />
                配置
              </button>
            </div>
          </AppCard>

          <AppCard emphasis="soft" className="space-y-1.5 p-3">
            <p className="text-[11px] font-black text-zinc-500">槽位备注</p>
            <textarea
              value={unit.notes ?? ""}
              onChange={(event) => onChange({ ...unit, notes: event.target.value })}
              rows={3}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="可记录该槽位的教学提示或注意事项"
            />
          </AppCard>
        </div>

        <footer className="border-t border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onApply}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500"
            >
              完成
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

type SplitTypeManagerSheetProps = {
  open: boolean;
  items: TemplateLibrarySplitTypeItem[];
  selectedKey: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (key: string) => void;
  onCreate: (label: string) => Promise<void>;
  onRename: (key: string, label: string) => Promise<void>;
  onDelete: (key: string, migrateToKey?: string) => Promise<void>;
};

type SupersetEditorBottomSheetProps = {
  open: boolean;
  draft: SupersetDraft | null;
  exercisesById: Map<string, ExerciseLibraryItem>;
  onChangeMeta: (
    patch: Partial<
      Pick<
        SupersetDraft,
        | "groupName"
        | "betweenExercisesRestSeconds"
        | "betweenRoundsRestSeconds"
        | "progressionBudgetPerExposure"
        | "selectionMode"
      >
    >,
  ) => void;
  onChangeUnit: (index: number, nextUnit: UnitDraft) => void;
  onWeightUnitChange: (index: number, nextUnit: "kg" | "lbs") => void;
  onOpenProgression: (index: number) => void;
  onClose: () => void;
  onApply: () => void;
};

function SupersetEditorBottomSheet({
  open,
  draft,
  exercisesById,
  onChangeMeta,
  onChangeUnit,
  onWeightUnitChange,
  onOpenProgression,
  onClose,
  onApply,
}: SupersetEditorBottomSheetProps) {
  if (!open || !draft) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[98] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <section className="relative flex h-[min(92dvh,820px)] w-full flex-col overflow-hidden rounded-t-[2.2rem] border border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-300 dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div>
            <p className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              超级组编辑
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {draft.groupName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <AppCard emphasis="soft" className="space-y-3 p-3">
            <div className="space-y-1">
              <p className="text-[11px] font-black text-zinc-500">超级组名称</p>
              <input
                value={draft.groupName}
                onChange={(event) => onChangeMeta({ groupName: event.target.value })}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="例如：上肢推拉超级组"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-black text-zinc-500">动作间小休息</span>
                <input
                  type="number"
                  min={0}
                  value={draft.betweenExercisesRestSeconds ?? ""}
                  onChange={(event) =>
                    onChangeMeta({
                      betweenExercisesRestSeconds:
                        event.target.value === ""
                          ? null
                          : Math.max(0, Number(event.target.value)),
                    })
                  }
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder="0"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-black text-zinc-500">回合间休息</span>
                <input
                  type="number"
                  min={0}
                  value={draft.betweenRoundsRestSeconds ?? ""}
                  onChange={(event) =>
                    onChangeMeta({
                      betweenRoundsRestSeconds:
                        event.target.value === ""
                          ? null
                          : Math.max(0, Number(event.target.value)),
                    })
                  }
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder="90"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-black text-zinc-500">同次最多推进</span>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={draft.progressionBudgetPerExposure}
                  onChange={(event) =>
                    onChangeMeta({
                      progressionBudgetPerExposure: normalizeSupersetProgressionBudget(
                        event.target.value,
                        1,
                      ),
                    })
                  }
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <div className="space-y-1">
                <span className="text-[11px] font-black text-zinc-500">推进选择模式</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
                  {([
                    ["auto_rotation", "自动轮转"],
                    ["fixed_order", "固定顺序"],
                    ["manual", "手动保留"],
                  ] as const).map(([value, label]) => {
                    const active = draft.selectionMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onChangeMeta({ selectionMode: value })}
                        className={`rounded-lg px-2 py-2 text-[10px] font-black transition-colors ${
                          active
                            ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </AppCard>

          {draft.units.map((unit, index) => {
            const exercise = exercisesById.get(unit.exerciseLibraryItemId) ?? null;
            const primaryMuscleLabels = exercise ? toPrimaryMuscleLabels(exercise.primaryRegions, 3) : [];
            return (
              <AppCard key={`${draft.groupId}:${unit.exerciseLibraryItemId}:${index}`} className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                      子动作 {String.fromCharCode(65 + index)}
                    </p>
                    <h4 className="mt-0.5 line-clamp-1 text-sm font-black text-zinc-900 dark:text-zinc-100">
                      {exercise?.name ?? unit.exerciseNameSnapshot}
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/35 dark:text-blue-300">
                        {exercise
                          ? getMovementPatternLabel(exercise.movementPattern)
                          : "动作模式未同步"}
                      </span>
                      {(primaryMuscleLabels.length > 0 ? primaryMuscleLabels : ["肌群未配置"]).map(
                        (label) => (
                          <span
                            key={`${draft.groupId}:${index}:${label}`}
                            className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {label}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenProgression(index)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-600 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/45"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    进步
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-black text-zinc-500">训练角色</p>
                  <div className="flex flex-wrap gap-1.5">
                    {UNIT_ROLE_VALUES.map((role) => {
                      const active = unit.unitRole === role;
                      return (
                        <button
                          key={`${draft.groupId}:${index}:role:${role}`}
                          type="button"
                          onClick={() => onChangeUnit(index, { ...unit, unitRole: role })}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                            active
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          }`}
                        >
                          {getUnitRoleLabel(role)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] font-black text-zinc-500">起算锚点草稿</p>
                      <p className="text-[10px] font-medium text-zinc-400">
                        超级组子动作也先保存入口锚点，真正排期前仍会统一确认。
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {formatSlotSetSummary(unit)}
                    </span>
                  </div>
                  <TemplateUnitSetsEditor
                    sets={unit.sets}
                    recordingMode={unit.recordingMode}
                    recordMode={unit.recordMode}
                    loadModel={unit.loadModel}
                    weightUnit={getUnitWeightUnit(unit)}
                    onWeightUnitChange={(nextUnit) => onWeightUnitChange(index, nextUnit)}
                    defaultCollapsed
                    onChange={(nextSets) => onChangeUnit(index, applySetsToUnitDraft(unit, nextSets))}
                    onRecordingModeChange={(nextValue) =>
                      onChangeUnit(index, applySetsToUnitDraft(unit, nextValue.sets, nextValue))
                    }
                  />
                </div>
              </AppCard>
            );
          })}
        </div>

        <footer className="border-t border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onApply}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500"
            >
              完成
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

type TemplateArrangementConfirmDialogProps = {
  open: boolean;
  summary: TemplateArrangementSummary | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function TemplateArrangementConfirmDialog({
  open,
  summary,
  saving,
  onClose,
  onConfirm,
}: TemplateArrangementConfirmDialogProps) {
  if (!open || !summary) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <section className="relative flex max-h-[86dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-start justify-between border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <div className="space-y-1">
            <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              确认训练安排
            </p>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              保存前检查本模板的训练总览
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <AppCard emphasis="soft" className="space-y-3 p-3">
            <div className="space-y-1">
              <p className="text-[11px] font-black text-zinc-500">动作模式统计（以组数计）</p>
              <div className="flex flex-wrap gap-1.5">
                {summary.movementStats.length > 0 ? (
                  summary.movementStats.map((item) => (
                    <span
                      key={`movement:${item.label}`}
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950/35 dark:text-blue-300"
                    >
                      {item.label} × {item.count}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-zinc-400">暂无</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-black text-zinc-500">肌群统计（以组数计）</p>
              <div className="flex flex-wrap gap-1.5">
                {summary.muscleStats.length > 0 ? (
                  summary.muscleStats.map((item) => (
                    <span
                      key={`muscle:${item.label}`}
                      className="rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {item.label} × {item.count}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-zinc-400">暂无</span>
                )}
              </div>
            </div>
          </AppCard>

          <div className="space-y-3">
            {summary.items.map((item) =>
              item.type === "single" ? (
                <AppCard key={item.key} className="space-y-2.5 p-3">
                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </h4>
                  <div className="space-y-1">
                    {item.setLines.map((line, index) => (
                      <p
                        key={`${item.key}:set:${index}`}
                        className="text-[11px] font-medium leading-relaxed text-zinc-700 dark:text-zinc-200"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                  <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    进步逻辑：{item.progressionSummary}
                  </p>
                </AppCard>
              ) : (
                <AppCard key={item.key} className="space-y-3 p-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                      超级组 · {item.title}
                    </h4>
                    <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      按真实训练顺序核对动作与休息安排
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    {item.rounds.map((round) => (
                      <div
                        key={round.key}
                        className="rounded-2xl border border-zinc-200 bg-zinc-50/70 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/70"
                      >
                        <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-200">
                          {round.title}
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {round.lines.map((line) =>
                            line.type === "action" ? (
                              <div key={line.key} className="space-y-0.5">
                                <p className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100">
                                  {line.title}
                                </p>
                                <p className="text-[11px] font-medium leading-relaxed text-zinc-600 dark:text-zinc-300">
                                  {line.detail}
                                </p>
                              </div>
                            ) : (
                              <p
                                key={line.key}
                                className="text-[11px] font-bold text-blue-700 dark:text-blue-300"
                              >
                                {line.label}
                              </p>
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    进步逻辑：{item.progressionSummary}
                  </p>
                </AppCard>
              ),
            )}
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            返回修改
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "保存中" : "确认保存"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SplitTypeManagerSheet({
  open,
  items,
  selectedKey,
  busy,
  error,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: SplitTypeManagerSheetProps) {
  const [newLabel, setNewLabel] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [migrateToKey, setMigrateToKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewLabel("");
      setEditingKey(null);
      setEditingLabel("");
      setDeletingKey(null);
      setMigrateToKey(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const deletingItem = deletingKey ? items.find((item) => item.key === deletingKey) ?? null : null;
  const migrateCandidates =
    deletingItem !== null ? items.filter((item) => item.key !== deletingItem.key) : [];

  return (
    <div className="fixed inset-0 z-[99] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <section className="relative flex h-[min(86dvh,760px)] w-full flex-col overflow-hidden rounded-t-[2rem] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div>
            <p className="text-base font-black text-zinc-900 dark:text-zinc-100">管理分化类型</p>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">新增、改名、删除并同步筛选</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          <AppCard emphasis="soft" className="space-y-2 p-3">
            <p className="text-[11px] font-black text-zinc-500">已配置分化类型</p>
            <div className="space-y-2">
              {items.map((item) => {
                const active = selectedKey === item.key;
                const isEditing = editingKey === item.key;
                return (
                  <div
                    key={item.key}
                    className="rounded-xl border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(item.key)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        {item.label}
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          引用 {item.templateCount}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditingKey(item.key);
                            setEditingLabel(item.label);
                            setDeletingKey(null);
                          }}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-[10px] font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          改名
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setDeletingKey(item.key);
                            setMigrateToKey(
                              items.find((candidate) => candidate.key !== item.key)?.key ?? null,
                            );
                            setEditingKey(null);
                          }}
                          className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={editingLabel}
                          onChange={(event) => setEditingLabel(event.target.value)}
                          className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                          placeholder="新的分化类型名称"
                        />
                        <button
                          type="button"
                          disabled={busy || !editingLabel.trim()}
                          onClick={async () => {
                            await onRename(item.key, editingLabel.trim());
                            setEditingKey(null);
                          }}
                          className="rounded-lg bg-blue-600 px-2.5 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditingKey(null)}
                          className="rounded-lg border border-zinc-300 px-2.5 py-2 text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          取消
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </AppCard>

          <AppCard emphasis="soft" className="space-y-2 p-3">
            <p className="text-[11px] font-black text-zinc-500">新增分化类型</p>
            <div className="flex items-center gap-2">
              <input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                placeholder="例如：上/下/恢复"
              />
              <button
                type="button"
                disabled={busy || !newLabel.trim()}
                onClick={async () => {
                  await onCreate(newLabel.trim());
                  setNewLabel("");
                }}
                className="rounded-lg bg-blue-600 px-2.5 py-2 text-[11px] font-bold text-white disabled:opacity-60"
              >
                新增
              </button>
            </div>
          </AppCard>

          {deletingItem ? (
            <AppCard emphasis="soft" className="space-y-2 p-3">
              <p className="text-[11px] font-black text-zinc-500">删除确认</p>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {deletingItem.templateCount > 0
                  ? `“${deletingItem.label}” 已被 ${deletingItem.templateCount} 个模板使用，需先迁移后删除。`
                  : `确认删除 “${deletingItem.label}”？`}
              </p>
              {deletingItem.templateCount > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-zinc-500">迁移到</p>
                  <div className="flex flex-wrap gap-1.5">
                    {migrateCandidates.map((item) => (
                      <button
                        key={`migrate-${item.key}`}
                        type="button"
                        onClick={() => setMigrateToKey(item.key)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          migrateToKey === item.key
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || (deletingItem.templateCount > 0 && !migrateToKey)}
                  onClick={async () => {
                    await onDelete(
                      deletingItem.key,
                      deletingItem.templateCount > 0 ? migrateToKey ?? undefined : undefined,
                    );
                    setDeletingKey(null);
                    setMigrateToKey(null);
                  }}
                  className="rounded-lg bg-red-600 px-2.5 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  确认删除
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDeletingKey(null);
                    setMigrateToKey(null);
                  }}
                  className="rounded-lg border border-zinc-300 px-2.5 py-2 text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  取消
                </button>
              </div>
            </AppCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function TemplateLibraryDetailClient({
  userId,
  itemId,
}: TemplateLibraryDetailClientProps) {
  const [item, setItem] = useState<TemplateLibraryItemDetail | null>(null);
  const [draft, setDraft] = useState<DefinitionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggleEnabledError, setToggleEnabledError] = useState<string | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const [exerciseCatalog, setExerciseCatalog] = useState<ExerciseLibraryItem[]>([]);
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [isSlotEditorOpen, setSlotEditorOpen] = useState(false);
  const [isSupersetEditorOpen, setSupersetEditorOpen] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [editingSupersetIndexes, setEditingSupersetIndexes] = useState<number[] | null>(null);
  const [slotDraft, setSlotDraft] = useState<UnitDraft | null>(null);
  const [supersetDraft, setSupersetDraft] = useState<SupersetDraft | null>(null);
  const [progressionTarget, setProgressionTarget] = useState<
    { scope: "single"; index: number } | { scope: "superset"; index: number } | null
  >(null);
  const [splitTypes, setSplitTypes] = useState<TemplateLibrarySplitTypeItem[]>([]);
  const [splitTypeSheetOpen, setSplitTypeSheetOpen] = useState(false);
  const [splitTypeSaving, setSplitTypeSaving] = useState(false);
  const [splitTypeError, setSplitTypeError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const exerciseById = useMemo(
    () => new Map(exerciseCatalog.map((entry) => [entry.id, entry])),
    [exerciseCatalog],
  );
  const slotViews = useMemo(() => buildSlotViews(draft?.units ?? []), [draft?.units]);
  const arrangementSummary = useMemo(
    () => buildTemplateArrangementSummary(slotViews, exerciseById),
    [slotViews, exerciseById],
  );

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const detail = await getTemplateLibraryItem(itemId, userId);
      setItem(detail);
      setDraft({
        name: detail.name,
        description: detail.description ?? "",
        splitType: detail.splitType,
        aliases: detail.aliases,
        notes: detail.notes ?? "",
        units: detail.units
          .slice()
          .sort((a, b) => a.sequenceNo - b.sequenceNo)
          .map((unit) => toUnitDraft(unit)),
      });
    } catch (error) {
      setLoadError(error instanceof Error ? translateUiError(error.message) : "模板详情加载失败");
      setItem(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [itemId, userId]);

  const loadExerciseCatalog = useCallback(async () => {
    try {
      const data = await listExerciseLibraryItems(userId, { enabled: "all" });
      setExerciseCatalog(data);
    } catch {
      setExerciseCatalog([]);
    }
  }, [userId]);

  const loadSplitTypes = useCallback(async () => {
    try {
      const data = await listTemplateLibrarySplitTypes(userId);
      setSplitTypes(data);
      setSplitTypeError(null);
    } catch (error) {
      setSplitTypes([]);
      setSplitTypeError(
        error instanceof Error ? translateUiError(error.message) : "分化类型加载失败",
      );
    }
  }, [userId]);

  useEffect(() => {
    void loadTemplate();
    void loadExerciseCatalog();
    void loadSplitTypes();
  }, [loadTemplate, loadExerciseCatalog, loadSplitTypes]);

  const updateUnit = (index: number, updater: (current: UnitDraft) => UnitDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const target = nextUnits[index];
      if (!target) return current;
      nextUnits[index] = updater(target);
      return { ...current, units: nextUnits };
    });
  };

  const closeSlotEditor = () => {
    setSlotEditorOpen(false);
    setEditingSlotIndex(null);
    setSlotDraft(null);
    setProgressionTarget(null);
  };

  const openSlotEditor = (index: number) => {
    if (!draft?.units[index]) {
      return;
    }
    setEditingSlotIndex(index);
    setSlotDraft({ ...cloneUnitDraft(draft.units[index]), required: true });
    setSlotEditorOpen(true);
  };

  const closeSupersetEditor = () => {
    setSupersetEditorOpen(false);
    setEditingSupersetIndexes(null);
    setSupersetDraft(null);
    setProgressionTarget(null);
  };

  const openSupersetEditor = (slot: Extract<SlotView, { kind: "superset" }>) => {
    setEditingSupersetIndexes(slot.unitIndexes);
    setSupersetDraft({
      groupId: slot.groupId,
      groupName:
        slot.meta.groupName ??
        slot.units.map((unit) => unit.exerciseNameSnapshot).join(" + "),
      betweenExercisesRestSeconds: slot.meta.betweenExercisesRestSeconds ?? null,
      betweenRoundsRestSeconds: slot.meta.betweenRoundsRestSeconds ?? 90,
      progressionBudgetPerExposure: slot.meta.progressionBudgetPerExposure ?? 1,
      selectionMode: slot.meta.selectionMode ?? "auto_rotation",
      units: slot.units.map((unit) => cloneUnitDraft(unit)),
    });
    setSupersetEditorOpen(true);
  };

  const applySlotEditorChanges = () => {
    if (editingSlotIndex === null || !slotDraft) {
      closeSlotEditor();
      return;
    }
    updateUnit(editingSlotIndex, () => ({ ...cloneUnitDraft(slotDraft), required: true }));
    closeSlotEditor();
  };

  const applySupersetEditorChanges = () => {
    if (!editingSupersetIndexes || !supersetDraft) {
      closeSupersetEditor();
      return;
    }
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const nextUnits = [...current.units];
      const sharedGroupName = supersetDraft.groupName.trim();
      supersetDraft.units.forEach((unit, index) => {
        const targetIndex = editingSupersetIndexes[index];
        if (typeof targetIndex !== "number" || !nextUnits[targetIndex]) {
          return;
        }
        nextUnits[targetIndex] = {
          ...cloneUnitDraft(unit),
          required: true,
          supersetGroup: {
            groupId: supersetDraft.groupId,
            groupName: sharedGroupName || null,
            orderIndex: index + 1,
            totalUnits: supersetDraft.units.length,
            betweenExercisesRestSeconds: supersetDraft.betweenExercisesRestSeconds ?? null,
            betweenRoundsRestSeconds: supersetDraft.betweenRoundsRestSeconds ?? null,
            progressionBudgetPerExposure: normalizeSupersetProgressionBudget(
              supersetDraft.progressionBudgetPerExposure,
              1,
            ),
            selectionMode: supersetDraft.selectionMode,
          },
        };
      });
      return { ...current, units: nextUnits };
    });
    closeSupersetEditor();
  };

  const handleSlotDraftWeightUnitChange = (nextUnit: "kg" | "lbs") => {
    setSlotDraft((current) => {
      if (!current) {
        return current;
      }
      return applyWeightUnitToUnitDraft(current, nextUnit);
    });
  };

  const handleSupersetDraftMetaChange = (
    patch: Partial<
      Pick<
        SupersetDraft,
        | "groupName"
        | "betweenExercisesRestSeconds"
        | "betweenRoundsRestSeconds"
        | "progressionBudgetPerExposure"
        | "selectionMode"
      >
    >,
  ) => {
    setSupersetDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const handleSupersetDraftUnitChange = (index: number, nextUnit: UnitDraft) => {
    setSupersetDraft((current) => {
      if (!current?.units[index]) {
        return current;
      }
      const nextUnits = [...current.units];
      nextUnits[index] = nextUnit;
      return { ...current, units: nextUnits };
    });
  };

  const handleSupersetDraftWeightUnitChange = (index: number, nextUnit: "kg" | "lbs") => {
    setSupersetDraft((current) => {
      if (!current?.units[index]) {
        return current;
      }
      const nextUnits = [...current.units];
      nextUnits[index] = applyWeightUnitToUnitDraft(nextUnits[index], nextUnit);
      return { ...current, units: nextUnits };
    });
  };

  const availableSplitTypes = useMemo(() => {
    if (!draft) {
      return splitTypes;
    }
    if (splitTypes.some((item) => item.key === draft.splitType)) {
      return splitTypes;
    }
    return [
      ...splitTypes,
      {
        key: draft.splitType,
        label: getTemplateSplitTypeLabel(draft.splitType),
        builtin: false,
        templateCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }, [draft, splitTypes]);

  const handleCreateSplitType = async (label: string) => {
    setSplitTypeSaving(true);
    setSplitTypeError(null);
    try {
      const created = await createTemplateLibrarySplitType({ userId, label });
      await loadSplitTypes();
      setDraft((current) => (current ? { ...current, splitType: created.key } : current));
    } catch (error) {
      setSplitTypeError(
        error instanceof Error ? translateUiError(error.message) : "新增分化类型失败",
      );
    } finally {
      setSplitTypeSaving(false);
    }
  };

  const handleRenameSplitType = async (key: string, label: string) => {
    setSplitTypeSaving(true);
    setSplitTypeError(null);
    try {
      await updateTemplateLibrarySplitType(key, { userId, label });
      await loadSplitTypes();
    } catch (error) {
      setSplitTypeError(
        error instanceof Error ? translateUiError(error.message) : "更新分化类型失败",
      );
    } finally {
      setSplitTypeSaving(false);
    }
  };

  const handleDeleteSplitType = async (key: string, migrateToKey?: string) => {
    setSplitTypeSaving(true);
    setSplitTypeError(null);
    try {
      const result = await deleteTemplateLibrarySplitType(key, {
        userId,
        ...(migrateToKey ? { migrateToKey } : {}),
      });
      await loadSplitTypes();
      if (result.deleted && draft?.splitType === key) {
        const fallbackKey = result.migratedToKey ?? splitTypes.find((item) => item.key !== key)?.key;
        if (fallbackKey) {
          setDraft((current) => (current ? { ...current, splitType: fallbackKey } : current));
        }
      }
    } catch (error) {
      setSplitTypeError(
        error instanceof Error ? translateUiError(error.message) : "删除分化类型失败",
      );
    } finally {
      setSplitTypeSaving(false);
    }
  };

  const handleAddAction = (action: ExerciseLibraryItem) => {
    setDraft((current) => {
      if (!current) return current;
      const alreadyExists = current.units.some(
        (unit) => unit.exerciseLibraryItemId === action.id,
      );
      if (alreadyExists) {
        return current;
      }

      const nextSequence = current.units.length + 1;
      const nextUnit = buildUnitDraftFromAction(action, nextSequence);

      return { ...current, units: [...current.units, nextUnit] };
    });
    setActionDrawerOpen(false);
  };

  const handleCreateSuperset = (actions: ExerciseLibraryItem[]) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const groupId = buildSupersetGroupId();
      const totalUnits = actions.length;
      const groupName = actions.map((action) => action.name).join(" + ");
      const baseSequence = current.units.length + 1;
      const nextUnits = actions.map((action, index) =>
        buildUnitDraftFromAction(action, baseSequence + index, {
          groupId,
          groupName,
          orderIndex: index + 1,
          totalUnits,
          betweenExercisesRestSeconds: null,
          betweenRoundsRestSeconds: 90,
          progressionBudgetPerExposure: 1,
          selectionMode: "auto_rotation",
        }),
      );
      return {
        ...current,
        units: [...current.units, ...nextUnits],
      };
    });
  };

  const moveSlot = (slot: SlotView, direction: "up" | "down") => {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.units];
      const sourceIndexes =
        slot.kind === "single" ? [slot.index] : [...slot.unitIndexes];
      const groupStart = sourceIndexes[0] ?? 0;
      const groupLength = sourceIndexes.length;
      const targetStart = direction === "up" ? groupStart - 1 : groupStart + 1;
      if (targetStart < 0 || targetStart + groupLength - 1 >= next.length) {
        return current;
      }
      const moving = next.splice(groupStart, groupLength);
      const insertAt = direction === "up" ? targetStart : targetStart;
      next.splice(insertAt, 0, ...moving);
      return { ...current, units: next };
    });
  };

  const removeSlot = (slot: SlotView) => {
    setDraft((current) => {
      if (!current) return current;
      const removalSet = new Set(
        slot.kind === "single" ? [slot.index] : slot.unitIndexes,
      );
      const next = current.units.filter((_, unitIndex) => !removalSet.has(unitIndex));
      return { ...current, units: next };
    });
    if (slot.kind === "single" && editingSlotIndex === slot.index) {
      closeSlotEditor();
      return;
    }
    if (
      slot.kind === "superset" &&
      editingSupersetIndexes?.some((index) => slot.unitIndexes.includes(index))
    ) {
      closeSupersetEditor();
    }
  };

  const persistDraft = async () => {
    if (!item || !draft) return;
    setSaving(true);
    setSaveError(null);

    try {
      const unitsPayload: UpsertTemplateLibraryUnitPayload[] = draft.units.map((unit, idx) => {
        const catalogItem = exerciseById.get(unit.exerciseLibraryItemId);
        const exerciseNameSnapshot = catalogItem?.name ?? unit.exerciseNameSnapshot;
        const setsPayload = unit.sets.map((set) => toTemplateSetPayload(set));
        const progressTrackKey =
          unit.progressTrackKey.trim() || buildProgressTrackKey(exerciseNameSnapshot, idx + 1);

        return {
          exerciseLibraryItemId: unit.exerciseLibraryItemId,
          exerciseNameSnapshot,
          sequenceNo: idx + 1,
          unitRole: unit.unitRole,
          progressTrackKey,
          progressionFamily: unit.progressionFamily,
          progressionPolicyType:
            unit.progressionPolicyType as UpsertTemplateLibraryUnitPayload["progressionPolicyType"],
          progressionPolicyConfig: parseJsonObjectSafe(unit.progressionPolicyConfigText),
          adjustmentPolicyType: unit.adjustmentPolicyType,
          adjustmentPolicyConfig: parseJsonObjectSafe(unit.adjustmentPolicyConfigText),
          successCriteria: parseJsonObjectSafe(unit.successCriteriaText),
          recordingMode: unit.recordingMode,
          recordMode: unit.recordMode,
          loadModel: unit.loadModel,
          defaultSets: Math.max(1, unit.defaultSets),
          ...(unit.defaultReps ? { defaultReps: unit.defaultReps } : {}),
          ...(unit.defaultDurationSeconds
            ? { defaultDurationSeconds: unit.defaultDurationSeconds }
            : {}),
          ...(unit.defaultLoadValue ? { defaultLoadValue: unit.defaultLoadValue } : {}),
          ...(unit.defaultLoadUnit ? { defaultLoadUnit: unit.defaultLoadUnit } : {}),
          ...(unit.defaultAdditionalLoadValue
            ? { defaultAdditionalLoadValue: unit.defaultAdditionalLoadValue }
            : {}),
          ...(unit.defaultAdditionalLoadUnit
            ? { defaultAdditionalLoadUnit: unit.defaultAdditionalLoadUnit }
            : {}),
          ...(unit.targetRepsMin ? { targetRepsMin: unit.targetRepsMin } : {}),
          ...(unit.targetRepsMax ? { targetRepsMax: unit.targetRepsMax } : {}),
          ...(unit.rpeMin !== null ? { rpeMin: unit.rpeMin } : {}),
          ...(unit.rpeMax !== null ? { rpeMax: unit.rpeMax } : {}),
          sets: setsPayload,
          anchorDraft: {
            setCount: unit.anchorDraft.setCount,
            reps: unit.anchorDraft.reps,
            durationSeconds: unit.anchorDraft.durationSeconds,
            loadValue: unit.anchorDraft.loadValue,
            additionalLoadValue: unit.anchorDraft.additionalLoadValue,
            assistWeight: unit.anchorDraft.assistWeight,
            restSeconds: unit.anchorDraft.restSeconds,
            tempo: unit.anchorDraft.tempo,
            targetRpe: unit.anchorDraft.targetRpe,
            recommendedRir: unit.anchorDraft.recommendedRir,
            setStructure: setsPayload,
          },
          ...(unit.notes?.trim() ? { notes: unit.notes.trim() } : {}),
          required: true,
          ...(unit.supersetGroup
            ? {
                supersetGroup: {
                  groupId: unit.supersetGroup.groupId,
                  ...(unit.supersetGroup.groupName
                    ? { groupName: unit.supersetGroup.groupName }
                    : {}),
                  orderIndex: unit.supersetGroup.orderIndex,
                  totalUnits: unit.supersetGroup.totalUnits,
                  ...(unit.supersetGroup.betweenExercisesRestSeconds !== null
                    ? {
                        betweenExercisesRestSeconds:
                          unit.supersetGroup.betweenExercisesRestSeconds,
                      }
                    : {}),
                  ...(unit.supersetGroup.betweenRoundsRestSeconds !== null
                    ? {
                        betweenRoundsRestSeconds:
                          unit.supersetGroup.betweenRoundsRestSeconds,
                      }
                    : {}),
                  progressionBudgetPerExposure:
                    unit.supersetGroup.progressionBudgetPerExposure,
                  selectionMode: unit.supersetGroup.selectionMode,
                },
              }
            : {}),
        };
      });

      await updateTemplateLibraryItem(item.id, {
        userId,
        name: draft.name.trim(),
        description: draft.description.trim(),
        splitType: draft.splitType,
        aliases: draft.aliases,
        notes: draft.notes.trim(),
        units: unitsPayload,
      });
      setConfirmDialogOpen(false);
      await loadTemplate();
    } catch (error) {
      setSaveError(error instanceof Error ? translateUiError(error.message) : "模板保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!item || !draft) {
      return;
    }
    setSaveError(null);
    setConfirmDialogOpen(true);
  };

  const handleToggleEnabled = async () => {
    if (!item) return;
    setTogglingEnabled(true);
    setToggleEnabledError(null);
    try {
      await setTemplateLibraryItemEnabled(item.id, {
        userId,
        enabled: !item.enabled,
      });
      await loadTemplate();
    } catch (error) {
      setToggleEnabledError(
        error instanceof Error ? translateUiError(error.message) : "状态切换失败",
      );
    } finally {
      setTogglingEnabled(false);
    }
  };

  if (loading && !draft) {
    return (
      <div className="mx-auto w-full max-w-[480px] space-y-3 px-3 py-4 sm:px-4">
        <AppCard emphasis="soft">
          <SkeletonRows rows={4} />
        </AppCard>
        <AppCard emphasis="soft">
          <SkeletonRows rows={6} />
        </AppCard>
      </div>
    );
  }

  if (!draft || !item) {
    return (
      <div className="mx-auto w-full max-w-[480px] space-y-3 px-3 py-4 sm:px-4">
        <AppCard emphasis="warn" className="space-y-3">
          <p className="text-sm font-black text-orange-700 dark:text-orange-300">模板详情加载失败</p>
          <p className="text-xs text-orange-700/90 dark:text-orange-300/90">
            {loadError ?? "请稍后重试"}
          </p>
          <button
            type="button"
            onClick={() => void loadTemplate()}
            className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-200 dark:border-orange-700 dark:bg-orange-900/40 dark:text-orange-200 dark:hover:bg-orange-900/60"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            重新加载
          </button>
        </AppCard>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-4 px-3 py-4 sm:px-4">
      <header className="space-y-1 px-1">
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          {draft.name || "未命名模板"}
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          模板详情页 · 配置训练单元、进步策略与引用关系
        </p>
      </header>

      {loadError ? <InlineAlert tone="warn">{loadError}</InlineAlert> : null}
      {saveError ? <InlineAlert tone="error">{saveError}</InlineAlert> : null}
      {toggleEnabledError ? <InlineAlert tone="error">{toggleEnabledError}</InlineAlert> : null}

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">模板定义</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleEnabled}
              disabled={togglingEnabled}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-60 ${
                item.enabled
                  ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              }`}
            >
              {item.enabled ? "停用模板" : "启用模板"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "保存中" : "保存"}
            </button>
          </div>
        </div>

        <section className="space-y-2">
          <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">模板名称</p>
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, name: event.target.value } : current))
            }
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">分化类型</p>
            <button
              type="button"
              onClick={() => setSplitTypeSheetOpen(true)}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              管理分化类型
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableSplitTypes.map((option) => {
              const active = draft.splitType === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    setDraft((current) =>
                      current ? { ...current, splitType: option.key } : current,
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {splitTypeError ? <InlineAlert tone="error">{splitTypeError}</InlineAlert> : null}
        </section>

        <section className="space-y-2">
          <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">模板说明</p>
          <textarea
            value={draft.description}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, description: event.target.value } : current,
              )
            }
            rows={3}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            placeholder="输入模板定位与使用场景"
          />
        </section>
      </AppCard>

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">统计与引用</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/80 px-2 py-2 text-center dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">动作槽位</p>
            <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100">
              {countLogicalTemplateSlots(draft.units)}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 px-2 py-2 text-center dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">计划包引用</p>
            <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100">
              {item.summary.totalPackageReferences}
            </p>
          </div>
        </div>

        <details className="rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <summary className="cursor-pointer text-xs font-black text-zinc-900 dark:text-zinc-100">
            计划包层引用（{item.references.packages.length}）
          </summary>
          <div className="mt-2 space-y-1">
            {item.references.packages.length > 0 ? (
              item.references.packages.slice(0, 10).map((reference) => (
                <p
                  key={`${reference.packageId}-${reference.dayCode}`}
                  className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                >
                  {reference.packageName} / {reference.dayCode}
                  {reference.dayLabel ? `（${reference.dayLabel}）` : ""}
                </p>
              ))
            ) : (
              <p className="text-[11px] text-zinc-400">暂无</p>
            )}
          </div>
        </details>

        {item.governance.duplicateCandidates.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
            <p className="text-[11px] font-black text-amber-800 dark:text-amber-300">
              治理提醒：存在潜在重复模板
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {item.governance.duplicateCandidates.slice(0, 6).map((candidate) => (
                <span
                  key={candidate.id}
                  className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300"
                >
                  {candidate.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </AppCard>

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">模板动作槽位</h3>
          <button
            type="button"
            onClick={() => setActionDrawerOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-600 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/45"
          >
            <Plus className="h-3.5 w-3.5" />
            加入动作
          </button>
        </div>

        {slotViews.length > 0 ? (
          <div className="space-y-3">
            {slotViews.map((slot, slotIndex) => {
              if (slot.kind === "single") {
                const unit = slot.unit;
                const exercise = exerciseById.get(unit.exerciseLibraryItemId);
                const primaryMuscleLabels = exercise
                  ? toPrimaryMuscleLabels(exercise.primaryRegions, 2)
                  : [];
                const roleLabel = getUnitRoleLabel(unit.unitRole);
                const setSummary = formatSlotSetSummary(unit);
                const progressionSummary = `${getProgressionFamilyLabel(
                  unit.progressionFamily,
                )} / ${getProgressionPolicyTypeLabel(unit.progressionPolicyType)}`;

                return (
                  <AppCard key={`${unit.exerciseLibraryItemId}:${slot.index}`} className="p-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openSlotEditor(slot.index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openSlotEditor(slot.index);
                        }
                      }}
                      className="space-y-2.5 rounded-lg outline-none ring-blue-300/50 focus-visible:ring-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                            槽位 #{slotIndex + 1}
                          </p>
                          <h4 className="mt-0.5 line-clamp-1 text-sm font-black text-zinc-900 dark:text-zinc-100">
                            {exercise?.name ?? unit.exerciseNameSnapshot}
                          </h4>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                              {roleLabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openSlotEditor(slot.index);
                            }}
                            className="rounded-lg border border-blue-300 bg-blue-50 p-1 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/55"
                            aria-label="编辑槽位"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveSlot(slot, "up");
                            }}
                            disabled={slotIndex === 0}
                            className="rounded-lg border border-zinc-300 p-1 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                            aria-label="上移槽位"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveSlot(slot, "down");
                            }}
                            disabled={slotIndex === slotViews.length - 1}
                            className="rounded-lg border border-zinc-300 p-1 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                            aria-label="下移槽位"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeSlot(slot);
                            }}
                            className="rounded-lg border border-red-300 bg-red-50 p-1 text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                            aria-label="删除槽位"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/35 dark:text-blue-300">
                            {exercise
                              ? getMovementPatternLabel(exercise.movementPattern)
                              : "动作模式未同步"}
                          </span>
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {exercise
                              ? exercise.category === "compound"
                                ? "复合动作"
                                : "孤立动作"
                              : "技术分类未同步"}
                          </span>
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {exercise
                              ? getExerciseRecordModeLabel(exercise.defaultRecordMode)
                              : getExerciseRecordModeLabel(
                                  unit.recordMode === "sets_time" ? "duration" : "reps",
                                )}
                          </span>
                          {(primaryMuscleLabels.length > 0
                            ? primaryMuscleLabels
                            : ["肌群未配置"]).map((label) => (
                            <span
                              key={`${unit.exerciseLibraryItemId}:${slot.index}:${label}`}
                              className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                        <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                          进步：{progressionSummary}
                        </p>
                        <p className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          组结构：{setSummary}
                        </p>
                      </div>
                    </div>
                  </AppCard>
                );
              }

              const supersetName =
                slot.meta.groupName ??
                slot.units.map((unit) => unit.exerciseNameSnapshot).join(" + ");

              return (
                <AppCard key={`superset:${slot.groupId}`} className="p-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openSupersetEditor(slot)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openSupersetEditor(slot);
                      }
                    }}
                    className="space-y-2.5 rounded-lg outline-none ring-blue-300/50 focus-visible:ring-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                          槽位 #{slotIndex + 1} · 超级组
                        </p>
                        <h4 className="mt-0.5 line-clamp-1 text-sm font-black text-zinc-900 dark:text-zinc-100">
                          {supersetName}
                        </h4>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/35 dark:text-blue-300">
                            {slot.units.length} 个子动作
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                            最多推进 {slot.meta.progressionBudgetPerExposure}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSupersetEditor(slot);
                          }}
                          className="rounded-lg border border-blue-300 bg-blue-50 p-1 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/55"
                          aria-label="编辑超级组"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveSlot(slot, "up");
                          }}
                          disabled={slotIndex === 0}
                          className="rounded-lg border border-zinc-300 p-1 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                          aria-label="上移槽位"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveSlot(slot, "down");
                          }}
                          disabled={slotIndex === slotViews.length - 1}
                          className="rounded-lg border border-zinc-300 p-1 text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                          aria-label="下移槽位"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSlot(slot);
                          }}
                          className="rounded-lg border border-red-300 bg-red-50 p-1 text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
                          aria-label="删除超级组"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                      <div className="space-y-1.5">
                        {slot.units.map((unit, childIndex) => {
                          const exercise = exerciseById.get(unit.exerciseLibraryItemId);
                          return (
                            <div
                              key={`${slot.groupId}:${unit.exerciseLibraryItemId}:${childIndex}`}
                              className="flex flex-wrap items-center gap-1.5"
                            >
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                                {String.fromCharCode(65 + childIndex)}
                              </span>
                              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                                {exercise?.name ?? unit.exerciseNameSnapshot}
                              </span>
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {getUnitRoleLabel(unit.unitRole)}
                              </span>
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {formatSlotSetSummary(unit)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                        节奏：A-B-(C)-休息
                      </p>
                      <p className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        小休息 {slot.meta.betweenExercisesRestSeconds ?? 0}s / 回合休息{" "}
                        {slot.meta.betweenRoundsRestSeconds ?? 0}s
                      </p>
                    </div>
                  </div>
                </AppCard>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="模板中还没有动作槽位"
            hint="点击“加入动作”从动作库选择并编排"
          />
        )}
      </AppCard>

      <ActionArsenalDrawer
        isOpen={actionDrawerOpen}
        onClose={() => setActionDrawerOpen(false)}
        actions={exerciseCatalog.filter((entry) => entry.enabled)}
        selectedActionIds={draft.units.map((unit) => unit.exerciseLibraryItemId)}
        onSelect={handleAddAction}
        onCreateSuperset={handleCreateSuperset}
      />

      <SplitTypeManagerSheet
        open={splitTypeSheetOpen}
        items={availableSplitTypes}
        selectedKey={draft.splitType}
        busy={splitTypeSaving}
        error={splitTypeError}
        onClose={() => setSplitTypeSheetOpen(false)}
        onSelect={(key) =>
          setDraft((current) => (current ? { ...current, splitType: key } : current))
        }
        onCreate={handleCreateSplitType}
        onRename={handleRenameSplitType}
        onDelete={handleDeleteSplitType}
      />

      <SlotEditorBottomSheet
        open={isSlotEditorOpen}
        unit={slotDraft}
        exercise={
          slotDraft ? (exerciseById.get(slotDraft.exerciseLibraryItemId) ?? null) : null
        }
        weightUnit={slotDraft ? getUnitWeightUnit(slotDraft) : "kg"}
        onChange={(nextUnit) => setSlotDraft(nextUnit)}
        onWeightUnitChange={handleSlotDraftWeightUnitChange}
        onClose={closeSlotEditor}
        onApply={applySlotEditorChanges}
        onOpenProgression={() =>
          setProgressionTarget(
            editingSlotIndex !== null ? { scope: "single", index: editingSlotIndex } : null,
          )
        }
      />

      <SupersetEditorBottomSheet
        open={isSupersetEditorOpen}
        draft={supersetDraft}
        exercisesById={exerciseById}
        onChangeMeta={handleSupersetDraftMetaChange}
        onChangeUnit={handleSupersetDraftUnitChange}
        onWeightUnitChange={handleSupersetDraftWeightUnitChange}
        onOpenProgression={(index) => setProgressionTarget({ scope: "superset", index })}
        onClose={closeSupersetEditor}
        onApply={applySupersetEditorChanges}
      />

      {progressionTarget &&
      ((progressionTarget.scope === "single" && slotDraft) ||
        (progressionTarget.scope === "superset" && supersetDraft?.units[progressionTarget.index])) ? (
        <ProgressionPolicyConfigDrawer
          open
          title={`进步逻辑：${
            progressionTarget.scope === "single"
              ? slotDraft?.exerciseNameSnapshot
              : supersetDraft?.units[progressionTarget.index]?.exerciseNameSnapshot
          }`}
          value={normalizePolicyConfig({
            progressionFamily:
              progressionTarget.scope === "single"
                ? slotDraft!.progressionFamily
                : supersetDraft!.units[progressionTarget.index].progressionFamily,
            progressionPolicyType:
              progressionTarget.scope === "single"
                ? slotDraft!.progressionPolicyType
                : supersetDraft!.units[progressionTarget.index].progressionPolicyType,
            progressionPolicyConfig: parseJsonObjectSafe(
              progressionTarget.scope === "single"
                ? slotDraft!.progressionPolicyConfigText
                : supersetDraft!.units[progressionTarget.index].progressionPolicyConfigText,
            ),
            successCriteria: parseJsonObjectSafe(
              progressionTarget.scope === "single"
                ? slotDraft!.successCriteriaText
                : supersetDraft!.units[progressionTarget.index].successCriteriaText,
            ),
            adjustmentPolicyType:
              progressionTarget.scope === "single"
                ? slotDraft!.adjustmentPolicyType
                : supersetDraft!.units[progressionTarget.index].adjustmentPolicyType,
            adjustmentPolicyConfig: parseJsonObjectSafe(
              progressionTarget.scope === "single"
                ? slotDraft!.adjustmentPolicyConfigText
                : supersetDraft!.units[progressionTarget.index].adjustmentPolicyConfigText,
            ),
            progressTrackKey:
              progressionTarget.scope === "single"
                ? slotDraft!.progressTrackKey
                : supersetDraft!.units[progressionTarget.index].progressTrackKey,
          })}
          onApply={(value: ProgressionConfigValue) => {
            if (progressionTarget.scope === "single") {
              setSlotDraft((current) => {
                if (!current) {
                  return current;
                }
                return {
                  ...current,
                  progressionFamily: value.progressionFamily as UnitDraft["progressionFamily"],
                  progressionPolicyType:
                    value.progressionPolicyType as UnitDraft["progressionPolicyType"],
                  progressionPolicyConfigText: stringifyJson(value.progressionPolicyConfig),
                  successCriteriaText: stringifyJson(value.successCriteria),
                  adjustmentPolicyType:
                    (value.adjustmentPolicyType ??
                      current.adjustmentPolicyType) as UnitDraft["adjustmentPolicyType"],
                  adjustmentPolicyConfigText: stringifyJson(value.adjustmentPolicyConfig),
                  progressTrackKey: value.progressTrackKey ?? "",
                  required: true,
                };
              });
              return;
            }

            setSupersetDraft((current) => {
              if (!current?.units[progressionTarget.index]) {
                return current;
              }
              const nextUnits = [...current.units];
              const targetUnit = nextUnits[progressionTarget.index];
              nextUnits[progressionTarget.index] = {
                ...targetUnit,
                progressionFamily: value.progressionFamily as UnitDraft["progressionFamily"],
                progressionPolicyType:
                  value.progressionPolicyType as UnitDraft["progressionPolicyType"],
                progressionPolicyConfigText: stringifyJson(value.progressionPolicyConfig),
                successCriteriaText: stringifyJson(value.successCriteria),
                adjustmentPolicyType:
                  (value.adjustmentPolicyType ??
                    targetUnit.adjustmentPolicyType) as UnitDraft["adjustmentPolicyType"],
                adjustmentPolicyConfigText: stringifyJson(value.adjustmentPolicyConfig),
                progressTrackKey: value.progressTrackKey ?? "",
                required: true,
              };
              return { ...current, units: nextUnits };
            });
          }}
          onClose={() => setProgressionTarget(null)}
        />
      ) : null}

      <TemplateArrangementConfirmDialog
        open={confirmDialogOpen}
        summary={arrangementSummary}
        saving={saving}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={() => void persistDraft()}
      />
    </div>
  );
}
