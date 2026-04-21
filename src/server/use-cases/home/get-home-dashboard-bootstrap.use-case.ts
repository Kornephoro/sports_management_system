import { z } from "zod";

import {
  countOverdueUnresolvedPlannedSessionsByUser,
  countUpcomingPlannedSessionsByUser,
  getActiveSessionExecutionByPlannedSessionForUser,
  getLatestSessionExecutionByPlannedSessionForUser,
  getNextOrRecentPlannedSessionByUser,
  listObservationsByMetric,
  listRecentCompletedWeightedExecutionSetsByUser,
} from "@/server/repositories";
import { addDaysDateOnlyUtc, getEndOfDayFromDateOnlyUtc, getStartOfTodayInAppTimeZone } from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const METRIC_KEYS = ["bodyweight", "waist_circumference", "resting_heart_rate"] as const;
const DEFAULT_UNITS: Record<(typeof METRIC_KEYS)[number], string> = {
  bodyweight: "kg",
  waist_circumference: "cm",
  resting_heart_rate: "bpm",
};
const WORKING_SET_TYPES = new Set(["working", "top_set", "backoff", "amrap", "volume", "cluster"]);

const GetHomeDashboardBootstrapInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type GetHomeDashboardBootstrapInput = z.input<typeof GetHomeDashboardBootstrapInputSchema>;

