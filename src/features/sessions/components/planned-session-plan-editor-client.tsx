"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import {
  ExerciseLibraryItem,
  listExerciseLibraryItems,
} from "@/features/exercise-library/exercise-library-api";
import {
  resolveExerciseDefinitionDefaults,
  resolveExerciseDefinitionInheritanceView,
} from "@/features/exercise-library/exercise-definition-defaults";
import { getLatestObservationSummary } from "@/features/observations/observations-api";
import {
  deletePlannedSession,
  getPlannedSessionDetail,
  PlannedSessionItem,
  updatePlannedSessionPlan,
  UpdatePlannedSessionPlanPayload,
} from "@/features/sessions/sessions-api";
import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
} from "@/lib/progression-standards";
import {
  CLASSIC_PROGRESSION_STRATEGIES,
  getClassicProgressionStrategyByPolicyType,
} from "@/features/progression/progression-strategy-catalog";
import { ProgressionPolicyConfigDrawer } from "@/features/progression/components/progression-policy-config-drawer";
import { summarizeProgressionPolicyConfig } from "@/features/progression/progression-policy-summary";
import {
  applyTrainingZoneToSuccessCriteria,
  extractTrainingZoneFromSuccessCriteria,
  normalizePolicyConfig,
  ProgressionConfigValue,
} from "@/features/progression/progression-policy-normalizer";
import {
  getExerciseLoadModelLabel,
  getExerciseRecordModeLabel,
} from "@/lib/exercise-library-standards";
import {
  getRecordProfileForMode,
  RECORDING_MODE_OPTIONS,
  RecordingModeValue,
} from "@/lib/recording-mode-standards";
import { TemplateUnitSetsEditor } from "@/features/template-library/components/template-unit-sets-editor";
import {
  buildTrainingSetsFromLegacyDefaults,
  deriveLegacyDefaultsFromTrainingSets,
  normalizeTrainingUnitSets,
  TrainingUnitSet,
} from "@/lib/training-set-standards";
import {
  getProgressionPolicyTypeLabel,
} from "@/features/shared/ui-zh";
import { InlineAlert, PageContainer, SectionBlock, AppCard } from "@/features/shared/components/ui-primitives";

const QUICK_STRATEGY_OPTIONS: Array<{
  value:
    | "double_progression"
    | "linear_load_step"
    | "total_reps_threshold"
    | "manual";
  label: string;
}> = [
  { value: "double_progression", label: "双进阶" },
  { value: "linear_load_step", label: "线性加重" },
  { value: "total_reps_threshold", label: "阈值推进" },
  { value: "manual", label: "手动" },
];

type PlannedSessionPlanEditorClientProps = {
  userId: string;
  programId: string;
  plannedSessionId: string;
};

type UnitDraft = {
  id?: string;
  selectedExerciseName: string;
  exerciseLibraryItemId?: string;
  recordingMode: RecordingModeValue;
  progressionFamily:
    | "strict_load"
    | "threshold"
    | "exposure"
    | "performance"
    | "autoregulated";
  progressionPolicyType:
    | "linear_load_step"
    | "linear_periodization_step"
    | "scripted_cycle"
    | "double_progression"
    | "total_reps_threshold"
    | "add_set_then_load"
    | "reps_then_external_load"
    | "duration_threshold"
    | "bodyweight_reps_progression"
    | "hold_or_manual"
    | "manual";
  progressionPolicyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  adjustmentPolicyType: "always" | "rotating_pool" | "gated" | "manual";
  adjustmentPolicyConfig: Record<string, unknown>;
  progressTrackKey: string;
  mode: "reps" | "time";
  sets: string;
  reps: string;
  durationSeconds: string;
  loadModel: "external" | "bodyweight_plus_external";
  loadValue: string;
  loadUnit: "kg" | "lbs";
  additionalLoadValue: string;
  additionalLoadUnit: "kg" | "lbs";
  setStructure: TrainingUnitSet[];
  notes: string;
  required: boolean;
  showAdvanced: boolean;
  replaceActionId: string;
};

type SessionDraft = {
  plannedDurationMin: string;
  objectiveSummary: string;
  notes: string;
  units: UnitDraft[];
};

type BaselineUnit = {
  id: string;
  exerciseLibraryItemId: string | null;
  selectedExerciseName: string;
};

type PlanDriftSummary = {
  baselineCount: number;
  addedCount: number;
  removedCount: number;
  replacedCount: number;
  changedCount: number;
  changedRatio: number;
  shouldWarn: boolean;
};

function includesKeyword(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function toPlainRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
}

function parseNumberText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Number(value))) {
    return value.trim();
  }
  return "";
}

function toRecordMode(mode: UnitDraft["mode"]): "sets_reps" | "sets_time" {
  return mode === "time" ? "sets_time" : "sets_reps";
}

function toMode(recordMode: "sets_reps" | "sets_time"): UnitDraft["mode"] {
  return recordMode === "sets_time" ? "time" : "reps";
}

function inferRecordingModeFromPlanUnit(
  unit: Pick<UnitDraft, "recordingMode" | "mode" | "loadModel">,
): RecordingModeValue {
  if (unit.recordingMode) {
    return unit.recordingMode;
  }
  if (unit.mode === "time") {
    return "duration";
  }
  if (unit.loadModel === "bodyweight_plus_external") {
    return "bodyweight_load";
  }
  return "strength";
}

function toRecordModeFromRecordingMode(mode: RecordingModeValue): "sets_reps" | "sets_time" {
  const profile = getRecordProfileForMode(mode);
  return profile.recordMode;
}

function toAdjustmentConfig(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveProgressionPathMode(unit: Pick<UnitDraft, "adjustmentPolicyType">) {
  return unit.adjustmentPolicyType === "rotating_pool" ? "accessory_rotation" : "main_track";
}

function readRotationQuota(config: Record<string, unknown>) {
  const raw = config.rotation_quota ?? config.rotationQuota ?? config.quota;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.max(Math.trunc(raw), 1), 5);
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.max(Math.trunc(parsed), 1), 5);
    }
  }
  return 2;
}

