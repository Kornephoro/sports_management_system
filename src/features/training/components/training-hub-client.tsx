"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import {
  createTrainingMesocycle,
  GetTrainingProgressMatrixV2Options,
  getTrainingCalendarBootstrap,
  getTrainingProgressBootstrap,
  getTrainingProgressMatrixV2,
  TrainingCalendarBootstrapResponse,
  TrainingProgressBootstrapResponse,
  TrainingProgressMatrixV2Response,
  updateTrainingMesocycle,
} from "@/features/training/training-api";
import { AppCard, EmptyState, InlineAlert, SkeletonRows, SectionBlock } from "@/features/shared/components/ui-primitives";
import { getSessionExecutionStatusLabel, getSessionStatusLabel } from "@/features/shared/ui-zh";
import { buildProgressionMatrixVisualState, getProgressionMatrixAuxFlagLabel } from "@/features/progression/progression-visual-state";
import { TrainingPlanningOrchestratorClient } from "@/features/training/components/training-planning-orchestrator-client";
import { TemplateLibraryPanelClient } from "@/features/template-library/components/template-library-panel-client";
import { DualAnatomyMapper } from "@/features/exercise-library/components/muscle-map/dual-anatomy-mapper";
import { ACTION_PRIMARY_MUSCLE_TO_REGIONS } from "@/lib/action-filter-standards";
import { getMovementPatternLabel, getMuscleRegionLabel, MuscleRegionV1 } from "@/lib/exercise-library-standards";

type TrainingHubClientProps = {
  userId: string;
  initialProgressData?: TrainingProgressBootstrapResponse | null;
};

type TrainingModuleView = "calendar" | "planning" | "progression";
type ProgressionTab = "overview" | "matrix" | "trends" | "alerts" | "anatomy";
type SelectedMatrixCell = { rowKey: string; columnId: string };
type MatrixRow = TrainingProgressMatrixV2Response["rows"][number];
type MatrixCell = MatrixRow["cells"][number];
type CalendarGridCell = { key: string; dateKey: string; isCurrentMonth: boolean };
type UpcomingSessionSlot = TrainingCalendarBootstrapResponse["upcomingSessions"][number];
type ExecutionSlot = TrainingCalendarBootstrapResponse["recentExecutions"][number];
type CalendarContentEntry = {
  key: string;
  kind: "planned" | "execution";
  href: string;
  meta: string;
  title: string;
  subtitle: string | null;
  order: number;
  stripClassName: string;
  bodyClassName: string;
  titleClassName: string;
};
type AnatomySummary = {
  rows: Array<{
    region: MuscleRegionV1;
    label: string;
    score: number;
    share: number;
  }>;
  intensity: Partial<Record<MuscleRegionV1, number>>;
  primary: MuscleRegionV1[];
  secondary: MuscleRegionV1[];
};
type CycleSheetMode = null | "start" | "start_deload" | "end_deload" | "end_cycle";

const VIEW_LABELS: Record<TrainingModuleView, string> = {
  calendar: "训练日程",
  planning: "计划编排",
  progression: "进步监测",
};
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const PROGRESSION_TAB_LABELS: Record<ProgressionTab, string> = {
  overview: "总览",
  anatomy: "部位热力",
  matrix: "进步矩阵",
  trends: "趋势",
  alerts: "预警",
};
const DELOAD_REASON_OPTIONS = [
  { value: "recovery_risk", label: "恢复压力偏高" },
  { value: "subjective_fatigue", label: "主观疲劳偏高" },
  { value: "manual", label: "主动恢复调整" },
  { value: "planned", label: "计划减载" },
  { value: "other", label: "其他" },
] as const;
const END_REASON_OPTIONS = [
  { value: "manual_complete", label: "阶段目标完成" },
  { value: "fatigue_management", label: "恢复管理需要" },
  { value: "goal_switch", label: "切换训练重点" },
  { value: "injury_or_constraint", label: "伤病 / 限制" },
  { value: "schedule_change", label: "日程变化" },
  { value: "other", label: "其他" },
] as const;

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年${Number(month)}月`;
}

function shiftMonth(monthKey: string, offset: number) {
  const [rawYear, rawMonth] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(rawYear), Number(rawMonth) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount));
}

function buildFixedCalendarGrid(monthStartKey: string): CalendarGridCell[] {
  const [rawYear, rawMonth] = monthStartKey.split("-");
  const firstDay = new Date(Date.UTC(Number(rawYear), Number(rawMonth) - 1, 1));
  const mondayBasedWeekday = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = addDaysUtc(firstDay, -mondayBasedWeekday);
  const monthKey = monthStartKey.slice(0, 7);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDaysUtc(gridStart, index);
    const dateKey = toDateKey(date);
    return {
      key: dateKey,
      dateKey,
      isCurrentMonth: dateKey.slice(0, 7) === monthKey,
    };
  });
}

function parseView(value: string | null): TrainingModuleView {
  if (value === "planning" || value === "library") return "planning";
  if (value === "progression") return "progression";
  return "calendar";
}

function parseProgressionTab(value: string | null): ProgressionTab {
  if (value === "anatomy") return "anatomy";
  if (value === "matrix") return "matrix";
  if (value === "trends") return "trends";
  if (value === "alerts") return "alerts";
  return "overview";
}

function getTodayTrainingStateLabel(state: "not_started" | "in_progress" | "completed") {
  if (state === "in_progress") return "进行中";
  if (state === "completed") return "已完成";
  return "未开始";
}

function getTodayTrainingStateClass(state: "not_started" | "in_progress" | "completed") {
  if (state === "in_progress") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400";
  if (state === "completed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400";
  return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400";
}

function buildDefaultMesocycleName() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月训练阶段`;
}

function getCycleMarkerClassName(tone: "mesocycle" | "microcycle" | "deload") {
  if (tone === "mesocycle") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300";
  }
  if (tone === "deload") {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300";
}

function getCycleStatusLabel(
  cycle:
    | TrainingCalendarBootstrapResponse["cycleSummary"]["activeMesocycle"]
    | null,
) {
  if (!cycle) return null;
  if (cycle.activeDeload) return "减载中";
  if (cycle.suggestedAction === "deload") return "建议减载";
  if (cycle.suggestedAction === "end") return "建议收周期";
  return "推进中";
}

function getCycleStatusClassName(
  cycle:
    | TrainingCalendarBootstrapResponse["cycleSummary"]["activeMesocycle"]
    | null,
) {
  if (!cycle) return "";
  if (cycle.activeDeload) {
    return "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300";
  }
  if (cycle.suggestedAction === "deload") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  }
  if (cycle.suggestedAction === "end") {
    return "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
  }
  return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatMaybeNumber(value: number | null, suffix = "") {
  if (value === null) return "-";
  return `${Number(value.toFixed(2))}${suffix}`;
}

function toCompactDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function buildCalendarContentEntries(
  plannedSessions: UpcomingSessionSlot[],
  executedSessions: ExecutionSlot[],
) {
  const entries: CalendarContentEntry[] = [
    ...executedSessions.map((item) => ({
      key: `execution:${item.id}`,
      kind: "execution" as const,
      href: `/executions/${item.id}`,
      meta: `${item.sequenceIndex ? `#${item.sequenceIndex}` : "记录"} · ${getSessionExecutionStatusLabel(item.completionStatus)}`,
      title: item.title,
      subtitle: item.subtitle,
      order: item.sequenceIndex ?? Number.MAX_SAFE_INTEGER,
      stripClassName: "bg-emerald-500 text-white dark:bg-emerald-500",
      bodyClassName:
        "border border-emerald-200/70 bg-white dark:border-emerald-900/50 dark:bg-zinc-950",
      titleClassName: "text-zinc-950 dark:text-zinc-50",
    })),
    ...plannedSessions.map((item) => ({
      key: `planned:${item.id}`,
      kind: "planned" as const,
      href: `/programs/${item.program?.id || "unknown"}/planned-sessions/${item.id}/plan`,
      meta: `#${item.sequenceIndex} · ${getSessionStatusLabel(item.status)}`,
      title: item.title,
      subtitle: item.unitSummary ?? null,
      order: item.sequenceIndex,
      stripClassName: "bg-blue-500 text-white dark:bg-blue-500",
      bodyClassName:
        "border border-blue-200/70 bg-white dark:border-blue-900/50 dark:bg-zinc-950",
      titleClassName: "text-zinc-950 dark:text-zinc-50",
    })),
  ];

  return entries.sort((a, b) => a.order - b.order);
}