function getAppTimeZone() {
  return process.env.APP_TIME_ZONE?.trim() || "Asia/Shanghai";
}

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number((value as { toString: () => string }).toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTodayTrainingState(activeExecution: { id: string } | null, latestExecutionUnitCount: number | null) {
  if (activeExecution) {
    return "in_progress" as const;
  }
  if (latestExecutionUnitCount && latestExecutionUnitCount > 0) {
    return "completed" as const;
  }
  return "not_started" as const;
}

function getTodayTrainingActionLabel(state: "not_started" | "in_progress" | "completed", hasPlannedEntry: boolean) {
  if (!hasPlannedEntry) {
    return "去创建训练计划";
  }
  if (state === "in_progress") {
    return "继续训练";
  }
  if (state === "completed") {
    return "查看训练结果";
  }
  return "开始训练";
}

export async function getHomeDashboardBootstrapUseCase(rawInput: GetHomeDashboardBootstrapInput) {
  const input = GetHomeDashboardBootstrapInputSchema.parse(rawInput);
  const timeZone = getAppTimeZone();
  const todayStart = getStartOfTodayInAppTimeZone();
  const weekEnd = getEndOfDayFromDateOnlyUtc(addDaysDateOnlyUtc(todayStart, 6));
  const todayDateKey = getDateKeyInTimeZone(new Date(), timeZone);

  const [
    plannedEntry,
    overdueCount,
    upcomingCount7d,
    bodyweightRecords,
    waistRecords,
    restingHrRecords,
    completedWeightedSets,
  ] = await Promise.all([
    getNextOrRecentPlannedSessionByUser(input.userId, todayStart),
    countOverdueUnresolvedPlannedSessionsByUser(input.userId, todayStart),
    countUpcomingPlannedSessionsByUser(input.userId, todayStart, weekEnd),
    listObservationsByMetric(input.userId, "bodyweight", 30),
    listObservationsByMetric(input.userId, "waist_circumference", 2),
    listObservationsByMetric(input.userId, "resting_heart_rate", 2),
    listRecentCompletedWeightedExecutionSetsByUser(input.userId, 240),
  ]);

  let plannedEntryActiveExecution: Awaited<ReturnType<typeof getActiveSessionExecutionByPlannedSessionForUser>> | null = null;
  let plannedEntryLatestExecution: Awaited<ReturnType<typeof getLatestSessionExecutionByPlannedSessionForUser>> | null = null;
  if (plannedEntry) {
    [plannedEntryActiveExecution, plannedEntryLatestExecution] = await Promise.all([
      getActiveSessionExecutionByPlannedSessionForUser(plannedEntry.plannedSession.id, input.userId),
      getLatestSessionExecutionByPlannedSessionForUser(plannedEntry.plannedSession.id, input.userId),
    ]);
  }

  const trainingState = getTodayTrainingState(
    plannedEntryActiveExecution,
    plannedEntryLatestExecution?._count?.unit_executions ?? null,
  );
  const trainingActionHref = (() => {
    if (!plannedEntry) {
      return "/training?view=planning";
    }
    if (trainingState === "completed") {
      return "/training?view=calendar";
    }
    return `/programs/${plannedEntry.program?.id ?? plannedEntry.plannedSession.program_id}/planned-sessions/${plannedEntry.plannedSession.id}/execute?returnTo=today&from=home`;
  })();

  const metricRecordsMap = {
    bodyweight: bodyweightRecords,
    waist_circumference: waistRecords,
    resting_heart_rate: restingHrRecords,
  } as const;

  const dailyVitalsMetrics = METRIC_KEYS.map((metricKey) => {
    const records = metricRecordsMap[metricKey];
    const todayRecord = records.find((record) => getDateKeyInTimeZone(record.observed_at, timeZone) === todayDateKey) ?? null;
    const previousRecord =
      records.find((record) => getDateKeyInTimeZone(record.observed_at, timeZone) !== todayDateKey) ?? null;
    const todayValue = parseNullableNumber(todayRecord?.value_numeric ?? null);
    const previousValue = parseNullableNumber(previousRecord?.value_numeric ?? null);

    return {
      metricKey,
      unit: todayRecord?.unit ?? previousRecord?.unit ?? DEFAULT_UNITS[metricKey],
      todayValue,
      previousValue,
      deltaFromPrevious: todayValue !== null && previousValue !== null ? Number((todayValue - previousValue).toFixed(3)) : null,
      observedAt: todayRecord?.observed_at ?? null,
      missingToday: !todayRecord,
    };
  });

  const dailyVitalsFilledCount = dailyVitalsMetrics.filter((item) => !item.missingToday).length;
  const preferredBodyweightUnit = dailyVitalsMetrics.find((item) => item.metricKey === "bodyweight")?.unit ?? "kg";
  const bodyweightTrend = bodyweightRecords
    .filter((record) => {
      const valueNumeric = parseNullableNumber(record.value_numeric);
      if (valueNumeric === null) return false;
      return !record.unit || record.unit === preferredBodyweightUnit;
    })
    .slice(0, 14)
    .reverse()
    .map((record) => ({
      date: getDateKeyInTimeZone(record.observed_at, timeZone),
      value: Number((parseNullableNumber(record.value_numeric) ?? 0).toFixed(3)),
      unit: record.unit ?? preferredBodyweightUnit,
    }));

  const mainLiftMap = new Map<string, { exerciseName: string; e1rm: number; reps: number; weight: number; performedAt: Date }>();
  for (const setRow of completedWeightedSets) {
    const exerciseName = setRow.planned_unit?.selected_exercise_name?.trim();
    if (!exerciseName) continue;

    if (setRow.planned_set_type && !WORKING_SET_TYPES.has(setRow.planned_set_type)) {
      continue;
    }
    const weight = parseNullableNumber(setRow.actual_weight);
    const reps = parseNullableNumber(setRow.actual_reps);
    if (weight === null || reps === null || reps <= 0 || weight <= 0) {
      continue;
    }
    if (mainLiftMap.has(exerciseName)) {
      continue;
    }
    const e1rm = Number((weight * (1 + reps / 30)).toFixed(2));
    mainLiftMap.set(exerciseName, {
      exerciseName,
      e1rm,
      reps,
      weight,
      performedAt: setRow.session_execution.performed_at,
    });
  }

  const recentMainLiftPr = Array.from(mainLiftMap.values())
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
    .slice(0, 3)
    .map((item) => ({
      exerciseName: item.exerciseName,
      e1rm: item.e1rm,
      reps: item.reps,
      weight: item.weight,
      performedAt: item.performedAt,
    }));

  return {
    appDateKey: todayDateKey,
    todayTraining: {
      state: trainingState,
      actionLabel: getTodayTrainingActionLabel(trainingState, Boolean(plannedEntry)),
      actionHref: trainingActionHref,
      plannedEntry,
      activeExecution: plannedEntryActiveExecution
        ? {
            id: plannedEntryActiveExecution.id,
            completion_status: plannedEntryActiveExecution.completion_status,
            performed_at: plannedEntryActiveExecution.performed_at,
            unit_execution_count: plannedEntryActiveExecution._count.unit_executions,
          }
        : null,
      latestExecution: plannedEntryLatestExecution
        ? {
            id: plannedEntryLatestExecution.id,
            completion_status: plannedEntryLatestExecution.completion_status,
            performed_at: plannedEntryLatestExecution.performed_at,
            unit_execution_count: plannedEntryLatestExecution._count.unit_executions,
          }
        : null,
    },
    dailyVitals: {
      metrics: dailyVitalsMetrics,
      completion: {
        filledCount: dailyVitalsFilledCount,
        totalCount: METRIC_KEYS.length,
        allFilled: dailyVitalsFilledCount === METRIC_KEYS.length,
      },
    },
    scheduleSummary: {
      overdueCount,
      upcomingCount7d,
      nextSession: plannedEntry,
    },
    recentMainLiftPr,
    bodyweightTrend,
    generatedAt: new Date().toISOString(),
  };
}