function buildSetStructureFromLegacyPayload(payload: Record<string, unknown>, loadModel: UnitDraft["loadModel"], mode: UnitDraft["mode"]) {
  const defaultSets = Number(payload.sets);
  const safeSets = Number.isFinite(defaultSets) && defaultSets > 0 ? Math.trunc(defaultSets) : 3;
  const repsRaw = Number(payload.reps);
  const defaultReps = Number.isFinite(repsRaw) && repsRaw > 0 ? Math.trunc(repsRaw) : mode === "reps" ? 8 : null;
  const durationRaw = Number(payload.duration_seconds);
  const defaultDuration =
    Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.trunc(durationRaw)
      : mode === "time"
        ? 60
        : null;
  const loadRaw = Number(payload.load_value);
  const additionalRaw = Number(payload.additional_load_value);
  const defaultLoadValue = Number.isFinite(loadRaw) && loadRaw >= 0 ? loadRaw : null;
  const defaultAdditionalLoadValue =
    Number.isFinite(additionalRaw) && additionalRaw >= 0 ? additionalRaw : null;

  return buildTrainingSetsFromLegacyDefaults({
    defaultSets: safeSets,
    defaultReps,
    defaultDurationSeconds: defaultDuration,
    defaultLoadValue,
    defaultAdditionalLoadValue,
    loadModel,
    recordMode: toRecordMode(mode),
  });
}

function deriveLegacyFieldsFromSetStructure(unit: Pick<UnitDraft, "loadModel" | "recordingMode">, setStructure: TrainingUnitSet[]) {
  const legacy = deriveLegacyDefaultsFromTrainingSets(setStructure, {
    loadModel: unit.loadModel,
    recordMode: toRecordModeFromRecordingMode(unit.recordingMode),
  });
  if (!legacy) {
    return null;
  }

  return {
    sets: String(Math.max(1, legacy.defaultSets)),
    reps: legacy.defaultReps ? String(legacy.defaultReps) : "",
    durationSeconds: legacy.defaultDurationSeconds ? String(legacy.defaultDurationSeconds) : "",
    loadValue: legacy.defaultLoadValue !== null ? String(legacy.defaultLoadValue) : "",
    additionalLoadValue:
      legacy.defaultAdditionalLoadValue !== null ? String(legacy.defaultAdditionalLoadValue) : "",
  };
}

function parseOptionalPositiveInteger(value: string, fieldLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel} 必须是正整数`);
  }
  return parsed;
}

function parseOptionalPositiveNumber(value: string, fieldLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel} 必须是正数`);
  }
  return parsed;
}

const KG_TO_LBS_FACTOR = 2.2046226218;

function toRoundedLoadText(value: number) {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(Math.trunc(rounded));
  }
  return rounded.toFixed(1);
}

