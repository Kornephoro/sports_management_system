
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ExerciseNameLink } from "@/features/exercise-library/exercise-link";
import {
  clearExecutionLocalDraft,
  clearExecutionWorkbenchDraft,
  clearExecutionWorkbenchUiState,
  clearExecutionRestDraft,
  ExecutionDraftScope,
  getExecutionLocalDraftSnapshot,
  getExecutionWorkbenchUiStateSnapshot,
  removeExecutionSetDraft,
  RestPresentation,
  saveExecutionWorkbenchDraft,
  saveExecutionWorkbenchUiState,
  saveExecutionRestDraft,
  saveExecutionSetDraft,
} from "@/features/executions/hooks/execution-local-draft";
import { useRestTimer } from "@/features/executions/hooks/use-rest-timer";
import { useEdgeSnapBubble } from "@/features/shared/hooks/use-edge-snap-bubble";
import { InlineAlert } from "@/features/shared/components/ui-primitives";
import {
  addSessionExecutionSet,
  bootstrapSessionExecutionWorkbench,
  finalizeSessionExecution,
  FinalizeSessionExecutionResponse,
  PlannedSessionItem,
  SessionExecutionSet,
  SessionExecutionSetStatus,
  updateSessionExecutionSet,
} from "@/features/sessions/sessions-api";
import { TERMS_ZH } from "@/features/shared/ui-zh";

type Props = {
  userId: string;
  programId: string;
  plannedSessionId: string;
  returnTo?: string;
  fromPlannedSessionId?: string;
};

type Cursor = { plannedUnitId: string; setId: string };
type UnitStatus = "pending" | "in_progress" | "completed" | "skipped";
type WorkbenchPhase = "set_active" | "rest_active" | "session_done";
type WorkbenchSessionState = "not_started" | "active" | "resting" | "paused" | "completed";
type RestContext = {
  sourceSetId: string;
  startedAtMs: number;
  accumulatedMs: number;
  runningFromMs: number | null;
  committed: boolean;
};

type Row = {
  id: string;
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
  actualRestInput: string;
  actualTempoInput: string;
  status: SessionExecutionSetStatus;
  isExtraSet: boolean;
};

type RowMap = Record<string, Row[]>;

const DEFAULT_WEIGHT_STEP = 2.5;
const MIN_RPE = 6;
const MAX_RPE = 10;
const RPE_STEP = 0.5;
const QUICK_RPE_OPTIONS = [7, 8, 9, 10] as const;

function asText(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
}

function toPlainRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
}

function toOptionalInt(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("请输入非负整数");
  return parsed;
}

function toOptionalNumber(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("请输入非负数字");
  return parsed;
}

function normalizeRpe(value: number) {
  const stepped = Math.round(value / RPE_STEP) * RPE_STEP;
  return Math.max(MIN_RPE, Math.min(MAX_RPE, stepped));
}

function formatRpeValue(value: number) {
  const normalized = normalizeRpe(value);
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

function orderedRows(rows: Row[]) {
  return [...rows].sort((a, b) => a.setIndex - b.setIndex);
}

function isDone(row: Row) {
  return row.status === "completed" || row.status === "skipped";
}

function getUnitStatus(rows: Row[]): UnitStatus {
  if (rows.length === 0) return "pending";
  const completed = rows.filter((row) => row.status === "completed").length;
  const skipped = rows.filter((row) => row.status === "skipped").length;
  if (completed === rows.length) return "completed";
  if (skipped === rows.length) return "skipped";
  if (completed > 0 || skipped > 0) return "in_progress";
  return "pending";
}

function findFirstPendingCursor(unitIds: string[], rowsByUnit: RowMap): Cursor | null {
  for (const unitId of unitIds) {
    const row = orderedRows(rowsByUnit[unitId] ?? []).find((item) => !isDone(item));
    if (row) return { plannedUnitId: unitId, setId: row.id };
  }
  return null;
}

function findNextCursor(unitIds: string[], rowsByUnit: RowMap, current: Cursor): Cursor | null {
  const flattened = unitIds.flatMap((unitId) => orderedRows(rowsByUnit[unitId] ?? []).map((row) => ({ unitId, row })));
  const currentIndex = flattened.findIndex((item) => item.unitId === current.plannedUnitId && item.row.id === current.setId);
  if (currentIndex >= 0) {
    for (let index = currentIndex + 1; index < flattened.length; index += 1) {
      if (!isDone(flattened[index].row)) {
        return { plannedUnitId: flattened[index].unitId, setId: flattened[index].row.id };
      }
    }
  }
  return findFirstPendingCursor(unitIds, rowsByUnit);
}

function toRow(setRow: SessionExecutionSet): Row {
  return {
    id: setRow.id,
    setIndex: setRow.set_index,
    plannedSetType: setRow.planned_set_type,
    plannedReps: setRow.planned_reps,
    plannedWeight: setRow.planned_weight,
    plannedRpe: setRow.planned_rpe,
    plannedRestSeconds: setRow.planned_rest_seconds,
    plannedTempo: setRow.planned_tempo,
    actualRepsInput: asText(setRow.actual_reps),
    actualWeightInput: asText(setRow.actual_weight),
    actualRpeInput: asText(setRow.actual_rpe),
    actualRestInput: asText(setRow.actual_rest_seconds),
    actualTempoInput: asText(setRow.actual_tempo),
    status: setRow.status,
    isExtraSet: setRow.is_extra_set,
  };
}

function applySetDraftsToRows(rowsByUnit: RowMap, draftBySetId: Record<string, { actualWeightInput: string; actualRpeInput: string; actualRepsInput: string }>) {
  const next: RowMap = {};
  Object.entries(rowsByUnit).forEach(([unitId, rows]) => {
    next[unitId] = rows.map((row) => {
      if (isDone(row)) return row;
      const draft = draftBySetId[row.id];
      if (!draft) return row;
      return {
        ...row,
        actualWeightInput: draft.actualWeightInput ?? row.actualWeightInput,
        actualRpeInput: draft.actualRpeInput ?? row.actualRpeInput,
        actualRepsInput: draft.actualRepsInput ?? row.actualRepsInput,
      };
    });
  });
  return next;
}

function isCursorPending(rowsByUnit: RowMap, cursor: Cursor | null) {
  if (!cursor) return false;
  const target = (rowsByUnit[cursor.plannedUnitId] ?? []).find((row) => row.id === cursor.setId);
  return Boolean(target && !isDone(target));
}

function getUnitWeightUnit(unit: PlannedSessionItem["planned_units"][number]): "kg" | "lbs" {
  const payload = toPlainRecord(unit.target_payload);
  const loadModel = typeof payload.load_model === "string" ? payload.load_model : "external";
  if (loadModel === "bodyweight_plus_external") {
    return payload.additional_load_unit === "lbs" ? "lbs" : "kg";
  }
  return payload.load_unit === "lbs" ? "lbs" : "kg";
}

function getExerciseLibraryItemId(unit: PlannedSessionItem["planned_units"][number]) {
  const payload = toPlainRecord(unit.target_payload);
  const itemId = payload.exercise_library_item_id;
  return typeof itemId === "string" ? itemId : null;
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatRestTime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || seconds <= 0) {
    return "自由休息";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0 && secs > 0) {
    return `${mins}分${secs}秒`;
  }
  if (mins > 0) {
    return `${mins}分钟`;
  }
  return `${secs}秒`;
}

function formatWeightWithUnit(weight: string | null | undefined, unit: "kg" | "lbs") {
  if (!weight || weight.trim().length === 0) return "-";
  return `${weight}${unit}`;
}

function formatRepsLabel(reps: number | null | undefined) {
  if (reps === null || reps === undefined) return "-";
  return `${reps}次`;
}

