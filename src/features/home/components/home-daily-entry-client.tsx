"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";

import { 
  getHomeDashboardBootstrap, 
  HomeDailyMetricKey, 
  HomeDashboardBootstrapResponse, 
  submitDailyCheckin,
  listTodayOverduePlannedSessions,
  resolveOverdueTodaySession,
  OverduePlannedSessionItem
} from "@/features/home/home-api";
import { AppCard, InlineAlert, SkeletonRows } from "@/features/shared/components/ui-primitives";
import { getMetricLabel } from "@/features/shared/ui-zh";

type HomeDailyEntryClientProps = {
  userId: string;
};

type DailyCheckinDraft = {
  bodyweight: string;
  bodyweightUnit: "kg" | "lbs";
  waistCircumference: string;
  restingHeartRate: string;
};

const METRIC_ORDER: HomeDailyMetricKey[] = ["bodyweight", "waist_circumference", "resting_heart_rate"];

function formatDateLabel(dateText: string) {
  const date = new Date(dateText);
  const datePart = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekday = date.toLocaleDateString(undefined, {
    weekday: "short",
  });
  return `${datePart} (${weekday})`;
}

function formatMinutesToClock(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}小时${m}分` : `${m}分`;
}

function formatMetricValue(value: number | null, unit: string) {
  if (value === null) {
    return "—";
  }
  return `${value} ${unit}`;
}

function getDailyModalSeenKey(userId: string, dateKey: string) {
  return `sms.home.daily-vitals.modal-seen.v1:${userId}:${dateKey}`;
}

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayTrainingStateLabel(state: HomeDashboardBootstrapResponse["todayTraining"]["state"]) {
  if (state === "in_progress") return "进行中";
  if (state === "completed") return "已完成";
  return "未开始";
}

function getTodayTrainingStateClass(state: HomeDashboardBootstrapResponse["todayTraining"]["state"]) {
  if (state === "in_progress") return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400";
  if (state === "completed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400";
  return "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400";
}

function AreaChart({ points, color = "blue" }: { points: Array<{ date: string; value: number; unit: string }>; color?: "blue" | "emerald" }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length < 2) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl bg-zinc-50/50 dark:bg-zinc-900/40">
        <p className="text-[10px] text-zinc-400">趋势数据增长中...</p>
      </div>
    );
  }

  const chartWidth = 240;
  const chartHeight = 100;
  const marginLeft = 25;
  const marginBottom = 15;
  const marginTop = 15;
  
  const width = chartWidth - marginLeft;
  const height = chartHeight - marginBottom - marginTop;

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataRange = Math.max(dataMax - dataMin, 1);
  
  // Create a nice Y-axis scale based on data
  const yAxisTicks = [0, 20, 40, 60, 80, 100].map(p => dataMin + (p / 100) * dataRange);

  const pts = points.map((p, i) => ({
    x: marginLeft + (i / (points.length - 1)) * width,
    y: marginTop + height - ((p.value - dataMin) / dataRange) * height,
  }));

  // Improved smoothing: Use a more pronounced curve
  const linePath = `M ${pts[0].x},${pts[0].y} ${pts.slice(1).map((p, i) => {
    const prev = pts[i];
    // Increase control point intensity for "bubble" effect
    const cp1x = prev.x + (p.x - prev.x) / 2.5;
    const cp2x = p.x - (p.x - prev.x) / 2.5;
    return `C ${cp1x},${prev.y} ${cp2x},${p.y} ${p.x},${p.y}`;
  }).join(" ")}`;
  
  const areaPath = `${linePath} L ${pts[pts.length - 1].x},${chartHeight - marginBottom} L ${pts[0].x},${chartHeight - marginBottom} Z`;

  const colorClass = color === "emerald" ? "text-emerald-500" : "text-blue-500";
  const gradientId = `grad-${color}-${Math.random().toString(36).substr(2, 5)}`;
  const glowId = `glow-${color}-${Math.random().toString(36).substr(2, 5)}`;

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * chartWidth;
    
    let closestIndex = 0;
    let minDistance = Math.abs(pts[0].x - x);
    
    pts.forEach((pt, i) => {
      const dist = Math.abs(pt.x - x);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    });
    
    setActiveIndex(closestIndex);
  };

  return (
    <div className="group/chart relative h-24 w-full cursor-crosshair overflow-visible">
      <svg 
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
        className="h-full w-full overflow-visible" 
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" className={colorClass} />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" className={colorClass} />
          </linearGradient>
        </defs>
        
        {/* Grid Lines */}
        {yAxisTicks.map((val, i) => {
          const y = marginTop + height - (i / (yAxisTicks.length - 1)) * height;
          return (
            <g key={i} className="opacity-[0.4] dark:opacity-[0.2]">
              <line x1={marginLeft} y1={y} x2={chartWidth} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-zinc-200 dark:text-zinc-800" />
              <text x={marginLeft - 5} y={y + 3} textAnchor="end" className="fill-zinc-400 text-[8px] font-bold">{Math.round(val)}</text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} className="transition-all duration-300" />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`${colorClass} transition-all duration-300`}
          style={{ vectorEffect: 'non-scaling-stroke' }}
        />

        {/* Permanent Data Labels & Nodes */}
        {pts.map((pt, i) => (
          <g key={i}>
            <text 
              x={pt.x} 
              y={pt.y - 6} 
              textAnchor="middle" 
              className={`fill-zinc-400 text-[8px] font-black transition-all group-hover/chart:opacity-40 ${activeIndex === i ? "fill-zinc-900 opacity-100 dark:fill-white" : ""}`}
            >
              {points[i].value}
            </text>
            <circle 
              cx={pt.x} 
              cy={pt.y} 
              r="2" 
              fill="white" 
              className={`opacity-0 transition-opacity ${activeIndex === i ? "opacity-100" : ""} dark:fill-zinc-900`} 
              stroke="currentColor" 
              strokeWidth="1.5"
            />
          </g>
        ))}

        {/* X-Axis Labels (Simple) */}
        {pts.map((pt, i) => {
          if (i % 2 !== 0 && i !== pts.length - 1) return null; // Show every 2nd label
          return (
            <text key={i} x={pt.x} y={chartHeight - 2} textAnchor="middle" className="fill-zinc-400 text-[7px] font-bold uppercase tracking-tighter">
              {new Date(points[i].date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
            </text>
          );
        })}

        {/* Interaction Indicator */}
        {activeIndex !== null && (
          <g className="animate-in fade-in duration-200">
            <line x1={pts[activeIndex].x} y1={marginTop} x2={pts[activeIndex].x} y2={marginTop + height} stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" className="text-zinc-300 dark:text-zinc-700" />
            <circle cx={pts[activeIndex].x} cy={pts[activeIndex].y} r="4" fill="currentColor" className={colorClass} />
            <circle cx={pts[activeIndex].x} cy={pts[activeIndex].y} r="10" fill="currentColor" fillOpacity="0.15" className={colorClass} />
          </g>
        )}
      </svg>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  unit, 
  delta, 
  trendPoints, 
  onClick 
}: { 
  label: string; 
  value: number | null; 
  unit: string; 
  delta: number | null; 
  trendPoints?: Array<{ date: string; value: number; unit: string }>;
  onClick?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className={`group relative flex flex-col justify-between rounded-[2rem] border border-zinc-200/50 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all hover:bg-white active:scale-[0.98] dark:border-zinc-800/50 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="relative z-10">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{label}</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{value ?? "—"}</span>
          <span className="text-sm font-bold text-zinc-400 dark:text-zinc-500">{unit}</span>
        </div>
      </div>
      
      <div className="mt-6 relative">
        {trendPoints ? (
          <AreaChart points={trendPoints} />
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            {delta !== null ? (
              <>
                <span className={`flex h-6 items-center rounded-full px-2.5 font-black tracking-tight ${delta > 0 ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : delta < 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-zinc-50 text-zinc-400 dark:bg-zinc-800"}`}>
                  {delta > 0 ? "↑" : delta < 0 ? "↓" : "•"} {Math.abs(delta)}
                </span>
                <span className="font-bold text-zinc-400">vs 昨日</span>
              </>
            ) : (
              <span className="font-bold text-zinc-300 dark:text-zinc-700">— 暂无对比</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function HomeDailyEntryClient({ userId }: HomeDailyEntryClientProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<HomeDashboardBootstrapResponse | null>(null);
  const [showDailyModal, setShowDailyModal] = useState(false);
  const [submittingDailyCheckin, setSubmittingDailyCheckin] = useState(false);
  const [dailyCheckinError, setDailyCheckinError] = useState<string | null>(null);
  const [dailyDraft, setDailyDraft] = useState<DailyCheckinDraft>({
    bodyweight: "",
    bodyweightUnit: "kg",
    waistCircumference: "",
    restingHeartRate: "",
  });

  const [loadingOverdue, setLoadingOverdue] = useState(true);
  const [overdueError, setOverdueError] = useState<string | null>(null);
  const [overdueSessions, setOverdueSessions] = useState<OverduePlannedSessionItem[]>([]);
  const [overdueResolvingById, setOverdueResolvingById] = useState<Record<string, boolean>>({});
  const [overdueRescheduleEditingId, setOverdueRescheduleEditingId] = useState<string | null>(null);
  const [overdueRescheduleDraftById, setOverdueRescheduleDraftById] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDashboard = await getHomeDashboardBootstrap(userId);
      setDashboard(nextDashboard);

      const shouldPromptDailyCheckin = !nextDashboard.dailyVitals.completion.allFilled;
      if (shouldPromptDailyCheckin) {
        const seenKey = getDailyModalSeenKey(userId, nextDashboard.appDateKey);
        const hasSeen = typeof window !== "undefined" ? window.localStorage.getItem(seenKey) : null;
        if (!hasSeen) {
          setShowDailyModal(true);
        }
      }
    } catch (nextError) {
      setDashboard(null);
      setError(nextError instanceof Error ? nextError.message : "加载首页失败");
    } finally {
      setLoading(false);
    }
  };

  const loadOverdue = async () => {
    setLoadingOverdue(true);
    setOverdueError(null);
    try {
      const overdueResult = await listTodayOverduePlannedSessions(userId, 5);
      setOverdueSessions(overdueResult);
    } catch (e) {
      setOverdueSessions([]);
      setOverdueError(e instanceof Error ? e.message : "加载逾期训练失败");
    } finally {
      setLoadingOverdue(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadDashboard(), loadOverdue()]);
  };

  useEffect(() => {
    void loadAll();
  }, [userId]);

  const handleResolveOverdue = async (
    plannedSession: OverduePlannedSessionItem,
    action: "today_makeup" | "overdue_ignore",
  ) => {
    const actionLabel = action === "today_makeup" ? "今天补练" : "忽略此次训练（不补练）";
    const confirmed = window.confirm(
      `确认对训练 #${plannedSession.sequence_index} 执行「${actionLabel}」吗？`,
    );
    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setOverdueResolvingById((current) => ({
      ...current,
      [plannedSession.id]: true,
    }));

    try {
      const result = await resolveOverdueTodaySession(plannedSession.id, {
        userId,
        action,
      });
      if (action === "today_makeup") {
        setActionMessage(
          `已将训练 #${plannedSession.sequence_index} 设为今日补练，并顺延后续 ${result.shiftedCount} 条未完成训练。`,
        );
      } else {
        setActionMessage(
          `训练 #${plannedSession.sequence_index} 已忽略并归档为未训练，本次不补练，后续安排保持不变。`,
        );
      }
      await loadAll();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "处理失败");
    } finally {
      setOverdueResolvingById((current) => ({
        ...current,
        [plannedSession.id]: false,
      }));
    }
  };

  const openOverdueReschedule = (plannedSessionId: string) => {
    setActionError(null);
    setActionMessage(null);
    setOverdueRescheduleEditingId(plannedSessionId);
    setOverdueRescheduleDraftById((current) => ({
      ...current,
      [plannedSessionId]: current[plannedSessionId] ?? todayDateInputValue(),
    }));
  };

  const closeOverdueReschedule = () => {
    setOverdueRescheduleEditingId(null);
  };

  const handleSaveOverdueReschedule = async (plannedSession: OverduePlannedSessionItem) => {
    const targetDate = (overdueRescheduleDraftById[plannedSession.id] ?? "").trim();
    if (!targetDate) {
      setActionMessage(null);
      setActionError("改期失败：目标日期不能为空。\\n");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setOverdueResolvingById((current) => ({
      ...current,
      [plannedSession.id]: true,
    }));

    try {
      const previewResult = await resolveOverdueTodaySession(plannedSession.id, {
        userId,
        action: "reschedule_cascade",
        sessionDate: targetDate,
        shiftFollowing: true,
        previewOnly: true,
      });

      const previewLines = (previewResult.preview ?? [])
        .slice(0, 8)
        .map((item) => `训练 #${item.sequenceIndex}：${item.fromDate} → ${item.toDate}`);
      const previewMessage =
        previewLines.length > 0
          ? `本次改期将从边界点级联顺延后续未完成训练：\\n${previewLines.join("\\n")}\\n\\n确认继续吗？`
          : `本次改期将按顺序重排后续未完成训练，确认继续吗？`;

      const confirmed = window.confirm(previewMessage);
      if (!confirmed) {
        setOverdueResolvingById((current) => ({
          ...current,
          [plannedSession.id]: false,
        }));
        return;
      }

      const result = await resolveOverdueTodaySession(plannedSession.id, {
        userId,
        action: "reschedule_cascade",
        sessionDate: targetDate,
        shiftFollowing: true,
      });
      const resolvedDateText =
        typeof result.targetDate === "string"
          ? result.targetDate.slice(0, 10)
          : result.targetDate instanceof Date
            ? result.targetDate.toISOString().slice(0, 10)
            : targetDate;
      setActionMessage(
        `训练 #${plannedSession.sequence_index} 已改期到 ${resolvedDateText}，并顺延后续 ${result.shiftedCount} 条未完成训练。`,
      );
      setOverdueRescheduleEditingId(null);
      await loadAll();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "改期失败");
    } finally {
      setOverdueResolvingById((current) => ({
        ...current,
        [plannedSession.id]: false,
      }));
    }
  };

  const renderOverdueUnitSummary = (session: OverduePlannedSessionItem) => {
    if (session.planned_units.length === 0) {
      return "暂无动作";
    }
    return session.planned_units
      .map((unit) => unit.selected_exercise_name ?? `训练单元 #${unit.sequence_no}`)
      .join("、");
  };

  const markDailyModalSeen = () => {
    if (!dashboard || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(getDailyModalSeenKey(userId, dashboard.appDateKey), "1");
  };

  const onSkipDailyCheckin = () => {
    markDailyModalSeen();
    setShowDailyModal(false);
  };

  const onSubmitDailyCheckin = async () => {
    if (!dashboard) return;

    const bodyweight = dailyDraft.bodyweight.trim().length > 0 ? Number(dailyDraft.bodyweight) : undefined;
    const waistCircumference =
      dailyDraft.waistCircumference.trim().length > 0 ? Number(dailyDraft.waistCircumference) : undefined;
    const restingHeartRate =
      dailyDraft.restingHeartRate.trim().length > 0 ? Number(dailyDraft.restingHeartRate) : undefined;

    if (bodyweight === undefined && waistCircumference === undefined && restingHeartRate === undefined) {
      setDailyCheckinError("请至少填写一项今日体征数据");
      return;
    }

    setSubmittingDailyCheckin(true);
    setDailyCheckinError(null);
    try {
      await submitDailyCheckin({
        userId,
        date: dashboard.appDateKey,
        bodyweight,
        bodyweightUnit: dailyDraft.bodyweightUnit,
        waistCircumference,
        restingHeartRate,
      });
      markDailyModalSeen();
      setShowDailyModal(false);
      setDailyDraft((current) => ({
        ...current,
        bodyweight: "",
        waistCircumference: "",
        restingHeartRate: "",
      }));
      await loadDashboard();
    } catch (nextError) {
      setDailyCheckinError(nextError instanceof Error ? nextError.message : "提交今日体征失败");
    } finally {
      setSubmittingDailyCheckin(false);
    }
  };

  const dailyMetrics = useMemo(() => {
    if (!dashboard) {
      return [];
    }
    const byMetricKey = new Map(dashboard.dailyVitals.metrics.map((item) => [item.metricKey, item]));
    return METRIC_ORDER.map((metricKey) => byMetricKey.get(metricKey)).filter(
      (item): item is NonNullable<typeof item> => !!item,
    );
  }, [dashboard]);

  return (
    <section className="space-y-4">
      {loading ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <SkeletonRows rows={4} />
        </div>
      ) : null}

      {!loading && error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {!loading && !error && dashboard ? (
        <div className="space-y-6 pb-8">
          {/* Header Section */}
          <header className="flex items-center justify-between px-1">
            <div className="space-y-0.5">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">下午好, 运动员</h1>
              <p className="text-[11px] font-bold tracking-widest text-zinc-400 uppercase">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</p>
            </div>
          </header>

          {/* Overdue Section */}
          {!loadingOverdue && overdueSessions.length > 0 ? (
            <div className="space-y-4">
              <div className="px-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <div className="h-5 w-1 rounded-full bg-orange-500" />
                   <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100">逾期待处理</h2>
                </div>
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                  {overdueSessions.length} 项需处理
                </span>
              </div>
              
              <ul className="space-y-3">
                {overdueSessions.map((session) => {
                  const isResolving = !!overdueResolvingById[session.id];
                  const isEditingOverdueReschedule = overdueRescheduleEditingId === session.id;
                  const overdueRescheduleDraft = overdueRescheduleDraftById[session.id] ?? todayDateInputValue();
                  const programId = session.program?.id ?? session.program_id;

                  return (
                    <li key={session.id} className="overflow-hidden rounded-[2rem] border border-zinc-200/60 bg-white p-5 shadow-sm transition-all dark:border-zinc-800/60 dark:bg-zinc-900/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                           <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black tracking-widest text-orange-500 uppercase">{formatDateLabel(session.session_date)}</span>
                              {!session.is_actionable && <span className="text-[10px] font-bold text-zinc-400">· 锁定</span>}
                           </div>
                           <h3 className="truncate text-base font-black text-zinc-900 dark:text-zinc-50">
                             训练 #{session.sequence_index} · {session.program?.name ?? "未命名"}
                           </h3>
                           <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 line-clamp-1">{renderOverdueUnitSummary(session)}</p>
                        </div>
                        {!session.is_actionable && (
                          <div 
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800"
                            title={session.waiting_reason || "请先完成之前的训练"}
                          >
                            <span className="text-base opacity-40">🔒</span>
                          </div>
                        )}
                      </div>

                      {!session.is_actionable && (
                         <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/30">
                           <span className="text-[12px]">⚠️</span>
                           <p className="text-[10px] font-black text-zinc-400">
                             {session.waiting_reason || "受前序项限制，请由远及近依次处理。"}
                           </p>
                         </div>
                      )}

                      {session.is_actionable ? (
                        <div className="mt-5 space-y-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isResolving}
                              onClick={() => void handleResolveOverdue(session, "today_makeup")}
                              className="flex-[2] rounded-xl bg-orange-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-orange-500/10 active:scale-[0.98] disabled:opacity-50 dark:bg-orange-500"
                            >
                              今天补练
                            </button>
                            <button
                              type="button"
                              disabled={isResolving}
                              onClick={() => openOverdueReschedule(session.id)}
                              className="flex-1 rounded-xl bg-zinc-100 px-3 py-3 text-xs font-black text-zinc-700 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              改期
                            </button>
                            <button
                              type="button"
                              disabled={isResolving}
                              onClick={() => void handleResolveOverdue(session, "overdue_ignore")}
                              className="flex-1 rounded-xl bg-zinc-50 px-3 py-3 text-xs font-black text-zinc-500 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-800/40 dark:text-zinc-400"
                            >
                              忽略
                            </button>
                          </div>
                          
                          <div className="flex items-center justify-center pt-1">
                            <Link 
                               href={`/programs/${programId}/planned-sessions/${session.id}/plan`} 
                               className="text-[10px] font-black tracking-widest text-zinc-400 uppercase transition-colors hover:text-blue-500 dark:hover:text-blue-400"
                            >
                              查看计划详情 ...
                            </Link>
                          </div>
                        </div>
                      ) : null}

                      {session.is_actionable && isEditingOverdueReschedule ? (
                        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300 space-y-4 rounded-[1.5rem] bg-orange-50/50 p-4 dark:bg-orange-950/10">
                          <div className="space-y-2">
                             <p className="text-[10px] font-black uppercase tracking-wider text-orange-500">确认补练日期</p>
                             <input
                               type="date"
                               value={overdueRescheduleDraft}
                               onChange={(event) =>
                                 setOverdueRescheduleDraftById((current) => ({
                                   ...current,
                                   [session.id]: event.target.value,
                                 }))
                               }
                               className="w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-orange-900/30 dark:bg-zinc-900"
                             />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isResolving}
                              onClick={() => void handleSaveOverdueReschedule(session)}
                              className="flex-1 rounded-xl bg-zinc-900 py-3 text-xs font-black text-white shadow-xl shadow-zinc-900/20 active:scale-[0.98] dark:bg-zinc-50 dark:text-zinc-900"
                            >
                              {isResolving ? "处理中..." : "保存改期"}
                            </button>
                            <button
                              type="button"
                              disabled={isResolving}
                              onClick={closeOverdueReschedule}
                              className="rounded-xl px-4 py-3 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}


          {/* Today's Focus Card */}
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 p-6 shadow-2xl shadow-orange-500/20 dark:from-amber-900/60 dark:via-red-950 dark:to-zinc-950 dark:shadow-none transition-all duration-500">
            <div className="relative z-10 flex flex-col justify-between h-44">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-black tracking-widest text-white uppercase backdrop-blur-md border border-white/10">
                    {getTodayTrainingStateLabel(dashboard.todayTraining.state)}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <p className="text-[10px] font-bold text-white/60">生成于 {new Date(dashboard.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
                <div className="pt-3">
                  <h2 className="text-2xl font-black text-white tracking-tight leading-none">今天的主线任务</h2>
                  <div className="mt-2 flex items-center gap-2 text-white/80">
                    <span className="text-lg">🔥</span>
                    {dashboard.todayTraining.plannedEntry ? (
                      <p className="text-sm font-bold tracking-tight">
                        训练 #{dashboard.todayTraining.plannedEntry.plannedSession.sequence_index} · {dashboard.todayTraining.plannedEntry.program.name}
                      </p>
                    ) : (
                      <p className="text-sm font-medium opacity-80">当前处于休息或待排程状态</p>
                    )}
                  </div>
                </div>
              </div>
              
              <Link 
                href={dashboard.todayTraining.actionHref} 
                className="flex items-center justify-center rounded-[1.5rem] bg-white py-4 text-sm font-black text-orange-600 shadow-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {dashboard.todayTraining.actionLabel}
              </Link>
            </div>
            
            {/* Background Decorations - Mesh Gradient Style */}
            <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-amber-400/40 blur-[60px] dark:bg-orange-500/10 pointer-events-none" />
            <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-orange-400/30 blur-[60px] dark:bg-red-600/5 pointer-events-none" />
            
            {/* Subtle Grid Pattern */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} 
            />
          </div>

          {!dashboard.dailyVitals.completion.allFilled ? (
            <div 
              onClick={() => setShowDailyModal(true)}
              className="group flex cursor-pointer items-center justify-between rounded-3xl border border-amber-200 bg-amber-50/50 p-4 transition-colors hover:bg-amber-100/50 dark:border-amber-900/30 dark:bg-amber-950/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/40">
                  <span className="text-lg">⚖️</span>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-500">建议操作</p>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">补全今日体征数据</p>
                </div>
              </div>
              <span className="text-amber-400 transition-transform group-hover:translate-x-1">→</span>
            </div>
          ) : null}

          {/* Bento Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Weight Card - Spans 2 cols */}
            <div className="col-span-2">
              <MetricCard 
                label="当前体重"
                value={dailyMetrics[0]?.todayValue ?? null}
                unit={dailyMetrics[0]?.unit ?? "kg"}
                delta={dailyMetrics[0]?.deltaFromPrevious ?? null}
                trendPoints={dashboard.bodyweightTrend}
                onClick={() => setShowDailyModal(true)}
              />
            </div>

            {/* Other Vitals */}
            {dailyMetrics.slice(1).map((metric) => (
              <MetricCard 
                key={metric.metricKey}
                label={getMetricLabel(metric.metricKey).replace(/\(.*\)/, "")}
                value={metric.todayValue}
                unit={metric.unit}
                delta={metric.deltaFromPrevious}
                onClick={() => setShowDailyModal(true)}
              />
            ))}

            {/* Summary Cards */}
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div className="rounded-[2rem] border border-zinc-200/50 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/50 dark:bg-zinc-900/80">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">本周待办</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-orange-600 dark:text-orange-500">{dashboard.scheduleSummary.overdueCount}</span>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">项逾期</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-blue-600 dark:text-blue-500">{dashboard.scheduleSummary.upcomingCount7d}</span>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">项待执行</span>
                </div>
              </div>

              <div className="rounded-[2rem] border border-zinc-200/50 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/50 dark:bg-zinc-900/80">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">巅峰力量</p>
                {dashboard.recentMainLiftPr[0] ? (
                  <div className="mt-3 space-y-1">
                    <p className="truncate text-sm font-black text-zinc-900 dark:text-zinc-50">{dashboard.recentMainLiftPr[0].exerciseName}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black tracking-tighter text-zinc-900 dark:text-zinc-50">{dashboard.recentMainLiftPr[0].e1rm}</span>
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">kg (e1RM)</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[10px] font-bold text-zinc-300">暂无数据</p>
                )}
              </div>
            </div>
          </div>

          {/* Quick Tools */}
          <div className="rounded-3xl bg-zinc-100/80 p-5 dark:bg-zinc-900/40">
            <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">常用工具</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "计划", icon: "📅", href: "/training?view=planning" },
                { label: "分析", icon: "📈", href: "/training?view=progression" },
                { label: "身体", icon: "🫀", href: "/observations" },
              ].map((tool) => (
                <Link 
                  key={tool.label} 
                  href={tool.href}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-white py-4 shadow-sm transition-transform active:scale-90 dark:bg-zinc-800"
                >
                  <span className="text-xl">{tool.icon}</span>
                  <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">{tool.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showDailyModal && dashboard ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center dark:bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">记录今日体征</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">为了更准确的情境分析，请优先填写以下数据。</p>

            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                体重
                <div className="mt-2 flex gap-2">
                  <input
                    inputMode="decimal"
                    value={dailyDraft.bodyweight}
                    onChange={(event) => setDailyDraft((current) => ({ ...current, bodyweight: event.target.value }))}
                    className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-4 py-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:focus:border-blue-400"
                    placeholder="例如 72.5"
                  />
                  <select
                    value={dailyDraft.bodyweightUnit}
                    onChange={(event) =>
                      setDailyDraft((current) => ({
                        ...current,
                        bodyweightUnit: event.target.value as "kg" | "lbs",
                      }))
                    }
                    className="w-20 shrink-0 rounded-xl border border-zinc-300 bg-transparent px-2 py-3 outline-none dark:border-zinc-700"
                  >
                    <option value="kg">kg</option>
                    <option value="lbs">lbs</option>
                  </select>
                </div>
              </label>

              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                腰围 (cm)
                <input
                  inputMode="decimal"
                  value={dailyDraft.waistCircumference}
                  onChange={(event) =>
                    setDailyDraft((current) => ({
                      ...current,
                      waistCircumference: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-4 py-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:focus:border-blue-400"
                  placeholder="例如 82"
                />
              </label>

              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                静息心率 (bpm)
                <input
                  inputMode="numeric"
                  value={dailyDraft.restingHeartRate}
                  onChange={(event) =>
                    setDailyDraft((current) => ({
                      ...current,
                      restingHeartRate: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-4 py-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:focus:border-blue-400"
                  placeholder="例如 58"
                />
              </label>
            </div>

            {dailyCheckinError ? <p className="mt-3 text-sm text-red-500 dark:text-red-400">{dailyCheckinError}</p> : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onSkipDailyCheckin}
                className="rounded-xl border border-zinc-300 bg-transparent px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
              >
                稍后填写
              </button>
              <button
                type="button"
                disabled={submittingDailyCheckin}
                onClick={() => void onSubmitDailyCheckin()}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {submittingDailyCheckin ? "保存中..." : "保存记录"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