function convertLoadTextValue(value: string, fromUnit: "kg" | "lbs", toUnit: "kg" | "lbs") {
  const trimmed = value.trim();
  if (!trimmed || fromUnit === toUnit) {
    return value;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const converted = fromUnit === "kg" ? parsed * KG_TO_LBS_FACTOR : parsed / KG_TO_LBS_FACTOR;
  return toRoundedLoadText(converted);
}

function buildUnitDraft(unit: PlannedSessionItem["planned_units"][number]): UnitDraft {
  const payload = toPlainRecord(unit.target_payload);
  const durationSeconds = parseNumberText(payload.duration_seconds);
  const loadModelRaw = typeof payload.load_model === "string" ? payload.load_model : "";
  const loadUnitRaw = typeof payload.load_unit === "string" ? payload.load_unit : "";
  const loadModel =
    loadModelRaw === "bodyweight_plus_external" || loadUnitRaw === "bodyweight"
      ? "bodyweight_plus_external"
      : "external";
  const explicitRecordingMode =
    typeof payload.recording_mode === "string" ? payload.recording_mode : "";
  const recordingMode = (RECORDING_MODE_OPTIONS as ReadonlyArray<{ value: RecordingModeValue }>).some(
    (option) => option.value === explicitRecordingMode,
  )
    ? (explicitRecordingMode as RecordingModeValue)
    : durationSeconds
      ? "duration"
      : loadModel === "bodyweight_plus_external"
        ? "bodyweight_load"
        : "strength";
  const exerciseLibraryItemId =
    typeof payload.exercise_library_item_id === "string" ? payload.exercise_library_item_id : undefined;
  const progressionPolicyTypeRaw =
    typeof payload.progression_policy_type === "string" ? payload.progression_policy_type : "";
  const progressionPolicyType = (PROGRESSION_POLICY_TYPE_VALUES as readonly string[]).includes(
    progressionPolicyTypeRaw,
  )
    ? (progressionPolicyTypeRaw as UnitDraft["progressionPolicyType"])
    : CLASSIC_PROGRESSION_STRATEGIES[3].policyType;
  const progressionFamilyRaw =
    typeof payload.progression_family === "string" ? payload.progression_family : "";
  const progressionFamily = (PROGRESSION_FAMILY_VALUES as readonly string[]).includes(
    progressionFamilyRaw,
  )
    ? (progressionFamilyRaw as UnitDraft["progressionFamily"])
    : (getClassicProgressionStrategyByPolicyType(progressionPolicyType)?.progressionFamily ??
      "threshold");
  const progressionPolicyConfig =
    typeof payload.progression_policy_config === "object" &&
    payload.progression_policy_config !== null &&
    !Array.isArray(payload.progression_policy_config)
      ? (payload.progression_policy_config as Record<string, unknown>)
      : getClassicProgressionStrategyByPolicyType(progressionPolicyType)?.defaultPolicyConfig ?? {};
  const successCriteria =
    typeof payload.success_criteria === "object" &&
    payload.success_criteria !== null &&
    !Array.isArray(payload.success_criteria)
      ? (payload.success_criteria as Record<string, unknown>)
      : getClassicProgressionStrategyByPolicyType(progressionPolicyType)?.defaultSuccessCriteria ?? {};
  const successCriteriaWithZone = applyTrainingZoneToSuccessCriteria(successCriteria, {
    ...(typeof payload.target_reps_min === "number" ? { targetRepsMin: payload.target_reps_min } : {}),
    ...(typeof payload.target_reps_max === "number" ? { targetRepsMax: payload.target_reps_max } : {}),
    ...(typeof payload.rpe_min === "number" ? { rpeMin: payload.rpe_min } : {}),
    ...(typeof payload.rpe_max === "number" ? { rpeMax: payload.rpe_max } : {}),
  });
  const adjustmentPolicyTypeRaw =
    typeof payload.adjustment_policy_type === "string" ? payload.adjustment_policy_type : "";
  const adjustmentPolicyType = (ADJUSTMENT_POLICY_TYPE_VALUES as readonly string[]).includes(
    adjustmentPolicyTypeRaw,
  )
    ? (adjustmentPolicyTypeRaw as UnitDraft["adjustmentPolicyType"])
    : "always";
  const adjustmentPolicyConfig =
    typeof payload.adjustment_policy_config === "object" &&
    payload.adjustment_policy_config !== null &&
    !Array.isArray(payload.adjustment_policy_config)
      ? (payload.adjustment_policy_config as Record<string, unknown>)
      : {};
  const progressTrackKey =
    typeof payload.progress_track_key === "string" ? payload.progress_track_key : "";
  const setStructureFromPayload = normalizeTrainingUnitSets(payload.set_structure);
  const setStructure =
    setStructureFromPayload.length > 0
      ? setStructureFromPayload
      : buildSetStructureFromLegacyPayload(payload, loadModel, durationSeconds ? "time" : "reps");

  return {
    id: unit.id,
    selectedExerciseName: unit.selected_exercise_name ?? "",
    exerciseLibraryItemId,
    recordingMode,
    progressionFamily,
    progressionPolicyType,
    progressionPolicyConfig,
    successCriteria: successCriteriaWithZone,
    adjustmentPolicyType,
    adjustmentPolicyConfig,
    progressTrackKey,
    mode: durationSeconds ? "time" : "reps",
    sets: parseNumberText(payload.sets) || "1",
    reps: parseNumberText(payload.reps),
    durationSeconds,
    loadModel,
    loadValue: parseNumberText(payload.load_value),
    loadUnit: loadUnitRaw === "lbs" ? "lbs" : "kg",
    additionalLoadValue: parseNumberText(payload.additional_load_value),
    additionalLoadUnit:
      typeof payload.additional_load_unit === "string" && payload.additional_load_unit === "lbs"
        ? "lbs"
        : "kg",
    setStructure,
    notes: typeof payload.notes === "string" ? payload.notes : "",
    required: true,
    showAdvanced: false,
    replaceActionId: "",
  };
}

function createUnitDraftFromAction(action: ExerciseLibraryItem | null): UnitDraft {
  const defaultStrategy = CLASSIC_PROGRESSION_STRATEGIES[3];

  if (!action) {
    const recordingMode: RecordingModeValue = "strength";
    const mode: UnitDraft["mode"] = "reps";
    const loadModel: UnitDraft["loadModel"] = "external";
    return {
      selectedExerciseName: "新动作",
      exerciseLibraryItemId: undefined,
      recordingMode,
      progressionFamily: defaultStrategy.progressionFamily,
      progressionPolicyType: defaultStrategy.policyType,
      progressionPolicyConfig: defaultStrategy.defaultPolicyConfig,
      successCriteria: defaultStrategy.defaultSuccessCriteria,
      adjustmentPolicyType: "always",
      adjustmentPolicyConfig: {},
      progressTrackKey: "",
      mode: "reps",
      sets: "3",
      reps: "8",
      durationSeconds: "",
      loadModel,
      loadValue: "",
      loadUnit: "kg",
      additionalLoadValue: "",
      additionalLoadUnit: "kg",
      setStructure: buildTrainingSetsFromLegacyDefaults({
        defaultSets: 3,
        defaultReps: 8,
        defaultDurationSeconds: null,
        defaultLoadValue: null,
        defaultAdditionalLoadValue: null,
        loadModel,
        recordMode: toRecordMode(mode),
      }),
      notes: "",
      required: true,
      showAdvanced: false,
      replaceActionId: "",
    };
  }

  const mode: UnitDraft["mode"] = action.defaultRecordMode === "duration" ? "time" : "reps";
  const loadModel: UnitDraft["loadModel"] =
    action.defaultLoadModel === "bodyweight_plus" ? "bodyweight_plus_external" : "external";
  const recordingMode = (RECORDING_MODE_OPTIONS as ReadonlyArray<{ value: RecordingModeValue }>).some(
    (option) => option.value === action.recordingMode,
  )
    ? (action.recordingMode as RecordingModeValue)
    : action.defaultRecordMode === "duration"
      ? "duration"
      : action.defaultLoadModel === "bodyweight_plus"
        ? "bodyweight_load"
        : "strength";

  return {
    selectedExerciseName: action.name,
    exerciseLibraryItemId: action.id,
    recordingMode,
    progressionFamily: defaultStrategy.progressionFamily,
    progressionPolicyType: defaultStrategy.policyType,
    progressionPolicyConfig: defaultStrategy.defaultPolicyConfig,
    successCriteria: defaultStrategy.defaultSuccessCriteria,
    adjustmentPolicyType: "always",
    adjustmentPolicyConfig: {},
    progressTrackKey: "",
    mode,
    sets: "3",
    reps: mode === "reps" ? "8" : "",
    durationSeconds: mode === "time" ? "60" : "",
    loadModel,
    loadValue: "",
    loadUnit: "kg",
    additionalLoadValue: "",
    additionalLoadUnit: "kg",
    setStructure: buildTrainingSetsFromLegacyDefaults({
      defaultSets: 3,
      defaultReps: mode === "reps" ? 8 : null,
      defaultDurationSeconds: mode === "time" ? 60 : null,
      defaultLoadValue: null,
      defaultAdditionalLoadValue: null,
      loadModel,
      recordMode: toRecordMode(mode),
    }),
    notes: action.notes ?? "",
    required: true,
    showAdvanced: false,
    replaceActionId: "",
  };
}

function buildSessionDraft(session: PlannedSessionItem): SessionDraft {
  return {
    plannedDurationMin:
      typeof session.planned_duration_min === "number" ? String(session.planned_duration_min) : "",
    objectiveSummary: session.objective_summary ?? "",
    notes: "",
    units: session.planned_units.map(buildUnitDraft),
  };
}

function getBaselineExerciseLibraryItemId(unit: PlannedSessionItem["planned_units"][number]) {
  if (unit.exercise_library_item_id && unit.exercise_library_item_id.trim().length > 0) {
    return unit.exercise_library_item_id.trim();
  }
  const payload = toPlainRecord(unit.target_payload);
  const fromPayload = payload.exercise_library_item_id;
  if (typeof fromPayload === "string" && fromPayload.trim().length > 0) {
    return fromPayload.trim();
  }
  return null;
}

function toBaselineUnits(session: PlannedSessionItem): BaselineUnit[] {
  return session.planned_units.map((unit) => ({
    id: unit.id,
    exerciseLibraryItemId: getBaselineExerciseLibraryItemId(unit),
    selectedExerciseName: (unit.selected_exercise_name ?? "").trim(),
  }));
}

export function PlannedSessionPlanEditorClient({
  userId,
  programId,
  plannedSessionId,
}: PlannedSessionPlanEditorClientProps) {
  const router = useRouter();
  const [session, setSession] = useState<PlannedSessionItem | null>(null);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [baselineUnits, setBaselineUnits] = useState<BaselineUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addActionKeyword, setAddActionKeyword] = useState("");
  const [addActionId, setAddActionId] = useState<string>("");
  const [actionLibraryItems, setActionLibraryItems] = useState<ExerciseLibraryItem[]>([]);
  const [loadingActionLibrary, setLoadingActionLibrary] = useState(false);
  const [progressionConfigDrawer, setProgressionConfigDrawer] = useState<{
    open: boolean;
    unitIndex: number | null;
  }>({
    open: false,
    unitIndex: null,
  });

  const [latestBodyweightKg, setLatestBodyweightKg] = useState<number | null>(null);
  const [latestBodyweightObservedAt, setLatestBodyweightObservedAt] = useState<string | null>(null);
  const [loadingBodyweight, setLoadingBodyweight] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSession = await getPlannedSessionDetail(plannedSessionId, userId);
      setSession(nextSession);
      setDraft(buildSessionDraft(nextSession));
      setBaselineUnits(toBaselineUnits(nextSession));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载训练动作清单失败");
      setSession(null);
      setDraft(null);
      setBaselineUnits([]);
    } finally {
      setLoading(false);
    }
  }, [plannedSessionId, userId]);

  const loadLatestBodyweight = useCallback(async () => {
    setLoadingBodyweight(true);
    try {
      const summary = await getLatestObservationSummary(userId, ["bodyweight"]);
      const latest = summary.latestByMetric.find((item) => item.metricKey === "bodyweight")?.latest ?? null;
      if (latest?.value_numeric) {
        const value = Number(latest.value_numeric);
        if (Number.isFinite(value) && value > 0) {
          setLatestBodyweightKg(value);
          setLatestBodyweightObservedAt(latest.observed_at);
          return;
        }
      }
      setLatestBodyweightKg(null);
      setLatestBodyweightObservedAt(null);
    } catch {
      setLatestBodyweightKg(null);
      setLatestBodyweightObservedAt(null);
    } finally {
      setLoadingBodyweight(false);
    }
  }, [userId]);

  const loadActionLibrary = useCallback(async () => {
    setLoadingActionLibrary(true);
    try {
      const items = await listExerciseLibraryItems(userId, { enabled: "true" });
      setActionLibraryItems(items);
    } catch {
      setActionLibraryItems([]);
    } finally {
      setLoadingActionLibrary(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSession();
    void loadLatestBodyweight();
    void loadActionLibrary();
  }, [loadSession, loadLatestBodyweight, loadActionLibrary]);

  const hasExecution = (session?._count?.session_executions ?? 0) > 0;
  const hasBodyweightUnit = useMemo(
    () => (draft?.units ?? []).some((unit) => unit.loadModel === "bodyweight_plus_external"),
    [draft],
  );
  const selectedExerciseIds = useMemo(
    () =>
      (draft?.units ?? [])
        .map((unit) => unit.exerciseLibraryItemId)
        .filter((value): value is string => Boolean(value && value.trim().length > 0)),
    [draft],
  );
  const planDrift = useMemo<PlanDriftSummary>(() => {
    const currentUnits = draft?.units ?? [];
    const baselineById = new Map(baselineUnits.map((unit) => [unit.id, unit]));
    const baselineCount = baselineUnits.length;

    const addedCount = currentUnits.filter((unit) => !unit.id || !baselineById.has(unit.id)).length;
    const currentIds = new Set(
      currentUnits
        .map((unit) => unit.id)
        .filter((value): value is string => Boolean(value && value.trim().length > 0)),
    );
    const removedCount = baselineUnits.filter((unit) => !currentIds.has(unit.id)).length;
    const replacedCount = currentUnits.filter((unit) => {
      if (!unit.id) {
        return false;
      }
      const baseline = baselineById.get(unit.id);
      if (!baseline) {
        return false;
      }
      const currentExerciseId = unit.exerciseLibraryItemId?.trim() ?? null;
      if (baseline.exerciseLibraryItemId || currentExerciseId) {
        return baseline.exerciseLibraryItemId !== currentExerciseId;
      }
      return baseline.selectedExerciseName !== unit.selectedExerciseName.trim();
    }).length;

    const changedCount = addedCount + removedCount + replacedCount;
    const changedRatio = baselineCount > 0 ? changedCount / baselineCount : 0;

    return {
      baselineCount,
      addedCount,
      removedCount,
      replacedCount,
      changedCount,
      changedRatio,
      shouldWarn: changedCount >= 3 || (baselineCount > 0 && changedRatio >= 0.4),
    };
  }, [baselineUnits, draft?.units]);
  const addableActionItems = useMemo(() => {
    const selectedIdSet = new Set(selectedExerciseIds);
    const keyword = addActionKeyword.trim();
    return actionLibraryItems
      .filter((item) => !selectedIdSet.has(item.id))
      .filter((item) => {
        if (!keyword) return true;
        if (includesKeyword(item.name, keyword)) return true;
        return item.aliases.some((alias) => includesKeyword(alias, keyword));
      });
  }, [actionLibraryItems, selectedExerciseIds, addActionKeyword]);

  useEffect(() => {
    if (addableActionItems.length === 0) {
      setAddActionId("");
      return;
    }
    if (!addableActionItems.some((item) => item.id === addActionId)) {
      setAddActionId(addableActionItems[0].id);
    }
  }, [addableActionItems, addActionId]);

  const currentDrawerUnit = useMemo(() => {
    if (!draft || progressionConfigDrawer.unitIndex === null) {
      return null;
    }
    return draft.units[progressionConfigDrawer.unitIndex] ?? null;
  }, [draft, progressionConfigDrawer.unitIndex]);

  const fallbackDrawerValue = useMemo(
    () =>
      normalizePolicyConfig({
        progressionFamily: "threshold",
        progressionPolicyType: "double_progression",
        progressionPolicyConfig: {},
        successCriteria: {},
        adjustmentPolicyType: "always",
        adjustmentPolicyConfig: {},
        progressTrackKey: "",
      }),
    [],
  );

  const getActionById = useCallback(
    (actionId: string) =>
      actionLibraryItems.find((item) => item.id === actionId) ?? null,
    [actionLibraryItems],
  );
  const selectableActionLibraryItems = actionLibraryItems;

  const handleSessionFieldChange = (field: keyof Omit<SessionDraft, "units">, value: string) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const handleUnitFieldChange = (index: number, field: keyof UnitDraft, value: string | boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      nextUnits[index] = { ...currentUnit, [field]: value };
      return { ...current, units: nextUnits };
    });
  };

  const patchUnit = (index: number, patch: Partial<UnitDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      nextUnits[index] = {
        ...currentUnit,
        ...patch,
      };
      return { ...current, units: nextUnits };
    });
  };

  const applySetStructurePatch = (
    currentUnit: UnitDraft,
    nextSetStructure: TrainingUnitSet[],
    patch: Partial<UnitDraft> = {},
  ) => {
    const merged: UnitDraft = {
      ...currentUnit,
      ...patch,
      setStructure: normalizeTrainingUnitSets(nextSetStructure),
    };
    const derived = deriveLegacyFieldsFromSetStructure(merged, merged.setStructure);
    if (!derived) {
      return merged;
    }
    return {
      ...merged,
      ...derived,
    };
  };

  const handleSetStructureChange = (index: number, nextSetStructure: TrainingUnitSet[]) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      nextUnits[index] = applySetStructurePatch(currentUnit, nextSetStructure);
      return { ...current, units: nextUnits };
    });
  };

  const handleSetEditorRecordingModeChange = (
    index: number,
    next: {
      recordingMode: RecordingModeValue;
      recordMode: "sets_reps" | "sets_time";
      loadModel: "external" | "bodyweight_plus_external";
      sets: TrainingUnitSet[];
    },
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      nextUnits[index] = applySetStructurePatch(currentUnit, next.sets, {
        recordingMode: next.recordingMode,
        mode: toMode(next.recordMode),
        loadModel: next.loadModel,
      });
      return { ...current, units: nextUnits };
    });
  };

  const handleWeightUnitChange = (index: number, nextUnit: "kg" | "lbs") => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;

      if (currentUnit.loadModel === "external") {
        const convertedSetStructure = currentUnit.setStructure.map((setItem) => ({
          ...setItem,
          ...(typeof setItem.weight === "number"
            ? {
                weight: Number(
                  convertLoadTextValue(String(setItem.weight), currentUnit.loadUnit, nextUnit),
                ),
              }
            : {}),
        }));
        nextUnits[index] = {
          ...currentUnit,
          loadUnit: nextUnit,
          loadValue: convertLoadTextValue(currentUnit.loadValue, currentUnit.loadUnit, nextUnit),
          setStructure: convertedSetStructure,
        };
      } else {
        const convertedSetStructure = currentUnit.setStructure.map((setItem) => ({
          ...setItem,
          ...(typeof setItem.weight === "number"
            ? {
                weight: Number(
                  convertLoadTextValue(
                    String(setItem.weight),
                    currentUnit.additionalLoadUnit,
                    nextUnit,
                  ),
                ),
              }
            : {}),
          ...(typeof setItem.assist_weight === "number"
            ? {
                assist_weight: Number(
                  convertLoadTextValue(
                    String(setItem.assist_weight),
                    currentUnit.additionalLoadUnit,
                    nextUnit,
                  ),
                ),
              }
            : {}),
        }));
        nextUnits[index] = {
          ...currentUnit,
          additionalLoadUnit: nextUnit,
          additionalLoadValue: convertLoadTextValue(
            currentUnit.additionalLoadValue,
            currentUnit.additionalLoadUnit,
            nextUnit,
          ),
          setStructure: convertedSetStructure,
        };
      }
      return { ...current, units: nextUnits };
    });
  };

  const buildUnitProgressionConfigValue = (unit: UnitDraft): ProgressionConfigValue =>
    normalizePolicyConfig({
      progressionFamily: unit.progressionFamily,
      progressionPolicyType: unit.progressionPolicyType,
      progressionPolicyConfig: unit.progressionPolicyConfig,
      successCriteria: unit.successCriteria,
      adjustmentPolicyType: unit.adjustmentPolicyType,
      adjustmentPolicyConfig: unit.adjustmentPolicyConfig,
      progressTrackKey: unit.progressTrackKey,
    });

  const updateUnitProgressionConfig = (index: number, nextValue: ProgressionConfigValue) => {
    const normalized = normalizePolicyConfig(nextValue);
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      nextUnits[index] = {
        ...currentUnit,
        progressionFamily: normalized.progressionFamily as UnitDraft["progressionFamily"],
        progressionPolicyType: normalized.progressionPolicyType as UnitDraft["progressionPolicyType"],
        progressionPolicyConfig: normalized.progressionPolicyConfig,
        successCriteria: normalized.successCriteria,
        adjustmentPolicyType: (normalized.adjustmentPolicyType ?? "always") as UnitDraft["adjustmentPolicyType"],
        adjustmentPolicyConfig: normalized.adjustmentPolicyConfig ?? {},
        progressTrackKey: normalized.progressTrackKey ?? "",
      };
      return { ...current, units: nextUnits };
    });
  };

  const applyQuickProgressionStrategy = (
    index: number,
    policyType:
      | "double_progression"
      | "linear_load_step"
      | "total_reps_threshold"
      | "manual",
  ) => {
    const currentUnit = draft?.units[index];
    if (!currentUnit) return;
    const strategy = getClassicProgressionStrategyByPolicyType(policyType);
    if (!strategy) return;

    const trainingZone = extractTrainingZoneFromSuccessCriteria(currentUnit.successCriteria);
    const normalized = normalizePolicyConfig({
      progressionFamily: strategy.progressionFamily,
      progressionPolicyType: strategy.policyType,
      progressionPolicyConfig: strategy.defaultPolicyConfig,
      successCriteria: applyTrainingZoneToSuccessCriteria(strategy.defaultSuccessCriteria, trainingZone),
      adjustmentPolicyType: currentUnit.adjustmentPolicyType,
      adjustmentPolicyConfig: currentUnit.adjustmentPolicyConfig,
      progressTrackKey: currentUnit.progressTrackKey,
    });
    updateUnitProgressionConfig(index, normalized);
  };

  const applyQuickProgressionPath = (index: number, path: "main_track" | "accessory_rotation") => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      const adjustmentPolicyConfig = toAdjustmentConfig(currentUnit.adjustmentPolicyConfig);
      nextUnits[index] = {
        ...currentUnit,
        adjustmentPolicyType: path === "accessory_rotation" ? "rotating_pool" : "always",
        adjustmentPolicyConfig:
          path === "accessory_rotation"
            ? {
                ...adjustmentPolicyConfig,
                progression_enabled:
                  adjustmentPolicyConfig.progression_enabled === false ? false : true,
                rotation_quota: Number(adjustmentPolicyConfig.rotation_quota ?? 2),
                diversify_dimensions: Array.isArray(adjustmentPolicyConfig.diversify_dimensions)
                  ? adjustmentPolicyConfig.diversify_dimensions
                  : ["primary_muscle", "movement_pattern"],
              }
            : {
                ...adjustmentPolicyConfig,
                progression_enabled:
                  adjustmentPolicyConfig.progression_enabled === false ? false : true,
              },
      };
      return { ...current, units: nextUnits };
    });
  };

  const applyQuickRotationQuota = (index: number, quota: number) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit) return current;
      const adjustmentPolicyConfig = toAdjustmentConfig(currentUnit.adjustmentPolicyConfig);
      nextUnits[index] = {
        ...currentUnit,
        adjustmentPolicyType: "rotating_pool",
        adjustmentPolicyConfig: {
          ...adjustmentPolicyConfig,
          progression_enabled: adjustmentPolicyConfig.progression_enabled === false ? false : true,
          rotation_quota: Math.min(Math.max(Math.trunc(quota), 1), 5),
          diversify_dimensions: Array.isArray(adjustmentPolicyConfig.diversify_dimensions)
            ? adjustmentPolicyConfig.diversify_dimensions
            : ["primary_muscle", "movement_pattern"],
        },
      };
      return { ...current, units: nextUnits };
    });
  };

  const handleReplaceFromLibrary = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const nextUnits = [...current.units];
      const currentUnit = nextUnits[index];
      if (!currentUnit || !currentUnit.replaceActionId) return current;
      const replaced = createUnitDraftFromAction(getActionById(currentUnit.replaceActionId));
      nextUnits[index] = {
        ...replaced,
        id: currentUnit.id,
        progressionFamily: currentUnit.progressionFamily,
        progressionPolicyType: currentUnit.progressionPolicyType,
        progressionPolicyConfig: currentUnit.progressionPolicyConfig,
        successCriteria: currentUnit.successCriteria,
        adjustmentPolicyType: currentUnit.adjustmentPolicyType,
        adjustmentPolicyConfig: currentUnit.adjustmentPolicyConfig,
        progressTrackKey: currentUnit.progressTrackKey,
      };
      return { ...current, units: nextUnits };
    });
  };

  const handleAddAction = (sourceActionId?: string) => {
    const nextActionId = sourceActionId ?? addActionId;
    if (!nextActionId) return;
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        units: [...current.units, createUnitDraftFromAction(getActionById(nextActionId))],
      };
    });
  };

  const handleRemoveUnit = (index: number) => {
    setDraft((current) => {
      if (!current || current.units.length <= 1) return current;
      return {
        ...current,
        units: current.units.filter((_, unitIndex) => unitIndex !== index),
      };
    });
  };

  const handleSave = async () => {
    if (!session || !draft) return;
    setError(null);
    setMessage(null);

    if (hasBodyweightUnit && latestBodyweightKg === null) {
      setError("存在自重动作，但未找到体重记录。请先到“身体状态记录”录入体重。");
      return;
    }

    let payload: UpdatePlannedSessionPlanPayload;
    try {
      const units = draft.units.map((unit, index) => {
        const normalizedSetStructure = normalizeTrainingUnitSets(unit.setStructure);
        if (normalizedSetStructure.length === 0) {
          throw new Error(`第 ${index + 1} 个动作至少需要配置 1 组处方`);
        }

        const legacyDefaults = deriveLegacyDefaultsFromTrainingSets(normalizedSetStructure, {
          loadModel: unit.loadModel,
          recordMode: toRecordModeFromRecordingMode(unit.recordingMode),
        });
        const sets =
          legacyDefaults?.defaultSets ??
          parseOptionalPositiveInteger(unit.sets, `第 ${index + 1} 个动作的组数`);
        if (!sets) throw new Error(`第 ${index + 1} 个动作的组数不能为空`);

        const reps =
          unit.mode === "reps"
            ? legacyDefaults?.defaultReps ??
              parseOptionalPositiveInteger(unit.reps, `第 ${index + 1} 个动作的次数`)
            : undefined;
        const durationSeconds =
          unit.mode === "time"
            ? legacyDefaults?.defaultDurationSeconds ??
              parseOptionalPositiveInteger(unit.durationSeconds, `第 ${index + 1} 个动作的时长（秒）`)
            : undefined;
        if (unit.mode === "reps" && !reps) throw new Error(`第 ${index + 1} 个动作的次数不能为空`);
        if (unit.mode === "time" && !durationSeconds) throw new Error(`第 ${index + 1} 个动作的时长不能为空`);

        const normalizedSuccessCriteria = applyTrainingZoneToSuccessCriteria(
          unit.successCriteria,
          extractTrainingZoneFromSuccessCriteria(unit.successCriteria),
        );
        const trainingZone = extractTrainingZoneFromSuccessCriteria(normalizedSuccessCriteria);

        const loadValue =
          unit.loadModel === "external"
            ? (legacyDefaults?.defaultLoadValue ??
              parseOptionalPositiveNumber(unit.loadValue, "重量数值"))
            : undefined;
        const additionalLoadValue =
          unit.loadModel === "bodyweight_plus_external"
            ? (legacyDefaults?.defaultAdditionalLoadValue ??
              parseOptionalPositiveNumber(unit.additionalLoadValue, "附重数值"))
            : undefined;

        return {
          ...(unit.id ? { id: unit.id } : {}),
          selectedExerciseName: unit.selectedExerciseName,
          ...(unit.exerciseLibraryItemId ? { exerciseLibraryItemId: unit.exerciseLibraryItemId } : {}),
          ...(unit.progressTrackKey.trim() ? { progressTrackKey: unit.progressTrackKey.trim() } : {}),
          progressionFamily: unit.progressionFamily,
          progressionPolicyType: unit.progressionPolicyType,
          progressionPolicyConfig: unit.progressionPolicyConfig,
          adjustmentPolicyType: unit.adjustmentPolicyType,
          adjustmentPolicyConfig: unit.adjustmentPolicyConfig,
          successCriteria: normalizedSuccessCriteria,
          setStructure: normalizedSetStructure.map((setItem) => ({
            type: setItem.type,
            ...(setItem.reps !== undefined ? { reps: setItem.reps } : {}),
            ...(setItem.duration_seconds !== undefined
              ? { durationSeconds: setItem.duration_seconds }
              : {}),
            ...(setItem.weight_mode !== undefined ? { weightMode: setItem.weight_mode } : {}),
            ...(setItem.weight !== undefined ? { weight: setItem.weight } : {}),
            ...(setItem.relative_intensity_ratio !== undefined
              ? { relativeIntensityRatio: setItem.relative_intensity_ratio }
              : {}),
            ...(setItem.tempo !== undefined ? { tempo: setItem.tempo } : {}),
            ...(setItem.assist_weight !== undefined ? { assistWeight: setItem.assist_weight } : {}),
            ...(setItem.rpe !== undefined ? { rpe: setItem.rpe } : {}),
            ...(setItem.rest_seconds !== undefined ? { restSeconds: setItem.rest_seconds } : {}),
            ...(setItem.participates_in_progression !== undefined
              ? { participatesInProgression: setItem.participates_in_progression }
              : {}),
            ...(setItem.notes ? { notes: setItem.notes } : {}),
          })),
          sets,
          ...(reps ? { reps } : {}),
          ...(durationSeconds ? { durationSeconds } : {}),
          loadModel: unit.loadModel,
          ...(loadValue !== undefined ? { loadValue, loadUnit: unit.loadUnit } : {}),
          ...(additionalLoadValue !== undefined
            ? { additionalLoadValue, additionalLoadUnit: unit.additionalLoadUnit }
            : {}),
          ...(trainingZone.targetRepsMin !== undefined
            ? { targetRepsMin: trainingZone.targetRepsMin }
            : {}),
          ...(trainingZone.targetRepsMax !== undefined
            ? { targetRepsMax: trainingZone.targetRepsMax }
            : {}),
          ...(trainingZone.rpeMin !== undefined ? { rpeMin: trainingZone.rpeMin } : {}),
          ...(trainingZone.rpeMax !== undefined ? { rpeMax: trainingZone.rpeMax } : {}),
          ...(unit.notes.trim() ? { notes: unit.notes.trim() } : {}),
          required: true,
        };
      });

      const plannedDurationMin = parseOptionalPositiveInteger(draft.plannedDurationMin, "计划时长（分钟）");
      payload = {
        userId,
        ...(plannedDurationMin !== undefined ? { plannedDurationMin } : {}),
        objectiveSummary: draft.objectiveSummary,
        notes: draft.notes,
        units,
      };
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "保存前校验失败");
      return;
    }

    setSaving(true);
    try {
      await updatePlannedSessionPlan(session.id, payload);
      setMessage("已保存本期计划微调。该修改仅影响当前这期计划。");
      await loadSession();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!session || hasExecution) return;
    setDeletingSession(true);
    setError(null);
    setMessage(null);
    try {
      await deletePlannedSession(session.id, userId);
      router.push("/training?view=calendar");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除训练安排失败");
    } finally {
      setDeletingSession(false);
      setDeleteConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="animate-pulse rounded-md border border-zinc-200 bg-white p-4">
          <div className="h-5 w-64 rounded bg-zinc-200" />
          <div className="mt-2 h-3 w-56 rounded bg-zinc-100" />
        </div>
      </section>
    );
  }

  if (error && !draft) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!session || !draft) {
    return <p className="text-sm text-zinc-600">未找到该训练。</p>;
  }

  return (
    <PageContainer className="pb-32">
      <header className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              重塑训练计划
            </h1>
            <p className="text-xs font-bold text-zinc-500">
              计划 #{session.sequence_index} | {new Date(session.session_date).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
              临时微调
            </span>
            {!hasExecution ? (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除安排
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-[11px] font-medium leading-relaxed text-zinc-500 dark:text-zinc-400">
          本页修改仅影响当前这一期训练，不影响模板定义。修改后请务必点击最下方的“同步至当前计划”。
        </p>
      </header>

      {hasExecution ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          该训练已存在执行记录，本期计划已锁定，不再支持继续微调。
        </p>
      ) : null}
      <div className="space-y-6">
        <SectionBlock title="训练概览">
          <div className="grid gap-4 sm:grid-cols-3">
             <div className="space-y-1">
               <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400">计划时长 (min)</label>
               <input
                 type="number"
                 min={1}
                 disabled={hasExecution}
                 value={draft.plannedDurationMin}
                 onChange={(event) => handleSessionFieldChange("plannedDurationMin", event.target.value)}
                 className="block w-full rounded-xl border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
               />
             </div>
             <div className="space-y-1 sm:col-span-2">
               <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400">训练主旨</label>
               <input
                 disabled={hasExecution}
                 placeholder="例如：力量巩固或技术修正"
                 value={draft.objectiveSummary}
                 onChange={(event) => handleSessionFieldChange("objectiveSummary", event.target.value)}
                 className="block w-full rounded-xl border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-bold focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
               />
             </div>
          </div>
        </SectionBlock>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">训练动作清单</h2>
            <span className="text-[10px] font-bold text-zinc-400">{draft.units.length} 个动作</span>
          </div>

          <div className="space-y-4">
            {draft.units.map((unit, unitIndex) => {
               const progressionSummary = summarizeProgressionPolicyConfig(buildUnitProgressionConfigValue(unit));
               return (
                <AppCard key={`${unit.id ?? "new"}-${unitIndex}`} className="relative overflow-hidden">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-[10px] font-black text-white shadow-lg shadow-blue-500/20">
                        {unitIndex + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                            {unit.selectedExerciseName}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[10px] font-bold text-zinc-400">
                             {getExerciseRecordModeLabel(toRecordModeFromRecordingMode(unit.recordingMode))}
                           </span>
                           <span className="h-1 w-1 rounded-full bg-zinc-300" />
                           <span className="text-[10px] font-bold text-zinc-400">
                             {getExerciseLoadModelLabel(unit.loadModel)}
                           </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={hasExecution || draft.units.length <= 1}
                      onClick={() => handleRemoveUnit(unitIndex)}
                      className="rounded-lg bg-red-50 p-2 text-red-600 active:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                    >
                      <span className="text-xs font-bold">移除</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={hasExecution}
                    onClick={() => setProgressionConfigDrawer({ open: true, unitIndex })}
                    className="mb-4 flex w-full flex-col items-start gap-1 rounded-2xl border border-blue-100/50 bg-blue-50/30 p-3 text-left transition-colors active:bg-blue-50 dark:border-blue-900/20 dark:bg-blue-900/10"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        进步逻辑 (Progression)
                      </span>
                      <span className="text-[10px] font-bold text-blue-500">点击配置 →</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {progressionSummary || "未配置逻辑"}
                    </p>
                  </button>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">训练处方 (Prescription)</span>
                    </div>
                    
                    <TemplateUnitSetsEditor
                      sets={unit.setStructure}
                      recordingMode={unit.recordingMode}
                      recordMode={toRecordModeFromRecordingMode(unit.recordingMode)}
                      loadModel={unit.loadModel}
                      weightUnit={unit.loadModel === "external" ? unit.loadUnit : unit.additionalLoadUnit}
                      onWeightUnitChange={(nextUnit) => handleWeightUnitChange(unitIndex, nextUnit)}
                      defaultCollapsed
                      disabled={hasExecution}
                      onChange={(nextSets) => handleSetStructureChange(unitIndex, nextSets)}
                      onRecordingModeChange={(nextMode) =>
                        handleSetEditorRecordingModeChange(unitIndex, nextMode)
                      }
                    />
                  </div>


                  {unit.showAdvanced && (
                    <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">动作备注</label>
                        <textarea
                          disabled={hasExecution}
                          placeholder="填写针对该动作的特殊提醒"
                          value={unit.notes}
                          onChange={(e) => handleUnitFieldChange(unitIndex, "notes", e.target.value)}
                          className="w-full rounded-xl border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold focus:border-blue-500 focus:ring-0 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">替换为库中其他动作</label>
                        <div className="flex gap-2">
                           <select
                             value={unit.replaceActionId}
                             onChange={(e) => handleUnitFieldChange(unitIndex, "replaceActionId", e.target.value)}
                             className="flex-1 rounded-xl border-zinc-200 bg-white px-3 py-2 text-xs font-bold dark:border-zinc-800 dark:bg-zinc-950"
                           >
                             <option value="">选择动作...</option>
                             {selectableActionLibraryItems.map(item => (
                               <option key={item.id} value={item.id}>{item.name}</option>
                             ))}
                           </select>
                           <button
                             type="button"
                             disabled={!unit.replaceActionId}
                             onClick={() => handleReplaceFromLibrary(unitIndex)}
                             className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-black text-white active:bg-zinc-800 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
                           >
                             替换
                           </button>
                        </div>
                      </div>
                    </div>
                  )}
                </AppCard>
               );
            })}
          </div>

          {/* Add New Unit Section */}
          {!hasExecution && (
             <div className="mt-8 space-y-4 rounded-3xl border border-dashed border-zinc-300 p-6 dark:border-zinc-800">
                <div className="text-center space-y-1">
                   <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">新增训练动作</h4>
                   <p className="text-[10px] font-bold text-zinc-400">从动作库中搜索并添加新项</p>
                </div>
                <div className="flex flex-col gap-3">
                   <input 
                     placeholder="搜索动作名称..."
                     value={addActionKeyword}
                     onChange={(e) => setAddActionKeyword(e.target.value)}
                     className="w-full rounded-2xl border-zinc-200 bg-white px-4 py-3 text-sm font-bold focus:border-blue-500 focus:ring-0 dark:border-zinc-800 dark:bg-zinc-950"
                   />
                   <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {addableActionItems.slice(0, 8).map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleAddAction(item.id)}
                          className="flex items-center justify-center rounded-xl border border-zinc-100 bg-white p-3 text-[11px] font-black text-zinc-700 active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          + {item.name}
                        </button>
                      ))}
                   </div>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-white/80 p-4 backdrop-blur-md dark:bg-zinc-950/80">
         <div className="flex w-full max-w-[480px] gap-3">
            <button
               onClick={() => window.history.back()}
               className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-black text-zinc-900 active:scale-95 dark:bg-zinc-800 dark:text-zinc-100"
            >
               取消
            </button>
            <button
               disabled={saving || hasExecution}
               onClick={() => void handleSave()}
               className="flex h-12 flex-[2] items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50"
            >
               {saving ? "同步中..." : "同步至当前计划"}
            </button>
         </div>
      </div>

      {/* Progression Config Drawer */}
      {progressionConfigDrawer.open && (
        <ProgressionPolicyConfigDrawer
          key={`planned-unit-${progressionConfigDrawer.unitIndex ?? "none"}`}
          open={progressionConfigDrawer.open && progressionConfigDrawer.unitIndex !== null}
          title={
            progressionConfigDrawer.unitIndex !== null
              ? `动作 #${progressionConfigDrawer.unitIndex + 1} 进步策略配置`
              : "动作进步策略配置"
          }
          value={currentDrawerUnit ? buildUnitProgressionConfigValue(currentDrawerUnit) : fallbackDrawerValue}
          onApply={(nextValue: ProgressionConfigValue) => {
            if (progressionConfigDrawer.unitIndex === null) return;
            updateUnitProgressionConfig(progressionConfigDrawer.unitIndex, nextValue);
          }}
          onClose={() => setProgressionConfigDrawer({ open: false, unitIndex: null })}
          disabled={hasExecution || saving}
        />
      )}

      {/* Error/Success Feedbacks */}
      <div className="fixed top-16 left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none">
         <div className="w-full max-w-[480px] space-y-2 pointer-events-auto">
            {error && <InlineAlert tone="error">{error}</InlineAlert>}
            {message && <InlineAlert tone="success">{message}</InlineAlert>}
         </div>
      </div>

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-3 pb-3">
          <div className="w-full max-w-[560px] rounded-[28px] border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">确认删除计划安排</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    这会删除当前未训练的计划安排，并影响后续日历与未来排期。若已经生成训练记录，则不会允许删除。
                  </p>
                </div>
              </div>

              <InlineAlert tone="warn">
                删除仅发生在计划详情页内，避免在首页或列表页误触。
              </InlineAlert>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={deletingSession}
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="h-11 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deletingSession}
                  onClick={() => void handleDeleteSession()}
                  className="h-11 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-60"
                >
                  {deletingSession ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