function getProgressionTabHref(tab: ProgressionTab) {
  return `/training?view=progression&tab=${tab}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function formatSnapshotValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  }
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "-";
  return String(value);
}

const MOVEMENT_PATTERN_TO_REGIONS: Partial<Record<string, MuscleRegionV1[]>> = {
  horizontal_push: ["chest", "delt_front", "triceps"],
  vertical_push: ["delt_front", "delt_mid", "triceps"],
  horizontal_pull: ["lats", "rhomboids", "delt_rear", "biceps"],
  vertical_pull: ["lats", "biceps", "forearms"],
  squat_knee_dominant: ["quads", "glutes", "adductors"],
  hip_hinge: ["hamstrings", "glutes", "erector_spinae"],
  split_lunge: ["quads", "glutes", "adductors"],
  lower_isolation: ["quads", "hamstrings", "calves"],
  upper_isolation: ["biceps", "triceps", "delt_mid"],
  core: ["core", "abs", "obliques", "erector_spinae"],
  carry: ["core", "forearms", "traps_mid_upper"],
};

function uniqueRegions(regions: MuscleRegionV1[]) {
  return Array.from(new Set(regions));
}

function buildProgressAnatomySummary(progressData: TrainingProgressBootstrapResponse | null): AnatomySummary {
  if (!progressData) {
    return {
      rows: [],
      intensity: {},
      primary: [],
      secondary: [],
    };
  }

  const scoreByRegion = new Map<MuscleRegionV1, number>();
  for (const track of progressData.trackTrends) {
    const executedPoints = track.points.filter((point) => point.outcome !== null);
    if (executedPoints.length === 0) {
      continue;
    }

    const declaredRegions = track.primaryMuscles.flatMap((group) => ACTION_PRIMARY_MUSCLE_TO_REGIONS[group as keyof typeof ACTION_PRIMARY_MUSCLE_TO_REGIONS] ?? []);
    const fallbackRegions = track.movementPatterns.flatMap((pattern) => MOVEMENT_PATTERN_TO_REGIONS[pattern] ?? []);
    const regions = uniqueRegions((declaredRegions.length > 0 ? declaredRegions : fallbackRegions).filter(Boolean));
    if (regions.length === 0) {
      continue;
    }

    const totalContribution = executedPoints.reduce((sum, point) => sum + Math.max(0.25, point.outcomeScore || 0), 0);
    for (const region of regions) {
      scoreByRegion.set(region, Number(((scoreByRegion.get(region) ?? 0) + totalContribution).toFixed(2)));
    }
  }

  const rows = Array.from(scoreByRegion.entries())
    .map(([region, score]) => ({
      region,
      label: getMuscleRegionLabel(region),
      score,
      share: 0,
    }))
    .sort((a, b) => b.score - a.score);

  const totalScore = rows.reduce((sum, row) => sum + row.score, 0);
  const maxScore = rows[0]?.score ?? 0;
  const normalizedRows = rows.map((row) => ({
    ...row,
    share: totalScore > 0 ? Number(((row.score / totalScore) * 100).toFixed(1)) : 0,
  }));
  const intensity = Object.fromEntries(
    normalizedRows.map((row) => [row.region, maxScore > 0 ? Number((row.score / maxScore).toFixed(3)) : 0]),
  ) as Partial<Record<MuscleRegionV1, number>>;

  return {
    rows: normalizedRows,
    intensity,
    primary: normalizedRows
      .filter((row) => maxScore > 0 && row.score >= Math.max(1, maxScore * 0.55))
      .map((row) => row.region),
    secondary: normalizedRows
      .filter((row) => row.score > 0 && row.score < Math.max(1, maxScore * 0.55))
      .map((row) => row.region),
  };
}

function MiniBars({
  points,
  unit,
}: {
  points: Array<{ dateKey: string; value: number; trainingQuality: number | null }>;
  unit: string;
}) {
  const normalizedPoints = useMemo(() => {
    const byDate = new Map<string, { dateKey: string; value: number; trainingQuality: number | null }>();
    for (const point of points) {
      byDate.set(point.dateKey, point);
    }
    return Array.from(byDate.values()).slice(-14);
  }, [points]);

  if (normalizedPoints.length === 0) {
    return <p className="text-xs text-zinc-500">暂无数据</p>;
  }

  const maxValue = Math.max(...normalizedPoints.map((item) => item.value), 1);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1">
        {normalizedPoints.map((point) => {
          const ratio = Math.max(point.value / maxValue, 0.1);
          return (
            <div key={point.dateKey} className="flex-1 rounded-sm bg-blue-100/50 p-[1px] dark:bg-blue-900/30">
              <div
                className="w-full rounded-sm bg-blue-500 shadow-sm dark:bg-blue-400"
                style={{ height: `${Math.max(8, Math.round(30 * ratio))}px` }}
                title={`${point.dateKey}：${point.value}${unit}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>{toCompactDateLabel(normalizedPoints[0].dateKey)}</span>
        <span>{toCompactDateLabel(normalizedPoints[normalizedPoints.length - 1].dateKey)}</span>
      </div>
    </div>
  );
}

