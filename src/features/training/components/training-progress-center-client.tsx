"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  getTrainingProgressBootstrap,
  getTrainingProgressMatrixV2,
  GetTrainingProgressMatrixV2Options,
  TrainingProgressBootstrapResponse,
  TrainingProgressMatrixV2Response,
} from "@/features/training/training-api";
import {
  buildProgressionMatrixVisualState,
  getProgressionMatrixAuxFlagLabel,
} from "@/features/progression/progression-visual-state";
import { AppCard, EmptyState, InlineAlert, SkeletonRows } from "@/features/shared/components/ui-primitives";

type TrainingProgressCenterClientProps = {
  userId: string;
};

type ProgressTab = "overview" | "matrix" | "trend" | "warning";

const PROGRESS_TABS: Array<{ value: ProgressTab; label: string }> = [
  { value: "overview", label: "总览" },
  { value: "matrix", label: "进步矩阵" },
  { value: "trend", label: "趋势" },
  { value: "warning", label: "预警" },
];

const WINDOW_OPTIONS: Array<{ value: 7 | 10 | 14; label: string }> = [
  { value: 7, label: "7列" },
  { value: 10, label: "10列" },
  { value: 14, label: "14列" },
];

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
  });
}

function toSessionTypeValue(value: string | null) {
  return value ?? "__none__";
}

