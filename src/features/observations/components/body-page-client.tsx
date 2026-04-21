"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import { getHomeDashboardBootstrap, submitDailyCheckin } from "@/features/home/home-api";
import { generateRecoveryAiSummary, getOpenAiSettings } from "@/features/me/me-api";
import {
  createObservation,
  listObservationsByMetric,
  ObservationItem,
} from "@/features/observations/observations-api";
import { AppCard, EmptyState, InlineAlert, PageHeader, SkeletonRows } from "@/features/shared/components/ui-primitives";
import { getMetricLabel } from "@/features/shared/ui-zh";
import {
  getTrainingCalendarBootstrap,
  getTrainingProgressBootstrap,
  TrainingCalendarBootstrapResponse,
  TrainingProgressBootstrapResponse,
} from "@/features/training/training-api";

type BodyPageClientProps = {
  userId: string;
};

type BodyMetricKey = "bodyweight" | "waist_circumference" | "resting_heart_rate";
type RecoveryMetricKey = "sleep_hours" | "fatigue_score";
type HistoryMetricKey = BodyMetricKey | RecoveryMetricKey;
type TrendRange = 14 | 56 | 84;

type DailyCheckinDraft = {
  bodyweight: string;
  bodyweightUnit: "kg" | "lbs";
  waistCircumference: string;
  restingHeartRate: string;
};

type RecoveryDraft = {
  sleepHours: string;
  fatigueScore: string;
  notes: string;
};

type MetricPoint = {
  dateKey: string;
  observedAt: string;
  value: number;
  unit: string;
};

type RecoveryAiSummary = {
  overallState: "stable" | "watch" | "high";
  label: string;
  summary: string;
  actions: string[];
  watchItems: string[];
  confidence: "low" | "medium" | "high";
};

type BodyHistoryMap = Record<HistoryMetricKey, ObservationItem[]>;