function formatSessionDate(dateText: string) {
  const date = new Date(dateText);
  const d = date.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  const w = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${d} (${w})`;
}

function formatSetTypeLabel(setType: string | null) {
  if (!setType) return "工作组";
  const normalized = setType.trim().toLowerCase();
  const map: Record<string, string> = {
    warmup: "热身组",
    working: "正式组",
    top_set: "顶组",
    backoff: "回退组",
    dropset: "递减组",
    failure: "力竭组",
    amrap: "AMRAP",
    tempo: "节奏组",
    volume: "容量组",
    pause: "停顿组",
    cluster: "簇组",
  };
  return map[normalized] ?? setType;
}

function formatTempoDisplay(tempo: string | null) {
  if (!tempo) return "-";
  const parts = tempo
    .split(/[^0-9]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (parts.length === 0) return "-";
  return parts.join(" ");
}

function parseTempoParts(tempo: string | null | undefined) {
  const parts = (tempo ?? "")
    .split(/[^0-9]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4);
  return Array.from({ length: 4 }, (_, index) => parts[index] ?? "");
}

function buildTempoValue(parts: string[]) {
  const normalized = parts.map((part) => part.replace(/\D/g, "").slice(0, 1));
  if (normalized.every((part) => part.length === 0)) return "";
  return normalized.join("-");
}

function buildDraftScope(
  userId: string,
  plannedSessionId: string,
  sessionExecutionId: string | null,
): ExecutionDraftScope | null {
  if (!sessionExecutionId) return null;
  return {
    userId,
    plannedSessionId,
    sessionExecutionId,
  };
}

function summarizeRestoreTarget(
  cursor: Cursor | null,
  unitById: Map<string, PlannedSessionItem["planned_units"][number]>,
  rowsByUnit: RowMap,
) {
  if (!cursor) return null;
  const unit = unitById.get(cursor.plannedUnitId);
  const row = (rowsByUnit[cursor.plannedUnitId] ?? []).find((item) => item.id === cursor.setId);
  if (!unit || !row) return null;
  return `${unit.selected_exercise_name ?? "未命名动作"} 第${row.setIndex}组`;
}

function inferRestSourceSetId(unitIds: string[], rowsByUnit: RowMap, pendingCursor: Cursor): string | null {
  const flattened = unitIds.flatMap((unitId) =>
    orderedRows(rowsByUnit[unitId] ?? []).map((row) => ({
      unitId,
      row,
    })),
  );
  const pendingIndex = flattened.findIndex(
    (item) => item.unitId === pendingCursor.plannedUnitId && item.row.id === pendingCursor.setId,
  );
  if (pendingIndex <= 0) return null;
  return flattened[pendingIndex - 1]?.row.id ?? null;
}

export function SessionExecutionWorkbenchClient({ userId, programId, plannedSessionId, returnTo, fromPlannedSessionId }: Props) {
  const router = useRouter();
  const pathname = usePathname() || `/programs/${programId}/planned-sessions/${plannedSessionId}/execute`;
  const [plannedSession, setPlannedSession] = useState<PlannedSessionItem | null>(null);
  const [sessionExecutionId, setSessionExecutionId] = useState<string | null>(null);
  const [performedAt, setPerformedAt] = useState<string | null>(null);
  const [rowsByUnit, setRowsByUnit] = useState<RowMap>({});
  const [activeCursor, setActiveCursor] = useState<Cursor | null>(null);
  const [pendingNextCursor, setPendingNextCursor] = useState<Cursor | null>(null);
  const [phase, setPhase] = useState<WorkbenchPhase>("set_active");
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("准备加载训练数据...");
  const [reloadToken, setReloadToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [restoreHint, setRestoreHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingSetId, setSavingSetId] = useState<string | null>(null);
  const [addingExtra, setAddingExtra] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<"units" | "sets" | null>(null);
  const [expandedRelatedSetIds, setExpandedRelatedSetIds] = useState<string[]>([]);
  const [showFocusOverlay, setShowFocusOverlay] = useState(false);
  const [restPresentation, setRestPresentation] = useState<RestPresentation>("card");
  const [restContext, setRestContext] = useState<RestContext | null>(null);
  const [restAutoAdvanceEnabled, setRestAutoAdvanceEnabled] = useState(true);
  const [restFinishing, setRestFinishing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizeSummary, setFinalizeSummary] = useState<FinalizeSessionExecutionResponse["summary"] | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const restCardRef = useRef<HTMLDivElement | null>(null);
  const timer = useRestTimer();
  const executePath = useMemo(
    () => `/programs/${programId}/planned-sessions/${plannedSessionId}/execute`,
    [plannedSessionId, programId],
  );
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowFocusOverlay(window.scrollY > 240);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const orderedUnits = useMemo(
    () => (plannedSession ? [...plannedSession.planned_units].sort((a, b) => a.sequence_no - b.sequence_no) : []),
    [plannedSession],
  );
  const unitIds = useMemo(() => orderedUnits.map((unit) => unit.id), [orderedUnits]);
  const unitById = useMemo(() => new Map(orderedUnits.map((unit) => [unit.id, unit])), [orderedUnits]);
  const draftScope = useMemo(
    () => buildDraftScope(userId, plannedSessionId, sessionExecutionId),
    [plannedSessionId, sessionExecutionId, userId],
  );

  const elapsedSeconds = useMemo(() => {
    if (!performedAt) return 0;
    const delta = nowTs - new Date(performedAt).getTime();
    return delta > 0 ? Math.floor(delta / 1000) : 0;
  }, [nowTs, performedAt]);

  const summary = useMemo(() => {
    const statuses = orderedUnits.map((unit) => getUnitStatus(rowsByUnit[unit.id] ?? []));
    const allRows = orderedUnits.flatMap((unit) => rowsByUnit[unit.id] ?? []);
    return {
      totalUnits: statuses.length,
      completedUnits: statuses.filter((status) => status === "completed").length,
      totalSets: allRows.length,
      completedSets: allRows.filter((row) => row.status === "completed").length,
      pendingSets: allRows.filter((row) => !isDone(row)).length,
      extraSets: allRows.filter((row) => row.isExtraSet).length,
    };
  }, [orderedUnits, rowsByUnit]);

  const displaySummary = finalizeSummary
    ? {
        totalUnits: finalizeSummary.totals.totalUnits,
        completedUnits: finalizeSummary.totals.completedUnits,
        totalSets: finalizeSummary.totals.totalSets,
        completedSets: finalizeSummary.totals.completedSets,
        pendingSets: finalizeSummary.totals.pendingSets,
        extraSets: finalizeSummary.totals.extraSets,
      }
    : summary;

  const currentSet = useMemo(() => {
    if (!activeCursor) return null;
    return (rowsByUnit[activeCursor.plannedUnitId] ?? []).find((row) => row.id === activeCursor.setId) ?? null;
  }, [activeCursor, rowsByUnit]);

  const currentUnit = useMemo(() => {
    if (!activeCursor) return null;
    return unitById.get(activeCursor.plannedUnitId) ?? null;
  }, [activeCursor, unitById]);
  const currentAiAnchor = useMemo(() => {
    if (!currentUnit) return null;
    const payload = toPlainRecord(currentUnit.target_payload);
    const aiAnchor = toPlainRecord(payload.ai_anchor);
    if (aiAnchor.pending_confirmation !== true) {
      return null;
    }
    return {
      daysSinceLastPerformed:
        typeof aiAnchor.days_since_last_performed === "number"
          ? aiAnchor.days_since_last_performed
          : null,
      logicSummary:
        typeof aiAnchor.logic_summary === "string" ? aiAnchor.logic_summary : null,
      recommendedRir:
        typeof aiAnchor.recommended_rir === "number" ? aiAnchor.recommended_rir : null,
      reasons: Array.isArray(aiAnchor.reasons)
        ? aiAnchor.reasons.filter((item): item is string => typeof item === "string")
        : [],
    };
  }, [currentUnit]);
  const currentUnitRows = useMemo(
    () => (currentUnit ? orderedRows(rowsByUnit[currentUnit.id] ?? []) : []),
    [currentUnit, rowsByUnit],
  );
  const currentUnitProgressIndex = useMemo(() => {
    if (!currentUnit) return null;
    const idx = orderedUnits.findIndex((unit) => unit.id === currentUnit.id);
    return idx >= 0 ? idx + 1 : null;
  }, [currentUnit, orderedUnits]);
  const currentSetProgressText = useMemo(() => {
    if (!currentSet || currentUnitRows.length === 0) return null;
    return `${currentSet.setIndex}/${currentUnitRows.length}`;
  }, [currentSet, currentUnitRows.length]);
  const currentProgressHint = useMemo(() => {
    if (!currentSet || !activeCursor) return null;
    const rows = orderedRows(rowsByUnit[activeCursor.plannedUnitId] ?? []);
    const previous = rows.filter((row) => row.setIndex < currentSet.setIndex).pop();
    if (!previous?.plannedWeight || !currentSet.plannedWeight) return "按计划完成本组";
    const prevWeight = Number(previous.plannedWeight);
    const curWeight = Number(currentSet.plannedWeight);
    if (!Number.isFinite(prevWeight) || !Number.isFinite(curWeight)) return "按计划完成本组";
    const delta = Math.round((curWeight - prevWeight) * 10) / 10;
    if (delta > 0) return `重量 +${delta}`;
    if (delta < 0) return `重量 ${delta}`;
    return "与上组同重量";
  }, [activeCursor, currentSet, rowsByUnit]);
  const selectedRpe = useMemo(() => {
    if (!currentSet?.actualRpeInput.trim()) return null;
    const value = Number(currentSet.actualRpeInput.trim());
    return Number.isFinite(value) ? normalizeRpe(value) : null;
  }, [currentSet?.actualRpeInput]);
  const plannedRpe = useMemo(() => {
    if (!currentSet?.plannedRpe?.trim()) return null;
    const value = Number(currentSet.plannedRpe.trim());
    return Number.isFinite(value) ? normalizeRpe(value) : null;
  }, [currentSet?.plannedRpe]);
  const activeRpe = useMemo(() => selectedRpe ?? plannedRpe ?? 8, [plannedRpe, selectedRpe]);

  const moveToNextSet = useCallback(
    (nextCursor: Cursor | null) => {
      if (draftScope) {
        clearExecutionRestDraft(draftScope);
      }
      setRestContext(null);
      setRestAutoAdvanceEnabled(true);
      setRestFinishing(false);
      setRestPresentation("card");
      if (nextCursor) {
        setActiveCursor(nextCursor);
        setPendingNextCursor(null);
        setPhase("set_active");
        return;
      }
      setActiveCursor(null);
      setPendingNextCursor(null);
      setPhase("session_done");
    },
    [draftScope],
  );

  const persistRestForSourceSet = useCallback(async () => {
    if (!restContext || restContext.committed) {
      return;
    }

    const elapsedMs =
      restContext.accumulatedMs +
      (restContext.runningFromMs !== null
        ? Math.max(0, Date.now() - restContext.runningFromMs)
        : 0);
    const actualRestSeconds = Math.max(0, Math.round(elapsedMs / 1000));

    await updateSessionExecutionSet(restContext.sourceSetId, {
      userId,
      actualRestSeconds,
    });

    setRestContext((current) => {
      if (!current || current.sourceSetId !== restContext.sourceSetId) {
        return current;
      }
      return {
        ...current,
        accumulatedMs: elapsedMs,
        runningFromMs: null,
        committed: true,
      };
    });
  }, [restContext, userId]);

  const handleRestFinished = useCallback(
    async (reason: "auto" | "skip") => {
      if (phase !== "rest_active" || restFinishing) return;
      setRestFinishing(true);
      setActionError(null);
      try {
        await persistRestForSourceSet();
        timer.stop();
        moveToNextSet(pendingNextCursor);
        if (reason === "skip") {
          setMessage("休息已结束，已进入下一组。");
        }
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : "记录休息时间失败");
      } finally {
        setRestFinishing(false);
      }
    },
    [moveToNextSet, pendingNextCursor, persistRestForSourceSet, phase, restFinishing, timer],
  );

  const pauseRest = useCallback(() => {
    if (timer.state !== "running") return;
    setRestContext((current) => {
      if (!current || current.runningFromMs === null) {
        return current;
      }
      return {
        ...current,
        accumulatedMs: current.accumulatedMs + Math.max(0, Date.now() - current.runningFromMs),
        runningFromMs: null,
      };
    });
    timer.pause();
  }, [timer]);

  const resumeRest = useCallback(() => {
    if (timer.state !== "paused") return;
    setRestContext((current) => {
      if (!current) return current;
      return {
        ...current,
        runningFromMs: Date.now(),
      };
    });
    timer.resume();
  }, [timer]);

  const adjustRestBy = useCallback(
    (deltaSeconds: number) => {
      if (phase !== "rest_active") return;
      if (deltaSeconds === 0) return;
      timer.adjustBy(deltaSeconds);
      if (deltaSeconds > 0) {
        setRestAutoAdvanceEnabled(true);
        setRestContext((current) => {
          if (!current) return current;
          return {
            ...current,
            runningFromMs: current.runningFromMs ?? Date.now(),
          };
        });
      }
    },
    [phase, timer],
  );

  useEffect(() => {
    if (phase !== "rest_active") return;
    if (!restAutoAdvanceEnabled) return;
    if (timer.state !== "idle") return;
    if (actionError) return;
    void handleRestFinished("auto");
  }, [actionError, handleRestFinished, phase, restAutoAdvanceEnabled, timer.state]);

  useEffect(() => {
    if (phase !== "rest_active" || restPresentation !== "card") return;
    const onPointerDown = (event: PointerEvent) => {
      const card = restCardRef.current;
      if (!card) return;
      const target = event.target;
      if (target instanceof Node && !card.contains(target)) {
        setRestPresentation("bubble");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [phase, restPresentation]);

  useEffect(() => {
    if (phase !== "set_active") {
      setShowMoreActions(false);
    }
  }, [phase, activeCursor?.setId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setRestoreHint(null);
      try {
        setLoadingStage("同步当前训练会话...");
        const bootstrap = await bootstrapSessionExecutionWorkbench(plannedSessionId, {
          userId,
          performedAt: new Date().toISOString(),
          overallFeeling: "normal",
        });
        if (cancelled) return;
        setLoadingStage("加载组级执行数据...");
        if (cancelled) return;

        const session = bootstrap.plannedSession;
        const detail = bootstrap.executionDetail;
        const executionId = bootstrap.sessionExecutionId;

        setPlannedSession(session);
        const localDraftScope = buildDraftScope(userId, plannedSessionId, executionId);
        const draftSnapshot = localDraftScope
          ? getExecutionLocalDraftSnapshot(localDraftScope)
          : null;
        const uiSnapshot = getExecutionWorkbenchUiStateSnapshot();
        const matchedUiDraft =
          uiSnapshot.draft &&
          uiSnapshot.draft.userId === userId &&
          uiSnapshot.draft.plannedSessionId === plannedSessionId &&
          uiSnapshot.draft.sessionExecutionId === executionId
            ? uiSnapshot.draft
            : null;
        setFocusMode(Boolean(matchedUiDraft?.focusMode));

        const rawRowsMap = detail.units.reduce<RowMap>((acc, unit) => {
          acc[unit.planned_unit.id] = orderedRows(unit.sets.map((setRow) => toRow(setRow)));
          return acc;
        }, {});
        const hydratedRowsMap = applySetDraftsToRows(
          rawRowsMap,
          draftSnapshot?.setDrafts ?? {},
        );
        setRowsByUnit(hydratedRowsMap);
        setPerformedAt(detail.session.performed_at);

        const ids = session.planned_units.slice().sort((a, b) => a.sequence_no - b.sequence_no).map((unit) => unit.id);
        const firstCursor = findFirstPendingCursor(ids, hydratedRowsMap);
        const restoredCursor = isCursorPending(
          hydratedRowsMap,
          draftSnapshot?.workbenchDraft?.activeCursor ?? null,
        )
          ? (draftSnapshot?.workbenchDraft?.activeCursor ?? null)
          : null;
        const finalized = detail.session.completion_status === "completed" || detail.session.completion_status === "skipped";
        setIsFinalized(finalized);
        if (finalized) {
          setPhase("session_done");
          setActiveCursor(null);
          setPendingNextCursor(null);
          setRestContext(null);
          setRestAutoAdvanceEnabled(true);
          setRestPresentation("card");
        } else if (firstCursor) {
          const restDraft = draftSnapshot?.restDraft ?? null;
          const restPendingCursor = restDraft?.pendingNextCursor ?? null;
          const canRestorePending =
            restPendingCursor === null ||
            isCursorPending(hydratedRowsMap, restPendingCursor);
          if (restDraft && canRestorePending) {
            const remainingMs = restDraft.restTargetTimestamp - Date.now();
            const autoAdvanceEnabled =
              restDraft.autoAdvanceEnabled !== undefined
                ? restDraft.autoAdvanceEnabled
                : remainingMs > 0;
            if (remainingMs > 0 || !autoAdvanceEnabled) {
              const pendingCursor = restPendingCursor;
              const cursorForRest = pendingCursor ?? restoredCursor ?? firstCursor;
              const inferredSourceSetId =
                restDraft.sourceSetId ??
                (pendingCursor
                  ? inferRestSourceSetId(ids, hydratedRowsMap, pendingCursor)
                  : null);
              setActiveCursor(cursorForRest);
              setPendingNextCursor(pendingCursor);
              setPhase("rest_active");
              setRestAutoAdvanceEnabled(autoAdvanceEnabled);
              setRestPresentation(restDraft.presentation ?? "card");
              setRestContext({
                sourceSetId: inferredSourceSetId ?? cursorForRest.setId,
                startedAtMs: restDraft.restStartedAtMs ?? Date.now(),
                accumulatedMs: restDraft.accumulatedMs ?? 0,
                runningFromMs:
                  restDraft.runningFromMs === undefined
                    ? Date.now()
                    : restDraft.runningFromMs,
                committed: false,
              });
              timer.start(Math.ceil(remainingMs / 1000));
              const restoreText = summarizeRestoreTarget(
                pendingCursor,
                new Map(session.planned_units.map((unit) => [unit.id, unit])),
                hydratedRowsMap,
              );
              if (restoreText) {
                setRestoreHint(
                  `${draftSnapshot?.isStale ? "检测到上次训练已超过24小时，" : ""}已恢复上次训练：${restoreText}（当前仍在休息中）。`,
                );
              }
            } else {
              if (localDraftScope) {
                clearExecutionRestDraft(localDraftScope);
              }
              setPhase("set_active");
              setRestContext(null);
              setRestAutoAdvanceEnabled(true);
              setRestPresentation("card");
              const cursorToUse = restDraft.pendingNextCursor ?? restoredCursor ?? firstCursor;
              setActiveCursor(cursorToUse);
              setPendingNextCursor(null);
              const restoreText = summarizeRestoreTarget(
                cursorToUse,
                new Map(session.planned_units.map((unit) => [unit.id, unit])),
                hydratedRowsMap,
              );
              if (restoreText && bootstrap.reusedExisting) {
                setRestoreHint(
                  `${draftSnapshot?.isStale ? "检测到上次训练已超过24小时，" : ""}已恢复上次训练：${restoreText}。`,
                );
              }
            }
          } else if (restDraft && localDraftScope) {
            clearExecutionRestDraft(localDraftScope);
            const cursorToUse = restoredCursor ?? firstCursor;
            setPhase("set_active");
            setRestContext(null);
            setRestAutoAdvanceEnabled(true);
            setRestPresentation("card");
            setActiveCursor(cursorToUse);
            setPendingNextCursor(null);
          } else {
            setPhase("set_active");
            setRestContext(null);
            setRestAutoAdvanceEnabled(true);
            setRestPresentation("card");
            const cursorToUse = restoredCursor ?? firstCursor;
            setActiveCursor(cursorToUse);
            setPendingNextCursor(null);
            if (bootstrap.reusedExisting) {
              const restoreText = summarizeRestoreTarget(
                cursorToUse,
                new Map(session.planned_units.map((unit) => [unit.id, unit])),
                hydratedRowsMap,
              );
              if (restoreText) {
                setRestoreHint(
                  `${draftSnapshot?.isStale ? "检测到上次训练已超过24小时，" : ""}已恢复上次训练：${restoreText}。`,
                );
              }
            }
          }
        } else {
          setPhase("session_done");
          setActiveCursor(null);
          setPendingNextCursor(null);
          setRestContext(null);
          setRestAutoAdvanceEnabled(true);
          setRestPresentation("card");
        }
        setSessionExecutionId(executionId);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "加载实时训练工作台失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [plannedSessionId, reloadToken, timer.start, userId]);

  const reloadWorkbench = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (isFinalized || !sessionExecutionId) {
      clearExecutionWorkbenchUiState();
      return;
    }
    saveExecutionWorkbenchUiState({
      userId,
      programId,
      plannedSessionId,
      sessionExecutionId,
      executePath,
      lastRoute: pathname,
      focusMode,
      isMinimized: false,
      lastKnownCursor: activeCursor
        ? { plannedUnitId: activeCursor.plannedUnitId, setId: activeCursor.setId }
        : null,
      currentExerciseName: currentUnit?.selected_exercise_name ?? null,
      currentSetIndex: currentSet?.setIndex ?? null,
      restSnapshot:
        phase === "rest_active"
          ? {
              phase: "rest_active",
              remainingSeconds: timer.remainingSeconds,
              targetTimestamp: Date.now() + timer.remainingSeconds * 1000,
            }
          : null,
    });
  }, [
    activeCursor,
    currentSet?.setIndex,
    currentUnit?.selected_exercise_name,
    executePath,
    focusMode,
    isFinalized,
    pathname,
    phase,
    plannedSessionId,
    programId,
    sessionExecutionId,
    timer.remainingSeconds,
    userId,
  ]);

  useEffect(() => {
    if (!focusMode || isFinalized) {
      return;
    }
    const blockMessage = "专注模式已开启，请先关闭专注模式或结束训练。";
    const executeUrl = new URL(executePath, window.location.origin);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = blockMessage;
      return blockMessage;
    };
    const onPopState = () => {
      window.history.pushState({ focusMode: true }, "", window.location.href);
      setMessage(blockMessage);
    };
    const onDocumentClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const targetUrl = new URL(href, window.location.origin);
      const isSameExecuteRoute =
        targetUrl.pathname === executeUrl.pathname && targetUrl.search === executeUrl.search;
      if (isSameExecuteRoute) return;
      event.preventDefault();
      event.stopPropagation();
      setMessage(blockMessage);
    };
    window.history.pushState({ focusMode: true }, "", window.location.href);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClickCapture, true);
    };
  }, [executePath, focusMode, isFinalized]);

  const updateCurrentSetDraft = useCallback(
    (field: "actualWeightInput" | "actualRpeInput" | "actualRepsInput", value: string) => {
      if (!activeCursor) return;
      setRowsByUnit((current) => ({
        ...current,
        [activeCursor.plannedUnitId]: (current[activeCursor.plannedUnitId] ?? []).map((row) =>
          row.id === activeCursor.setId ? { ...row, [field]: value } : row,
        ),
      }));
    },
    [activeCursor],
  );

  const updateSetDraft = useCallback(
    (
      unitId: string,
      setId: string,
      field: "actualWeightInput" | "actualRpeInput" | "actualRepsInput" | "actualRestInput" | "actualTempoInput",
      value: string,
    ) => {
      setRowsByUnit((current) => ({
        ...current,
        [unitId]: (current[unitId] ?? []).map((row) => (row.id === setId ? { ...row, [field]: value } : row)),
      }));
    },
    [],
  );

  useEffect(() => {
    if (!draftScope || !currentSet) return;
    if (isDone(currentSet)) {
      removeExecutionSetDraft(draftScope, currentSet.id);
      return;
    }

    const hasAnyValue =
      currentSet.actualWeightInput.trim().length > 0 ||
      currentSet.actualRpeInput.trim().length > 0 ||
      currentSet.actualRepsInput.trim().length > 0;

    if (!hasAnyValue) {
      removeExecutionSetDraft(draftScope, currentSet.id);
      return;
    }

    saveExecutionSetDraft(draftScope, currentSet.id, {
      actualWeightInput: currentSet.actualWeightInput,
      actualRpeInput: currentSet.actualRpeInput,
      actualRepsInput: currentSet.actualRepsInput,
    });
  }, [
    currentSet,
    currentSet?.actualRepsInput,
    currentSet?.actualRpeInput,
    currentSet?.actualWeightInput,
    draftScope,
  ]);

  useEffect(() => {
    if (!draftScope) return;
    if (phase === "session_done" || isFinalized) {
      clearExecutionWorkbenchDraft(draftScope);
      return;
    }
    saveExecutionWorkbenchDraft(draftScope, {
      phase,
      activeCursor,
      pendingNextCursor,
    });
  }, [activeCursor, draftScope, isFinalized, pendingNextCursor, phase]);

  useEffect(() => {
    if (!draftScope) return;
    if (phase !== "rest_active" || !restContext) {
      clearExecutionRestDraft(draftScope);
      return;
    }

    saveExecutionRestDraft(draftScope, {
      pendingNextCursor,
      restTargetTimestamp: Date.now() + timer.remainingSeconds * 1000,
      autoAdvanceEnabled: restAutoAdvanceEnabled,
      presentation: restPresentation,
      sourceSetId: restContext.sourceSetId,
      restStartedAtMs: restContext.startedAtMs,
      accumulatedMs: restContext.accumulatedMs,
      runningFromMs: restContext.runningFromMs,
    });
  }, [
    draftScope,
    pendingNextCursor,
    phase,
    restAutoAdvanceEnabled,
    restContext,
    restPresentation,
    timer.remainingSeconds,
  ]);

  const applyPlanValues = useCallback(() => {
    if (!activeCursor) return;
    setRowsByUnit((current) => ({
      ...current,
      [activeCursor.plannedUnitId]: (current[activeCursor.plannedUnitId] ?? []).map((row) =>
        row.id === activeCursor.setId
          ? {
              ...row,
              actualWeightInput: row.plannedWeight ?? row.actualWeightInput,
              actualRepsInput: row.plannedReps !== null ? String(row.plannedReps) : row.actualRepsInput,
              actualRpeInput: row.plannedRpe ?? row.actualRpeInput,
            }
          : row,
      ),
    }));
  }, [activeCursor]);

  const copyPreviousSetValues = useCallback(() => {
    if (!activeCursor || !currentSet) return;
    const rows = orderedRows(rowsByUnit[activeCursor.plannedUnitId] ?? []);
    const previous = rows.filter((row) => row.setIndex < currentSet.setIndex).pop();
    if (!previous) return;
    setRowsByUnit((current) => ({
      ...current,
      [activeCursor.plannedUnitId]: (current[activeCursor.plannedUnitId] ?? []).map((row) =>
        row.id === activeCursor.setId
          ? {
              ...row,
              actualWeightInput: previous.actualWeightInput || previous.plannedWeight || row.actualWeightInput,
              actualRepsInput:
                previous.actualRepsInput ||
                (previous.plannedReps !== null ? String(previous.plannedReps) : row.actualRepsInput),
              actualRpeInput: previous.actualRpeInput || previous.plannedRpe || row.actualRpeInput,
            }
          : row,
      ),
    }));
  }, [activeCursor, currentSet, rowsByUnit]);

  const adjustWeight = useCallback(
    (delta: number) => {
      if (!activeCursor) return;
      setRowsByUnit((current) => ({
        ...current,
        [activeCursor.plannedUnitId]: (current[activeCursor.plannedUnitId] ?? []).map((row) => {
          if (row.id !== activeCursor.setId) return row;
          const base = row.actualWeightInput.trim() ? Number(row.actualWeightInput) : Number(row.plannedWeight ?? "0");
          const safe = Number.isFinite(base) ? base : 0;
          return {
            ...row,
            actualWeightInput: String(Math.max(0, Math.round((safe + delta) * 1000) / 1000)),
          };
        }),
      }));
    },
    [activeCursor],
  );
  const adjustSetWeight = useCallback(
    (unitId: string, setId: string, delta: number) => {
      setRowsByUnit((current) => ({
        ...current,
        [unitId]: (current[unitId] ?? []).map((row) => {
          if (row.id !== setId) return row;
          const base = row.actualWeightInput.trim() ? Number(row.actualWeightInput) : Number(row.plannedWeight ?? "0");
          const safe = Number.isFinite(base) ? base : 0;
          return {
            ...row,
            actualWeightInput: String(Math.max(0, Math.round((safe + delta) * 1000) / 1000)),
          };
        }),
      }));
    },
    [],
  );

  const setRpeValue = useCallback(
    (rpe: number) => {
      updateCurrentSetDraft("actualRpeInput", formatRpeValue(rpe));
    },
    [updateCurrentSetDraft],
  );
  const adjustRpe = useCallback(
    (delta: number) => {
      setRpeValue(activeRpe + delta);
    },
    [activeRpe, setRpeValue],
  );
  const setSetRpeValue = useCallback(
    (unitId: string, setId: string, rpe: number) => {
      updateSetDraft(unitId, setId, "actualRpeInput", formatRpeValue(rpe));
    },
    [updateSetDraft],
  );
  const saveSetEdits = useCallback(
    async (unitId: string, row: Row) => {
      setSavingSetId(row.id);
      setActionError(null);
      setMessage(null);
      try {
        let actualReps = toOptionalInt(row.actualRepsInput);
        let actualWeight = toOptionalNumber(row.actualWeightInput);
        let actualRpe = toOptionalNumber(row.actualRpeInput);
        let actualRestSeconds = toOptionalInt(row.actualRestInput);
        const actualTempo = row.actualTempoInput.trim() || row.plannedTempo || undefined;
        if (actualReps === undefined && row.plannedReps !== null) actualReps = row.plannedReps;
        if (actualWeight === undefined && row.plannedWeight !== null) actualWeight = Number(row.plannedWeight);
        if (actualRpe === undefined && row.plannedRpe !== null) actualRpe = Number(row.plannedRpe);
        if (actualRestSeconds === undefined && row.plannedRestSeconds !== null) actualRestSeconds = row.plannedRestSeconds;

        const updated = await updateSessionExecutionSet(row.id, {
          userId,
          actualReps,
          actualWeight,
          actualRpe,
          actualRestSeconds,
          actualTempo,
        });

        setRowsByUnit((current) => ({
          ...current,
          [unitId]: orderedRows((current[unitId] ?? []).map((item) => (item.id === row.id ? toRow(updated) : item))),
        }));
        setMessage(`第 ${row.setIndex} 组已更新。`);
      } catch (nextError) {
        setActionError(nextError instanceof Error ? nextError.message : "更新组数据失败");
      } finally {
        setSavingSetId(null);
      }
    },
    [userId],
  );
  const completeCurrentSet = useCallback(async () => {
    if (!activeCursor || !currentSet || !sessionExecutionId || !draftScope || isFinalized) return;
    setSavingSetId(currentSet.id);
    setActionError(null);
    setMessage(null);
    try {
      let actualReps = toOptionalInt(currentSet.actualRepsInput);
      let actualWeight = toOptionalNumber(currentSet.actualWeightInput);
      let actualRpe = toOptionalNumber(currentSet.actualRpeInput);
      let actualRestSeconds = toOptionalInt(currentSet.actualRestInput);
      const actualTempo = currentSet.actualTempoInput.trim() || currentSet.plannedTempo || undefined;
      if (actualReps === undefined && currentSet.plannedReps !== null) actualReps = currentSet.plannedReps;
      if (actualWeight === undefined && currentSet.plannedWeight !== null) actualWeight = Number(currentSet.plannedWeight);
      if (actualRpe === undefined && currentSet.plannedRpe !== null) actualRpe = Number(currentSet.plannedRpe);
      if (actualRestSeconds === undefined && currentSet.plannedRestSeconds !== null) actualRestSeconds = currentSet.plannedRestSeconds;

      const updated = await updateSessionExecutionSet(currentSet.id, {
        userId,
        actualReps,
        actualWeight,
        actualRpe,
        actualRestSeconds,
        actualTempo,
        status: "completed",
      });

      const nextMap: RowMap = {
        ...rowsByUnit,
        [activeCursor.plannedUnitId]: orderedRows(
          (rowsByUnit[activeCursor.plannedUnitId] ?? []).map((row) =>
            row.id === currentSet.id ? toRow(updated) : row,
          ),
        ),
      };
      const nextCursor = findNextCursor(unitIds, nextMap, activeCursor);
      setRowsByUnit(nextMap);
      removeExecutionSetDraft(draftScope, currentSet.id);

      const configuredRestSeconds = actualRestSeconds ?? updated.planned_rest_seconds ?? currentSet.plannedRestSeconds ?? 0;
      const normalizedRestSeconds = Math.max(0, Math.floor(configuredRestSeconds));
      const now = Date.now();
      const autoAdvanceEnabled = normalizedRestSeconds > 0;
      setPendingNextCursor(nextCursor);
      setPhase("rest_active");
      setRestAutoAdvanceEnabled(autoAdvanceEnabled);
      setRestPresentation("card");
      setRestContext({
        sourceSetId: currentSet.id,
        startedAtMs: now,
        accumulatedMs: 0,
        runningFromMs: now,
        committed: false,
      });
      timer.start(normalizedRestSeconds);
      setMessage("本组已完成，已自动进入下一流程。");
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "保存本组失败");
    } finally {
      setSavingSetId(null);
    }
  }, [activeCursor, currentSet, draftScope, isFinalized, moveToNextSet, rowsByUnit, sessionExecutionId, timer, unitIds, userId]);

  const skipCurrentSet = useCallback(async () => {
    if (!activeCursor || !currentSet || !sessionExecutionId || !draftScope || isFinalized) return;
    setSavingSetId(currentSet.id);
    setActionError(null);
    setMessage(null);
    try {
      const updated = await updateSessionExecutionSet(currentSet.id, { userId, status: "skipped" });
      const nextMap: RowMap = {
        ...rowsByUnit,
        [activeCursor.plannedUnitId]: orderedRows(
          (rowsByUnit[activeCursor.plannedUnitId] ?? []).map((row) =>
            row.id === currentSet.id ? toRow(updated) : row,
          ),
        ),
      };
      const nextCursor = findNextCursor(unitIds, nextMap, activeCursor);
      setRowsByUnit(nextMap);
      removeExecutionSetDraft(draftScope, currentSet.id);
      moveToNextSet(nextCursor);
      setMessage("本组已跳过，已自动推进。");
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "跳过失败");
    } finally {
      setSavingSetId(null);
    }
  }, [activeCursor, currentSet, draftScope, isFinalized, moveToNextSet, rowsByUnit, sessionExecutionId, unitIds, userId]);

  const addExtraSet = useCallback(async () => {
    if (!sessionExecutionId || isFinalized) return;
    const targetUnitId = activeCursor?.plannedUnitId ?? pendingNextCursor?.plannedUnitId ?? unitIds[0] ?? null;
    if (!targetUnitId) return;

    setAddingExtra(true);
    setActionError(null);
    setMessage(null);
    try {
      const rows = orderedRows(rowsByUnit[targetUnitId] ?? []);
      const basedOnSetId = rows.length > 0 ? rows[rows.length - 1].id : undefined;
      const created = await addSessionExecutionSet({
        userId,
        sessionExecutionId,
        plannedUnitId: targetUnitId,
        basedOnSetId,
        isExtraSet: true,
      });
      const nextRows = orderedRows([...(rowsByUnit[targetUnitId] ?? []), toRow(created)]);
      setRowsByUnit((current) => ({ ...current, [targetUnitId]: nextRows }));
      if (phase === "session_done") {
        setActiveCursor({ plannedUnitId: targetUnitId, setId: created.id });
        setPhase("set_active");
      }
      setMessage("已新增临时组。");
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "新增失败");
    } finally {
      setAddingExtra(false);
    }
  }, [activeCursor, isFinalized, pendingNextCursor, phase, rowsByUnit, sessionExecutionId, unitIds, userId]);

  const minimizeTraining = useCallback(() => {
    if (!sessionExecutionId || focusMode || isFinalized) return;
    saveExecutionWorkbenchUiState({
      userId,
      programId,
      plannedSessionId,
      sessionExecutionId,
      executePath,
      lastRoute: pathname,
      focusMode,
      isMinimized: true,
      lastKnownCursor: activeCursor
        ? { plannedUnitId: activeCursor.plannedUnitId, setId: activeCursor.setId }
        : null,
      currentExerciseName: currentUnit?.selected_exercise_name ?? null,
      currentSetIndex: currentSet?.setIndex ?? null,
      restSnapshot:
        phase === "rest_active"
          ? {
              phase: "rest_active",
              remainingSeconds: timer.remainingSeconds,
              targetTimestamp: Date.now() + timer.remainingSeconds * 1000,
            }
          : null,
    });
    router.push("/training?from=workbench-minimized");
  }, [
    activeCursor,
    currentSet?.setIndex,
    currentUnit?.selected_exercise_name,
    executePath,
    focusMode,
    isFinalized,
    pathname,
    phase,
    plannedSessionId,
    programId,
    router,
    sessionExecutionId,
    timer.remainingSeconds,
    userId,
  ]);

  const finishTraining = useCallback(async () => {
    if (!sessionExecutionId || isFinalized) return;
    const confirmMessages: string[] = [];
    if (summary.pendingSets > 0) {
      confirmMessages.push(`还有 ${summary.pendingSets} 组未完成`);
    }
    if (phase === "rest_active") {
      confirmMessages.push("当前休息尚未结束");
    }
    if (summary.extraSets > 0) {
      confirmMessages.push(`包含 ${summary.extraSets} 组临时加组`);
    }
    if (confirmMessages.length > 0) {
      const confirmed = window.confirm(`${confirmMessages.join("，")}，仍要结束训练吗？`);
      if (!confirmed) {
        return;
      }
    }

    setFinalizing(true);
    setFinalizeError(null);
    try {
      if (phase === "rest_active") {
        await persistRestForSourceSet();
      }
      const result = await finalizeSessionExecution(sessionExecutionId, {
        userId,
        actualDurationMin: elapsedSeconds > 0 ? Math.max(1, Math.round(elapsedSeconds / 60)) : undefined,
      });
      setIsFinalized(true);
      setFinalizeSummary(result.summary);
      setPhase("session_done");
      setActiveCursor(null);
      setPendingNextCursor(null);
      setRestContext(null);
      setRestAutoAdvanceEnabled(true);
      setRestPresentation("card");
      setRestFinishing(false);
      timer.stop();
      if (draftScope) {
        clearExecutionLocalDraft(draftScope);
      }
      clearExecutionWorkbenchUiState();
      const aiFollowup = result.summary.aiFollowup;
      if (aiFollowup && aiFollowup.confirmedAnchors > 0) {
        setMessage(
          `训练已结束。本次已确认 ${aiFollowup.confirmedAnchors} 个动作的起始基准，并刷新后续 ${aiFollowup.refreshedFutureSessions} 次未执行安排。`,
        );
      } else {
        setMessage("训练已结束。");
      }
    } catch (nextError) {
      setFinalizeError(nextError instanceof Error ? nextError.message : "结束训练失败");
    } finally {
      setFinalizing(false);
    }
  }, [
    draftScope,
    elapsedSeconds,
    isFinalized,
    persistRestForSourceSet,
    phase,
    sessionExecutionId,
    summary.extraSets,
    summary.pendingSets,
    timer,
    userId,
  ]);

  useEffect(() => {
    setExpandedRelatedSetIds((current) => {
      const availableIds = new Set(currentUnitRows.map((row) => row.id));
      const preserved = current.filter((id) => availableIds.has(id));
      const currentSetId = currentSet?.id ?? null;
      if (currentSetId && !preserved.includes(currentSetId)) {
        return [...preserved, currentSetId];
      }
      if (preserved.length > 0) {
        return preserved;
      }
      return currentSetId ? [currentSetId] : currentUnitRows[0]?.id ? [currentUnitRows[0].id] : [];
    });
  }, [currentSet?.id, currentUnitRows]);

  const toggleSetEditorCard = useCallback((setId: string) => {
    setExpandedRelatedSetIds((current) =>
      current.includes(setId) ? current.filter((id) => id !== setId) : [...current, setId],
    );
  }, []);

  const fromToday = returnTo === "today";
  const returnSessionId = fromPlannedSessionId ?? plannedSessionId;
  const todayHref = useMemo(() => {
    const query = new URLSearchParams({ from: "execute", completedPlannedSessionId: returnSessionId });
    if (sessionExecutionId) query.set("sessionExecutionId", sessionExecutionId);
    return `/today?${query.toString()}`;
  }, [returnSessionId, sessionExecutionId]);
  const focusSetId =
    phase === "rest_active" && pendingNextCursor && pendingNextCursor.plannedUnitId === currentUnit?.id
      ? pendingNextCursor.setId
      : currentSet?.id ?? null;
  const focusSetIndex = currentUnitRows.find((row) => row.id === focusSetId)?.setIndex ?? currentSet?.setIndex ?? null;
  const restBubbleEnabled = phase === "rest_active" && restPresentation === "bubble" && timer.remainingSeconds > 0;
  const { bubbleRef: restBubbleRef, bubbleStyle: restBubbleStyle, bubbleBind: restBubbleBind } = useEdgeSnapBubble({
    storageKey: "sms.workbench-rest-bubble.position.v1",
    enabled: restBubbleEnabled,
    defaultSide: "right",
    defaultBottomOffset: 132,
    estimatedWidth: 80,
    estimatedHeight: 80,
  });

  if (loading) {
    return (
      <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">正在加载实时训练工作台...</p>
        <p>{loadingStage}</p>
      </div>
    );
  }

  if (error || !plannedSession || !sessionExecutionId) {
    return (
      <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{error ?? "初始化失败"}</p>
        <button
          type="button"
          onClick={reloadWorkbench}
          className="rounded border border-red-300 bg-white px-3 py-2 text-xs text-red-700"
        >
          重试加载
        </button>
      </div>
    );
  }

  const currentUnitWeightUnit = currentUnit ? getUnitWeightUnit(currentUnit) : "kg";
  const isSetActive = phase === "set_active" && Boolean(currentSet) && Boolean(currentUnit);
  const isRestActive = phase === "rest_active";
  const workbenchSessionState: WorkbenchSessionState = (() => {
    if (isFinalized || phase === "session_done") return "completed";
    if (!sessionExecutionId) return "not_started";
    if (phase === "rest_active") {
      return timer.state === "paused" ? "paused" : "resting";
    }
    return "active";
  })();
  const workbenchSessionStateLabel: Record<WorkbenchSessionState, string> = {
    not_started: "未开始",
    active: "进行中",
    resting: "休息中",
    paused: "已暂停",
    completed: "已完成",
  };
  const isActionDisabled = Boolean(savingSetId) || isFinalized || !isSetActive;
  const currentWeightDisplay = currentSet
    ? currentSet.actualWeightInput || currentSet.plannedWeight || "0"
    : "0";
  const currentRepsDisplay = currentSet
    ? currentSet.actualRepsInput || (currentSet.plannedReps !== null ? String(currentSet.plannedReps) : "-")
    : "-";
  const showRestBubble = restBubbleEnabled;

  return (
    <section className="flex min-h-[100dvh] flex-col gap-5 pb-32">
      {currentUnit && focusSetIndex ? (
        <div
          className={`pointer-events-none fixed inset-x-0 top-0 z-20 transition-all duration-300 ${
            showFocusOverlay ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
          }`}
          aria-hidden={!showFocusOverlay}
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/96 via-white/88 to-transparent dark:from-zinc-950/96 dark:via-zinc-950/84 dark:to-transparent" />
          <div
            className="relative mx-4 mt-2 rounded-[1.5rem] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/82"
            style={{ marginTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">当前动作</p>
                <p className="truncate text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                  {currentUnit.selected_exercise_name ?? "未命名动作"}
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-black text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                第 {focusSetIndex} / {currentUnitRows.length} 组
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dynamic Header */}
      <header className="flex items-center justify-between px-1">
        <div className="space-y-0.5">
          <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">正在训练</h1>
          <div className="flex items-center gap-2">
            <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{formatClock(elapsedSeconds)} · {workbenchSessionStateLabel[workbenchSessionState]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button
             type="button"
             onClick={() => setFocusMode((c) => !c)}
             className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-all ${focusMode ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
           >
             {focusMode ? "🧘" : "👁️"}
           </button>
           {!focusMode && !isFinalized ? (
             <button
               type="button"
               onClick={minimizeTraining}
               className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 pr-0.5 text-zinc-600 transition-active active:scale-95 dark:bg-zinc-900 dark:text-zinc-400"
               aria-label="缩小训练"
             >
               🔻
             </button>
           ) : null}
           <button
             type="button"
             onClick={() => void finishTraining()}
             disabled={isFinalized || finalizing}
             className="rounded-2xl bg-zinc-900 px-4 py-2.5 text-[11px] font-black text-white shadow-xl transition-all active:scale-95 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
           >
             {finalizing ? "结束中" : "完成训练"}
           </button>
         </div>
       </header>
 
       {restoreHint ? (
         <div className="rounded-3xl bg-blue-50/50 p-4 dark:bg-blue-900/20">
           <p className="text-xs font-bold text-blue-700 dark:text-blue-400">💡 {restoreHint}</p>
         </div>
       ) : null}

      {/* Status Bar */}
      <div className="grid grid-cols-2 gap-3 rounded-[2rem] bg-zinc-100/50 p-2 dark:bg-zinc-900/40">
        <button 
          onClick={() => setActiveDrawer("units")}
          className="flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-sm transition-active active:scale-95 dark:bg-zinc-900 ring-1 ring-zinc-100 dark:ring-zinc-800"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">🎯</div>
          <div className="space-y-0.5 text-left">
            <p className="text-[9px] font-black text-zinc-400 uppercase">进度 (可切换动作)</p>
            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{currentUnitProgressIndex ?? displaySummary.totalUnits}/{displaySummary.totalUnits}</p>
          </div>
        </button>
        <button 
          onClick={() => setActiveDrawer("sets")}
          className="flex items-center gap-3 rounded-[1.5rem] bg-white p-3 shadow-sm transition-active active:scale-95 dark:bg-zinc-900 ring-1 ring-zinc-100 dark:ring-zinc-800"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">🔢</div>
          <div className="space-y-0.5 text-left">
            <p className="text-[9px] font-black text-zinc-400 uppercase">组数 (可查所有组)</p>
            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{currentSetProgressText ?? "-"}</p>
          </div>
        </button>
      </div>

      {currentUnit && currentSet ? (
        <div className="flex flex-col gap-5">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-white p-6 shadow-sm dark:bg-zinc-900">
            <div className="relative z-10 w-full">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">当前动作</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                {currentUnit.selected_exercise_name ?? "未命名动作"}
              </h2>
              {currentAiAnchor ? (
                <div className="mt-4 rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <p className="text-xs font-black text-blue-900 dark:text-blue-100">
                    {currentAiAnchor.daysSinceLastPerformed !== null
                      ? `距离你上次训练这个动作已过去 ${currentAiAnchor.daysSinceLastPerformed} 天。`
                      : "这个动作正在使用 AI 生成的临时起始基准。"}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    当前输入框里已经预填 AI 建议值。你可以按体感微调；如果不改，系统会默认你采纳这次 AI 建议。
                  </p>
                  {currentAiAnchor.logicSummary ? (
                    <p className="mt-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                      {currentAiAnchor.logicSummary}
                      {currentAiAnchor.recommendedRir !== null
                        ? ` · 推荐先按 RIR ${currentAiAnchor.recommendedRir} 校准`
                        : ""}
                    </p>
                  ) : null}
                  {currentAiAnchor.reasons.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                      {currentAiAnchor.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    这次训练的结果会成为这个动作之后安排的新起始参考。
                  </p>
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-3">
                 <div className="rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950/40">
                   <p className="text-[9px] font-black text-zinc-400 uppercase">正在聚焦</p>
                   <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">
                     第 {(currentUnitRows.find((row) => row.id === focusSetId)?.setIndex ?? currentSet.setIndex)} 组
                   </p>
                 </div>
                 <div className="rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950/40">
                   <p className="text-[9px] font-black text-zinc-400 uppercase">共计组数</p>
                   <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">{currentUnitRows.length} 组</p>
                 </div>
                 <div className="rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950/40">
                   <p className="text-[9px] font-black text-zinc-400 uppercase">完成进度</p>
                   <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">
                     {currentUnitRows.filter((row) => row.status === "completed").length}/{currentUnitRows.length}
                   </p>
                 </div>
                 <div className="rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950/40">
                   <p className="text-[9px] font-black text-zinc-400 uppercase">训练状态</p>
                   <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">{workbenchSessionStateLabel[workbenchSessionState]}</p>
                 </div>
              </div>
            </div>
            {/* Structural Graphic Element representing powerlifting */}
            <div className="absolute -right-10 -top-10 h-64 w-64 rotate-12 opacity-30 mix-blend-multiply dark:mix-blend-screen bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.03),rgba(0,0,0,0.03)_10px,transparent_10px,transparent_20px)] dark:bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.03),rgba(255,255,255,0.03)_10px,transparent_10px,transparent_20px)]" />
          </div>
          <div className="space-y-4">
            {currentUnitRows.map((row) => {
              const isFocused = row.id === focusSetId;
              const isExpanded = expandedRelatedSetIds.includes(row.id);
              const weightValue = row.actualWeightInput || row.plannedWeight || "";
              const repsValue = row.actualRepsInput || (row.plannedReps !== null ? String(row.plannedReps) : "");
              const rowPlannedRpe =
                row.plannedRpe?.trim() && Number.isFinite(Number(row.plannedRpe.trim()))
                  ? normalizeRpe(Number(row.plannedRpe.trim()))
                  : 8;
              const rowSelectedRpe =
                row.actualRpeInput.trim() && Number.isFinite(Number(row.actualRpeInput.trim()))
                  ? normalizeRpe(Number(row.actualRpeInput.trim()))
                  : null;
              const rowActiveRpe = rowSelectedRpe ?? rowPlannedRpe;
              const badgeClass = isFocused
                ? "bg-orange-500 text-white"
                : row.status === "completed"
                  ? "bg-emerald-500 text-white"
                  : row.status === "skipped"
                    ? "bg-zinc-400 text-white"
                    : "bg-blue-600 text-white";
              return (
                <article
                  key={row.id}
                  className={`overflow-hidden rounded-[2.25rem] border transition-all duration-300 ${
                    isFocused
                      ? "border-orange-200 bg-white shadow-xl shadow-orange-100/70 dark:border-orange-900/50 dark:bg-zinc-950"
                      : "border-zinc-200 bg-zinc-50/80 opacity-80 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSetEditorCard(row.id)}
                    className="flex w-full items-start justify-between gap-3 px-5 py-5 text-left transition-active active:scale-[0.99]"
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black ${badgeClass}`}>
                          第 {row.setIndex} 组{row.isExtraSet ? " · 加组" : ""}
                        </span>
                        <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                          {formatSetTypeLabel(row.plannedSetType)} · {row.status === "completed" ? "已完成" : row.status === "skipped" ? "已跳过" : isFocused ? "当前组" : "待执行"}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                        {formatRepsLabel(row.plannedReps)} · {formatWeightWithUnit(row.plannedWeight, currentUnitWeightUnit)} · 休息 {formatRestTime(row.plannedRestSeconds)} · 节奏 {formatTempoDisplay(row.plannedTempo)}
                      </p>
                    </div>
                    <span className={`pt-1 text-lg font-black ${isFocused ? "text-orange-400" : "text-zinc-400 dark:text-zinc-500"}`}>
                      {isExpanded ? "−" : "+"}
                    </span>
                  </button>

                  <div className={`grid transition-all duration-300 ease-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <div className="overflow-hidden">
                      <div className="border-t border-white/80 px-5 pb-5 pt-4 dark:border-zinc-800">
                        {(() => {
                          const restValue = row.actualRestInput || (row.plannedRestSeconds !== null ? String(row.plannedRestSeconds) : "");
                          const tempoParts = parseTempoParts(row.actualTempoInput || row.plannedTempo || "");
                          return (
                            <>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">重量 ({currentUnitWeightUnit})</span>
                                  </div>
                                  <div className="flex h-16 items-center justify-between gap-1 overflow-hidden rounded-3xl bg-zinc-50 p-1 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                                    <button
                                      type="button"
                                      onClick={() => adjustSetWeight(currentUnit.id, row.id, -DEFAULT_WEIGHT_STEP)}
                                      className="flex h-full w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-zinc-900 shadow-sm transition-transform active:scale-90 dark:bg-zinc-800 dark:text-zinc-50"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      inputMode="decimal"
                                      className="w-full flex-1 appearance-none bg-transparent text-center text-2xl font-black tracking-tighter text-zinc-900 outline-none dark:text-zinc-50"
                                      value={row.actualWeightInput}
                                      onChange={(event) => updateSetDraft(currentUnit.id, row.id, "actualWeightInput", event.target.value)}
                                      placeholder={row.plannedWeight || "-"}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => adjustSetWeight(currentUnit.id, row.id, DEFAULT_WEIGHT_STEP)}
                                      className="flex h-full w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-zinc-900 shadow-sm transition-transform active:scale-90 dark:bg-zinc-800 dark:text-zinc-50"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">次数 (Reps)</span>
                                  </div>
                                  <div className="flex h-16 items-center justify-between gap-1 overflow-hidden rounded-3xl bg-zinc-50 p-1 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentValue = parseInt(repsValue || "0", 10);
                                        updateSetDraft(currentUnit.id, row.id, "actualRepsInput", Math.max(0, currentValue - 1).toString());
                                      }}
                                      className="flex h-full w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-zinc-900 shadow-sm transition-transform active:scale-90 dark:bg-zinc-800 dark:text-zinc-50"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      inputMode="numeric"
                                      className="w-full flex-1 appearance-none bg-transparent text-center text-2xl font-black tracking-tighter text-zinc-900 outline-none dark:text-zinc-50"
                                      value={row.actualRepsInput}
                                      onChange={(event) => updateSetDraft(currentUnit.id, row.id, "actualRepsInput", event.target.value)}
                                      placeholder={row.plannedReps?.toString() || "-"}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentValue = parseInt(repsValue || "0", 10);
                                        updateSetDraft(currentUnit.id, row.id, "actualRepsInput", String(currentValue + 1));
                                      }}
                                      className="flex h-full w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-zinc-900 shadow-sm transition-transform active:scale-90 dark:bg-zinc-800 dark:text-zinc-50"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                                  <div className="space-y-2">
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400">休息时长 (秒)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="5"
                                      inputMode="numeric"
                                      value={restValue}
                                      onChange={(event) => updateSetDraft(currentUnit.id, row.id, "actualRestInput", event.target.value)}
                                      placeholder={row.plannedRestSeconds !== null ? String(row.plannedRestSeconds) : ""}
                                      className="h-14 w-full rounded-2xl bg-zinc-50 px-4 text-lg font-black text-zinc-900 outline-none ring-1 ring-zinc-200 placeholder:text-zinc-300 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-400">动作节奏</label>
                                    <div className="flex items-center gap-2">
                                      {tempoParts.map((part, index) => (
                                        <input
                                          key={`${row.id}-tempo-${index}`}
                                          type="text"
                                          inputMode="numeric"
                                          maxLength={1}
                                          value={part}
                                          onChange={(event) => {
                                            const nextParts = [...tempoParts];
                                            nextParts[index] = event.target.value.replace(/\D/g, "").slice(0, 1);
                                            updateSetDraft(currentUnit.id, row.id, "actualTempoInput", buildTempoValue(nextParts));
                                          }}
                                          placeholder={(parseTempoParts(row.plannedTempo)[index] || "").slice(0, 1)}
                                          className="h-14 w-11 rounded-2xl bg-zinc-50 text-center text-xl font-black text-zinc-900 outline-none ring-1 ring-zinc-200 placeholder:text-zinc-300 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800"
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">难度感知 (RPE)</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSetRpeValue(currentUnit.id, row.id, rowActiveRpe - RPE_STEP)}
                                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-xl font-black text-zinc-900 transition-transform active:scale-90 dark:bg-zinc-800 dark:text-zinc-100"
                                      >
                                        -
                                      </button>
                                      <span className="rounded-[1.25rem] bg-blue-50 px-4 py-2 text-lg font-black text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        RPE {formatRpeValue(rowActiveRpe)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSetRpeValue(currentUnit.id, row.id, rowActiveRpe + RPE_STEP)}
                                        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-xl font-black text-zinc-900 transition-transform active:scale-90 dark:bg-zinc-800 dark:text-zinc-100"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  <div className="px-1 py-1">
                                    <input
                                      type="range"
                                      min="6"
                                      max="10"
                                      step="0.5"
                                      value={rowActiveRpe}
                                      onChange={(event) => setSetRpeValue(currentUnit.id, row.id, Number(event.target.value))}
                                      className="workbench-rpe-slider h-5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 dark:bg-zinc-800"
                                    />
                                    <div className="mt-3 flex justify-between text-[12px] font-bold text-zinc-400">
                                      <span>6 (轻松)</span>
                                      <span>8 (留两下)</span>
                                      <span>10 (力竭)</span>
                                    </div>
                                    <div className="mt-4 grid grid-cols-4 gap-2">
                                      {QUICK_RPE_OPTIONS.map((option) => {
                                        const active = option === rowActiveRpe;
                                        return (
                                          <button
                                            key={`${row.id}-${option}`}
                                            type="button"
                                            onClick={() => setSetRpeValue(currentUnit.id, row.id, option)}
                                            className={`rounded-2xl px-3 py-3 text-sm font-black transition-transform active:scale-95 ${
                                              active
                                                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                                            }`}
                                          >
                                            {option}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          );
                        })()}

                        <div className="mt-5 flex flex-wrap gap-3">
                          {row.status === "completed" || row.status === "skipped" ? (
                            <button
                              type="button"
                              onClick={() => void saveSetEdits(currentUnit.id, row)}
                              disabled={savingSetId === row.id}
                              className="flex h-14 min-w-[140px] items-center justify-center rounded-[1.25rem] bg-zinc-900 px-5 text-sm font-black text-white shadow-xl shadow-zinc-500/20 transition-all active:scale-95 disabled:opacity-50 dark:bg-blue-600 dark:shadow-blue-500/30"
                            >
                              {savingSetId === row.id ? "保存中" : "保存修改"}
                            </button>
                          ) : (
                            <div className="rounded-[1.25rem] bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                              该组未到执行顺序，先专注当前组。
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {isRestActive && restPresentation === "card" ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center">
          <div
            className="absolute inset-0"
            onClick={() => setRestPresentation("bubble")}
            aria-hidden
          />
          <section
            ref={restCardRef}
            className="relative w-full overflow-hidden rounded-t-[3rem] bg-white p-8 shadow-2xl dark:bg-zinc-950 sm:max-w-md sm:rounded-[3rem]"
          >
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">组间休息</span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-900">自动进入下一组</span>
              </div>
              
              <div className="flex flex-col items-center">
                <p className="text-8xl font-black tracking-tighter text-zinc-900 dark:text-zinc-50">{timer.formatted}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => adjustRestBy(-15)}
                  className="flex h-14 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-black text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50 transition-active active:scale-95"
                >
                  -15s
                </button>
                <button
                  type="button"
                  onClick={() => adjustRestBy(15)}
                  className="flex h-14 items-center justify-center rounded-2xl bg-zinc-100 text-sm font-black text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50 transition-active active:scale-95"
                >
                  +15s
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void handleRestFinished("skip")}
                  className="flex h-16 w-full items-center justify-center rounded-[1.25rem] bg-zinc-900 text-sm font-black text-white dark:bg-blue-600 transition-active active:scale-95"
                >
                  {restFinishing ? "处理中..." : "跳过休息"}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={timer.state === "running" ? pauseRest : resumeRest}
                    className="flex-1 rounded-xl bg-zinc-100 py-3 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    {timer.state === "running" ? "暂停倒计时" : "继续倒计时"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestPresentation("bubble")}
                    className="flex-1 rounded-xl bg-zinc-100 py-3 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    收至侧边
                  </button>
                </div>
              </div>
            </div>
            {/* BG Gradient */}
            <div className={`absolute inset-0 opacity-10 blur-3xl transition-colors ${timer.remainingSeconds < 10 ? "bg-red-500" : "bg-blue-500 hover:bg-emerald-500"}`} />
          </section>
        </div>
      ) : null}

      {showRestBubble ? (
        <button
          type="button"
          onClick={() => setRestPresentation("card")}
          ref={restBubbleRef as RefObject<HTMLButtonElement>}
          style={restBubbleStyle}
          {...restBubbleBind}
          className="fixed z-30 flex h-20 w-20 flex-col items-center justify-center rounded-[2rem] border border-blue-200 bg-white text-blue-700 shadow-[0_18px_40px_rgba(37,99,235,0.18)] transition-transform active:scale-95 dark:border-blue-900 dark:bg-zinc-950 dark:text-blue-300"
          aria-label="展开休息倒计时卡片"
        >
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-400">休息</span>
          <span className="mt-1 text-lg font-black tracking-tight">{timer.formatted}</span>
          {timer.state === "paused" ? (
            <span className="mt-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              已暂停
            </span>
          ) : null}
        </button>
      ) : null}

      {showMoreActions && currentSet && currentUnit ? (
        <section className="fixed inset-x-0 bottom-[96px] z-30 mx-auto w-full max-w-3xl rounded-t-xl border border-zinc-200 bg-zinc-50 p-3 text-sm shadow-lg max-h-[55dvh] overflow-y-auto md:bottom-4 md:rounded-xl">
          <p className="font-medium text-zinc-900">更多操作（低频）</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={applyPlanValues}
              disabled={!isSetActive || isFinalized}
              className="min-h-11 rounded border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-700 disabled:opacity-50"
            >
              使用计划值
            </button>
            <button
              type="button"
              onClick={copyPreviousSetValues}
              disabled={!isSetActive || isFinalized}
              className="min-h-11 rounded border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-700 disabled:opacity-50"
            >
              复制上一组
            </button>
            <button
              type="button"
              onClick={() => void addExtraSet()}
              disabled={addingExtra || isFinalized}
              className="min-h-11 rounded border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-700 disabled:opacity-50"
            >
              {addingExtra ? "新增中..." : "新增一组"}
            </button>
            <button
              type="button"
              onClick={() => setShowMoreActions(false)}
              className="min-h-11 rounded border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-700"
            >
              收起更多
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-zinc-600">
              自定义重量（{currentUnitWeightUnit}）
              <input
                type="number"
                min={0}
                step={0.5}
                inputMode="decimal"
                enterKeyHint="done"
                value={currentSet.actualWeightInput}
                onChange={(event) => updateCurrentSetDraft("actualWeightInput", event.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
              />
            </label>
            <label className="text-xs text-zinc-600">
              调整次数
              <input
                type="number"
                min={0}
                inputMode="numeric"
                enterKeyHint="done"
                value={currentSet.actualRepsInput}
                onChange={(event) => updateCurrentSetDraft("actualRepsInput", event.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-600">当前提交：{currentRepsDisplay}次 · {currentWeightDisplay}{currentUnitWeightUnit}</p>
        </section>
      ) : null}

      {phase === "session_done" ? (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">本次训练已无待执行组</p>
          <p className="mt-1">
            完成组 {displaySummary.completedSets} · 未完成组 {displaySummary.pendingSets} · 临时加组{" "}
            {displaySummary.extraSets}
          </p>
          {finalizeSummary?.aiFollowup && finalizeSummary.aiFollowup.confirmedAnchors > 0 ? (
            <div className="mt-3 rounded-2xl border border-emerald-200/80 bg-white/70 px-3 py-3 text-xs font-medium text-emerald-900">
              已将本次训练结果确认为{" "}
              <span className="font-black">{finalizeSummary.aiFollowup.confirmedAnchors}</span>{" "}
              个动作的后续起点，并同步刷新后面{" "}
              <span className="font-black">{finalizeSummary.aiFollowup.refreshedFutureSessions}</span>{" "}
              次未执行安排。
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {fromToday ? (
              <Link href={todayHref} className="underline">
                返回今日训练页
              </Link>
            ) : null}
            <Link href={`/executions/${sessionExecutionId}`} className="underline">
              查看训练记录详情
            </Link>
          </div>
        </section>
      ) : null}

      {phase !== "session_done" ? (
        <section
          className="fixed inset-x-0 bottom-0 z-40 bg-white/80 p-4 backdrop-blur-xl dark:bg-zinc-950/80 border-t border-zinc-200/50 dark:border-zinc-800/80"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div className="mx-auto flex max-w-[480px] items-center gap-3">
            <button
              type="button"
              onClick={() => setShowMoreActions((c) => !c)}
              disabled={!currentSet || isFinalized}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-lg transition-transform active:scale-90 dark:bg-zinc-800"
            >
              ⚙️
            </button>
            <button
              type="button"
              onClick={() => void completeCurrentSet()}
              disabled={isActionDisabled}
              className="flex h-16 flex-1 items-center justify-center rounded-[1.25rem] bg-zinc-900 text-sm font-black text-white shadow-xl shadow-zinc-500/20 transition-all active:scale-95 disabled:opacity-50 dark:bg-blue-600 dark:shadow-blue-500/30"
            >
              {savingSetId && currentSet ? (savingSetId === currentSet.id ? "保存中" : "完成本组") : "完成本组"}
            </button>
            <button
              type="button"
              onClick={() => void skipCurrentSet()}
              disabled={isActionDisabled}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-lg transition-transform active:scale-90 dark:bg-zinc-800"
            >
              ⏭️
            </button>
          </div>
        </section>
      ) : null}

      {/* Drawers */}
      {activeDrawer === "units" && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setActiveDrawer(null)} />
          <div className="relative animate-slide-up flex flex-col max-h-[85vh] rounded-t-[2.5rem] bg-white shadow-2xl dark:bg-zinc-950 pb-safe">
            <div className="flex items-center justify-between p-6 pb-2">
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-50">训练动作 ({orderedUnits.length})</h3>
              <button 
                onClick={() => setActiveDrawer(null)} 
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {orderedUnits.map((unit, idx) => {
                 const unitRows = orderedRows(rowsByUnit[unit.id] ?? []);
                 const completed = unitRows.filter(r => r.status === "completed").length;
                 const planned = unitRows.filter(r => !r.isExtraSet).length;
                 const isCurrent = unit.id === currentUnit?.id;
                 return (
                   <button 
                     key={unit.id}
                     onClick={() => {
                       // Jump to first uncompleted or just the first set of this unit
                       const firstPending = unitRows.find((r) => r.status === "pending") || unitRows[0];
                       if (firstPending) {
                         moveToNextSet({ plannedUnitId: unit.id, setId: firstPending.id });
                       }
                       setActiveDrawer(null);
                     }}
                     className={`flex w-full flex-col gap-2 rounded-2xl p-4 text-left transition-all active:scale-[0.98] ${isCurrent ? "bg-orange-50 ring-2 ring-orange-500/30 dark:bg-orange-950/30" : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
                   >
                     <div className="flex items-center justify-between">
                       <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{idx + 1}. {unit.selected_exercise_name}</span>
                       {isCurrent ? <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-900/50 dark:text-orange-400">进行中</span> : null}
                     </div>
                     <div className="flex items-center justify-between text-xs font-medium">
                       <span className="text-zinc-500">{unitRows.length} 组 (已完成 {completed})</span>
                       <span className={completed >= planned ? "text-emerald-500" : "text-zinc-400"}>{completed >= planned ? "✓ 已达标" : "未完成"}</span>
                     </div>
                   </button>
                 );
              })}
            </div>
          </div>
        </div>
      )}

      {activeDrawer === "sets" && currentUnitRows.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setActiveDrawer(null)} />
          <div className="relative animate-slide-up flex flex-col max-h-[80vh] rounded-t-[2.5rem] bg-white shadow-2xl dark:bg-zinc-950 pb-safe">
            <div className="flex items-center justify-between p-6 pb-2">
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-50">组况详细</h3>
              <button 
                onClick={() => setActiveDrawer(null)} 
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-900"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {currentUnitRows.map((row) => (
                <button 
                  key={row.id} 
                  onClick={() => {
                    moveToNextSet({ plannedUnitId: currentUnit!.id, setId: row.id });
                    setActiveDrawer(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl p-4 transition-all active:scale-[0.98] ${row.id === activeCursor?.setId ? "bg-blue-50 ring-2 ring-blue-500/30 dark:bg-blue-900/30" : "bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
                >
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">第 {row.setIndex} 组 {row.isExtraSet ? "(加)" : ""}</span>
                    <span className="text-[10px] font-medium text-zinc-500">{formatSetTypeLabel(row.plannedSetType)}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-sm font-black text-zinc-800 dark:text-zinc-200">
                        {row.status === "completed" 
                          ? `${row.actualRepsInput || row.plannedReps}次 × ${row.actualWeightInput || row.plannedWeight}${currentUnitWeightUnit}` 
                          : `${row.plannedReps ?? "-"}次 × ${row.plannedWeight ?? "-"}${currentUnitWeightUnit}`}
                    </span>
                    <span className={`text-[10px] font-bold ${row.status === "completed" ? "text-emerald-500 dark:text-emerald-400" : "text-zinc-400"}`}>
                        {row.status === "completed" ? `已完成 (RPE ${row.actualRpeInput || row.plannedRpe || "-"})` : (isDone(row) ? "已跳过" : "待执行")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .workbench-rpe-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 28px;
          width: 28px;
          border-radius: 9999px;
          background: #2563eb;
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
          border: 3px solid #ffffff;
        }
        .workbench-rpe-slider::-moz-range-thumb {
          height: 28px;
          width: 28px;
          border-radius: 9999px;
          background: #2563eb;
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
          border: 3px solid #ffffff;
        }
      `}</style>
    </section>
  );
}