function TrendBars({
  points,
}: {
  points: Array<{ dateKey: string; value?: number; score?: number; trainingQuality?: number | null }>;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-zinc-500">暂无趋势数据</p>;
  }
  const values = points.map((point) => point.value ?? point.score ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div className="space-y-1">
      {points.map((point, index) => {
        const currentValue = point.value ?? point.score ?? 0;
        const width = Math.max((currentValue / max) * 100, 6);
        return (
          <div key={`${point.dateKey}-${index}`} className="flex items-center gap-2 text-[11px]">
            <span className="w-12 shrink-0 text-zinc-500">{point.dateKey.slice(5)}</span>
            <div className="h-2 flex-1 rounded bg-zinc-100">
              <div className="h-2 rounded bg-blue-500" style={{ width: `${width}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right text-zinc-600">{currentValue.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TrainingProgressCenterClient({ userId }: TrainingProgressCenterClientProps) {
  const [tab, setTab] = useState<ProgressTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<TrainingProgressBootstrapResponse | null>(null);

  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<TrainingProgressMatrixV2Response | null>(null);
  const [windowSize, setWindowSize] = useState<7 | 10 | 14>(10);
  const [axis, setAxis] = useState<"calendar" | "exposure">("calendar");
  const [rowAxis, setRowAxis] = useState<"track" | "session_type">("track");
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const [sessionType, setSessionType] = useState("__all__");
  const [movementPattern, setMovementPattern] = useState("__all__");
  const [primaryMuscle, setPrimaryMuscle] = useState("__all__");
  const [focusedTrack, setFocusedTrack] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getTrainingProgressBootstrap(userId);
        if (cancelled) return;
        setBootstrap(response);
      } catch (nextError) {
        if (!cancelled) {
          setBootstrap(null);
          setError(nextError instanceof Error ? nextError.message : "加载进步总览失败");
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
  }, [userId]);

  useEffect(() => {
    if (tab !== "matrix") return;

    let cancelled = false;
    const run = async () => {
      setMatrixLoading(true);
      setMatrixError(null);
      try {
        const options: GetTrainingProgressMatrixV2Options = {
          window: windowSize,
          includeRecent: true,
          recentCount: 3,
          axis,
          rowAxis,
          onlyAbnormal,
        };
        if (sessionType !== "__all__") {
          options.sessionType = sessionType === "__none__" ? "__none__" : sessionType;
        }
        if (movementPattern !== "__all__") {
          options.movementPattern = movementPattern;
        }
        if (primaryMuscle !== "__all__") {
          options.primaryMuscle = primaryMuscle;
        }
        const response = await getTrainingProgressMatrixV2(userId, options);
        if (cancelled) return;
        setMatrix(response);
      } catch (nextError) {
        if (!cancelled) {
          setMatrix(null);
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
  }, [userId, tab, windowSize, axis, rowAxis, onlyAbnormal, sessionType, movementPattern, primaryMuscle]);

  const filteredMatrixRows = useMemo(() => {
    if (!matrix) return [];
    if (!focusedTrack) return matrix.rows;
    return matrix.rows.filter((row) => row.key === focusedTrack);
  }, [matrix, focusedTrack]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PROGRESS_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={`rounded border px-3 py-1.5 text-sm ${
              tab === item.value
                ? "border-blue-300 bg-blue-100 text-blue-700"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <AppCard>
          <SkeletonRows rows={6} />
        </AppCard>
      ) : null}

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {!loading && !error && bootstrap && tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <AppCard className="space-y-1">
              <p className="text-xs text-zinc-500">本周完成率</p>
              <p className="text-xl font-semibold text-zinc-900">{formatPercent(bootstrap.overview.completionRate)}</p>
            </AppCard>
            <AppCard className="space-y-1">
              <p className="text-xs text-zinc-500">计划达成率</p>
              <p className="text-xl font-semibold text-zinc-900">{formatPercent(bootstrap.overview.planHitRate)}</p>
            </AppCard>
            <AppCard className="space-y-1">
              <p className="text-xs text-zinc-500">跳过率</p>
              <p className="text-xl font-semibold text-zinc-900">{formatPercent(bootstrap.overview.skipRate)}</p>
            </AppCard>
            <AppCard className="space-y-1">
              <p className="text-xs text-zinc-500">平均 RPE</p>
              <p className="text-xl font-semibold text-zinc-900">
                {bootstrap.overview.averageRpe !== null ? bootstrap.overview.averageRpe.toFixed(2) : "—"}
              </p>
            </AppCard>
          </div>

          <AppCard className="space-y-3">
            <p className="text-sm font-semibold text-zinc-900">主项最近 1RM（估算）</p>
            {bootstrap.overview.recentMainLiftPr.length === 0 ? (
              <EmptyState title="暂无主项估算数据" hint="完成更多有效组后会出现趋势。" />
            ) : (
              <ul className="space-y-2 text-sm text-zinc-700">
                {bootstrap.overview.recentMainLiftPr.map((item) => (
                  <li key={`${item.exerciseName}-${item.performedAt}`} className="rounded border border-zinc-200 px-3 py-2">
                    {item.exerciseName}：{item.e1rm}kg（{item.weight}kg × {item.reps}次） · {formatDate(item.performedAt)}
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </div>
      ) : null}

      {!loading && !error && bootstrap && tab === "matrix" ? (
        <div className="space-y-4">
          <AppCard className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {WINDOW_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setWindowSize(item.value)}
                  className={`rounded border px-2 py-1 text-xs ${
                    windowSize === item.value
                      ? "border-blue-300 bg-blue-100 text-blue-700"
                      : "border-zinc-300 text-zinc-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAxis((current) => (current === "calendar" ? "exposure" : "calendar"))}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700"
              >
                列轴：{axis === "calendar" ? "日期" : "曝光"}
              </button>
              <button
                type="button"
                onClick={() => setRowAxis((current) => (current === "track" ? "session_type" : "track"))}
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700"
              >
                行轴：{rowAxis === "track" ? "动作轨道" : "训练日类型"}
              </button>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={onlyAbnormal}
                  onChange={(event) => setOnlyAbnormal(event.target.checked)}
                  className="h-4 w-4"
                />
                仅异常
              </label>
            </div>
            {matrix ? (
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  value={sessionType}
                  onChange={(event) => setSessionType(event.target.value)}
                  className="rounded border border-zinc-300 px-2 py-2 text-xs"
                >
                  {matrix.filters.sessionTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}（{option.count}）
                    </option>
                  ))}
                </select>
                <select
                  value={movementPattern}
                  onChange={(event) => setMovementPattern(event.target.value)}
                  className="rounded border border-zinc-300 px-2 py-2 text-xs"
                >
                  <option value="__all__">全部动作模式</option>
                  {matrix.filters.movementPatternOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value}（{option.count}）
                    </option>
                  ))}
                </select>
                <select
                  value={primaryMuscle}
                  onChange={(event) => setPrimaryMuscle(event.target.value)}
                  className="rounded border border-zinc-300 px-2 py-2 text-xs"
                >
                  <option value="__all__">全部主要肌群</option>
                  {matrix.filters.primaryMuscleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value}（{option.count}）
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </AppCard>

          {matrixLoading ? (
            <AppCard>
              <SkeletonRows rows={8} />
            </AppCard>
          ) : null}

          {matrixError ? <InlineAlert tone="error">{matrixError}</InlineAlert> : null}

          {!matrixLoading && !matrixError && matrix ? (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="min-w-[980px] table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="sticky left-0 z-20 w-56 border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                      {rowAxis === "track" ? "动作轨道" : "训练日类型"}
                    </th>
                    {matrix.columns.map((column) => (
                      <th key={column.id} className="w-52 border-r border-zinc-200 px-2 py-2 text-xs font-semibold text-zinc-700">
                        <p>{column.label}</p>
                        <p className="text-[11px] font-normal text-zinc-500">{column.subLabel}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMatrixRows.length === 0 ? (
                    <tr>
                      <td colSpan={matrix.columns.length + 1} className="px-3 py-4">
                        <EmptyState title="当前筛选下暂无可显示轨道" />
                      </td>
                    </tr>
                  ) : (
                    filteredMatrixRows.map((row) => {
                      const cellMap = new Map(row.cells.map((cell) => [cell.columnId, cell]));
                      return (
                        <tr key={row.key} className="border-b border-zinc-100 align-top">
                          <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900">
                            <button type="button" onClick={() => setFocusedTrack((current) => (current === row.key ? null : row.key))} className="text-left hover:underline">
                              {row.label}
                            </button>
                          </td>
                          {matrix.columns.map((column) => {
                            const cell = cellMap.get(column.id);
                            if (!cell) {
                              return (
                                <td key={`${row.key}-${column.id}`} className="border-r border-zinc-200 px-2 py-2">
                                  <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-400">
                                    未安排
                                  </div>
                                </td>
                              );
                            }

                            const visual = buildProgressionMatrixVisualState(
                              cell.progressionSnapshot,
                              cell.matrixCellPayload,
                            );

                            return (
                              <td key={`${row.key}-${column.id}`} className="border-r border-zinc-200 px-2 py-2">
                                <div className={`rounded border px-2 py-1.5 ${visual.cellClassName}`}>
                                  <p className="truncate text-[11px] font-semibold">
                                    {visual.icon} {visual.statusLabel}
                                    {visual.auxFlags[0] ? ` · ${getProgressionMatrixAuxFlagLabel(visual.auxFlags[0])}` : ""}
                                  </p>
                                  <p className="mt-0.5 truncate text-[12px] font-semibold">{visual.planLine}</p>
                                  <p className="mt-0.5 truncate text-[11px]">{visual.actualLine}</p>
                                  <p className="mt-0.5 truncate text-[11px] text-zinc-700">{visual.deviationLine}</p>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && bootstrap && tab === "trend" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <AppCard className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">体重波动（14点）</p>
              <TrendBars points={bootstrap.trend.bodyweight.map((item) => ({ ...item }))} />
            </AppCard>
            <AppCard className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">训练质量（14点）</p>
              <TrendBars points={bootstrap.trend.trainingQuality.map((item) => ({ ...item }))} />
            </AppCard>
          </div>
          <AppCard className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">动作轨道趋势</p>
            {bootstrap.trackTrends.length === 0 ? (
              <EmptyState title="暂无轨道趋势数据" />
            ) : (
              <ul className="space-y-2 text-sm text-zinc-700">
                {bootstrap.trackTrends.slice(0, 12).map((track) => (
                  <li key={track.key} className="rounded border border-zinc-200 px-3 py-2">
                    <p>
                      {track.directionLabel} {track.label} ·
                      {track.weightDelta !== null ? ` 重量Δ ${track.weightDelta >= 0 ? "+" : ""}${track.weightDelta}` : " 重量Δ —"} ·
                      {track.repsDelta !== null ? ` 次数Δ ${track.repsDelta >= 0 ? "+" : ""}${track.repsDelta}` : " 次数Δ —"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      近段平均RPE：{track.averageRpe !== null ? track.averageRpe.toFixed(2) : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </div>
      ) : null}

      {!loading && !error && bootstrap && tab === "warning" ? (
        <div className="space-y-4">
          <AppCard className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">预警列表</p>
            {bootstrap.warnings.length === 0 ? (
              <EmptyState title="当前没有高优先级预警" hint="继续按计划执行并观察矩阵变化。" />
            ) : (
              <ul className="space-y-2 text-sm text-zinc-700">
                {bootstrap.warnings.map((item, index) => (
                  <li key={`${item.trackKey}-${index}`} className="rounded border border-zinc-200 px-3 py-2">
                    <p className="font-medium text-zinc-900">
                      [{item.type}] {item.label}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">{item.message}</p>
                    <Link href={item.matrixHref} className="mt-1 inline-block text-xs text-blue-700 underline">
                      去矩阵查看该轨道 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </div>
      ) : null}
    </div>
  );
}

