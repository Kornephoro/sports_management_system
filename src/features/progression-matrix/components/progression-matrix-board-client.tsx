"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildProgressionMatrixVisualState,
  getProgressionMatrixAuxFlagLabel,
  normalizeProgressionSnapshot,
} from "@/features/progression/progression-visual-state";
import {
  listProgressionMatrixSessions,
  ProgressionMatrixSession,
} from "@/features/progression-matrix/progression-matrix-api";
import { InlineAlert, SectionBlock } from "@/features/shared/components/ui-primitives";
import { getTrainingStatusBadgeClass } from "@/features/shared/training-semantic-ui";
import { getSessionStatusLabel } from "@/features/shared/ui-zh";

type ProgressionMatrixBoardClientProps = {
  userId: string;
};

type ColumnWindow = 7 | 10 | 14;
type MatrixViewMode = "plan" | "execution";

type MatrixColumn = {
  id: string;
  sequenceIndex: number;
  sessionDate: string;
  status: string;
};

type MatrixCell = {
  rowKey: string;
  rowLabel: string;
  unitId: string;
  unitSequenceNo: number;
  exerciseName: string;
  column: MatrixColumn;
  visual: ReturnType<typeof buildProgressionMatrixVisualState>;
};

type MatrixRow = {
  key: string;
  label: string;
  cellsByColumnId: Map<string, MatrixCell>;
  sortOrder: number;
  trend: "up" | "flat" | "mixed";
};

const WINDOW_OPTIONS: Array<{ value: ColumnWindow; label: string }> = [
  { value: 7, label: "7次" },
  { value: 10, label: "10次" },
  { value: 14, label: "14次" },
];

const FIELD_LABELS: Record<string, string> = {
  current_load: "重量/附重",
  current_reps: "次数",
  current_sets: "组数",
  current_duration_seconds: "时长",
  current_phase: "阶段",
  cycle_index: "周期步",
  pending_retry: "重试标记",
};

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function formatDateLabel(dateText: string) {
  const date = new Date(dateText);
  const datePart = date.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
  });
  const weekday = date.toLocaleDateString(undefined, {
    weekday: "short",
  });
  return `${datePart} (${weekday})`;
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function resolveTrend(columns: MatrixColumn[], row: Omit<MatrixRow, "trend">): MatrixRow["trend"] {
  const values = columns
    .map((column) => row.cellsByColumnId.get(column.id))
    .filter((cell): cell is MatrixCell => Boolean(cell));

  if (values.length === 0) {
    return "flat";
  }

  const scores = values.map((cell) => cell.visual.trendScore);
  let nonDecreasing = true;
  let hasIncrease = false;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] < scores[index - 1]) {
      nonDecreasing = false;
    }
    if (scores[index] > scores[index - 1]) {
      hasIncrease = true;
    }
  }

  const failedOrSkippedRatio =
    values.filter(
      (cell) => cell.visual.actualOutcome === "failed" || cell.visual.actualOutcome === "skipped",
    ).length / values.length;

  if (nonDecreasing && hasIncrease && failedOrSkippedRatio <= 0.25) {
    return "up";
  }

  const longHold = values.every(
    (cell) =>
      (cell.visual.status === "no_change" || cell.visual.status === "threshold_progress") &&
      cell.visual.actualOutcome !== "success_met",
  );
  if (longHold) {
    return "flat";
  }

  return "mixed";
}

function getTrendLabel(trend: MatrixRow["trend"]) {
  if (trend === "up") return "📈";
  if (trend === "flat") return "➖";
  return "📊";
}

function getRowKey(session: ProgressionMatrixSession, unit: ProgressionMatrixSession["planned_units"][number]) {
  const snapshot = normalizeProgressionSnapshot(unit.progression_snapshot);
  const trackKey = snapshot?.track_key?.trim() ?? "";
  if (trackKey) {
    return `track:${trackKey}`;
  }

  const exerciseName = unit.selected_exercise_name?.trim() ?? "";
  if (exerciseName) {
    return `name:${exerciseName}`;
  }

  return `sequence:${unit.sequence_no}`;
}

