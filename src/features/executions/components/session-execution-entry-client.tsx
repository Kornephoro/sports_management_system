"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ExerciseNameLink } from "@/features/exercise-library/exercise-link";
import { InlineAlert, SectionBlock } from "@/features/shared/components/ui-primitives";
import {
  addSessionExecutionSet,
  createSessionExecution,
  createUnitExecutions,
  getLatestSessionExecutionByPlannedSession,
  getSessionExecutionDetail,
  listPlannedSessions,
  LatestPlannedSessionExecutionResponse,
  PlannedSessionItem,
  SessionExecutionSet,
  SessionExecutionSetStatus,
  SessionExecutionDetailResponse,
  updateSessionExecutionSet,
} from "@/features/sessions/sessions-api";
import {
  getSessionStatusLabel,
  getUnitExecutionStatusLabel,
  TERMS_ZH,
} from "@/features/shared/ui-zh";
import { inferRecordingModeFromUnit } from "@/lib/recording-mode-standards";
import { normalizeTrainingUnitSets } from "@/lib/training-set-standards";

type SessionExecutionEntryClientProps = {
  userId: string;
  programId: string;
  plannedSessionId: string;
  returnTo?: string;
  fromPlannedSessionId?: string;
  resume?: string;
};

type DeviationTag =
  | "less_sets"
  | "less_reps"
  | "increase_load"
  | "decrease_load"
  | "add_sets"
  | "add_reps"
  | "replace_exercise"
  | "execution_method_change"
  | "less_duration";

type ReasonTag =
  | "fatigue"
  | "time_limit"
  | "poor_state"
  | "pain_discomfort"
  | "equipment_limit"
  | "venue_limit"
  | "other";

type SetRowDraft = {
  setNo: number;
  plannedLoadText: string;
  plannedReps?: number;
  plannedDurationSeconds?: number;
  actualLoadText: string;
  actualReps: string;
  actualDurationSeconds: string;
  skipped: boolean;
};

type UnitDraft = {
  completionStatus: "completed" | "partial" | "skipped";
  notes: string;
  perceivedExertion: string;
  painScore: string;
  hasAdjustment: boolean;
  deviationTags: DeviationTag[];
  reasonTags: ReasonTag[];
  executionMethod: "" | "superset" | "drop_set" | "rest_pause" | "other";
  actualSets: string;
  actualReps: string;
  actualDurationSeconds: string;
  loadChange: "" | "increase" | "decrease";
  addedSets: string;
  addedReps: string;
  replacedExerciseName: string;
  executionMethodNote: string;
  showSetDetails: boolean;
  setRows: SetRowDraft[];
};

type OverallFeeling = "easy" | "normal" | "hard";

const DEVIATION_OPTIONS: Array<{ value: DeviationTag; label: string }> = [
  { value: "less_sets", label: "少做组数" },
  { value: "less_reps", label: "少做次数" },
  { value: "increase_load", label: "加重" },
  { value: "decrease_load", label: "降重" },
  { value: "add_sets", label: "加组" },
  { value: "add_reps", label: "加次数" },
  { value: "replace_exercise", label: "替换动作" },
  { value: "execution_method_change", label: "执行方式变化" },
  { value: "less_duration", label: "时长不足" },
] as const;

const REASON_OPTIONS: Array<{ value: ReasonTag; label: string }> = [
  { value: "fatigue", label: "力竭" },
  { value: "time_limit", label: "时间不够" },
  { value: "poor_state", label: "状态差" },
  { value: "pain_discomfort", label: "疼痛/不适" },
  { value: "equipment_limit", label: "器械限制" },
  { value: "venue_limit", label: "场地限制" },
  { value: "other", label: "其他" },
] as const;

const EXECUTION_METHOD_OPTIONS = [
  { value: "superset", label: "超级组" },
  { value: "drop_set", label: "掉重组" },
  { value: "rest_pause", label: "rest-pause" },
  { value: "other", label: "其他" },
] as const;

const DEVIATION_CONFLICT_MAP: Record<DeviationTag, DeviationTag[]> = {
  less_sets: ["add_sets"],
  add_sets: ["less_sets"],
  less_reps: ["add_reps"],
  add_reps: ["less_reps"],
  increase_load: ["decrease_load"],
  decrease_load: ["increase_load"],
  replace_exercise: [],
  execution_method_change: [],
  less_duration: [],
};

const SKIPPED_FORBIDDEN_DEVIATIONS: DeviationTag[] = [
  "increase_load",
  "decrease_load",
  "add_sets",
  "add_reps",
  "execution_method_change",
  "less_reps",
  "less_sets",
  "less_duration",
];

type SubmittedUnitExecutionRow = {
  unitExecutionId: string;
  plannedUnitId: string | null;
  plannedUnitName: string;
  exerciseLibraryItemId: string | null;
  completionStatus: string;
  notes: string | null;
  perceivedExertion: string | null;
  painScore: number | null;
};

type PersistedSetDraft = {
  id: string;
  plannedUnitId: string | null;
  setIndex: number;
  plannedSetType: string | null;
  plannedReps: number | null;
  plannedWeight: string | null;
  plannedRpe: string | null;
  plannedRestSeconds: number | null;
  plannedTempo: string | null;
  actualRepsInput: string;
  actualWeightInput: string;
  actualRpeInput: string;
  actualRestSecondsInput: string;
  actualTempoInput: string;
  status: SessionExecutionSetStatus;
  isExtraSet: boolean;
  note: string;
};

type SetDraftMap = Record<string, PersistedSetDraft[]>;

function nowDateTimeInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatSessionDateLabel(sessionDate: string) {
  const date = new Date(sessionDate);
  const datePart = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${datePart} (${weekday})`;
}

function toPlainRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
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
  return null;
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
  return null;
}

function asInputString(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }
  const raw = String(value).trim();
  return raw.length > 0 ? raw : "";
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPersistedSetDraft(setRow: SessionExecutionSet): PersistedSetDraft {
  return {
    id: setRow.id,
    plannedUnitId: setRow.planned_unit_id,
    setIndex: setRow.set_index,
    plannedSetType: setRow.planned_set_type,
    plannedReps: setRow.planned_reps,
    plannedWeight: setRow.planned_weight,
    plannedRpe: setRow.planned_rpe,
    plannedRestSeconds: setRow.planned_rest_seconds,
    plannedTempo: setRow.planned_tempo,
    actualRepsInput: asInputString(setRow.actual_reps),
    actualWeightInput: asInputString(setRow.actual_weight),
    actualRpeInput: asInputString(setRow.actual_rpe),
    actualRestSecondsInput: asInputString(setRow.actual_rest_seconds),
    actualTempoInput: asInputString(setRow.actual_tempo),
    status: setRow.status,
    isExtraSet: setRow.is_extra_set,
    note: setRow.note ?? "",
  };
}

function toSetDraftMap(detail: SessionExecutionDetailResponse): SetDraftMap {
  return detail.units.reduce<SetDraftMap>((acc, unit) => {
    acc[unit.planned_unit.id] = [...unit.sets]
      .sort((a, b) => a.set_index - b.set_index)
      .map((setRow) => toPersistedSetDraft(setRow));
    return acc;
  }, {});
}

function parseOptionalInteger(text: string) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("请输入非负整数");
  }
  return parsed;
}

function parseOptionalDecimal(text: string) {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("请输入非负数字");
  }
  return parsed;
}

function formatPlannedSetSummary(setDraft: PersistedSetDraft) {
  const left =
    setDraft.plannedReps !== null ? `${setDraft.plannedReps} 次` : "次数未设";
  const right =
    setDraft.plannedWeight !== null && setDraft.plannedWeight.trim().length > 0
      ? `${setDraft.plannedWeight} kg`
      : "重量未设";
  const suffix: string[] = [];
  if (setDraft.plannedSetType) {
    suffix.push(setDraft.plannedSetType);
  }
  if (setDraft.plannedTempo) {
    suffix.push(`Tempo ${setDraft.plannedTempo}`);
  }
  return suffix.length > 0 ? `${left} × ${right}（${suffix.join(" / ")}）` : `${left} × ${right}`;
}

function getSetStatusLabel(status: SessionExecutionSetStatus) {
  switch (status) {
    case "completed":
      return "已完成";
    case "skipped":
      return "跳过";
    case "extra":
      return "临时加组";
    default:
      return "待完成";
  }
}

function isTimeBasedUnit(unit: PlannedSessionItem["planned_units"][number]) {
  const targetPayload = toPlainRecord(unit.target_payload);
  const prescriptionType = typeof targetPayload.prescription_type === "string"
    ? targetPayload.prescription_type
    : "";

  if (prescriptionType === "sets_time") {
    return true;
  }

  return toPositiveNumber(targetPayload.duration_seconds) !== null;
}

function inferUnitRecordingMode(unit: PlannedSessionItem["planned_units"][number]) {
  const targetPayload = toPlainRecord(unit.target_payload);
  const explicit = toOptionalString(targetPayload.recording_mode);
  if (explicit) {
    return explicit;
  }

  const prescriptionType = toOptionalString(targetPayload.prescription_type);
  const recordMode =
    prescriptionType === "sets_time" ||
    toOptionalString(targetPayload.record_mode) === "sets_time" ||
    toPositiveNumber(targetPayload.duration_seconds) !== null
      ? "sets_time"
      : "sets_reps";
  const loadModel =
    toOptionalString(targetPayload.load_model) === "bodyweight_plus_external"
      ? "bodyweight_plus_external"
      : "external";

  return inferRecordingModeFromUnit({
    recordingMode: explicit ?? null,
    recordMode,
    loadModel,
    sets: normalizeTrainingUnitSets(targetPayload.set_structure),
  });
}

function isSetTrackingEligibleUnit(unit: PlannedSessionItem["planned_units"][number]) {
  const targetPayload = toPlainRecord(unit.target_payload);
  const hasSets = toPositiveNumber(targetPayload.sets) !== null;
  if (!hasSets) {
    return false;
  }
  const mode = inferUnitRecordingMode(unit);
  if (!mode) {
    return false;
  }
  return (
    mode === "strength" ||
    mode === "reps_only" ||
    mode === "duration" ||
    mode === "bodyweight_load" ||
    mode === "assisted"
  );
}

function getUnitExerciseLibraryItemId(unit: PlannedSessionItem["planned_units"][number]) {
  const targetPayload = toPlainRecord(unit.target_payload);
  const itemId = targetPayload.exercise_library_item_id;
  return typeof itemId === "string" ? itemId : null;
}

function getPlanSummary(unit: PlannedSessionItem["planned_units"][number]) {
  const targetPayload = toPlainRecord(unit.target_payload);
  const summaryParts: string[] = [];

  const sets = toPositiveNumber(targetPayload.sets);
  if (sets !== null) {
    summaryParts.push(`组数 ${sets}`);
  }

  if (isTimeBasedUnit(unit)) {
    const duration = toPositiveNumber(targetPayload.duration_seconds);
    if (duration !== null) {
      summaryParts.push(`时长 ${duration} 秒`);
    }
  } else {
    const reps = toPositiveNumber(targetPayload.reps);
    if (reps !== null) {
      summaryParts.push(`次数 ${reps}`);
    }
  }

  const loadModel = typeof targetPayload.load_model === "string" ? targetPayload.load_model : "";
  const recordingMode = inferUnitRecordingMode(unit);
  const loadValue = toPositiveNumber(targetPayload.load_value);
  const loadUnit = typeof targetPayload.load_unit === "string" ? targetPayload.load_unit.trim() : "";
  const loadText = typeof targetPayload.load_text === "string" ? targetPayload.load_text.trim() : "";
  const bodyweightSnapshot = toPositiveNumber(targetPayload.bodyweight_snapshot_kg);
  const additionalLoadValue = toPositiveNumber(targetPayload.additional_load_value);
  const assistWeight = toPositiveNumber(targetPayload.assist_weight);
  const additionalLoadUnit =
    typeof targetPayload.additional_load_unit === "string"
      ? targetPayload.additional_load_unit.trim()
      : "kg";

  if (loadModel === "bodyweight_plus_external" || loadUnit === "bodyweight") {
    if (recordingMode === "assisted") {
      if (bodyweightSnapshot !== null && assistWeight !== null) {
        summaryParts.push(`重量 自重${bodyweightSnapshot}kg + 辅助${assistWeight}${additionalLoadUnit}`);
      } else if (assistWeight !== null) {
        summaryParts.push(`重量 自重 + 辅助${assistWeight}${additionalLoadUnit}`);
      } else {
        summaryParts.push("重量 自重辅助");
      }
    } else if (bodyweightSnapshot !== null && additionalLoadValue !== null) {
      summaryParts.push(`重量 自重${bodyweightSnapshot}kg + 附重${additionalLoadValue}${additionalLoadUnit}`);
    } else if (bodyweightSnapshot !== null) {
      summaryParts.push(`重量 自重${bodyweightSnapshot}kg`);
    } else if (additionalLoadValue !== null) {
      summaryParts.push(`重量 自重 + 附重${additionalLoadValue}${additionalLoadUnit}`);
    } else {
      summaryParts.push("重量 自重");
    }
  } else if (loadValue !== null) {
    summaryParts.push(`重量 ${loadValue}${loadUnit ? loadUnit : ""}`);
  } else if (loadText) {
    summaryParts.push(`重量 ${loadText}`);
  }

  const targetRepsMin = toPositiveNumber(targetPayload.target_reps_min);
  const targetRepsMax = toPositiveNumber(targetPayload.target_reps_max);
  if (targetRepsMin !== null || targetRepsMax !== null) {
    summaryParts.push(
      `目标次数 ${targetRepsMin !== null ? targetRepsMin : "-"}~${targetRepsMax !== null ? targetRepsMax : "-"}`,
    );
  }

  const rpeMin = toPositiveNumber(targetPayload.rpe_min);
  const rpeMax = toPositiveNumber(targetPayload.rpe_max);
  if (rpeMin !== null || rpeMax !== null) {
    summaryParts.push(
      `主观用力程度（RPE） ${rpeMin !== null ? rpeMin : "-"}~${rpeMax !== null ? rpeMax : "-"}`,
    );
  }

  return summaryParts.length > 0 ? summaryParts.join(" | ") : "未配置计划参数";
}

function getLoadTextFromPayload(targetPayload: Record<string, unknown>) {
  const loadModel = typeof targetPayload.load_model === "string" ? targetPayload.load_model : "";
  const recordingMode =
    typeof targetPayload.recording_mode === "string" ? targetPayload.recording_mode : null;
  const bodyweightSnapshot = toPositiveNumber(targetPayload.bodyweight_snapshot_kg);
  const additionalLoadValue = toPositiveNumber(targetPayload.additional_load_value);
  const assistWeight = toPositiveNumber(targetPayload.assist_weight);
  const additionalLoadUnit =
    typeof targetPayload.additional_load_unit === "string"
      ? targetPayload.additional_load_unit.trim()
      : "kg";

  if (loadModel === "bodyweight_plus_external") {
    if (recordingMode === "assisted") {
      if (bodyweightSnapshot !== null && assistWeight !== null) {
        return `自重${bodyweightSnapshot}kg + 辅助${assistWeight}${additionalLoadUnit}`;
      }
      if (assistWeight !== null) {
        return `自重 + 辅助${assistWeight}${additionalLoadUnit}`;
      }
      return "自重辅助";
    }
    if (bodyweightSnapshot !== null && additionalLoadValue !== null) {
      return `自重${bodyweightSnapshot}kg + 附重${additionalLoadValue}${additionalLoadUnit}`;
    }
    if (bodyweightSnapshot !== null) {
      return `自重${bodyweightSnapshot}kg`;
    }
    if (additionalLoadValue !== null) {
      return `自重 + 附重${additionalLoadValue}${additionalLoadUnit}`;
    }
    return "自重";
  }

  const loadValue = toPositiveNumber(targetPayload.load_value);
  const loadUnit = typeof targetPayload.load_unit === "string" ? targetPayload.load_unit.trim() : "";
  const loadText = typeof targetPayload.load_text === "string" ? targetPayload.load_text.trim() : "";

  if (loadValue !== null) {
    return `${loadValue}${loadUnit || ""}`;
  }
  if (loadText) {
    return loadText;
  }
  if (loadUnit === "bodyweight") {
    return "自重";
  }
  return "";
}

function buildPrefilledSetRows(unit: PlannedSessionItem["planned_units"][number]): SetRowDraft[] {
  const targetPayload = toPlainRecord(unit.target_payload);
  const plannedSets = toPositiveNumber(targetPayload.sets) ?? 1;
  const plannedReps = toPositiveNumber(targetPayload.reps) ?? undefined;
  const plannedDurationSeconds = toPositiveNumber(targetPayload.duration_seconds) ?? undefined;
  const plannedLoadText = getLoadTextFromPayload(targetPayload);
  const timeBased = isTimeBasedUnit(unit);

  return Array.from({ length: plannedSets }).map((_, index) => ({
    setNo: index + 1,
    plannedLoadText,
    plannedReps,
    plannedDurationSeconds,
    actualLoadText: plannedLoadText,
    actualReps: timeBased ? "" : plannedReps ? String(plannedReps) : "",
    actualDurationSeconds: timeBased && plannedDurationSeconds ? String(plannedDurationSeconds) : "",
    skipped: false,
  }));
}

function parseLeadingNumber(text: string) {
  const match = text.trim().match(/^([+-]?\d+(\.\d+)?)/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toggleTagWithConflicts(prevTags: DeviationTag[], clickedTag: DeviationTag) {
  if (prevTags.includes(clickedTag)) {
    return prevTags.filter((tag) => tag !== clickedTag);
  }

  const conflicts = DEVIATION_CONFLICT_MAP[clickedTag] ?? [];
  const nextTags = prevTags.filter((tag) => !conflicts.includes(tag));
  nextTags.push(clickedTag);
  return nextTags;
}

function sanitizeDraftForStatus(draft: UnitDraft): UnitDraft {
  if (draft.completionStatus !== "skipped") {
    return draft;
  }

  return {
    ...draft,
    hasAdjustment: true,
    deviationTags: [],
    executionMethod: "",
    actualSets: "",
    actualReps: "",
    actualDurationSeconds: "",
    loadChange: "",
    addedSets: "",
    addedReps: "",
    replacedExerciseName: "",
    executionMethodNote: "",
    showSetDetails: false,
  };
}

function deriveDeviationSuggestionsFromSetRows(rows: SetRowDraft[]): DeviationTag[] {
  if (rows.length === 0) {
    return [];
  }

  const suggestions = new Set<DeviationTag>();
  const completedRows = rows.filter((row) => !row.skipped);

  if (completedRows.length < rows.length) {
    suggestions.add("less_sets");
  }

  rows.forEach((row) => {
    if (row.skipped) {
      return;
    }

    if (
      typeof row.plannedReps === "number" &&
      row.actualReps.trim().length > 0 &&
      !Number.isNaN(Number(row.actualReps)) &&
      Number(row.actualReps) < row.plannedReps
    ) {
      suggestions.add("less_reps");
    }

    if (
      typeof row.plannedDurationSeconds === "number" &&
      row.actualDurationSeconds.trim().length > 0 &&
      !Number.isNaN(Number(row.actualDurationSeconds)) &&
      Number(row.actualDurationSeconds) < row.plannedDurationSeconds
    ) {
      suggestions.add("less_duration");
    }

    const plannedLoad = parseLeadingNumber(row.plannedLoadText);
    const actualLoad = parseLeadingNumber(row.actualLoadText);
    if (plannedLoad !== null && actualLoad !== null) {
      if (actualLoad < plannedLoad) {
        suggestions.add("decrease_load");
      } else if (actualLoad > plannedLoad) {
        suggestions.add("increase_load");
      }
    }
  });

  return Array.from(suggestions);
}

function buildUnitDrafts(plannedSession: PlannedSessionItem | null) {
  if (!plannedSession) {
    return {} as Record<string, UnitDraft>;
  }

  return plannedSession.planned_units.reduce<Record<string, UnitDraft>>((acc, unit) => {
    acc[unit.id] = {
      completionStatus: "completed",
      notes: "",
      perceivedExertion: "",
      painScore: "",
      hasAdjustment: false,
      deviationTags: [],
      reasonTags: [],
      executionMethod: "",
      actualSets: "",
      actualReps: "",
      actualDurationSeconds: "",
      loadChange: "",
      addedSets: "",
      addedReps: "",
      replacedExerciseName: "",
      executionMethodNote: "",
      showSetDetails: false,
      setRows: buildPrefilledSetRows(unit),
    };
    return acc;
  }, {});
}

export function SessionExecutionEntryClient({
  userId,
  programId,
  plannedSessionId,
  returnTo,
  fromPlannedSessionId,
  resume,
}: SessionExecutionEntryClientProps) {
  const [plannedSession, setPlannedSession] = useState<PlannedSessionItem | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);

  const [overallFeeling, setOverallFeeling] = useState<OverallFeeling>("normal");
  const [performedAt, setPerformedAt] = useState(nowDateTimeInputValue);
  const [actualDurationMin, setActualDurationMin] = useState<string>("60");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  const [sessionResultMessage, setSessionResultMessage] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionExecutionId, setSessionExecutionId] = useState<string | null>(null);
  const [resumedExecution, setResumedExecution] = useState<LatestPlannedSessionExecutionResponse | null>(null);

  const [unitDrafts, setUnitDrafts] = useState<Record<string, UnitDraft>>({});
  const [unitSubmitting, setUnitSubmitting] = useState(false);
  const [unitResultMessage, setUnitResultMessage] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [latestSubmittedUnits, setLatestSubmittedUnits] = useState<SubmittedUnitExecutionRow[]>([]);
  const [setDraftsByUnitId, setSetDraftsByUnitId] = useState<SetDraftMap>({});
  const [loadingSetDetails, setLoadingSetDetails] = useState(false);
  const [setActionMessage, setSetActionMessage] = useState<string | null>(null);
  const [setActionError, setSetActionError] = useState<string | null>(null);
  const [savingSetIds, setSavingSetIds] = useState<Record<string, boolean>>({});
  const [addingSetByUnitId, setAddingSetByUnitId] = useState<Record<string, boolean>>({});

  const orderedUnits = useMemo(
    () => (plannedSession ? [...plannedSession.planned_units].sort((a, b) => a.sequence_no - b.sequence_no) : []),
    [plannedSession],
  );

  const fromToday = returnTo === "today";
  const returnPlannedSessionId = fromPlannedSessionId ?? plannedSessionId;

  const buildTodayReturnHref = () => {
    const query = new URLSearchParams({
      from: "execute",
      completedPlannedSessionId: returnPlannedSessionId,
    });
    if (sessionExecutionId) {
      query.set("sessionExecutionId", sessionExecutionId);
    }
    return `/today?${query.toString()}`;
  };

  const loadPlannedSession = useCallback(async () => {
    setLoadingSession(true);
    setSessionLoadError(null);

    try {
      const sessions = await listPlannedSessions(userId, programId);
      const target = sessions.find((session) => session.id === plannedSessionId);

      if (!target) {
        throw new Error(`未找到已安排训练：${plannedSessionId}`);
      }

      setPlannedSession(target);
      setUnitDrafts(buildUnitDrafts(target));
    } catch (loadError) {
      setSessionLoadError(loadError instanceof Error ? loadError.message : "加载已安排训练失败");
      setPlannedSession(null);
      setUnitDrafts({});
    } finally {
      setLoadingSession(false);
    }
  }, [plannedSessionId, programId, userId]);

  useEffect(() => {
    void loadPlannedSession();
  }, [loadPlannedSession]);

  useEffect(() => {
    if (resume !== "latest" || sessionExecutionId) {
      return;
    }

    let cancelled = false;

    const loadLatestExecution = async () => {
      try {
        const latest = await getLatestSessionExecutionByPlannedSession(plannedSessionId, userId);
        if (cancelled || !latest) {
          return;
        }

        setResumedExecution(latest);
        setSessionExecutionId(latest.id);
        setSessionResultMessage(
          latest.unit_execution_count > 0
            ? "已恢复最近一次训练执行记录，本次已有动作记录。"
            : "已恢复最近一次训练执行记录，可以继续第 2 步录入动作。",
        );
      } catch (resumeError) {
        if (cancelled) {
          return;
        }
        setSessionError(resumeError instanceof Error ? resumeError.message : "恢复最近训练执行记录失败");
      }
    };

    void loadLatestExecution();

    return () => {
      cancelled = true;
    };
  }, [plannedSessionId, resume, sessionExecutionId, userId]);

  const loadSetExecutionDetail = useCallback(async () => {
    if (!sessionExecutionId) {
      setSetDraftsByUnitId({});
      return;
    }

    setLoadingSetDetails(true);
    setSetActionError(null);
    try {
      const detail = await getSessionExecutionDetail(sessionExecutionId, userId);
      setSetDraftsByUnitId(toSetDraftMap(detail));
    } catch (loadError) {
      setSetActionError(loadError instanceof Error ? loadError.message : "加载组级执行记录失败");
    } finally {
      setLoadingSetDetails(false);
    }
  }, [sessionExecutionId, userId]);

  useEffect(() => {
    void loadSetExecutionDetail();
  }, [loadSetExecutionDetail]);

  const handleSessionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSessionSubmitting(true);
    setSessionResultMessage(null);
    setSessionError(null);

    try {
      const response = await createSessionExecution(plannedSessionId, {
        userId,
        performedAt: new Date(performedAt).toISOString(),
        overallFeeling,
        actualDurationMin: actualDurationMin ? Number(actualDurationMin) : undefined,
        notes: sessionNotes || undefined,
      });

      setResumedExecution(null);
      setSessionExecutionId(response.id);
      setSessionResultMessage("整次训练总结提交成功。");
    } catch (submitError) {
      setSessionError(submitError instanceof Error ? submitError.message : "提交失败");
    } finally {
      setSessionSubmitting(false);
    }
  };

  const handleUnitDraftChange = (
    plannedUnitId: string,
    field: keyof UnitDraft,
    value: string | UnitDraft["completionStatus"] | boolean,
  ) => {
    setUnitDrafts((current) => ({
      ...current,
      [plannedUnitId]: {
        ...(current[plannedUnitId] ?? {
          completionStatus: "completed",
          hasAdjustment: false,
          notes: "",
          perceivedExertion: "",
          painScore: "",
          deviationTags: [],
          reasonTags: [],
          executionMethod: "",
          actualSets: "",
          actualReps: "",
          actualDurationSeconds: "",
          loadChange: "",
          addedSets: "",
          addedReps: "",
          replacedExerciseName: "",
          executionMethodNote: "",
          showSetDetails: false,
          setRows: [],
        }),
        [field]: value,
      },
    }));
  };

  const handleSetUnitMainStatus = (
    plannedUnitId: string,
    status: "completed" | "partial" | "skipped",
  ) => {
    setUnitDrafts((current) => {
      const base = current[plannedUnitId];
      if (!base) {
        return current;
      }

      return {
        ...current,
        [plannedUnitId]: sanitizeDraftForStatus({
          ...base,
          completionStatus: status,
          hasAdjustment: status === "completed" ? base.hasAdjustment : true,
          showSetDetails:
            status === "skipped"
              ? false
              : status === "partial"
                ? true
                : base.showSetDetails,
        }),
      };
    });
  };

  const handleToggleDeviationTag = (
    plannedUnitId: string,
    tag: UnitDraft["deviationTags"][number],
  ) => {
    setUnitDrafts((current) => {
      const base = current[plannedUnitId];
      if (!base) {
        return current;
      }
      if (base.completionStatus === "skipped") {
        return current;
      }

      const nextTags = toggleTagWithConflicts(base.deviationTags, tag);
      return {
        ...current,
        [plannedUnitId]: {
          ...base,
          hasAdjustment: true,
          deviationTags: nextTags,
        },
      };
    });
  };

  const handleToggleReasonTag = (
    plannedUnitId: string,
    tag: UnitDraft["reasonTags"][number],
  ) => {
    setUnitDrafts((current) => {
      const base = current[plannedUnitId];
      if (!base) {
        return current;
      }

      const hasTag = base.reasonTags.includes(tag);
      return {
        ...current,
        [plannedUnitId]: {
          ...base,
          hasAdjustment: true,
          reasonTags: hasTag
            ? base.reasonTags.filter((item) => item !== tag)
            : [...base.reasonTags, tag],
        },
      };
    });
  };

  const handleSetRowChange = (
    plannedUnitId: string,
    setNo: number,
    field: "actualLoadText" | "actualReps" | "actualDurationSeconds" | "skipped",
    value: string | boolean,
  ) => {
    setUnitDrafts((current) => {
      const base = current[plannedUnitId];
      if (!base) {
        return current;
      }

      const nextRows = base.setRows.map((row) => {
        if (row.setNo !== setNo) {
          return row;
        }
        return {
          ...row,
          [field]: value,
        };
      });

      return {
        ...current,
        [plannedUnitId]: {
          ...base,
          hasAdjustment: true,
          setRows: nextRows,
        },
      };
    });
  };

  const handleApplySetSuggestions = (plannedUnitId: string) => {
    setUnitDrafts((current) => {
      const base = current[plannedUnitId];
      if (!base || base.completionStatus === "skipped") {
        return current;
      }

      const suggestions = deriveDeviationSuggestionsFromSetRows(base.setRows);
      if (suggestions.length === 0) {
        return current;
      }

      let nextTags = [...base.deviationTags];
      suggestions.forEach((tag) => {
        nextTags = toggleTagWithConflicts(nextTags, tag);
      });

      return {
        ...current,
        [plannedUnitId]: {
          ...base,
          hasAdjustment: true,
          deviationTags: nextTags,
        },
      };
    });
  };

  const handleMarkAllSkipped = () => {
    setUnitDrafts((current) => {
      const next: Record<string, UnitDraft> = {};
      Object.entries(current).forEach(([unitId, draft]) => {
        next[unitId] = sanitizeDraftForStatus({
          ...draft,
          completionStatus: "skipped",
          hasAdjustment: true,
        });
      });
      return next;
    });
  };

  const handleSetDraftFieldChange = (
    plannedUnitId: string,
    setId: string,
    field:
      | "actualRepsInput"
      | "actualWeightInput"
      | "actualRpeInput"
      | "actualRestSecondsInput"
      | "actualTempoInput"
      | "note",
    value: string,
  ) => {
    setSetDraftsByUnitId((current) => {
      const rows = current[plannedUnitId] ?? [];
      return {
        ...current,
        [plannedUnitId]: rows.map((row) => (row.id === setId ? { ...row, [field]: value } : row)),
      };
    });
  };

  const handleCompletePersistedSet = async (plannedUnitId: string, setId: string) => {
    if (!sessionExecutionId) {
      setSetActionError("请先完成第 1 步，再记录每组执行。");
      return;
    }

    const targetSet = (setDraftsByUnitId[plannedUnitId] ?? []).find((row) => row.id === setId);
    if (!targetSet) {
      setSetActionError("未找到该组记录，请刷新页面后重试。");
      return;
    }

    setSetActionError(null);
    setSetActionMessage(null);
    setSavingSetIds((current) => ({ ...current, [setId]: true }));

    try {
      const updated = await updateSessionExecutionSet(setId, {
        userId,
        actualReps: parseOptionalInteger(targetSet.actualRepsInput),
        actualWeight: parseOptionalDecimal(targetSet.actualWeightInput),
        actualRpe: parseOptionalDecimal(targetSet.actualRpeInput),
        actualRestSeconds: parseOptionalInteger(targetSet.actualRestSecondsInput),
        actualTempo: targetSet.actualTempoInput.trim() || undefined,
        status: "completed",
        note: targetSet.note.trim() || undefined,
      });

      setSetDraftsByUnitId((current) => {
        const rows = current[plannedUnitId] ?? [];
        return {
          ...current,
          [plannedUnitId]: rows
            .map((row) => (row.id === setId ? toPersistedSetDraft(updated) : row))
            .sort((a, b) => a.setIndex - b.setIndex),
        };
      });
      setSetActionMessage(`已完成第 ${targetSet.setIndex} 组记录。`);
    } catch (error) {
      setSetActionError(error instanceof Error ? error.message : "更新组记录失败");
    } finally {
      setSavingSetIds((current) => ({ ...current, [setId]: false }));
    }
  };

  const handleAddExtraPersistedSet = async (plannedUnitId: string) => {
    if (!sessionExecutionId) {
      setSetActionError("请先完成第 1 步，再新增临时加组。");
      return;
    }

    const currentSets = setDraftsByUnitId[plannedUnitId] ?? [];
    const basedOnSetId = currentSets.length > 0 ? currentSets[currentSets.length - 1].id : undefined;

    setSetActionError(null);
    setSetActionMessage(null);
    setAddingSetByUnitId((current) => ({ ...current, [plannedUnitId]: true }));

    try {
      const created = await addSessionExecutionSet({
        userId,
        sessionExecutionId,
        plannedUnitId,
        basedOnSetId,
        isExtraSet: true,
      });

      setSetDraftsByUnitId((current) => {
        const rows = current[plannedUnitId] ?? [];
        return {
          ...current,
          [plannedUnitId]: [...rows, toPersistedSetDraft(created)].sort(
            (a, b) => a.setIndex - b.setIndex,
          ),
        };
      });
      setSetActionMessage("已新增临时加组。");
    } catch (error) {
      setSetActionError(error instanceof Error ? error.message : "新增临时加组失败");
    } finally {
      setAddingSetByUnitId((current) => ({ ...current, [plannedUnitId]: false }));
    }
  };

  const handleUnitSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sessionExecutionId) {
      setUnitError("请先提交训练执行记录，再录入训练单元执行记录。");
      return;
    }

    if (!plannedSession || plannedSession.planned_units.length === 0) {
      setUnitError("当前已安排训练下没有可录入的已安排训练单元。");
      return;
    }

    if (resumedExecution && resumedExecution.unit_execution_count > 0) {
      setUnitError("当前训练执行记录已存在动作记录。请前往训练记录页继续编辑，避免重复提交。");
      return;
    }

    setUnitSubmitting(true);
    setUnitResultMessage(null);
    setUnitError(null);

    try {
      const unitExecutions = plannedSession.planned_units.map((unit) => {
        const draft = unitDrafts[unit.id];
        if (!draft) {
          throw new Error(`训练单元 #${unit.sequence_no} 草稿未初始化，请刷新后重试`);
        }
        const safeDraft = sanitizeDraftForStatus(draft);
        const perceivedExertion = safeDraft?.perceivedExertion?.trim()
          ? Number(safeDraft.perceivedExertion)
          : undefined;
        const painScore = safeDraft?.painScore?.trim() ? Number(safeDraft.painScore) : undefined;

        if (Number.isNaN(perceivedExertion)) {
          throw new Error(`训练单元 #${unit.sequence_no} 的主观用力程度不是有效数字`);
        }

        if (Number.isNaN(painScore)) {
          throw new Error(`训练单元 #${unit.sequence_no} 的疼痛评分不是有效数字`);
        }
        if (typeof painScore === "number" && !Number.isInteger(painScore)) {
          throw new Error(`训练单元 #${unit.sequence_no} 的疼痛评分需要是整数`);
        }

        if (
          safeDraft.completionStatus === "partial" &&
          safeDraft.deviationTags.length === 0 &&
          safeDraft.reasonTags.length === 0 &&
          !safeDraft.notes.trim()
        ) {
          throw new Error(`训练单元 #${unit.sequence_no} 为“部分完成”时，至少补充偏差、原因或备注`);
        }

        const timeBased = isTimeBasedUnit(unit);
        const setDetails =
          safeDraft.showSetDetails && safeDraft.completionStatus !== "skipped"
            ? safeDraft.setRows.map((row) => ({
                set_no: row.setNo,
                skipped: row.skipped,
                planned_load_text: row.plannedLoadText,
                planned_reps: row.plannedReps ?? null,
                planned_duration_seconds: row.plannedDurationSeconds ?? null,
                actual_load_text: row.actualLoadText.trim() || row.plannedLoadText,
                actual_reps:
                  !timeBased && row.actualReps.trim() ? Number(row.actualReps) : null,
                actual_duration_seconds:
                  timeBased && row.actualDurationSeconds.trim()
                    ? Number(row.actualDurationSeconds)
                    : null,
              }))
            : [];

        const completedRows = setDetails.filter((row) => !row.skipped);
        const minActualReps =
          !timeBased &&
          completedRows.length > 0 &&
          completedRows.some((row) => typeof row.actual_reps === "number")
            ? Math.min(
                ...completedRows
                  .map((row) => row.actual_reps)
                  .filter((value): value is number => typeof value === "number"),
              )
            : undefined;
        const minActualDurationSeconds =
          timeBased &&
          completedRows.length > 0 &&
          completedRows.some((row) => typeof row.actual_duration_seconds === "number")
            ? Math.min(
                ...completedRows
                  .map((row) => row.actual_duration_seconds)
                  .filter((value): value is number => typeof value === "number"),
              )
            : undefined;

        const actualSets = safeDraft.actualSets.trim()
          ? Number(safeDraft.actualSets)
          : setDetails.length > 0 && safeDraft.deviationTags.includes("less_sets")
            ? completedRows.length
            : undefined;
        const actualReps = safeDraft.actualReps.trim()
          ? Number(safeDraft.actualReps)
          : safeDraft.deviationTags.includes("less_reps")
            ? minActualReps
            : undefined;
        const actualDurationSeconds = safeDraft.actualDurationSeconds.trim()
          ? Number(safeDraft.actualDurationSeconds)
          : safeDraft.deviationTags.includes("less_duration")
            ? minActualDurationSeconds
          : undefined;
        const addedSets = safeDraft.addedSets.trim() ? Number(safeDraft.addedSets) : undefined;
        const addedReps = safeDraft.addedReps.trim() ? Number(safeDraft.addedReps) : undefined;

        if (Number.isNaN(actualSets) || Number.isNaN(actualReps) || Number.isNaN(actualDurationSeconds)) {
          throw new Error(`训练单元 #${unit.sequence_no} 的实际值需要是数字`);
        }
        if (Number.isNaN(addedSets) || Number.isNaN(addedReps)) {
          throw new Error(`训练单元 #${unit.sequence_no} 的加组/加次数需要是数字`);
        }

        return {
          plannedUnitId: unit.id,
          completionStatus: safeDraft?.completionStatus ?? "completed",
          notes: safeDraft?.notes?.trim() ? safeDraft.notes.trim() : undefined,
          perceivedExertion,
          painScore,
          checkoff: {
            deviationTags: safeDraft.deviationTags,
            executionMethod: safeDraft.executionMethod || undefined,
            reasonTags: safeDraft.reasonTags,
            actualSets,
            actualReps,
            actualDurationSeconds,
            loadChange: safeDraft.loadChange || undefined,
            addedSets,
            addedReps,
            replacedExerciseName: safeDraft.replacedExerciseName.trim() || undefined,
            executionMethodNote: safeDraft.executionMethodNote.trim() || undefined,
            notes: safeDraft.notes.trim() || undefined,
          },
          actualPayload: {
            source: "execution_checkoff_v1_entry",
            plannedUnitId: unit.id,
            plannedUnitName: unit.selected_exercise_name,
            set_details: setDetails.length > 0 ? setDetails : undefined,
          },
        };
      });

      const response = await createUnitExecutions(sessionExecutionId, {
        userId,
        unitExecutions,
      });

      const plannedUnitInfoMap = new Map(
        plannedSession.planned_units.map((unit) => [
          unit.id,
          {
            name: unit.selected_exercise_name ?? "未命名单元",
            exerciseLibraryItemId: getUnitExerciseLibraryItemId(unit),
          },
        ]),
      );
      setLatestSubmittedUnits(
        response.map((item) => ({
          unitExecutionId: item.id,
          plannedUnitId: item.planned_unit_id,
          plannedUnitName: item.planned_unit_id
            ? (plannedUnitInfoMap.get(item.planned_unit_id)?.name ?? "未命名单元")
            : "未关联训练单元",
          exerciseLibraryItemId: item.planned_unit_id
            ? (plannedUnitInfoMap.get(item.planned_unit_id)?.exerciseLibraryItemId ?? null)
            : null,
          completionStatus: item.completion_status,
          notes: item.notes,
          perceivedExertion: item.perceived_exertion,
          painScore: item.pain_score,
        })),
      );
      setResumedExecution((current) =>
        current
          ? {
              ...current,
              unit_execution_count: response.length,
            }
          : current,
      );
      setUnitResultMessage(`提交成功，已创建 ${response.length} 条训练单元执行记录，并刷新计划状态。`);
      await loadPlannedSession();
    } catch (submitError) {
      setUnitError(submitError instanceof Error ? submitError.message : "训练单元执行记录提交失败");
    } finally {
      setUnitSubmitting(false);
    }
  };

  const hasSessionSubmitted = !!sessionExecutionId;
  const hasUnitSubmitted = latestSubmittedUnits.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.execute}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {fromToday ? (
            <Link href="/today" className="text-blue-700 underline">
              返回今日训练页
            </Link>
          ) : null}
          <Link href="/progression-matrix" className="text-blue-700 underline">
            查看进步矩阵 →
          </Link>
          <Link href={`/programs/${programId}/planned-sessions`} className="text-blue-700 underline">
            返回已安排训练
          </Link>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">录入流程说明</p>
        <p className="mt-1">第 1 步先提交整次训练总结（整体感受/时长/备注）。</p>
        <p>第 2 步再按动作逐项核销：先选主状态，只有偏差时再补充填写。</p>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">当前训练上下文</p>
        {plannedSession ? (
          <>
            <p className="mt-1">
              训练日期：{formatSessionDateLabel(plannedSession.session_date)} | 训练编号 #
              {plannedSession.sequence_index}
            </p>
            <p>当前训练状态：{getSessionStatusLabel(plannedSession.status)}</p>
          </>
        ) : (
          <p className="mt-1">正在加载本次已安排训练信息...</p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href={`/programs/${programId}/planned-sessions/${plannedSessionId}/plan`} className="text-blue-700 underline">
            查看并确认计划（可微调）
          </Link>
          <Link href={`/programs/${programId}/planned-sessions`} className="text-blue-700 underline">
            返回已安排训练
          </Link>
          {sessionExecutionId ? (
            <Link href={`/executions/${sessionExecutionId}`} className="text-blue-700 underline">
              打开训练记录详情
            </Link>
          ) : null}
        </div>
      </div>

      {loadingSession ? <p className="text-sm text-zinc-600">正在加载已安排训练与训练单元...</p> : null}
      {sessionLoadError ? <p className="text-sm text-red-600">{sessionLoadError}</p> : null}

      <SectionBlock>
      <form onSubmit={handleSessionSubmit} className="space-y-3">
        <p className="text-sm font-medium text-zinc-900">第 1 步：提交整次训练总结</p>

        <label className="block text-sm text-zinc-700">
          本次训练整体感受
          <select
            value={overallFeeling}
            onChange={(event) => setOverallFeeling(event.target.value as OverallFeeling)}
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          >
            <option value="easy">轻松</option>
            <option value="normal">正常</option>
            <option value="hard">困难</option>
          </select>
        </label>

        <label className="block text-sm text-zinc-700">
          执行时间
          <input
            type="datetime-local"
            value={performedAt}
            onChange={(event) => setPerformedAt(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>

        <label className="block text-sm text-zinc-700">
          实际时长（分钟）
          <input
            type="number"
            min={1}
            value={actualDurationMin}
            onChange={(event) => setActualDurationMin(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>

        <label className="block text-sm text-zinc-700">
          备注
          <textarea
            value={sessionNotes}
            onChange={(event) => setSessionNotes(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            rows={3}
          />
        </label>

        <button
          type="submit"
          disabled={sessionSubmitting || !!sessionLoadError}
          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {sessionSubmitting ? "提交中..." : "提交整次训练总结"}
        </button>
      </form>
      </SectionBlock>

      {sessionResultMessage ? <InlineAlert tone="success">{sessionResultMessage}</InlineAlert> : null}
      {sessionError ? <InlineAlert tone="error">{sessionError}</InlineAlert> : null}

      {sessionExecutionId ? (
        <InlineAlert tone="success">
          <p>整次训练总结已提交，可继续第 2 步按动作录入。</p>
          <a href="#unit-execution-step" className="mt-1 inline-block underline">
            继续到第 2 步（按动作录入）
          </a>
          {resumedExecution && resumedExecution.unit_execution_count > 0 ? (
            <p className="mt-1 text-amber-700">
              当前记录已提交过动作明细，请改去训练记录页做逐条编辑。
            </p>
          ) : null}
        </InlineAlert>
      ) : (
        <InlineAlert tone="warn">
          请先完成第 1 步，才能提交训练单元执行记录。
        </InlineAlert>
      )}

      <form
        id="unit-execution-step"
        onSubmit={handleUnitSubmit}
        className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-zinc-900">第 2 步：按动作逐项核销（主状态 + 偏差）</p>
            <p className="text-xs text-zinc-600">
              每个动作先选“已完成/部分完成/未做”，默认按计划完成，发生偏差时再补充。
            </p>
          </div>
          <button
            type="button"
            onClick={handleMarkAllSkipped}
            disabled={!sessionExecutionId || unitSubmitting}
            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 disabled:opacity-60"
          >
            一键全部标记未做
          </button>
        </div>
        {setActionMessage ? <p className="text-xs text-green-700">{setActionMessage}</p> : null}
        {setActionError ? <p className="text-xs text-red-600">{setActionError}</p> : null}

        {orderedUnits.length > 0 ? (
          <ul className="space-y-3">
            {orderedUnits.map((unit) => {
              const draft = unitDrafts[unit.id];
              if (!draft) {
                return null;
              }
              const persistedSets = setDraftsByUnitId[unit.id] ?? [];
              const setTrackingEligible = isSetTrackingEligibleUnit(unit);
              const allPersistedSetsCompleted =
                persistedSets.length > 0 &&
                persistedSets.every((setDraft) => setDraft.status === "completed");

              const showConditional = draft.completionStatus !== "completed" || draft.hasAdjustment;
              const showSkippedOnly = draft.completionStatus === "skipped";
              const showSetDetails = draft.showSetDetails && !showSkippedOnly;
              const showActualSetsInput = draft.deviationTags.includes("less_sets");
              const showActualRepsInput = draft.deviationTags.includes("less_reps") && !showSetDetails && !isTimeBasedUnit(unit);
              const showActualDurationInput =
                draft.deviationTags.includes("less_duration") && !showSetDetails && isTimeBasedUnit(unit);
              const showAddedSetsInput = draft.deviationTags.includes("add_sets");
              const showAddedRepsInput = draft.deviationTags.includes("add_reps");
              const showWeightChangeInput =
                draft.deviationTags.includes("increase_load") || draft.deviationTags.includes("decrease_load");
              const showReplaceExerciseInput = draft.deviationTags.includes("replace_exercise");
              const showExecutionMethodInput = draft.deviationTags.includes("execution_method_change");
              const suggestionTags = showSetDetails
                ? deriveDeviationSuggestionsFromSetRows(draft.setRows).filter(
                    (tag) => !draft.deviationTags.includes(tag),
                  )
                : [];

              return (
                <li key={unit.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-medium text-zinc-900">
                    训练单元 #{unit.sequence_no}：
                    {" "}
                    <ExerciseNameLink
                      name={unit.selected_exercise_name ?? "未命名单元"}
                      exerciseLibraryItemId={getUnitExerciseLibraryItemId(unit)}
                        className="text-blue-700 underline"
                      unknownHintClassName="ml-1 text-[11px] text-zinc-500"
                    />
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">已安排状态：{getSessionStatusLabel(unit.status)}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    计划值：{getPlanSummary(unit)}
                  </p>

                  {setTrackingEligible ? (
                  <div className="mt-3 rounded border border-zinc-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-zinc-900">组级执行（基础）</p>
                      <button
                        type="button"
                        onClick={() => void handleAddExtraPersistedSet(unit.id)}
                        disabled={!sessionExecutionId || addingSetByUnitId[unit.id] === true}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 disabled:opacity-60"
                      >
                        {addingSetByUnitId[unit.id] ? "新增中..." : "新增一组"}
                      </button>
                    </div>

                    {loadingSetDetails ? (
                      <p className="mt-2 text-xs text-zinc-500">组级记录加载中...</p>
                    ) : persistedSets.length === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">该动作暂无组级记录。</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {persistedSets.map((setDraft) => {
                          const isSaving = savingSetIds[setDraft.id] === true;
                          return (
                            <div
                              key={setDraft.id}
                              className="flex flex-wrap items-center gap-2 rounded border border-zinc-100 bg-zinc-50 px-2 py-2 text-xs text-zinc-700"
                            >
                              <span>
                                组{setDraft.setIndex}
                                {setDraft.isExtraSet ? "（extra）" : ""}：
                              </span>
                              <span>计划 {formatPlannedSetSummary(setDraft)}</span>
                              <span>｜实际</span>
                              <input
                                type="number"
                                min={0}
                                value={setDraft.actualRepsInput}
                                onChange={(event) =>
                                  handleSetDraftFieldChange(
                                    unit.id,
                                    setDraft.id,
                                    "actualRepsInput",
                                    event.target.value,
                                  )
                                }
                                placeholder="次数"
                                className="w-16 rounded border border-zinc-300 px-2 py-1"
                              />
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={setDraft.actualWeightInput}
                                onChange={(event) =>
                                  handleSetDraftFieldChange(
                                    unit.id,
                                    setDraft.id,
                                    "actualWeightInput",
                                    event.target.value,
                                  )
                                }
                                placeholder="重量"
                                className="w-20 rounded border border-zinc-300 px-2 py-1"
                              />
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.5}
                                value={setDraft.actualRpeInput}
                                onChange={(event) =>
                                  handleSetDraftFieldChange(
                                    unit.id,
                                    setDraft.id,
                                    "actualRpeInput",
                                    event.target.value,
                                  )
                                }
                                placeholder="RPE"
                                className="w-16 rounded border border-zinc-300 px-2 py-1"
                              />
                              <input
                                type="number"
                                min={0}
                                value={setDraft.actualRestSecondsInput}
                                onChange={(event) =>
                                  handleSetDraftFieldChange(
                                    unit.id,
                                    setDraft.id,
                                    "actualRestSecondsInput",
                                    event.target.value,
                                  )
                                }
                                placeholder="休息秒"
                                className="w-20 rounded border border-zinc-300 px-2 py-1"
                              />
                              <input
                                type="text"
                                value={setDraft.actualTempoInput}
                                onChange={(event) =>
                                  handleSetDraftFieldChange(
                                    unit.id,
                                    setDraft.id,
                                    "actualTempoInput",
                                    event.target.value,
                                  )
                                }
                                placeholder="Tempo"
                                className="w-24 rounded border border-zinc-300 px-2 py-1"
                              />
                              <button
                                type="button"
                                onClick={() => void handleCompletePersistedSet(unit.id, setDraft.id)}
                                disabled={isSaving}
                                className="rounded border border-emerald-300 px-2 py-1 text-emerald-700 disabled:opacity-60"
                              >
                                {isSaving ? "保存中..." : "完成"}
                              </button>
                              <span className="text-zinc-500">状态：{getSetStatusLabel(setDraft.status)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {allPersistedSetsCompleted ? (
                      <p className="mt-2 text-xs text-emerald-700">该动作所有组均已完成。</p>
                    ) : null}
                  </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetUnitMainStatus(unit.id, "completed")}
                      className={`rounded border px-2 py-1 text-xs ${
                        draft?.completionStatus === "completed"
                          ? "border-emerald-400 bg-emerald-100 text-emerald-800"
                          : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                    >
                      已完成
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetUnitMainStatus(unit.id, "partial")}
                      className={`rounded border px-2 py-1 text-xs ${
                        draft?.completionStatus === "partial"
                          ? "border-amber-400 bg-amber-100 text-amber-800"
                          : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                    >
                      部分完成
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetUnitMainStatus(unit.id, "skipped")}
                      className={`rounded border px-2 py-1 text-xs ${
                        draft?.completionStatus === "skipped"
                          ? "border-zinc-500 bg-zinc-200 text-zinc-800"
                          : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                    >
                      未做
                    </button>
                    {draft?.completionStatus === "completed" ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleUnitDraftChange(unit.id, "hasAdjustment", !(draft?.hasAdjustment ?? false))
                        }
                        className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
                      >
                        {draft?.hasAdjustment ? "收起调整" : "有调整"}
                      </button>
                    ) : null}
                    {!showSkippedOnly ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleUnitDraftChange(unit.id, "showSetDetails", !draft.showSetDetails)
                        }
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700"
                      >
                        {showSetDetails ? "收起组级明细" : "展开组级明细（按计划预填）"}
                      </button>
                    ) : null}
                  </div>

                  {showSetDetails ? (
                    <div className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-white p-2">
                      <table className="min-w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-600">
                            <th className="px-2 py-2 text-left font-medium">组次</th>
                            <th className="px-2 py-2 text-left font-medium">计划重量</th>
                            <th className="px-2 py-2 text-left font-medium">
                              {isTimeBasedUnit(unit) ? "计划时长（秒）" : "计划次数"}
                            </th>
                            <th className="px-2 py-2 text-left font-medium">实际重量</th>
                            <th className="px-2 py-2 text-left font-medium">
                              {isTimeBasedUnit(unit) ? "实际时长（秒）" : "实际次数"}
                            </th>
                            <th className="px-2 py-2 text-left font-medium">本组未做</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.setRows.map((row) => (
                            <tr key={`${unit.id}-set-${row.setNo}`} className="border-b border-zinc-100">
                              <td className="px-2 py-2">第 {row.setNo} 组</td>
                              <td className="px-2 py-2">{row.plannedLoadText || "-"}</td>
                              <td className="px-2 py-2">
                                {isTimeBasedUnit(unit) ? (row.plannedDurationSeconds ?? "-") : (row.plannedReps ?? "-")}
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  value={row.actualLoadText}
                                  disabled={row.skipped}
                                  onChange={(event) =>
                                    handleSetRowChange(unit.id, row.setNo, "actualLoadText", event.target.value)
                                  }
                                  className="w-24 rounded border border-zinc-300 px-2 py-1 disabled:bg-zinc-100"
                                />
                              </td>
                              <td className="px-2 py-2">
                                {isTimeBasedUnit(unit) ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.actualDurationSeconds}
                                    disabled={row.skipped}
                                    onChange={(event) =>
                                      handleSetRowChange(
                                        unit.id,
                                        row.setNo,
                                        "actualDurationSeconds",
                                        event.target.value,
                                      )
                                    }
                                    className="w-20 rounded border border-zinc-300 px-2 py-1 disabled:bg-zinc-100"
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.actualReps}
                                    disabled={row.skipped}
                                    onChange={(event) =>
                                      handleSetRowChange(unit.id, row.setNo, "actualReps", event.target.value)
                                    }
                                    className="w-20 rounded border border-zinc-300 px-2 py-1 disabled:bg-zinc-100"
                                  />
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <label className="inline-flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={row.skipped}
                                    onChange={(event) =>
                                      handleSetRowChange(unit.id, row.setNo, "skipped", event.target.checked)
                                    }
                                  />
                                  未做
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {suggestionTags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-700">
                          <span>
                            系统识别偏差：
                            {suggestionTags
                              .map((tag) => DEVIATION_OPTIONS.find((option) => option.value === tag)?.label ?? tag)
                              .join("、")}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApplySetSuggestions(unit.id)}
                            className="rounded border border-blue-300 px-2 py-1 text-blue-700"
                          >
                            一键应用标签
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!showSkippedOnly ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-zinc-700">
                        主观用力程度（RPE，0-10）
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={draft.perceivedExertion}
                          onChange={(event) =>
                            handleUnitDraftChange(unit.id, "perceivedExertion", event.target.value)
                          }
                          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                        />
                      </label>

                      <label className="text-xs text-zinc-700">
                        疼痛评分（0-10）
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={1}
                          value={draft.painScore}
                          onChange={(event) => handleUnitDraftChange(unit.id, "painScore", event.target.value)}
                          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                        />
                      </label>
                    </div>
                  ) : null}

                  <label className="mt-3 block text-xs text-zinc-700">
                    备注
                    <textarea
                      value={draft.notes}
                      onChange={(event) => handleUnitDraftChange(unit.id, "notes", event.target.value)}
                      className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                      rows={2}
                    />
                  </label>

                  {showConditional ? (
                    <div className="mt-3 space-y-3 rounded border border-zinc-200 bg-white p-3">
                      {!showSkippedOnly ? (
                        <>
                          <div>
                            <p className="text-xs font-medium text-zinc-800">偏差标签（可多选）</p>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              互斥规则：少做组数↔加组，少做次数↔加次数，加重↔降重。选择新标签会自动取消冲突标签。
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {DEVIATION_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => handleToggleDeviationTag(unit.id, option.value)}
                                  disabled={showSkippedOnly && SKIPPED_FORBIDDEN_DEVIATIONS.includes(option.value)}
                                  className={`rounded border px-2 py-1 text-xs ${
                                    draft.deviationTags.includes(option.value)
                                      ? "border-blue-400 bg-blue-100 text-blue-800"
                                      : "border-zinc-300 bg-white text-zinc-700"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            {showActualSetsInput ? (
                              <label className="text-xs text-zinc-700">
                                实际完成组数
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.actualSets}
                                  onChange={(event) => handleUnitDraftChange(unit.id, "actualSets", event.target.value)}
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                />
                              </label>
                            ) : null}

                            {showActualRepsInput ? (
                              <label className="text-xs text-zinc-700">
                                实际完成次数
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.actualReps}
                                  onChange={(event) => handleUnitDraftChange(unit.id, "actualReps", event.target.value)}
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                />
                              </label>
                            ) : null}

                            {showActualDurationInput ? (
                              <label className="text-xs text-zinc-700">
                                实际时长（秒）
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.actualDurationSeconds}
                                  onChange={(event) =>
                                    handleUnitDraftChange(unit.id, "actualDurationSeconds", event.target.value)
                                  }
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                />
                              </label>
                            ) : null}

                            {showWeightChangeInput ? (
                              <label className="text-xs text-zinc-700">
                                重量变化
                                <select
                                  value={draft.loadChange}
                                  onChange={(event) =>
                                    handleUnitDraftChange(
                                      unit.id,
                                      "loadChange",
                                      event.target.value as "" | "increase" | "decrease",
                                    )
                                  }
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                >
                                  <option value="">请选择</option>
                                  <option value="increase">加重</option>
                                  <option value="decrease">降重</option>
                                </select>
                              </label>
                            ) : null}

                            {showAddedSetsInput ? (
                              <label className="text-xs text-zinc-700">
                                加组数量
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.addedSets}
                                  onChange={(event) => handleUnitDraftChange(unit.id, "addedSets", event.target.value)}
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                />
                              </label>
                            ) : null}

                            {showAddedRepsInput ? (
                              <label className="text-xs text-zinc-700">
                                加次数数量
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.addedReps}
                                  onChange={(event) => handleUnitDraftChange(unit.id, "addedReps", event.target.value)}
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                />
                              </label>
                            ) : null}

                            {showExecutionMethodInput ? (
                              <>
                                <label className="text-xs text-zinc-700">
                                  执行方式变化
                                  <select
                                    value={draft.executionMethod}
                                    onChange={(event) =>
                                      handleUnitDraftChange(
                                        unit.id,
                                        "executionMethod",
                                        event.target.value as "" | "superset" | "drop_set" | "rest_pause" | "other",
                                      )
                                    }
                                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                  >
                                    <option value="">请选择</option>
                                    {EXECUTION_METHOD_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs text-zinc-700 sm:col-span-2">
                                  执行方式补充说明
                                  <input
                                    type="text"
                                    value={draft.executionMethodNote}
                                    onChange={(event) =>
                                      handleUnitDraftChange(unit.id, "executionMethodNote", event.target.value)
                                    }
                                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                  />
                                </label>
                              </>
                            ) : null}

                            {showReplaceExerciseInput ? (
                              <label className="text-xs text-zinc-700 sm:col-span-2">
                                替换动作名称
                                <input
                                  type="text"
                                  value={draft.replacedExerciseName}
                                  onChange={(event) =>
                                    handleUnitDraftChange(unit.id, "replacedExerciseName", event.target.value)
                                  }
                                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                                />
                              </label>
                            ) : null}
                          </div>
                        </>
                      ) : <p className="text-xs text-zinc-600">未做状态下仅记录原因与备注。</p>}

                      <div>
                        <p className="text-xs font-medium text-zinc-800">原因标签（可多选）</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {REASON_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handleToggleReasonTag(unit.id, option.value)}
                              className={`rounded border px-2 py-1 text-xs ${
                                draft.reasonTags.includes(option.value)
                                  ? "border-violet-400 bg-violet-100 text-violet-800"
                                  : "border-zinc-300 bg-white text-zinc-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">当前已安排训练没有关联训练单元。</p>
        )}

        <button
          type="submit"
          disabled={
            unitSubmitting ||
            !sessionExecutionId ||
            orderedUnits.length === 0 ||
            !!sessionLoadError ||
            !!(resumedExecution && resumedExecution.unit_execution_count > 0)
          }
          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {unitSubmitting ? "提交中..." : "提交训练单元执行记录"}
        </button>
      </form>

      {unitResultMessage ? <p className="text-sm text-green-700">{unitResultMessage}</p> : null}
      {unitError ? <p className="text-sm text-red-600">{unitError}</p> : null}

      {hasSessionSubmitted ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium text-emerald-900">
            {hasUnitSubmitted
              ? "本次训练记录已完成提交（训练 + 训练单元）。"
              : "训练执行记录已提交，可继续补全训练单元执行记录。"}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {fromToday ? (
              <Link href={buildTodayReturnHref()} className="text-emerald-900 underline">
                返回今日训练页（查看刚完成结果）
              </Link>
            ) : null}
            {sessionExecutionId ? (
              <Link href={`/executions/${sessionExecutionId}`} className="text-emerald-900 underline">
                查看训练记录详情
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {latestSubmittedUnits.length > 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">本次已提交训练单元执行记录（只读）</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-600">
                  <th className="px-2 py-2 font-medium">已安排训练单元 / 名称</th>
                  <th className="px-2 py-2 font-medium">完成状态</th>
                  <th className="px-2 py-2 font-medium">备注</th>
                  <th className="px-2 py-2 font-medium">主观用力程度（RPE）</th>
                  <th className="px-2 py-2 font-medium">疼痛评分</th>
                </tr>
              </thead>
              <tbody>
                {latestSubmittedUnits.map((item) => (
                  <tr key={item.unitExecutionId} className="border-b border-zinc-100 align-top">
                    <td className="px-2 py-2 text-zinc-800">
                      <p>
                        <ExerciseNameLink
                          name={item.plannedUnitName}
                          exerciseLibraryItemId={item.exerciseLibraryItemId}
                            className="text-blue-700 underline"
                          unknownHintClassName="ml-1 text-[11px] text-zinc-500"
                        />
                      </p>
                      <p className="text-xs text-zinc-500">{item.plannedUnitId ?? "未关联训练单元编号"}</p>
                    </td>
                    <td className="px-2 py-2 text-zinc-700">{getUnitExecutionStatusLabel(item.completionStatus)}</td>
                    <td className="px-2 py-2 text-zinc-700">{item.notes?.trim() ? item.notes : "-"}</td>
                    <td className="px-2 py-2 text-zinc-700">{item.perceivedExertion ?? "-"}</td>
                    <td className="px-2 py-2 text-zinc-700">{item.painScore ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {plannedSession ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <p className="font-medium text-zinc-900">当前计划状态（提交后可观察回写）</p>
          <p className="mt-1">已安排训练状态：{getSessionStatusLabel(plannedSession.status)}</p>
          <ul className="mt-2 space-y-1">
            {orderedUnits.map((unit) => (
              <li key={`status-${unit.id}`}>
                训练单元 #{unit.sequence_no}（
                <ExerciseNameLink
                  name={unit.selected_exercise_name ?? "未命名单元"}
                  exerciseLibraryItemId={getUnitExerciseLibraryItemId(unit)}
                    className="text-blue-700 underline"
                  unknownHintClassName="ml-1 text-[11px] text-zinc-500"
                />
                ）：{getSessionStatusLabel(unit.status)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