export function TrainingHubClient({ userId, initialProgressData = null }: TrainingHubClientProps) {
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get("view"));
  const progressionTab = parseProgressionTab(searchParams.get("tab"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState(() => toDateKey(new Date()).slice(0, 7));
  const [bootstrap, setBootstrap] = useState<TrainingCalendarBootstrapResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [scheduleView, setScheduleView] = useState<"calendar" | "list">("calendar");
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [cycleSheetMode, setCycleSheetMode] = useState<CycleSheetMode>(null);
  const [cycleSubmitting, setCycleSubmitting] = useState(false);
  const [cycleActionError, setCycleActionError] = useState<string | null>(null);
  const [cycleDraftName, setCycleDraftName] = useState(() => buildDefaultMesocycleName());
  const [cycleDraftPackageId, setCycleDraftPackageId] = useState("");
  const [cycleDraftNote, setCycleDraftNote] = useState("");
  const [deloadReason, setDeloadReason] =
    useState<(typeof DELOAD_REASON_OPTIONS)[number]["value"]>("manual");
  const [endReason, setEndReason] =
    useState<(typeof END_REASON_OPTIONS)[number]["value"]>("manual_complete");

  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<TrainingProgressBootstrapResponse | null>(initialProgressData);

  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixData, setMatrixData] = useState<TrainingProgressMatrixV2Response | null>(null);

  const [matrixWindow, setMatrixWindow] = useState<7 | 10 | 14>(10);
  const [matrixIncludeRecent, setMatrixIncludeRecent] = useState(true);
  const [matrixRecentCount, setMatrixRecentCount] = useState(3);
  const [matrixAxis, setMatrixAxis] = useState<"calendar" | "exposure">("exposure");
  const [matrixRowAxis, setMatrixRowAxis] = useState<"track" | "session_type">("track");
  const [matrixSessionType, setMatrixSessionType] = useState("__all__");
  const [matrixMovementPattern, setMatrixMovementPattern] = useState("__all__");
  const [matrixPrimaryMuscle, setMatrixPrimaryMuscle] = useState("__all__");
  const [matrixOnlyAbnormal, setMatrixOnlyAbnormal] = useState(false);
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<SelectedMatrixCell | null>(null);
  const refreshTrainingBootstrap = useCallback(async () => {
    const result = await getTrainingCalendarBootstrap(userId, monthKey);
    setBootstrap(result);
    return result;
  }, [monthKey, userId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTrainingCalendarBootstrap(userId, monthKey);
        if (cancelled) return;
        setBootstrap(result);
      } catch (nextError) {
        if (!cancelled) {
          setBootstrap(null);
          setError(nextError instanceof Error ? nextError.message : "加载训练模块失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [userId, monthKey]);

  useEffect(() => {
    if (!bootstrap) return;
    if (selectedDate.slice(0, 7) === bootstrap.month) {
      return;
    }
    const fallbackDate = bootstrap.todayDateKey.slice(0, 7) === bootstrap.month ? bootstrap.todayDateKey : bootstrap.monthStart;
    setSelectedDate(fallbackDate);
  }, [bootstrap, selectedDate]);

  useEffect(() => {
    if (!initialProgressData) {
      return;
    }
    setProgressData(initialProgressData);
    setProgressError(null);
    setProgressLoading(false);
  }, [initialProgressData]);

  useEffect(() => {
    if (view !== "progression") {
      return;
    }
    if (progressData || progressLoading) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setProgressLoading(true);
      setProgressError(null);
      try {
        const result = await getTrainingProgressBootstrap(userId);
        if (!cancelled) {
          setProgressData(result);
        }
      } catch (nextError) {
        if (!cancelled) {
          setProgressError(nextError instanceof Error ? nextError.message : "加载进步总览失败");
        }
      } finally {
        if (!cancelled) {
          setProgressLoading(false);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [progressData, progressLoading, userId, view]);

  useEffect(() => {
    if (view !== "progression" || progressionTab !== "matrix") {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setMatrixLoading(true);
      setMatrixError(null);
      try {
        const options: GetTrainingProgressMatrixV2Options = {
          window: matrixWindow,
          includeRecent: matrixIncludeRecent,
          recentCount: matrixRecentCount,
          axis: matrixAxis,
          rowAxis: matrixRowAxis,
          onlyAbnormal: matrixOnlyAbnormal,
          sessionType: matrixSessionType !== "__all__" ? matrixSessionType : undefined,
          movementPattern: matrixMovementPattern !== "__all__" ? matrixMovementPattern : undefined,
          primaryMuscle: matrixPrimaryMuscle !== "__all__" ? matrixPrimaryMuscle : undefined,
        };
        const result = await getTrainingProgressMatrixV2(userId, options);
        if (!cancelled) {
          setMatrixData(result);
          setSelectedMatrixCell(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setMatrixData(null);
          setMatrixError(nextError instanceof Error ? nextError.message : "加载进步矩阵失败");
        }
      } finally {
        if (!cancelled) {
          setMatrixLoading(false);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [
    matrixAxis,
    matrixIncludeRecent,
    matrixMovementPattern,
    matrixOnlyAbnormal,
    matrixPrimaryMuscle,
    matrixRecentCount,
    matrixRowAxis,
    matrixSessionType,
    matrixWindow,
    progressionTab,
    userId,
    view,
  ]);

  const monthGrid = useMemo(() => {
    if (!bootstrap) return [];
    return buildFixedCalendarGrid(bootstrap.monthStart);
  }, [bootstrap]);

  const plannedByDate = useMemo(() => {
    const map = new Map<string, TrainingCalendarBootstrapResponse["upcomingSessions"]>();
    if (!bootstrap) return map;
    for (const item of bootstrap.upcomingSessions) {
      const list = map.get(item.dateKey) ?? [];
      list.push(item);
      map.set(item.dateKey, list);
    }
    return map;
  }, [bootstrap]);

  const executionByDate = useMemo(() => {
    const map = new Map<string, TrainingCalendarBootstrapResponse["recentExecutions"]>();
    if (!bootstrap) return map;
    for (const item of bootstrap.recentExecutions) {
      const list = map.get(item.dateKey) ?? [];
      list.push(item);
      map.set(item.dateKey, list);
    }
    return map;
  }, [bootstrap]);

  const restByDate = useMemo(() => {
    return new Set(bootstrap?.restDateKeys ?? []);
  }, [bootstrap]);
  const cycleMarkersByDate = useMemo(() => {
    const map = new Map<string, TrainingCalendarBootstrapResponse["cycleSummary"]["markers"]>();
    for (const marker of bootstrap?.cycleSummary.markers ?? []) {
      const list = map.get(marker.dateKey) ?? [];
      list.push(marker);
      map.set(marker.dateKey, list);
    }
    return map;
  }, [bootstrap?.cycleSummary.markers]);

  const selectedDatePlanned = useMemo(
    () => plannedByDate.get(selectedDate) ?? [],
    [plannedByDate, selectedDate],
  );
  const selectedDateExecuted = useMemo(
    () => executionByDate.get(selectedDate) ?? [],
    [executionByDate, selectedDate],
  );
  const selectedDateIsRest = restByDate.has(selectedDate);
  const executedPlannedSessionIds = useMemo(
    () =>
      new Set(
        (bootstrap?.recentExecutions ?? [])
          .map((item) => item.plannedSessionId)
          .filter((value): value is string => typeof value === "string"),
      ),
    [bootstrap?.recentExecutions],
  );
  const visibleUpcomingSessions = useMemo(
    () => (bootstrap?.upcomingSessions ?? []).filter((item) => !executedPlannedSessionIds.has(item.id)),
    [bootstrap?.upcomingSessions, executedPlannedSessionIds],
  );
  const visibleSelectedDatePlanned = useMemo(
    () => selectedDatePlanned.filter((item) => !executedPlannedSessionIds.has(item.id)),
    [executedPlannedSessionIds, selectedDatePlanned],
  );
  const selectedDateEntries = useMemo(
    () => buildCalendarContentEntries(visibleSelectedDatePlanned, selectedDateExecuted),
    [selectedDateExecuted, visibleSelectedDatePlanned],
  );
  const selectedDateCycleMarkers = useMemo(
    () => cycleMarkersByDate.get(selectedDate) ?? [],
    [cycleMarkersByDate, selectedDate],
  );

  const matrixRowsWithMap = useMemo(() => {
    if (!matrixData) return [] as Array<{ row: MatrixRow; cellMap: Map<string, MatrixCell> }>;
    return matrixData.rows.map((row) => ({
      row,
      cellMap: new Map(row.cells.map((cell) => [cell.columnId, cell])),
    }));
  }, [matrixData]);

  const selectedMatrixCellData = useMemo(() => {
    if (!selectedMatrixCell || !matrixData) return null;
    const row = matrixData.rows.find((item) => item.key === selectedMatrixCell.rowKey);
    if (!row) return null;
    const cell = row.cells.find((item) => item.columnId === selectedMatrixCell.columnId);
    if (!cell) return null;
    const column = matrixData.columns.find((item) => item.id === selectedMatrixCell.columnId);
    const visual = buildProgressionMatrixVisualState(cell.progressionSnapshot, cell.matrixCellPayload);
    return {
      row,
      cell,
      column,
      visual,
      snapshot: toRecord(visual.snapshot),
    };
  }, [matrixData, selectedMatrixCell]);

  const progressionAnatomy = useMemo(
    () => buildProgressAnatomySummary(progressData),
    [progressData],
  );

  const topMovementPatterns = useMemo(() => {
    if (!progressData) return [];
    const countByPattern = new Map<string, number>();
    for (const track of progressData.trackTrends) {
      const executedCount = track.points.filter((point) => point.outcome !== null).length;
      if (executedCount === 0) continue;
      for (const pattern of track.movementPatterns) {
        countByPattern.set(pattern, (countByPattern.get(pattern) ?? 0) + executedCount);
      }
    }
    return Array.from(countByPattern.entries())
      .map(([pattern, count]) => ({
        pattern,
        label: getMovementPatternLabel(pattern),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [progressData]);
  const activeMesocycle = bootstrap?.cycleSummary.activeMesocycle ?? null;
  const candidateCyclePackages = bootstrap?.cycleSummary.candidatePackages ?? [];

  useEffect(() => {
    if (activeMesocycle) {
      return;
    }
    if (!candidateCyclePackages.some((item) => item.id === cycleDraftPackageId)) {
      setCycleDraftPackageId(candidateCyclePackages[0]?.id ?? "");
    }
  }, [activeMesocycle, candidateCyclePackages, cycleDraftPackageId]);

  const openCycleSheet = useCallback(
    (mode: CycleSheetMode) => {
      setCycleSheetMode(mode);
      setCycleActionError(null);
      setCycleDraftNote("");
      if (mode === "start") {
        setCycleDraftName(buildDefaultMesocycleName());
        setCycleDraftPackageId((current) =>
          candidateCyclePackages.some((item) => item.id === current)
            ? current
            : candidateCyclePackages[0]?.id ?? "",
        );
      }
      if (mode === "start_deload") {
        setDeloadReason(activeMesocycle?.suggestedAction === "deload" ? "recovery_risk" : "manual");
      }
      if (mode === "end_cycle") {
        setEndReason(
          activeMesocycle?.suggestedAction === "end" ? "manual_complete" : "manual_complete",
        );
      }
    },
    [activeMesocycle?.suggestedAction, candidateCyclePackages],
  );

  const closeCycleSheet = useCallback(() => {
    if (cycleSubmitting) return;
    setCycleSheetMode(null);
    setCycleActionError(null);
  }, [cycleSubmitting]);

  const submitCycleSheet = useCallback(async () => {
    if (!bootstrap) return;
    setCycleSubmitting(true);
    setCycleActionError(null);
    try {
      if (cycleSheetMode === "start") {
        const selectedPackage = candidateCyclePackages.find((item) => item.id === cycleDraftPackageId);
        if (!selectedPackage) {
          throw new Error("请先选择一个计划包");
        }
        const anchorSequence =
          bootstrap.todayTraining.plannedEntry?.plannedSession.sequence_index ??
          bootstrap.upcomingSessions[0]?.sequenceIndex ??
          null;
        await createTrainingMesocycle({
          userId,
          name: cycleDraftName.trim() || buildDefaultMesocycleName(),
          primaryPackageId: selectedPackage.id,
          programId: selectedPackage.linkedProgramId ?? undefined,
          startSequenceIndex: anchorSequence,
          notes: cycleDraftNote.trim() || undefined,
        });
      } else if (activeMesocycle && cycleSheetMode === "start_deload") {
        await updateTrainingMesocycle(activeMesocycle.id, {
          userId,
          action: "start_deload",
          reason: deloadReason,
          note: cycleDraftNote.trim() || undefined,
        });
      } else if (activeMesocycle && cycleSheetMode === "end_deload") {
        await updateTrainingMesocycle(activeMesocycle.id, {
          userId,
          action: "end_deload",
          note: cycleDraftNote.trim() || undefined,
        });
      } else if (activeMesocycle && cycleSheetMode === "end_cycle") {
        await updateTrainingMesocycle(activeMesocycle.id, {
          userId,
          action: "end_cycle",
          reason: endReason,
          note: cycleDraftNote.trim() || undefined,
        });
      }
      await refreshTrainingBootstrap();
      setCycleSheetMode(null);
      setCycleDraftNote("");
    } catch (error) {
      setCycleActionError(error instanceof Error ? error.message : "周期操作失败");
    } finally {
      setCycleSubmitting(false);
    }
  }, [
    activeMesocycle,
    bootstrap,
    candidateCyclePackages,
    cycleDraftName,
    cycleDraftNote,
    cycleDraftPackageId,
    cycleSheetMode,
    deloadReason,
    endReason,
    refreshTrainingBootstrap,
    userId,
  ]);

  return (
    <section className="space-y-4 pb-32">
      <AppCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">今日训练主入口</p>
          {bootstrap ? (
            <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase ${getTodayTrainingStateClass(bootstrap.todayTraining.state)}`}>
              {getTodayTrainingStateLabel(bootstrap.todayTraining.state)}
            </span>
          ) : null}
        </div>
        {bootstrap?.todayTraining.plannedEntry ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {bootstrap.todayTraining.plannedEntry.mode === "next" ? "下一次训练" : "最近一次训练"}：<strong className="font-semibold text-zinc-900 dark:text-zinc-100">训练 #{bootstrap.todayTraining.plannedEntry.plannedSession.sequence_index}</strong>
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">当前没有可执行训练，请先创建计划。</p>
        )}
        <div className="flex">
          {bootstrap ? (
            <Link href={bootstrap.todayTraining.actionHref} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400">
              {bootstrap.todayTraining.actionLabel}
            </Link>
          ) : null}
        </div>
      </AppCard>

      {!loading && !error && bootstrap ? (
        <AppCard className="space-y-3">
          {activeMesocycle ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">当前中周期</p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${getCycleStatusClassName(activeMesocycle)}`}
                    >
                      {getCycleStatusLabel(activeMesocycle)}
                    </span>
                  </div>
                  <p className="truncate text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                    {activeMesocycle.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCycleSheet("end_cycle")}
                  className="shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-[11px] font-bold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
                >
                  结束中周期
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                  {activeMesocycle.primaryPackageName ?? "未绑定计划包"}
                </span>
                {activeMesocycle.currentRunIndex !== null ? (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                    小周期 {activeMesocycle.currentRunIndex}
                    {activeMesocycle.currentRunDay !== null && activeMesocycle.currentRunSize !== null
                      ? ` · 第 ${activeMesocycle.currentRunDay}/${activeMesocycle.currentRunSize} 练`
                      : ""}
                  </span>
                ) : null}
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                  已进行 {activeMesocycle.weeksElapsed} 周
                </span>
                {activeMesocycle.deloadCount > 0 ? (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                    已减载 {activeMesocycle.deloadCount} 次
                  </span>
                ) : null}
              </div>

              {activeMesocycle.suggestionReason ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    activeMesocycle.suggestedAction === "end"
                      ? "bg-violet-50 text-violet-900 dark:bg-violet-950/20 dark:text-violet-100"
                      : activeMesocycle.suggestedAction === "deload"
                        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100"
                        : "bg-zinc-50 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300"
                  }`}
                >
                  {activeMesocycle.suggestionReason}
                </div>
              ) : null}
              {activeMesocycle.stressSignals.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeMesocycle.stressSignals.map((signal) => (
                    <span
                      key={signal}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        activeMesocycle.fatigueState === "high"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openCycleSheet(activeMesocycle.activeDeload ? "end_deload" : "start_deload")}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[0.98] ${
                    activeMesocycle.activeDeload
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-orange-500 text-white hover:bg-orange-400 dark:bg-orange-500 dark:hover:bg-orange-400"
                  }`}
                >
                  {activeMesocycle.activeDeload ? "结束减载" : "进入减载"}
                </button>
                <button
                  type="button"
                  onClick={() => openCycleSheet("end_cycle")}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-950 active:scale-[0.98] dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:text-zinc-50"
                >
                  收周期
                </button>
              </div>
              <div className="flex justify-end">
                <Link
                  href="/training/cycles"
                  className="text-xs font-bold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  查看周期档案
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">当前中周期</p>
                  <p className="text-base font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                    暂无进行中的周期
                  </p>
                </div>
                {bootstrap.cycleSummary.archivedCount > 0 ? (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                    已归档 {bootstrap.cycleSummary.archivedCount}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                用中周期把一段训练阶段收起来。开始后再选择要关联的计划包，小周期会随之自动轮转。
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openCycleSheet("start")}
                  disabled={candidateCyclePackages.length === 0}
                  className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  开始中周期
                </button>
                {bootstrap.cycleSummary.archivedCount > 0 ? (
                  <div className="flex justify-end">
                    <Link
                      href="/training/cycles"
                      className="text-xs font-bold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      查看周期档案
                    </Link>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </AppCard>
      ) : null}

      <div className="flex items-center justify-between gap-3 overflow-hidden rounded-[1.5rem] bg-zinc-100/80 p-1.5 shadow-inner dark:bg-zinc-900/50">
        <div className="shrink-0 flex items-center pl-1">
          <button
            type="button"
            onClick={() => setShowTemplateLibrary(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm transition-transform hover:scale-105 active:scale-95 dark:bg-zinc-800 dark:ring-1 dark:ring-white/10"
            title="训练模板库"
          >
            <span aria-hidden>📂</span>
          </button>
        </div>
        <div className="flex flex-1 gap-1">
          {(Object.keys(VIEW_LABELS) as TrainingModuleView[]).map((item) => (
            <Link
              key={item}
              href={`/training?view=${item}`}
              className={`flex-1 rounded-[1.25rem] px-2 py-2 text-center text-xs font-bold transition-all active:scale-[0.98] ${
                view === item 
                 ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50 scale-100" 
                 : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
              }`}
            >
              {VIEW_LABELS[item]}
            </Link>
          ))}
        </div>
        <div className="shrink-0 flex items-center pr-1">
          <Link
            href={bootstrap?.moduleEntrypoints.exerciseLibraryHref ?? "/exercise-library"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm transition-transform hover:scale-105 active:scale-95 dark:bg-zinc-800 dark:ring-1 dark:ring-white/10"
            title="动作库"
          >
            <span aria-hidden>🏋️</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <AppCard>
          <SkeletonRows rows={6} />
        </AppCard>
      ) : null}

      {!loading && error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {!loading && !error && bootstrap && view === "calendar" ? (
        <div className="space-y-4">
          <AppCard className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">训练日程</p>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                  <button
                    onClick={() => setScheduleView("calendar")}
                    className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                      scheduleView === "calendar"
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                    }`}
                  >
                    日历
                  </button>
                  <button
                    onClick={() => setScheduleView("list")}
                    className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                      scheduleView === "list"
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                    }`}
                  >
                    列表
                  </button>
                </div>
                {scheduleView === "calendar" && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMonthKey((current) => shiftMonth(current, -1))}
                      className="rounded-lg bg-zinc-100 px-2 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    >
                      &lt;
                    </button>
                    <span className="min-w-[70px] text-center text-[13px] font-bold tracking-tight text-zinc-800 dark:text-zinc-200">{getMonthLabel(bootstrap.month)}</span>
                    <button
                      type="button"
                      onClick={() => setMonthKey((current) => shiftMonth(current, 1))}
                      className="rounded-lg bg-zinc-100 px-2 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </div>
            </div>

            {scheduleView === "calendar" ? (
              <div className="space-y-4">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  逾期待处理 <span className="font-bold text-orange-500 dark:text-orange-400">{bootstrap.scheduleSummary.overdueCount}</span> 条，待执行 <span className="font-bold text-blue-600 dark:text-blue-400">{visibleUpcomingSessions.length}</span> 条。
                </p>

                <div className="grid grid-cols-7 gap-1.5 px-1">
                  {WEEKDAY_LABELS.map((label) => (
                    <div
                      key={label}
                      className="pb-1 text-center text-[11px] font-black tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {monthGrid.map((cell) => {
                    const plannedSessions = (plannedByDate.get(cell.dateKey) ?? []).filter(
                      (item) => !executedPlannedSessionIds.has(item.id),
                    );
                    const executedSessions = executionByDate.get(cell.dateKey) ?? [];
                    const contentEntries = buildCalendarContentEntries(plannedSessions, executedSessions);
                    const cycleMarkers = cycleMarkersByDate.get(cell.dateKey) ?? [];
                    const restFlag = restByDate.has(cell.dateKey);
                    const isToday = cell.dateKey === bootstrap.todayDateKey;
                    const isSelected = cell.dateKey === selectedDate;
                    const day = Number(cell.dateKey.slice(-2));

                    return (
                      <button
                        key={`${cell.key}-${cell.isCurrentMonth ? "in" : "out"}`}
                        type="button"
                        onClick={() => {
                          if (cell.isCurrentMonth) {
                            setSelectedDate(cell.dateKey);
                          }
                        }}
                        className={`flex min-h-[156px] flex-col overflow-hidden rounded-[1.2rem] border px-1.5 py-2 text-left transition-all active:scale-[0.98] ${
                          !cell.isCurrentMonth
                            ? "cursor-default border-transparent bg-zinc-50 opacity-30 grayscale dark:bg-zinc-900/40"
                            : isSelected
                              ? "border-blue-500 bg-blue-50/30 shadow-sm dark:border-blue-400 dark:bg-blue-900/10"
                              : "border-zinc-100 bg-white hover:bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950/20 dark:hover:bg-zinc-900/40"
                        }`}
                      >
                        <div className="flex w-full items-start justify-between">
                          <span
                            className={`text-[12px] font-black leading-none ${
                              isToday ? "text-blue-600 dark:text-blue-400 font-black" : cell.isCurrentMonth ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-600"
                            }`}
                          >
                            {day}
                          </span>
                          {isToday ? <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-sm" title="今天" /> : null}
                        </div>
                        
                        <div className="mt-2 flex w-full flex-1 flex-col gap-1.5 overflow-hidden">
                          {cell.isCurrentMonth && cycleMarkers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {cycleMarkers.slice(0, 2).map((marker, markerIndex) => (
                                <span
                                  key={`${cell.dateKey}-${marker.label}-${marker.tone}-${markerIndex}`}
                                  className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black leading-none ${getCycleMarkerClassName(marker.tone)}`}
                                >
                                  {marker.label}
                                </span>
                              ))}
                              {cycleMarkers.length > 2 ? (
                                <span className="rounded-full border border-zinc-200 px-1.5 py-0.5 text-[8px] font-black leading-none text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                                  +{cycleMarkers.length - 2}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {cell.isCurrentMonth && contentEntries.length > 0 ? (
                            <>
                              {contentEntries.slice(0, 2).map((entry) => (
                                <Link
                                  key={entry.key}
                                  href={entry.href}
                                  onClick={(event) => event.stopPropagation()}
                                  className="block overflow-hidden rounded-lg shadow-sm"
                                >
                                  <div className={`px-1.5 py-1 ${entry.stripClassName}`}>
                                    <p className="truncate text-[8px] font-black leading-none">
                                      {entry.meta}
                                    </p>
                                  </div>
                                  <div className={`px-1.5 py-1.5 ${entry.bodyClassName}`}>
                                    <p
                                      className={`line-clamp-3 text-[10px] font-black leading-[1.18] ${entry.titleClassName}`}
                                    >
                                      {entry.title}
                                    </p>
                                  </div>
                                </Link>
                              ))}
                              {contentEntries.length > 2 ? (
                                <div className="text-right text-[9px] font-black text-zinc-400 dark:text-zinc-500">
                                  +{contentEntries.length - 2}
                                </div>
                              ) : null}
                            </>
                          ) : cell.isCurrentMonth && restFlag ? (
                             <div className="mt-auto rounded-xl border border-emerald-200/80 bg-emerald-50 px-1.5 py-1 text-center text-[9px] font-black text-emerald-600/80 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400/70">休息</div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                 <div className="space-y-3">
                   {visibleUpcomingSessions.length === 0 ? (
                       <EmptyState 
                         title="暂无排项" 
                         hint="所有已安排的未来训练将在此以列表形式展示。您可以在「计划编排」中生成新的计划。" 
                       />
                    ) : (
                      visibleUpcomingSessions.map((item) => (
                        <div key={item.id} className="relative overflow-hidden rounded-[2rem] border border-zinc-100 bg-white p-5 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-950">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-1">
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">{toCompactDateLabel(item.dateKey)}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black tracking-tight ${item.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                                    {getSessionStatusLabel(item.status)}
                                  </span>
                               </div>
                               <h3 className="line-clamp-2 text-base font-black text-zinc-900 dark:text-zinc-50">
                                 {item.title}
                               </h3>
                               {item.unitSummary || item.program?.name ? (
                                 <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 line-clamp-1">
                                   {item.unitSummary || item.program?.name}
                                 </p>
                               ) : null}
                            </div>
                          </div>

                          <div className="mt-5 flex gap-2">
                             <Link 
                                href={`/programs/${item.program?.id || "unknown"}/planned-sessions/${item.id}/plan`}
                                className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-center text-xs font-black text-white active:scale-[0.98] dark:bg-zinc-50 dark:text-zinc-900"
                             >
                               查看详情
                             </Link>
                          </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>
            )}
          </AppCard>

          {scheduleView === "calendar" && (
            <AppCard className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">日期详情：{selectedDate}</p>
                {selectedDateCycleMarkers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedDateCycleMarkers.map((marker, markerIndex) => (
                      <span
                        key={`${selectedDate}-${marker.label}-${marker.tone}-${markerIndex}`}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getCycleMarkerClassName(marker.tone)}`}
                      >
                        {marker.label === "中"
                          ? "中周期开始"
                          : marker.label === "减"
                            ? "减载"
                            : `${marker.label} 起始`}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {visibleSelectedDatePlanned.length === 0 && selectedDateExecuted.length === 0 ? (
                <EmptyState
                  title={selectedDateIsRest ? "当天是休息日" : "当天没有计划或执行记录"}
                  hint={selectedDateIsRest ? "该日期来自计划包微周期的休息槽位。": "可在训练计划中安排，或从首页开始训练。"}
                />
              ) : (
                <div className={selectedDateEntries.length > 0 && visibleSelectedDatePlanned.length > 0 && selectedDateExecuted.length > 0 ? "grid gap-3 lg:grid-cols-2" : "space-y-3"}>
                  {visibleSelectedDatePlanned.length > 0 ? (
                    <div className="space-y-3 rounded-[2rem] bg-zinc-50/80 p-5 dark:bg-zinc-900/40">
                      <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">计划安排</p>
                      <div className="space-y-2">
                        {visibleSelectedDatePlanned.map((item) => (
                          <Link
                            href={`/programs/${item.program?.id || "unknown"}/planned-sessions/${item.id}/plan`}
                            key={item.id}
                            className="group flex w-full items-center justify-between rounded-[1.5rem] bg-white p-4 shadow-sm transition-all active:scale-[0.98] dark:bg-zinc-800/80 dark:hover:bg-zinc-800"
                          >
                            <div className="min-w-0 flex flex-col items-start gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">训练 #{item.sequenceIndex}</span>
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                  {getSessionStatusLabel(item.status)}
                                </span>
                              </div>
                              <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{item.title}</span>
                              {item.unitSummary ? (
                                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{item.unitSummary}</span>
                              ) : null}
                            </div>
                            <div className="text-zinc-400 transition-transform group-hover:translate-x-1 dark:text-zinc-500">
                               <span aria-hidden>&gt;</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedDateExecuted.length > 0 ? (
                    <div className="space-y-3 rounded-[2rem] bg-zinc-50/80 p-5 dark:bg-zinc-900/40">
                      <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">训练记录</p>
                      <div className="space-y-2">
                        {selectedDateExecuted.map((item) => (
                          <Link
                            href={`/executions/${item.id}`}
                            key={item.id}
                            className="group flex w-full items-center justify-between rounded-[1.5rem] bg-white p-4 shadow-sm transition-all active:scale-[0.98] dark:bg-zinc-800/80 dark:hover:bg-zinc-800"
                          >
                            <div className="min-w-0 flex flex-col items-start gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                 <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                                 <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                   {item.sequenceIndex ? `训练 #${item.sequenceIndex}` : "自由训练"}
                                 </span>
                                 <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                                   {getSessionExecutionStatusLabel(item.completionStatus)}
                                 </span>
                              </div>
                              <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{item.title}</span>
                              {item.durationMin || item.subtitle ? (
                                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                  {item.durationMin ? `${item.durationMin} 分钟` : ""}
                                  {item.durationMin && item.subtitle ? " · " : ""}
                                  {item.subtitle ?? ""}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-zinc-400 transition-transform group-hover:translate-x-1 dark:text-zinc-500">
                              <span aria-hidden>&gt;</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </AppCard>
          )}
        </div>
      ) : null}

      {!loading && !error && bootstrap && view === "progression" ? (
        <div className="space-y-4">
          <AppCard className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">进步完整分析中心</p>
              <Link href={getProgressionTabHref("matrix")} className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black tracking-widest text-blue-700 transition-active active:scale-95 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50">
                直达矩阵 <span aria-hidden>&gt;</span>
              </Link>
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-[1.5rem] bg-zinc-100/80 p-1.5 shadow-inner scrollbar-hide dark:bg-zinc-900/50">
              {(Object.keys(PROGRESSION_TAB_LABELS) as ProgressionTab[]).map((tab) => (
                <Link
                  key={tab}
                  href={getProgressionTabHref(tab)}
                  className={`flex-1 whitespace-nowrap rounded-[1.25rem] px-3 py-2 text-center text-xs font-bold transition-all active:scale-[0.98] ${
                    progressionTab === tab
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50 scale-100"
                      : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
                  }`}
                >
                  {PROGRESSION_TAB_LABELS[tab]}
                </Link>
              ))}
            </div>
          </AppCard>

          {progressionTab === "overview" ? (
            <>
              {progressLoading ? (
                <AppCard>
                  <SkeletonRows rows={6} />
                </AppCard>
              ) : null}
              {!progressLoading && progressError ? <InlineAlert tone="error">{progressError}</InlineAlert> : null}
              {!progressLoading && !progressError && progressData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <AppCard className="space-y-1 p-4">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">本周完成率</p>
                      <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">{formatPercent(progressData.overview.completionRate)}</p>
                    </AppCard>
                    <AppCard className="space-y-1 p-4">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">计划达成率</p>
                      <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">{formatPercent(progressData.overview.planHitRate)}</p>
                    </AppCard>
                    <AppCard className="space-y-1 p-4">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">平均 RPE</p>
                      <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">{formatMaybeNumber(progressData.overview.averageRpe)}</p>
                    </AppCard>
                    <AppCard className="space-y-1 p-4">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">跳过率</p>
                      <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">{formatPercent(progressData.overview.skipRate)}</p>
                    </AppCard>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <AppCard className="space-y-4">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">主项最近 e1RM</p>
                      {progressData.overview.recentMainLiftPr.length === 0 ? (
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">暂无主项 e1RM 数据</p>
                      ) : (
                        <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                          {progressData.overview.recentMainLiftPr.slice(0, 5).map((item) => (
                            <li key={`${item.exerciseName}-${item.performedAt}`} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{item.exerciseName}</p>
                              <p className="mt-1">e1RM <span className="font-bold">{item.e1rm}</span> · {item.weight}kg × {item.reps}</p>
                              <p className="mt-1 text-zinc-500 dark:text-zinc-400">{toCompactDateLabel(item.performedAt.slice(0, 10))}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </AppCard>
                    
                    <AppCard className="space-y-4">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">体征波动 (近14天)</p>
                      <div className="space-y-4">
                        <div className="rounded-xl bg-zinc-50/50 p-3 dark:bg-zinc-900/30">
                          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">体重</p>
                          <MiniBars points={progressData.trend.bodyweight} unit={progressData.trend.bodyweight[0]?.unit ?? "kg"} />
                        </div>
                        <div className="rounded-xl bg-zinc-50/50 p-3 dark:bg-zinc-900/30">
                          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">腰围</p>
                          <MiniBars points={progressData.trend.waistCircumference} unit={progressData.trend.waistCircumference[0]?.unit ?? "cm"} />
                        </div>
                        <div className="rounded-xl bg-zinc-50/50 p-3 dark:bg-zinc-900/30">
                          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">静息心率</p>
                          <MiniBars points={progressData.trend.restingHeartRate} unit={progressData.trend.restingHeartRate[0]?.unit ?? "bpm"} />
                        </div>
                      </div>
                    </AppCard>
                  </div>

                  <AppCard className="space-y-4">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">近期高频动作模式</p>
                    {topMovementPatterns.length === 0 ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">暂无动作模式统计</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {topMovementPatterns.map((item) => (
                          <div key={item.pattern} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">近阶段出现 {item.count} 次</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </AppCard>
                </div>
              ) : null}
            </>
          ) : null}

          {progressionTab === "anatomy" ? (
            <>
              {progressLoading ? (
                <AppCard>
                  <SkeletonRows rows={6} />
                </AppCard>
              ) : null}
              {!progressLoading && progressError ? <InlineAlert tone="error">{progressError}</InlineAlert> : null}
              {!progressLoading && !progressError && progressData ? (
                <AppCard className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">部位热力分析</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">按近期已执行训练轨道估算全身受训分布，便于快速看出哪里练得多、哪里覆盖少。</p>
                  </div>
                  {progressionAnatomy.rows.length === 0 ? (
                    <EmptyState title="还没有足够的热力数据" hint="等训练轨道积累到可识别的肌群标签后，这里会出现完整部位热图。" />
                  ) : (
                    <>
                      <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50/70 p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <DualAnatomyMapper
                          primary={progressionAnatomy.primary}
                          secondary={progressionAnatomy.secondary}
                          colorMode="heatmap"
                          intensity={progressionAnatomy.intensity}
                          showLabels
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {progressionAnatomy.rows.map((row) => (
                          <div key={row.region} className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{row.label}</p>
                              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                {row.share}%
                              </span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-red-500"
                                style={{ width: `${Math.max(8, Math.round((progressionAnatomy.intensity[row.region] ?? 0) * 100))}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">受训强度估算 {formatMaybeNumber(row.score)}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </AppCard>
              ) : null}
            </>
          ) : null}

          {progressionTab === "matrix" ? (
            <AppCard className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>窗口列数</span>
                  <select
                    value={String(matrixWindow)}
                    onChange={(event) => setMatrixWindow(Number(event.target.value) as 7 | 10 | 14)}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="7">7 列</option>
                    <option value="10">10 列</option>
                    <option value="14">14 列</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>列轴</span>
                  <select
                    value={matrixAxis}
                    onChange={(event) => setMatrixAxis(event.target.value as "calendar" | "exposure")}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="calendar">日期列 (Calendar)</option>
                    <option value="exposure">曝光列 (E1/E2...)</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>行轴</span>
                  <select
                    value={matrixRowAxis}
                    onChange={(event) => setMatrixRowAxis(event.target.value as "track" | "session_type")}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="track">动作轨道</option>
                    <option value="session_type">训练日类型</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>最近列</span>
                  <select
                    value={String(matrixRecentCount)}
                    onChange={(event) => setMatrixRecentCount(Number(event.target.value))}
                    disabled={!matrixIncludeRecent}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>训练日类型</span>
                  <select
                    value={matrixSessionType}
                    onChange={(event) => setMatrixSessionType(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="__all__">全部</option>
                    {(matrixData?.filters.sessionTypeOptions ?? [])
                      .filter((item) => item.id !== "__all__")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} ({item.count})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>动作模式</span>
                  <select
                    value={matrixMovementPattern}
                    onChange={(event) => setMatrixMovementPattern(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="__all__">全部</option>
                    {(matrixData?.filters.movementPatternOptions ?? []).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.value} ({item.count})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>主要肌群</span>
                  <select
                    value={matrixPrimaryMuscle}
                    onChange={(event) => setMatrixPrimaryMuscle(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
                  >
                    <option value="__all__">全部</option>
                    {(matrixData?.filters.primaryMuscleOptions ?? []).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.value} ({item.count})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-3 pt-6 text-xs text-zinc-700 dark:text-zinc-300">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={matrixIncludeRecent}
                      onChange={(event) => setMatrixIncludeRecent(event.target.checked)}
                      className="cursor-pointer rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span>包含近期记录</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={matrixOnlyAbnormal}
                      onChange={(event) => setMatrixOnlyAbnormal(event.target.checked)}
                      className="cursor-pointer rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span>仅看异常</span>
                  </label>
                </div>
              </div>

              {matrixLoading ? <SkeletonRows rows={8} /> : null}
              {!matrixLoading && matrixError ? <InlineAlert tone="error">{matrixError}</InlineAlert> : null}
              {!matrixLoading && !matrixError && matrixData ? (
                matrixData.rows.length === 0 ? (
                  <EmptyState title="当前筛选下没有可展示动作轨道" hint="可放宽筛选条件，或切回日期列查看完整视角。" />
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-500">
                      矩阵列轴：{matrixData.axis === "calendar" ? "日期列" : "曝光列"} · 行轴：
                      {matrixData.rowAxis === "track" ? "动作轨道" : "训练日类型"}
                    </p>
                    <div className="flex flex-col gap-3">
                      {matrixRowsWithMap.map(({ row, cellMap }) => (
                        <div key={row.key} className="relative rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                          <div className="mb-3">
                            <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-50">{row.label}</p>
                            <p className="mt-0.5 text-[11px] font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
                              {row.movementPatterns.join("/") || "-"} · {row.primaryMuscles.join("/") || "-"}
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-1.5">
                            {matrixData.columns.map((column) => {
                              const cell = cellMap.get(column.id);
                              const isSelected = selectedMatrixCell?.rowKey === row.key && selectedMatrixCell?.columnId === column.id;
                              
                              if (!cell) {
                                return (
                                  <div 
                                    key={`${row.key}-${column.id}`} 
                                    className="h-7 w-7 rounded border border-dashed border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50" 
                                    title={`${column.label} (未安排)`}
                                  />
                                );
                              }
                              
                              const visual = buildProgressionMatrixVisualState(cell.progressionSnapshot, cell.matrixCellPayload);
                              // Exclude Skipped (Gray) to have hollow styling if no snapshot + Not execution
                              const isHollow = visual.status === "no_change" && visual.actualOutcome === "skipped";
                              const computedClassName = isHollow 
                                ? "border-2 border-zinc-200 bg-transparent text-zinc-400 dark:border-zinc-700 dark:text-zinc-500" 
                                : visual.cellClassName;
                                
                              return (
                                <button
                                  key={`${row.key}-${column.id}`}
                                  type="button"
                                  onClick={() => setSelectedMatrixCell({ rowKey: row.key, columnId: column.id })}
                                  className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[11px] font-bold shadow-sm transition-all active:scale-[0.85] ${computedClassName} ${
                                    isSelected ? "ring-2 ring-blue-500 ring-offset-2 scale-110 dark:ring-blue-400 dark:ring-offset-zinc-900 z-10" : "hover:brightness-95"
                                  }`}
                                  title={`${column.label} / ${column.subLabel} - ${visual.statusLabel}`}
                                >
                                  {visual.icon}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {selectedMatrixCellData ? (
                      <div className="grid gap-3 lg:grid-cols-3">
                        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">计划段</p>
                          <p>状态：<span className="font-medium text-zinc-900 dark:text-zinc-200">{selectedMatrixCellData.visual.statusLabel}</span></p>
                          <p>变化：{selectedMatrixCellData.visual.planLine}</p>
                          <p>原因：{selectedMatrixCellData.visual.snapshot?.change_reason ?? "-"}</p>
                          <p>类型：{selectedMatrixCellData.visual.snapshot?.change_type ?? "-"}</p>
                        </div>
                        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">实际执行段</p>
                          <p>结果：<span className="font-medium text-zinc-900 dark:text-zinc-200">{selectedMatrixCellData.visual.actualLine}</span></p>
                          <p>分组：{selectedMatrixCellData.visual.actualDetails?.plannedSetCount ?? 0} 计划 / {selectedMatrixCellData.visual.actualDetails?.completedPlannedCount ?? 0} 完成</p>
                          <p>杂项：{selectedMatrixCellData.visual.actualDetails?.skippedPlannedCount ?? 0} 跳过 / {selectedMatrixCellData.visual.actualDetails?.extraSetCount ?? 0} 加组</p>
                        </div>
                        <div className="space-y-3 rounded-[1.5rem] bg-indigo-50/60 p-5 dark:bg-indigo-950/20">
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400">系统诊断</p>
                          <p className="font-bold">成效结论：<span className="text-zinc-900 dark:text-zinc-100">{selectedMatrixCellData.visual.resultDetails?.outcome ?? "-"}</span></p>
                          <p className="font-semibold text-zinc-600 dark:text-zinc-400">是否达标：{selectedMatrixCellData.visual.resultDetails?.isMeetsTarget === null ? "-" : selectedMatrixCellData.visual.resultDetails?.isMeetsTarget ? "是" : "否"}</p>
                          <p className="font-bold text-indigo-600 dark:text-indigo-400">{selectedMatrixCellData.visual.resultDetails?.impactHint ?? "-"}</p>
                          {selectedMatrixCellData.visual.auxFlags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {selectedMatrixCellData.visual.auxFlags.map((flag) => (
                                <span key={flag} className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-zinc-600 shadow-sm border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                  {getProgressionMatrixAuxFlagLabel(flag)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}
            </AppCard>
          ) : null}

          {progressionTab === "trends" ? (
            <>
              {progressLoading ? (
                <AppCard>
                  <SkeletonRows rows={6} />
                </AppCard>
              ) : null}
              {!progressLoading && progressError ? <InlineAlert tone="error">{progressError}</InlineAlert> : null}
              {!progressLoading && !progressError && progressData ? (
                <div className="grid gap-3">
                  {progressData.trackTrends.length === 0 ? (
                    <EmptyState title="暂无趋势轨道" hint="先完成几次训练后，这里会显示动作轨道趋势。" />
                  ) : (
                    progressData.trackTrends.map((track) => (
                      <AppCard key={track.key} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{track.label}</p>
                          <span className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{track.directionLabel}</span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          模式: {track.movementPatterns.slice(0, 2).join("/") || "-"} · 肌群: {track.primaryMuscles.slice(0, 2).join("/") || "-"}
                        </p>
                        <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                          <p>最近动态: <span className="font-semibold text-zinc-800 dark:text-zinc-200">重量 {formatMaybeNumber(track.weightDelta)} / 次数 {formatMaybeNumber(track.repsDelta)} / RPE {formatMaybeNumber(track.averageRpe)}</span></p>
                        </div>
                      </AppCard>
                    ))
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {progressionTab === "alerts" ? (
            <>
              {progressLoading ? (
                <AppCard>
                  <SkeletonRows rows={5} />
                </AppCard>
              ) : null}
              {!progressLoading && progressError ? <InlineAlert tone="error">{progressError}</InlineAlert> : null}
              {!progressLoading && !progressError && progressData ? (
                <div className="space-y-3">
                  {progressData.warnings.length === 0 ? (
                    <EmptyState title="当前没有预警" hint="继续保持训练与恢复节奏。" />
                  ) : (
                    progressData.warnings.map((warning) => (
                      <AppCard key={`${warning.type}-${warning.trackKey}`} className="space-y-3" emphasis="warn">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{warning.label}</p>
                          <span className="rounded-lg bg-orange-100/80 px-2.5 py-1 text-[11px] font-bold text-orange-800 dark:bg-orange-950/60 dark:text-orange-400">
                            {warning.severity === "high" ? "高危预警" : "中度关注"}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">{warning.message}</p>
                        <div className="pt-2">
                          <Link href={warning.matrixHref} className="inline-flex rounded-lg border border-orange-200 bg-white/60 px-3 py-1.5 text-xs font-semibold text-orange-700 backdrop-blur-sm transition-colors hover:bg-white dark:border-orange-800/80 dark:bg-orange-950/40 dark:text-orange-400 dark:hover:bg-orange-900/60">
                            在矩阵中排查问题 →
                          </Link>
                        </div>
                      </AppCard>
                    ))
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && bootstrap && view === "planning" ? (
        <SectionBlock 
          title="计划编排实验室" 
          description="在这里管理您的长期计划包。将模板组合成包，并安排您的周分化。点击左侧文件夹图标 📂 可管理单次训练模板。"
        >
          <TrainingPlanningOrchestratorClient userId={userId} />
        </SectionBlock>
      ) : null}

      {cycleSheetMode ? (
        <div className="fixed inset-0 z-[90] flex items-end bg-zinc-950/40 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="关闭周期面板"
            onClick={closeCycleSheet}
            className="absolute inset-0"
          />
          <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[2rem] bg-white px-5 pb-8 pt-5 shadow-2xl dark:bg-zinc-950">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {cycleSheetMode === "start"
                    ? "开始新的中周期"
                    : cycleSheetMode === "start_deload"
                      ? "进入减载"
                      : cycleSheetMode === "end_deload"
                        ? "结束减载"
                        : "结束当前中周期"}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {cycleSheetMode === "start"
                    ? "把当前这一段训练正式收进一个阶段里，小周期会随计划包自动轮转。"
                    : cycleSheetMode === "start_deload"
                      ? "减载会把当前阶段切到恢复管理状态，但不会自动结束当前中周期。"
                      : cycleSheetMode === "end_deload"
                        ? "结束减载后，当前中周期会恢复到正常推进状态。"
                        : "结束后，这个中周期会进入归档，后续训练将不再继续挂在它下面。"}
                </p>
              </div>

              {cycleSheetMode === "start" ? (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">中周期名称</span>
                    <input
                      value={cycleDraftName}
                      onChange={(event) => setCycleDraftName(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例如：春季增肌 1"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">关联计划包</span>
                    <select
                      value={cycleDraftPackageId}
                      onChange={(event) => setCycleDraftPackageId(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      {candidateCyclePackages.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.slotPreview}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">备注（选填）</span>
                    <textarea
                      value={cycleDraftNote}
                      onChange={(event) => setCycleDraftNote(event.target.value)}
                      rows={3}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例如：这一阶段主抓容量和动作稳定。"
                    />
                  </label>
                </div>
              ) : null}

              {cycleSheetMode === "start_deload" ? (
                <div className="space-y-4">
                  {activeMesocycle?.suggestionReason ? (
                    <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                      {activeMesocycle.suggestionReason}
                    </div>
                  ) : null}
                  {activeMesocycle?.stressSignals.length ? (
                    <div className="flex flex-wrap gap-2">
                      {activeMesocycle.stressSignals.map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">减载原因</p>
                    <div className="flex flex-wrap gap-2">
                      {DELOAD_REASON_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDeloadReason(option.value)}
                          className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                            deloadReason === option.value
                              ? "bg-orange-500 text-white"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">备注（选填）</span>
                    <textarea
                      value={cycleDraftNote}
                      onChange={(event) => setCycleDraftNote(event.target.value)}
                      rows={3}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例如：最近主观疲劳偏高，这周先控量。"
                    />
                  </label>
                </div>
              ) : null}

              {cycleSheetMode === "end_deload" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
                    当前减载会被记入这个中周期，但不会改变你已经沉淀下来的历史记录。
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">备注（选填）</span>
                    <textarea
                      value={cycleDraftNote}
                      onChange={(event) => setCycleDraftNote(event.target.value)}
                      rows={3}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例如：恢复完成，下周恢复正常推进。"
                    />
                  </label>
                </div>
              ) : null}

              {cycleSheetMode === "end_cycle" ? (
                <div className="space-y-4">
                  {activeMesocycle ? (
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
                      已持续 {activeMesocycle.weeksElapsed} 周
                      {activeMesocycle.currentRunIndex !== null ? ` · 小周期 ${activeMesocycle.currentRunIndex}` : ""}
                      {activeMesocycle.deloadCount > 0 ? ` · 已减载 ${activeMesocycle.deloadCount} 次` : ""}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">结束原因</p>
                    <div className="flex flex-wrap gap-2">
                      {END_REASON_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setEndReason(option.value)}
                          className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                            endReason === option.value
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">备注（选填）</span>
                    <textarea
                      value={cycleDraftNote}
                      onChange={(event) => setCycleDraftNote(event.target.value)}
                      rows={3}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      placeholder="例如：这阶段目标完成，准备切下一阶段。"
                    />
                  </label>
                </div>
              ) : null}

              {cycleActionError ? <InlineAlert tone="error">{cycleActionError}</InlineAlert> : null}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeCycleSheet}
                  disabled={cycleSubmitting}
                  className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitCycleSheet()}
                  disabled={cycleSubmitting || (cycleSheetMode === "start" && !cycleDraftPackageId)}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  {cycleSubmitting ? "处理中..." : "确认"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* Template Library Drawer Overlay */}
      {showTemplateLibrary && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-zinc-950">
          <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-4 dark:border-zinc-900">
            <div />
            <button
              onClick={() => setShowTemplateLibrary(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:scale-90 dark:bg-zinc-900 dark:text-zinc-400"
            >
              ✕
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-8 pb-32">
            <TemplateLibraryPanelClient userId={userId} />
          </div>
        </div>
      )}
    </section>
  );
}