export function ProgressionMatrixBoardClient({ userId }: ProgressionMatrixBoardClientProps) {
  const [windowSize, setWindowSize] = useState<ColumnWindow>(10);
  const [includeRecent, setIncludeRecent] = useState(true);
  const [viewMode, setViewMode] = useState<MatrixViewMode>("plan");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ProgressionMatrixSession[]>([]);
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listProgressionMatrixSessions(userId, {
        window: windowSize,
        includeRecent,
        recentCount: 3,
      });
      setSessions(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载进步矩阵失败");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [userId, windowSize, includeRecent]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const matrix = useMemo(() => {
    const orderedSessions = [...sessions].sort((a, b) => a.sequence_index - b.sequence_index);
    const columns: MatrixColumn[] = orderedSessions.map((session) => ({
      id: session.id,
      sequenceIndex: session.sequence_index,
      sessionDate: session.session_date,
      status: session.status,
    }));

    const rowMap = new Map<string, Omit<MatrixRow, "trend">>();
    let sortSeed = 0;

    for (const session of orderedSessions) {
      const column = columns.find((item) => item.id === session.id);
      if (!column) {
        continue;
      }

      const orderedUnits = [...session.planned_units].sort((a, b) => a.sequence_no - b.sequence_no);
      for (const unit of orderedUnits) {
        const baseKey = getRowKey(session, unit);
        let rowKey = baseKey;
        const exerciseName = unit.selected_exercise_name?.trim() || `训练单元 #${unit.sequence_no}`;

        const visual = buildProgressionMatrixVisualState(
          unit.progression_snapshot,
          unit.matrix_cell_payload,
        );

        if (rowMap.has(rowKey) && rowMap.get(rowKey)?.cellsByColumnId.has(column.id)) {
          rowKey = `${baseKey}:unit${unit.sequence_no}`;
        }

        if (!rowMap.has(rowKey)) {
          rowMap.set(rowKey, {
            key: rowKey,
            label: exerciseName,
            cellsByColumnId: new Map<string, MatrixCell>(),
            sortOrder: sortSeed,
          });
          sortSeed += 1;
        }

        rowMap.get(rowKey)?.cellsByColumnId.set(column.id, {
          rowKey,
          rowLabel: exerciseName,
          unitId: unit.id,
          unitSequenceNo: unit.sequence_no,
          exerciseName,
          column,
          visual,
        });
      }
    }

    const rows: MatrixRow[] = Array.from(rowMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({
        ...row,
        trend: resolveTrend(columns, row),
      }));

    return {
      columns,
      rows,
    };
  }, [sessions]);

  const totalChanged = useMemo(() => {
    let count = 0;
    for (const row of matrix.rows) {
      for (const cell of row.cellsByColumnId.values()) {
        if (cell.visual.status !== "no_change" && cell.visual.status !== "threshold_progress") {
          count += 1;
        }
      }
    }
    return count;
  }, [matrix.rows]);

  const detailSnapshot = selectedCell?.visual.snapshot ?? null;
  const detailBefore = toRecord(detailSnapshot?.before);
  const detailAfter = toRecord(detailSnapshot?.after);
  const detailFields = detailSnapshot?.changed_fields ?? [];

  return (
    <section className="space-y-4">
      <SectionBlock title="范围与视图" description="行=动作，列=训练序号。每格同时显示计划、实际与偏差。">
        <div className="flex flex-wrap items-center gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setWindowSize(option.value)}
              className={`rounded border px-3 py-1.5 text-sm ${
                windowSize === option.value
                  ? "border-blue-300 bg-blue-100 text-blue-700"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {option.label}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={includeRecent}
              onChange={(event) => setIncludeRecent(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            显示最近已执行（3列）
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setViewMode("plan")}
            className={`rounded border px-3 py-1 text-xs ${
              viewMode === "plan"
                ? "border-blue-300 bg-blue-100 text-blue-700"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            计划视角
          </button>
          <button
            type="button"
            onClick={() => setViewMode("execution")}
            className={`rounded border px-3 py-1 text-xs ${
              viewMode === "execution"
                ? "border-blue-300 bg-blue-100 text-blue-700"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            执行视角
          </button>
        </div>

        <p className="text-xs text-zinc-500">
          共 {matrix.columns.length} 次训练 · {matrix.rows.length} 个动作 · {totalChanged} 个动作单元发生推进或调整
        </p>
      </SectionBlock>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded bg-zinc-100" />
              ))}
            </div>
          ) : null}

          {!loading && matrix.columns.length === 0 ? (
            <InlineAlert className="m-4">当前范围内暂无可展示训练。</InlineAlert>
          ) : null}

          {!loading && matrix.columns.length > 0 ? (
            <table className="min-w-[1080px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="sticky left-0 z-20 w-56 border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                    动作
                  </th>
                  {matrix.columns.map((column) => (
                    <th key={column.id} className="w-52 border-r border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700">
                      <p>训练 #{column.sequenceIndex}</p>
                      <p className="mt-0.5 text-[11px] font-normal text-zinc-500">{formatDateLabel(column.sessionDate)}</p>
                      <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${getTrainingStatusBadgeClass(column.status)}`}>
                        {getSessionStatusLabel(column.status)}
                      </span>
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 w-16 bg-zinc-50 px-2 py-2 text-xs font-semibold text-zinc-700">
                    趋势
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.key} className="border-b border-zinc-100 align-top">
                    <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900">
                      {row.label}
                    </td>
                    {matrix.columns.map((column) => {
                      const cell = row.cellsByColumnId.get(column.id);
                      if (!cell) {
                        return (
                          <td key={`${row.key}-${column.id}`} className="border-r border-zinc-200 px-2 py-2">
                            <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-400">
                              沿用模板
                            </div>
                          </td>
                        );
                      }

                      const firstAux = cell.visual.auxFlags[0];
                      return (
                        <td key={`${row.key}-${column.id}`} className="border-r border-zinc-200 px-2 py-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCell(cell)}
                            className={`w-full rounded border px-2 py-1.5 text-left transition-colors hover:brightness-95 ${cell.visual.cellClassName}`}
                          >
                            <p className="truncate text-[11px] font-semibold">
                              {cell.visual.icon} {cell.visual.statusLabel}
                              {firstAux ? ` · ${getProgressionMatrixAuxFlagLabel(firstAux)}` : ""}
                            </p>
                            <p className={`mt-0.5 truncate ${viewMode === "plan" ? "text-sm font-semibold" : "text-[12px] text-zinc-700"}`}>
                              {cell.visual.planLine}
                            </p>
                            <p className={`mt-0.5 truncate ${viewMode === "execution" ? "text-sm font-semibold" : "text-[11px]"}`}>
                              {cell.visual.actualLine}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-700">{cell.visual.deviationLine}</p>
                          </button>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 border-l border-zinc-200 bg-white px-2 py-2 text-center text-sm">
                      {getTrendLabel(row.trend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-4 xl:sticky xl:top-24">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">详情 Side Panel</h3>
            {selectedCell ? (
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="text-xs text-zinc-600 underline"
              >
                清除选择
              </button>
            ) : null}
          </div>

          {!selectedCell ? (
            <p className="mt-3 text-xs text-zinc-500">点击任意动作单元格，查看计划 / 实际 / 结果。</p>
          ) : null}

          {selectedCell ? (
            <div className="mt-3 space-y-4 text-xs text-zinc-700">
              <div>
                <p className="font-medium text-zinc-900">{selectedCell.exerciseName}</p>
                <p className="mt-0.5 text-zinc-500">
                  训练 #{selectedCell.column.sequenceIndex} · {formatDateLabel(selectedCell.column.sessionDate)}
                </p>
              </div>

              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">计划</p>
                <div className={`rounded border px-2 py-1.5 ${selectedCell.visual.cellClassName}`}>
                  <p className="font-semibold">
                    {selectedCell.visual.icon} {selectedCell.visual.statusLabel}
                  </p>
                  <p className="mt-0.5">{selectedCell.visual.planLine}</p>
                  <p className="mt-0.5">原因：{selectedCell.visual.reasonShort}</p>
                </div>

                <div>
                  <p className="font-medium text-zinc-900">before → after</p>
                  {detailSnapshot ? (
                    <ul className="mt-1 space-y-1">
                      {[
                        "current_load",
                        "current_reps",
                        "current_sets",
                        "current_duration_seconds",
                        "current_phase",
                        "cycle_index",
                      ].map((field) => (
                        <li key={field}>
                          <span className="text-zinc-500">{FIELD_LABELS[field] ?? field}</span>
                          <span className="px-1 text-zinc-400">:</span>
                          <span>
                            {String(detailBefore[field] ?? "-")} → {String(detailAfter[field] ?? "-")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-zinc-500">无快照</p>
                  )}
                </div>

                <div>
                  <p className="font-medium text-zinc-900">changed_fields</p>
                  {detailFields.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {detailFields.map((field) => (
                        <span key={field} className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-[11px]">
                          {FIELD_LABELS[field] ?? field}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-zinc-500">无字段变化</p>
                  )}
                </div>
                <p>
                  <span className="text-zinc-500">change_reason / change_type:</span>
                  <span className="pl-1">{detailSnapshot?.change_reason ?? "-"} / {detailSnapshot?.change_type ?? "-"}</span>
                </p>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">实际执行</p>
                {selectedCell.visual.actualDetails ? (
                  <div className="space-y-1 rounded border border-zinc-200 bg-zinc-50 p-2">
                    <p>
                      {selectedCell.visual.actualSymbol} {selectedCell.visual.actualLabel}
                    </p>
                    <p>
                      计划/完成/跳过/未完成/extra：
                      {selectedCell.visual.actualDetails.plannedSetCount}/
                      {selectedCell.visual.actualDetails.completedPlannedCount}/
                      {selectedCell.visual.actualDetails.skippedPlannedCount}/
                      {selectedCell.visual.actualDetails.pendingPlannedCount}/
                      {selectedCell.visual.actualDetails.extraSetCount}
                    </p>
                    <p>
                      reps汇总：{formatNumber(selectedCell.visual.actualDetails.completedRepsTotal)} · duration汇总：
                      {formatNumber(selectedCell.visual.actualDetails.completedDurationTotal)}
                    </p>
                    <p>
                      核心组（reps）：
                      {selectedCell.visual.actualDetails.coreSet
                        ? `${formatNumber(selectedCell.visual.actualDetails.coreSet.plannedReps)} → ${formatNumber(selectedCell.visual.actualDetails.coreSet.actualReps)}`
                        : "-"}
                    </p>
                    <p>
                      核心组（weight）：
                      {selectedCell.visual.actualDetails.coreSet
                        ? `${formatNumber(selectedCell.visual.actualDetails.coreSet.plannedWeight)} → ${formatNumber(selectedCell.visual.actualDetails.coreSet.actualWeight)}`
                        : "-"}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(selectedCell.visual.deviationItems.length > 0 ? selectedCell.visual.deviationItems : ["无偏差"]).map((item) => (
                        <span key={item} className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-500">暂无执行数据</p>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">结果</p>
                {selectedCell.visual.resultDetails ? (
                  <div className="space-y-1 rounded border border-zinc-200 bg-zinc-50 p-2">
                    <p>outcome：{selectedCell.visual.resultDetails.outcome ?? "未执行"}</p>
                    <p>是否达标：{selectedCell.visual.resultDetails.isMeetsTarget === null ? "-" : selectedCell.visual.resultDetails.isMeetsTarget ? "是" : "否"}</p>
                    <p>hold/retry：{selectedCell.visual.resultDetails.retryFlag ? "retry" : selectedCell.visual.resultDetails.holdReason ?? "-"}</p>
                    <p>对下次推进影响：{selectedCell.visual.resultDetails.impactHint}</p>
                  </div>
                ) : (
                  <p className="text-zinc-500">暂无结果数据</p>
                )}
              </section>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