const BODY_METRICS: BodyMetricKey[] = ["bodyweight", "waist_circumference", "resting_heart_rate"];
const HISTORY_LIMITS: Record<HistoryMetricKey, number> = {
  bodyweight: 180,
  waist_circumference: 180,
  resting_heart_rate: 180,
  sleep_hours: 30,
  fatigue_score: 30,
};
const RANGE_OPTIONS: Array<{ value: TrendRange; label: string }> = [
  { value: 14, label: "14天" },
  { value: 56, label: "8周" },
  { value: 84, label: "12周" },
];
const EMPTY_HISTORIES: BodyHistoryMap = {
  bodyweight: [],
  waist_circumference: [],
  resting_heart_rate: [],
  sleep_hours: [],
  fatigue_score: [],
};

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toString" in (value as object)) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function shiftDateKey(dateKey: string, deltaDays: number) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function getWeekStartKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function normalizeObservationHistory(records: ObservationItem[], preferredUnit?: string) {
  const byDate = new Map<string, MetricPoint>();

  for (const record of records) {
    const numericValue = parseNumber(record.value_numeric);
    if (numericValue === null) continue;
    if (preferredUnit && record.unit && record.unit !== preferredUnit) continue;

    const dateKey = toDateKey(record.observed_at);
    if (byDate.has(dateKey)) continue;
    byDate.set(dateKey, {
      dateKey,
      observedAt: record.observed_at,
      value: Number(numericValue.toFixed(3)),
      unit: record.unit ?? preferredUnit ?? "",
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function filterSeriesByRange(points: MetricPoint[], days: TrendRange) {
  if (points.length === 0) return [];
  const endDateKey = points[points.length - 1].dateKey;
  const startDateKey = shiftDateKey(endDateKey, -(days - 1));
  return points.filter((point) => point.dateKey >= startDateKey);
}

function buildWeeklyAverageSeries(points: MetricPoint[]) {
  const grouped = new Map<string, { sum: number; count: number; unit: string }>();

  for (const point of points) {
    const weekStart = getWeekStartKey(point.dateKey);
    const bucket = grouped.get(weekStart) ?? { sum: 0, count: 0, unit: point.unit };
    bucket.sum += point.value;
    bucket.count += 1;
    grouped.set(weekStart, bucket);
  }

  return Array.from(grouped.entries())
    .map(([dateKey, bucket]) => ({
      dateKey,
      observedAt: `${dateKey}T00:00:00.000Z`,
      value: Number((bucket.sum / bucket.count).toFixed(2)),
      unit: bucket.unit,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function averageSeries(points: MetricPoint[], days: number) {
  if (points.length === 0) return null;
  const endDateKey = points[points.length - 1].dateKey;
  const startDateKey = shiftDateKey(endDateKey, -(days - 1));
  const filtered = points.filter((point) => point.dateKey >= startDateKey);
  if (filtered.length === 0) return null;
  return Number((filtered.reduce((sum, point) => sum + point.value, 0) / filtered.length).toFixed(2));
}

function formatMetricValue(value: number | null, unit: string) {
  if (value === null) return "待补";
  return `${Number(value.toFixed(2))} ${unit}`;
}

function formatCompactDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function formatObservedLabel(observedAt: string | null | undefined) {
  if (!observedAt) return "今日未记录";
  return new Date(observedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFatigueTone(state: "stable" | "watch" | "high") {
  if (state === "high") {
    return {
      chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
      card: "border-orange-200 bg-orange-50/80 dark:border-orange-900/50 dark:bg-orange-950/20",
      label: "恢复压力偏高",
    };
  }
  if (state === "watch") {
    return {
      chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      card: "border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20",
      label: "进入观察",
    };
  }
  return {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    card: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20",
    label: "恢复稳定",
  };
}

function getConfidenceLabel(confidence: RecoveryAiSummary["confidence"]) {
  if (confidence === "high") return "高把握";
  if (confidence === "medium") return "中等把握";
  return "低把握";
}

function TrendChart({
  dailyPoints,
  weeklyPoints,
  unit,
}: {
  dailyPoints: MetricPoint[];
  weeklyPoints: MetricPoint[];
  unit: string;
}) {
  const width = 320;
  const height = 180;
  const paddingX = 18;
  const paddingY = 22;

  const allPoints = [...dailyPoints, ...weeklyPoints];
  if (allPoints.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-[1.75rem] border border-dashed border-zinc-200 bg-zinc-50/70 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        暂无趋势数据
      </div>
    );
  }

  const timestamps = allPoints.map((point) => new Date(`${point.dateKey}T00:00:00Z`).getTime());
  const values = allPoints.map((point) => point.value);
  const minX = Math.min(...timestamps);
  const maxX = Math.max(...timestamps);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const safeRangeX = Math.max(maxX - minX, 1);
  const safeRangeY = Math.max(maxY - minY, 1);

  const toX = (dateKey: string) =>
    paddingX + (((new Date(`${dateKey}T00:00:00Z`).getTime() - minX) / safeRangeX) * (width - paddingX * 2));
  const toY = (value: number) =>
    height - paddingY - (((value - minY) / safeRangeY) * (height - paddingY * 2));

  const buildPath = (points: MetricPoint[]) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.dateKey).toFixed(2)} ${toY(point.value).toFixed(2)}`)
      .join(" ");

  const buildAreaPath = (points: MetricPoint[]) => {
    if (points.length === 0) return "";
    const baselineY = height - paddingY;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    return `${buildPath(points)} L ${toX(lastPoint.dateKey).toFixed(2)} ${baselineY.toFixed(2)} L ${toX(firstPoint.dateKey).toFixed(2)} ${baselineY.toFixed(2)} Z`;
  };

  const gridValues = Array.from({ length: 4 }, (_, index) => minY + (safeRangeY / 3) * index).reverse();

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-gradient-to-b from-blue-50/70 via-white to-white px-3 py-3 dark:border-zinc-800 dark:bg-gradient-to-b dark:from-blue-950/15 dark:via-zinc-950 dark:to-zinc-950">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
          <defs>
            <linearGradient id="bodyTrendFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {gridValues.map((value, index) => {
            const y = toY(value);
            return (
              <g key={index}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  className="stroke-zinc-200 dark:stroke-zinc-800"
                  strokeWidth="1"
                />
                <text
                  x={paddingX}
                  y={y - 4}
                  className="fill-zinc-400 text-[9px] font-semibold"
                >
                  {Number(value.toFixed(1))}
                </text>
              </g>
            );
          })}

          {dailyPoints.length > 1 ? <path d={buildAreaPath(dailyPoints)} fill="url(#bodyTrendFill)" /> : null}

          {dailyPoints.length > 1 ? (
            <path
              d={buildPath(dailyPoints)}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-500"
            />
          ) : null}

          {weeklyPoints.length > 1 ? (
            <path
              d={buildPath(weeklyPoints)}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="7 5"
              className="text-orange-500"
            />
          ) : null}

          {dailyPoints.map((point) => (
            <circle
              key={`daily-${point.dateKey}`}
              cx={toX(point.dateKey)}
              cy={toY(point.value)}
              r="3"
              className="fill-blue-500"
            />
          ))}
          {weeklyPoints.map((point) => (
            <circle
              key={`weekly-${point.dateKey}`}
              cx={toX(point.dateKey)}
              cy={toY(point.value)}
              r="3.5"
              className="fill-orange-500"
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            日值
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            周均
          </span>
        </div>
        <span>{unit}</span>
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-base font-black tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h2>
        {description ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function BodyPageClient({ userId }: BodyPageClientProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getHomeDashboardBootstrap>> | null>(null);
  const [progressData, setProgressData] = useState<TrainingProgressBootstrapResponse | null>(null);
  const [calendarData, setCalendarData] = useState<TrainingCalendarBootstrapResponse | null>(null);
  const [histories, setHistories] = useState<BodyHistoryMap>(EMPTY_HISTORIES);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiSummary, setAiSummary] = useState<RecoveryAiSummary | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);

  const [selectedMetric, setSelectedMetric] = useState<BodyMetricKey>("bodyweight");
  const [selectedRange, setSelectedRange] = useState<TrendRange>(56);
  const [showDailySheet, setShowDailySheet] = useState(false);
  const [showRecoverySheet, setShowRecoverySheet] = useState(false);
  const [dailySubmitting, setDailySubmitting] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dailyDraft, setDailyDraft] = useState<DailyCheckinDraft>({
    bodyweight: "",
    bodyweightUnit: "kg",
    waistCircumference: "",
    restingHeartRate: "",
  });
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft>({
    sleepHours: "",
    fatigueScore: "",
    notes: "",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [
        dashboardResult,
        progressResult,
        calendarResult,
        aiSettingsResult,
        bodyweightResult,
        waistResult,
        restingHrResult,
        sleepResult,
        fatigueResult,
      ] = await Promise.allSettled([
        getHomeDashboardBootstrap(userId),
        getTrainingProgressBootstrap(userId),
        getTrainingCalendarBootstrap(userId),
        getOpenAiSettings(userId),
        listObservationsByMetric(userId, "bodyweight", HISTORY_LIMITS.bodyweight),
        listObservationsByMetric(userId, "waist_circumference", HISTORY_LIMITS.waist_circumference),
        listObservationsByMetric(userId, "resting_heart_rate", HISTORY_LIMITS.resting_heart_rate),
        listObservationsByMetric(userId, "sleep_hours", HISTORY_LIMITS.sleep_hours),
        listObservationsByMetric(userId, "fatigue_score", HISTORY_LIMITS.fatigue_score),
      ]);

      if (dashboardResult.status !== "fulfilled") {
        throw dashboardResult.reason;
      }

      const nextDashboard = dashboardResult.value;
      const secondaryFailures: string[] = [];

      setDashboard(nextDashboard);
      setProgressData(progressResult.status === "fulfilled" ? progressResult.value : null);
      setCalendarData(calendarResult.status === "fulfilled" ? calendarResult.value : null);
      setAiConfigured(aiSettingsResult.status === "fulfilled" ? aiSettingsResult.value.hasApiKey : false);
      setHistories({
        bodyweight: bodyweightResult.status === "fulfilled" ? bodyweightResult.value : [],
        waist_circumference: waistResult.status === "fulfilled" ? waistResult.value : [],
        resting_heart_rate: restingHrResult.status === "fulfilled" ? restingHrResult.value : [],
        sleep_hours: sleepResult.status === "fulfilled" ? sleepResult.value : [],
        fatigue_score: fatigueResult.status === "fulfilled" ? fatigueResult.value : [],
      });

      if (progressResult.status !== "fulfilled") secondaryFailures.push("疲劳联动");
      if (calendarResult.status !== "fulfilled") secondaryFailures.push("周期摘要");
      if (aiSettingsResult.status !== "fulfilled") secondaryFailures.push("AI 配置");
      if (sleepResult.status !== "fulfilled" || fatigueResult.status !== "fulfilled") {
        secondaryFailures.push("恢复补记");
      }
      if (secondaryFailures.length > 0) {
        setNotice(`部分辅助信息暂时未加载完整：${secondaryFailures.join("、")}；主体数据仍可正常使用。`);
      }

      const preferredBodyweightUnit =
        nextDashboard.dailyVitals.metrics.find((item) => item.metricKey === "bodyweight")?.unit === "lbs"
          ? "lbs"
          : "kg";
      setDailyDraft((current) => ({
        ...current,
        bodyweightUnit: preferredBodyweightUnit,
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载身体页失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [userId]);

  const todayMetrics = useMemo(() => {
    const metrics = new Map(
      dashboard?.dailyVitals.metrics.map((item) => [item.metricKey, item]) ?? [],
    );
    return metrics;
  }, [dashboard]);

  const normalizedHistories = useMemo(() => {
    const preferredBodyweightUnit =
      todayMetrics.get("bodyweight")?.unit === "lbs" ? "lbs" : "kg";
    return {
      bodyweight: normalizeObservationHistory(histories.bodyweight, preferredBodyweightUnit),
      waist_circumference: normalizeObservationHistory(histories.waist_circumference),
      resting_heart_rate: normalizeObservationHistory(histories.resting_heart_rate),
      sleep_hours: normalizeObservationHistory(histories.sleep_hours),
      fatigue_score: normalizeObservationHistory(histories.fatigue_score),
    };
  }, [histories, todayMetrics]);

  const missingTodayMetrics = useMemo(
    () =>
      BODY_METRICS.filter((metricKey) => todayMetrics.get(metricKey)?.missingToday ?? true),
    [todayMetrics],
  );

  const selectedSeries = useMemo(() => {
    const daily = filterSeriesByRange(normalizedHistories[selectedMetric], selectedRange);
    return {
      daily,
      weekly: buildWeeklyAverageSeries(daily),
    };
  }, [normalizedHistories, selectedMetric, selectedRange]);

  const latestSleep = normalizedHistories.sleep_hours[normalizedHistories.sleep_hours.length - 1] ?? null;
  const latestFatigue = normalizedHistories.fatigue_score[normalizedHistories.fatigue_score.length - 1] ?? null;
  const recentSleepAverage = averageSeries(normalizedHistories.sleep_hours, 7);
  const recentFatigueAverage = averageSeries(normalizedHistories.fatigue_score, 3);
  const selectedLatestPoint = selectedSeries.daily[selectedSeries.daily.length - 1] ?? null;
  const selectedPreviousPoint = selectedSeries.daily[selectedSeries.daily.length - 2] ?? null;
  const selectedWeeklyPoint = selectedSeries.weekly[selectedSeries.weekly.length - 1] ?? null;
  const selectedDailyDelta =
    selectedLatestPoint && selectedPreviousPoint
      ? Number((selectedLatestPoint.value - selectedPreviousPoint.value).toFixed(2))
      : null;
  const cycleState = calendarData?.cycleSummary.activeMesocycle?.fatigueState ?? null;
  const fatigueTone = getFatigueTone(cycleState ?? ((latestFatigue?.value ?? 0) >= 8 ? "high" : (latestFatigue?.value ?? 0) >= 6 ? "watch" : "stable"));

  const todaySummaryCards = useMemo(
    () =>
      BODY_METRICS.map((metricKey) => {
        const todayMetric = todayMetrics.get(metricKey);
        const average7d = averageSeries(normalizedHistories[metricKey], 7);
        return {
          metricKey,
          label: getMetricLabel(metricKey),
          todayValue: todayMetric?.todayValue ?? null,
          unit: todayMetric?.unit ?? normalizedHistories[metricKey][normalizedHistories[metricKey].length - 1]?.unit ?? "",
          average7d,
          observedAt: todayMetric?.observedAt ?? null,
          missingToday: todayMetric?.missingToday ?? true,
        };
      }),
    [normalizedHistories, todayMetrics],
  );

  const handleSubmitDailyCheckin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dashboard) return;

    const bodyweight = dailyDraft.bodyweight.trim() ? Number(dailyDraft.bodyweight) : undefined;
    const waistCircumference = dailyDraft.waistCircumference.trim()
      ? Number(dailyDraft.waistCircumference)
      : undefined;
    const restingHeartRate = dailyDraft.restingHeartRate.trim()
      ? Number(dailyDraft.restingHeartRate)
      : undefined;

    if (bodyweight === undefined && waistCircumference === undefined && restingHeartRate === undefined) {
      setActionError("请至少补一项今日身体数据。");
      return;
    }

    setDailySubmitting(true);
    setActionError(null);
    setMessage(null);
    try {
      await submitDailyCheckin({
        userId,
        date: dashboard.appDateKey,
        bodyweight,
        bodyweightUnit: dailyDraft.bodyweightUnit,
        waistCircumference,
        restingHeartRate,
      });
      setMessage("今日身体数据已保存，并已和首页同步。");
      setShowDailySheet(false);
      setDailyDraft((current) => ({
        ...current,
        bodyweight: "",
        waistCircumference: "",
        restingHeartRate: "",
      }));
      await loadData();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "保存今日身体数据失败");
    } finally {
      setDailySubmitting(false);
    }
  };

  const handleSubmitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sleepHours = recoveryDraft.sleepHours.trim() ? Number(recoveryDraft.sleepHours) : undefined;
    const fatigueScore = recoveryDraft.fatigueScore.trim() ? Number(recoveryDraft.fatigueScore) : undefined;

    if (sleepHours === undefined && fatigueScore === undefined) {
      setActionError("请至少填写一项恢复补记数据。");
      return;
    }

    setRecoverySubmitting(true);
    setActionError(null);
    setMessage(null);

    try {
      const jobs: Array<Promise<unknown>> = [];
      const observedAt = new Date().toISOString();

      if (sleepHours !== undefined) {
        jobs.push(
          createObservation({
            userId,
            observedAt,
            observationDomain: "recovery",
            metricKey: "sleep_hours",
            valueNumeric: sleepHours,
            unit: "小时",
            source: "manual",
            notes: recoveryDraft.notes || undefined,
          }),
        );
      }
      if (fatigueScore !== undefined) {
        jobs.push(
          createObservation({
            userId,
            observedAt,
            observationDomain: "recovery",
            metricKey: "fatigue_score",
            valueNumeric: fatigueScore,
            unit: "分",
            source: "manual",
            notes: recoveryDraft.notes || undefined,
          }),
        );
      }

      await Promise.all(jobs);
      setMessage("恢复补记已保存，疲劳监测会自动纳入这些数据。");
      setShowRecoverySheet(false);
      setRecoveryDraft({
        sleepHours: "",
        fatigueScore: "",
        notes: "",
      });
      await loadData();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "保存恢复补记失败");
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const result = await generateRecoveryAiSummary(userId);
      setAiSummary(result);
    } catch (nextError) {
      setAiSummaryError(nextError instanceof Error ? nextError.message : "生成 AI 判断失败");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <PageHeader title="身体" description="记录体征、回看趋势，并把恢复信号收拢到一个地方。" />
        <AppCard>
          <SkeletonRows rows={6} />
        </AppCard>
        <AppCard>
          <SkeletonRows rows={6} />
        </AppCard>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-6">
        <PageHeader title="身体" description="记录体征、回看趋势，并把恢复信号收拢到一个地方。" />
        <InlineAlert tone="error">{error}</InlineAlert>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="身体"
        description="今天的体征记录、历史趋势和恢复状态都放在这里。首页和这里共用同一份今日数据。"
      />

      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {notice ? <InlineAlert tone="warn">{notice}</InlineAlert> : null}
      {actionError ? <InlineAlert tone="error">{actionError}</InlineAlert> : null}

      <AppCard className="space-y-4">
        <SectionTitle
          title="今日身体数据"
          description="体重、腰围、晨脉与首页联动；今天填一次，这里和首页都会同步。"
          actions={
            missingTodayMetrics.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowDailySheet(true)}
                className="rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {todaySummaryCards.some((item) => !item.missingToday) ? "补全今天" : "记录今天"}
              </button>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                今日已记录
              </span>
            )
          }
        />

        <div className="grid grid-cols-3 gap-3">
          {todaySummaryCards.map((item) => (
            <div key={item.metricKey} className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <p className="text-[11px] font-black tracking-tight text-zinc-500 dark:text-zinc-400">{item.label}</p>
              <p className="mt-2 text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                {item.todayValue === null ? "待补" : item.todayValue}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {item.todayValue === null ? "今天还没填" : item.unit}
              </p>
              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">近7日均</p>
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {item.average7d === null ? "暂无" : `${item.average7d} ${item.unit}`}
                </p>
              </div>
              <p className="mt-3 text-[10px] text-zinc-400 dark:text-zinc-500">{formatObservedLabel(item.observedAt)}</p>
            </div>
          ))}
        </div>
      </AppCard>

      <AppCard className="space-y-4">
        <SectionTitle
          title="历史趋势"
          description="日值负责看波动，周均负责看方向。把最近值、单日变化和周均先放在图表上面。"
        />

        <div className="flex flex-wrap gap-2">
          {BODY_METRICS.map((metricKey) => (
            <button
              key={metricKey}
              type="button"
              onClick={() => setSelectedMetric(metricKey)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                selectedMetric === metricKey
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {getMetricLabel(metricKey)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedRange(option.value)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                selectedRange === option.value
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {selectedSeries.daily.length === 0 ? (
          <EmptyState
            title="这个指标还没有足够的历史记录"
            hint="先连续记录几天，图表就会开始显示日值和周均。"
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[1.4rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">最新日值</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {selectedLatestPoint?.value ?? "-"}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedLatestPoint?.unit ?? ""}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">单日变化</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {selectedDailyDelta === null ? "-" : `${selectedDailyDelta > 0 ? "+" : ""}${selectedDailyDelta}`}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedLatestPoint?.unit ?? ""}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">当前周均</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {selectedWeeklyPoint?.value ?? "-"}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {selectedWeeklyPoint?.unit ?? ""}
                </p>
              </div>
            </div>

            <TrendChart
              dailyPoints={selectedSeries.daily}
              weeklyPoints={selectedSeries.weekly}
              unit={selectedSeries.daily[selectedSeries.daily.length - 1]?.unit ?? ""}
            />

            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>{formatCompactDate(selectedSeries.daily[0].dateKey)}</span>
              <span>{formatCompactDate(selectedSeries.daily[selectedSeries.daily.length - 1].dateKey)}</span>
            </div>
          </>
        )}
      </AppCard>

      <AppCard className={`space-y-4 border ${fatigueTone.card}`}>
        <SectionTitle
          title="疲劳监测"
          description="把可解释的系统判断和 OpenAI 辅助判断拆成双通道，先看规则，再看建议。"
          actions={
            <button
              type="button"
              onClick={() => setShowRecoverySheet(true)}
              className="rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-zinc-700 shadow-sm transition hover:bg-white dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              补记睡眠 / 疲劳
            </button>
          }
        />

        <div className="grid gap-4">
          <div className="rounded-[1.7rem] border border-white/70 bg-white/85 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/75">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-black tracking-tight text-zinc-950 dark:text-zinc-50">系统判断</p>
                <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  这条通道只看系统已有的睡眠、主观疲劳、RPE、完成率和周期压力信号。
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${fatigueTone.chip}`}>
                  {fatigueTone.label}
                </span>
                {calendarData?.cycleSummary.activeMesocycle?.suggestionLabel ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {calendarData.cycleSummary.activeMesocycle.suggestionLabel}
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {calendarData?.cycleSummary.activeMesocycle?.suggestionReason ??
                (progressData?.warnings.some((warning) => warning.type === "recovery_risk")
                  ? "最近存在恢复风险信号，建议回看训练预警并优先保证睡眠与恢复。"
                  : latestFatigue
                    ? "最近已经有主观疲劳记录，系统会继续结合训练质量和 RPE 做恢复判断。"
                    : "先补记睡眠和疲劳，系统才能更完整地判断恢复状态。")}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[1.35rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/70">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">主观疲劳</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {latestFatigue?.value ?? "-"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">近3次均值 {recentFatigueAverage ?? "-"}</p>
              </div>
              <div className="rounded-[1.35rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/70">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">睡眠时长</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {latestSleep?.value ?? "-"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">近7日均 {recentSleepAverage ?? "-"} 小时</p>
              </div>
              <div className="rounded-[1.35rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/70">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">最近平均 RPE</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {progressData?.overview.averageRpe ?? "-"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">完成率 {progressData?.overview.completionRate ?? "-"}%</p>
              </div>
              <div className="rounded-[1.35rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/70">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">疲劳趋势</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                  {calendarData?.cycleSummary.activeMesocycle?.rollingFatigueAverage ?? recentFatigueAverage ?? "-"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {calendarData?.cycleSummary.activeMesocycle ? "系统 3 次滚动均值" : "最近 3 次主观记录"}
                </p>
              </div>
            </div>

            {calendarData?.cycleSummary.activeMesocycle?.stressSignals?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {calendarData.cycleSummary.activeMesocycle.stressSignals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            ) : null}

            {progressData?.warnings.length ? (
              <div className="mt-4 space-y-2">
                {progressData.warnings.slice(0, 2).map((warning) => (
                  <div
                    key={`${warning.type}-${warning.trackKey}`}
                    className="rounded-[1.2rem] border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300"
                  >
                    <p className="font-bold text-zinc-950 dark:text-zinc-50">{warning.label}</p>
                    <p className="mt-1 text-xs leading-5">{warning.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-[1.7rem] border border-zinc-200 bg-white/90 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-black tracking-tight text-zinc-950 dark:text-zinc-50">AI 判断</p>
                <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  用你在“我的”页配置的 OpenAI 接口，结合身体数据、周期和训练质量给出一段更像教练口吻的恢复建议。
                </p>
              </div>
              {aiSummary ? (
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {getConfidenceLabel(aiSummary.confidence)}
                </span>
              ) : null}
            </div>

            {!aiConfigured ? (
              <div className="mt-4 rounded-[1.35rem] border border-dashed border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">还没有配置 OpenAI 接口</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  先去“我的”页填好 base URL、API Key 和模型，这里才能真正跑 AI 恢复判断。
                </p>
                <Link
                  href="/me"
                  className="mt-3 inline-flex rounded-[1rem] border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  去配置接口
                </Link>
              </div>
            ) : aiSummary ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[1.35rem] bg-blue-50/70 p-4 dark:bg-blue-950/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-blue-700 dark:bg-zinc-900 dark:text-blue-300">
                      {aiSummary.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{aiSummary.summary}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-[11px] font-black tracking-tight text-zinc-950 dark:text-zinc-50">建议动作</p>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                      {aiSummary.actions.map((action) => (
                        <li key={action} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-[11px] font-black tracking-tight text-zinc-950 dark:text-zinc-50">关注项</p>
                    {aiSummary.watchItems.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                        {aiSummary.watchItems.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">这次没有额外需要单独盯的风险项。</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[1.35rem] border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">还没有生成 AI 判断</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  点击下面按钮后，系统会用你当前保存的 OpenAI 配置读取最近身体和训练数据，生成一段恢复建议。
                </p>
              </div>
            )}

            {aiSummaryError ? <InlineAlert className="mt-4" tone="error">{aiSummaryError}</InlineAlert> : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleGenerateAiSummary()}
                disabled={!aiConfigured || aiSummaryLoading}
                className="rounded-[1.2rem] bg-zinc-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {aiSummaryLoading ? "生成中..." : aiSummary ? "重新生成 AI 判断" : "生成 AI 判断"}
              </button>
              <Link
                href="/me"
                className="rounded-[1.2rem] border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
              >
                打开接口设置
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/training?view=progression&tab=alerts"
            className="rounded-[1.4rem] border border-zinc-200 bg-white/80 px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200"
          >
            打开训练预警
          </Link>
          <Link
            href="/training/cycles"
            className="rounded-[1.4rem] border border-zinc-200 bg-white/80 px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-200"
          >
            查看周期档案
          </Link>
        </div>
      </AppCard>

      <AppCard className="space-y-4">
        <SectionTitle
          title="恢复补充"
          description="身体页先保留少量次级入口：睡眠、疲劳补记，以及恢复中心会继续扩展的方向。"
        />
        <div className="grid gap-3">
          <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">睡眠与疲劳补记</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              当天忘记填，或者想在训练后补记睡眠和主观疲劳时，直接从这里进入。
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-dashed border-zinc-200 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-950/20">
            <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">紧张 / 不适与恢复助手</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              后续会把局部紧张、疼痛限制和 AI 恢复建议都收进这里，不会再单独散落到别的页面。
            </p>
          </div>
        </div>
      </AppCard>

      {showDailySheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-sm">
          <button type="button" aria-label="关闭今日身体数据" onClick={() => setShowDailySheet(false)} className="absolute inset-0" />
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-[2rem] bg-white px-5 pb-8 pt-5 dark:bg-zinc-950">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-5">
              <SectionTitle
                title="补全今日身体数据"
                description="今天已经填过的项目会直接锁定显示，避免重复录入。"
              />

              <form className="space-y-4" onSubmit={handleSubmitDailyCheckin}>
                {BODY_METRICS.map((metricKey) => {
                  const metric = todayMetrics.get(metricKey);
                  const isMissing = metric?.missingToday ?? true;
                  if (!isMissing) {
                    return (
                      <div key={metricKey} className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">{getMetricLabel(metricKey)}</p>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                          今天已记录 {formatMetricValue(metric?.todayValue ?? null, metric?.unit ?? "")}
                        </p>
                      </div>
                    );
                  }

                  if (metricKey === "bodyweight") {
                    return (
                      <label key={metricKey} className="block space-y-2">
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">体重</span>
                        <div className="flex gap-2">
                          <input
                            inputMode="decimal"
                            value={dailyDraft.bodyweight}
                            onChange={(event) => setDailyDraft((current) => ({ ...current, bodyweight: event.target.value }))}
                            className="min-w-0 flex-1 rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                            placeholder="例如 72.5"
                          />
                          <select
                            value={dailyDraft.bodyweightUnit}
                            onChange={(event) =>
                              setDailyDraft((current) => ({
                                ...current,
                                bodyweightUnit: event.target.value === "lbs" ? "lbs" : "kg",
                              }))
                            }
                            className="w-20 rounded-[1.25rem] border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                          >
                            <option value="kg">kg</option>
                            <option value="lbs">lbs</option>
                          </select>
                        </div>
                      </label>
                    );
                  }

                  return (
                    <label key={metricKey} className="block space-y-2">
                      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{getMetricLabel(metricKey)}</span>
                      <input
                        inputMode="decimal"
                        value={metricKey === "waist_circumference" ? dailyDraft.waistCircumference : dailyDraft.restingHeartRate}
                        onChange={(event) =>
                          setDailyDraft((current) => ({
                            ...current,
                            [metricKey === "waist_circumference" ? "waistCircumference" : "restingHeartRate"]:
                              event.target.value,
                          }))
                        }
                        className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder={metricKey === "waist_circumference" ? "例如 82" : "例如 58"}
                      />
                    </label>
                  );
                })}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDailySheet(false)}
                    className="flex-1 rounded-[1.25rem] border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={dailySubmitting}
                    className="flex-1 rounded-[1.25rem] bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-blue-500 dark:disabled:bg-zinc-800"
                  >
                    {dailySubmitting ? "保存中..." : "保存今天"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showRecoverySheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-sm">
          <button type="button" aria-label="关闭恢复补记" onClick={() => setShowRecoverySheet(false)} className="absolute inset-0" />
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-[2rem] bg-white px-5 pb-8 pt-5 dark:bg-zinc-950">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-5">
              <SectionTitle
                title="补记睡眠 / 疲劳"
                description="这两项不会占据首屏，但会直接进入身体页的疲劳监测计算。"
              />
              <form className="space-y-4" onSubmit={handleSubmitRecovery}>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">睡眠时长（小时）</span>
                  <input
                    inputMode="decimal"
                    value={recoveryDraft.sleepHours}
                    onChange={(event) => setRecoveryDraft((current) => ({ ...current, sleepHours: event.target.value }))}
                    className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="例如 7.5"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">主观疲劳（1-10）</span>
                  <input
                    inputMode="decimal"
                    value={recoveryDraft.fatigueScore}
                    onChange={(event) => setRecoveryDraft((current) => ({ ...current, fatigueScore: event.target.value }))}
                    className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="例如 6.5"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">备注（选填）</span>
                  <textarea
                    rows={3}
                    value={recoveryDraft.notes}
                    onChange={(event) => setRecoveryDraft((current) => ({ ...current, notes: event.target.value }))}
                    className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="例如：昨晚睡得浅，今天主观疲劳偏高。"
                  />
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRecoverySheet(false)}
                    className="flex-1 rounded-[1.25rem] border border-zinc-200 px-4 py-3 text-sm font-bold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={recoverySubmitting}
                    className="flex-1 rounded-[1.25rem] bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-blue-500 dark:disabled:bg-zinc-800"
                  >
                    {recoverySubmitting ? "保存中..." : "保存补记"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
