"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExerciseNameLink } from "@/features/exercise-library/exercise-link";
import { InlineAlert } from "@/features/shared/components/ui-primitives";
import {
  deleteSessionExecution,
  ExecutionHistoryItem,
  listRecentSessionExecutions,
} from "@/features/executions/executions-api";
import {
  getSessionExecutionStatusLabel,
  getUnitExecutionStatusLabel,
  TERMS_ZH,
} from "@/features/shared/ui-zh";
import { getTrainingStatusBadgeClass } from "@/features/shared/training-semantic-ui";

type ExecutionHistoryClientProps = {
  userId: string;
};

type ExecutionFilterKey = "all" | "completed" | "partial_skipped";
type ProgramFilterKey = "all" | string;

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toFixedRatio(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }
  return `${Math.round(parsed * 100)}%`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function getUnitDisplayName(unit: ExecutionHistoryItem["unit_executions"][number]) {
  if (unit.actual_unit_name?.trim()) {
    return unit.actual_unit_name;
  }
  if (unit.planned_unit?.selected_exercise_name?.trim()) {
    return unit.planned_unit.selected_exercise_name;
  }
  return `训练单元 #${unit.sequence_no}`;
}

function getUnitExerciseLibraryItemId(unit: ExecutionHistoryItem["unit_executions"][number]) {
  const payload = toRecord(unit.planned_unit?.target_payload);
  const itemId = payload.exercise_library_item_id;
  return typeof itemId === "string" ? itemId : null;
}

function matchesExecutionFilter(execution: ExecutionHistoryItem, filterKey: ExecutionFilterKey) {
  if (filterKey === "all") {
    return true;
  }

  if (filterKey === "completed") {
    return execution.completion_status === "completed";
  }

  return execution.completion_status === "partial" || execution.completion_status === "skipped";
}

function getSetBasedSnapshot(unit: ExecutionHistoryItem["unit_executions"][number]) {
  const flags = toRecord(unit.result_flags);
  const setBased = toRecord(flags.set_based_v1);
  if (Object.keys(setBased).length === 0) {
    return null;
  }

  return {
    outcome: typeof setBased.outcome === "string" ? setBased.outcome : null,
    plannedSetCount: toNumber(setBased.planned_set_count),
    completedPlannedCount: toNumber(setBased.completed_planned_count),
    skippedPlannedCount: toNumber(setBased.skipped_planned_count),
    pendingPlannedCount: toNumber(setBased.pending_planned_count),
    completionRatio: toFixedRatio(setBased.completion_ratio),
    meetsTarget: typeof setBased.meets_target === "boolean" ? setBased.meets_target : null,
    coreSetFailed: typeof setBased.core_set_failed === "boolean" ? setBased.core_set_failed : null,
    extraSetCount: toNumber(setBased.extra_set_count),
  };
}

function getOverallFeelingLabel(execution: ExecutionHistoryItem) {
  const state = toRecord(execution.post_session_state);
  const feeling = state.overall_feeling;
  if (feeling === "easy") {
    return "轻松";
  }
  if (feeling === "hard") {
    return "困难";
  }
  if (feeling === "normal") {
    return "正常";
  }
  return null;
}

export function ExecutionHistoryClient({ userId }: ExecutionHistoryClientProps) {
  const [executions, setExecutions] = useState<ExecutionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<ExecutionFilterKey>("all");
  const [programFilter, setProgramFilter] = useState<ProgramFilterKey>("all");
  const [deletingExecutionId, setDeletingExecutionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listRecentSessionExecutions(userId, 20, "full");
      setExecutions(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载训练记录失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadExecutions();
  }, [loadExecutions]);

  const handleDeleteExecution = async (sessionExecutionId: string) => {
    const confirmed = window.confirm("确定删除这条训练执行记录吗？此操作不可恢复。");
    if (!confirmed) {
      return;
    }

    setDeletingExecutionId(sessionExecutionId);
    setActionError(null);
    setActionMessage(null);

    try {
      await deleteSessionExecution(sessionExecutionId, userId);
      await loadExecutions();
      if (expandedId === sessionExecutionId) {
        setExpandedId(null);
      }
      setActionMessage("训练执行记录已删除。");
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "删除训练执行记录失败");
    } finally {
      setDeletingExecutionId(null);
    }
  };

  const programOptions = useMemo(() => {
    const map = new Map<string, string>();
    executions.forEach((execution) => {
      if (execution.program) {
        map.set(execution.program.id, execution.program.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [executions]);

  const filteredExecutions = useMemo(() => {
    return executions.filter((execution) => {
      if (!matchesExecutionFilter(execution, filterKey)) {
        return false;
      }
      if (programFilter !== "all" && execution.program?.id !== programFilter) {
        return false;
      }
      return true;
    });
  }, [executions, filterKey, programFilter]);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">训练执行记录（只读）</h2>
          <p className="text-sm text-zinc-600">
            已下线手动核算编辑，结果由 <code>execution_sets</code> 自动汇总生成。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="text-zinc-600">状态筛选</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded border px-2 py-1 ${
                filterKey === "all"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700"
              }`}
              onClick={() => setFilterKey("all")}
            >
              全部
            </button>
            <button
              type="button"
              className={`rounded border px-2 py-1 ${
                filterKey === "completed"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700"
              }`}
              onClick={() => setFilterKey("completed")}
            >
              已完成
            </button>
            <button
              type="button"
              className={`rounded border px-2 py-1 ${
                filterKey === "partial_skipped"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700"
              }`}
              onClick={() => setFilterKey("partial_skipped")}
            >
              部分/跳过
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="program-filter" className="text-zinc-600">
          训练计划筛选
        </label>
        <select
          id="program-filter"
          value={programFilter}
          onChange={(event) => setProgramFilter(event.target.value)}
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        >
          <option value="all">全部训练计划</option>
          {programOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {actionError ? <InlineAlert tone="error">{actionError}</InlineAlert> : null}
      {actionMessage ? <InlineAlert tone="success">{actionMessage}</InlineAlert> : null}

      {loading ? <p className="text-sm text-zinc-500">正在加载训练记录...</p> : null}
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {filteredExecutions.map((execution) => {
            const expanded = expandedId === execution.id;
            const overallFeelingLabel = getOverallFeelingLabel(execution);
            return (
              <article key={execution.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                      <span className="font-medium text-zinc-900">
                        {execution.program?.name ?? "未命名训练计划"}
                      </span>
                      <span className={getTrainingStatusBadgeClass(execution.completion_status)}>
                        {getSessionExecutionStatusLabel(execution.completion_status)}
                      </span>
                      {execution.planned_session ? (
                        <span className="text-zinc-500">
                          第 {execution.planned_session.sequence_index} 次
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-500">
                      执行时间：{formatDateTime(execution.performed_at)}
                      {execution.actual_duration_min ? ` · 用时 ${execution.actual_duration_min} 分钟` : ""}
                      {overallFeelingLabel ? ` · 体感 ${overallFeelingLabel}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href={`/executions/${execution.id}`}
                      className="rounded border border-blue-300 bg-blue-50 px-2 py-1 font-medium text-blue-700"
                    >
                      打开详情页
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : execution.id)}
                      className="rounded border border-zinc-300 px-2 py-1 text-zinc-700"
                    >
                      {expanded ? "收起详情" : "查看详情"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteExecution(execution.id)}
                      disabled={deletingExecutionId === execution.id}
                      className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-60"
                    >
                      {deletingExecutionId === execution.id ? "删除中..." : "删除"}
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-3 space-y-3 rounded border border-zinc-200 bg-white p-3">
                    <p className="text-xs text-zinc-600">
                      <span className="font-medium text-zinc-700">执行 ID：</span>
                      {execution.id}
                    </p>
                    {execution.notes ? (
                      <p className="text-sm text-zinc-700">
                        <span className="font-medium text-zinc-900">备注：</span>
                        {execution.notes}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                      <Link
                        href="/progression-matrix"
                        className="text-blue-700 underline"
                      >
                        在进步矩阵中查看本次变化 →
                      </Link>
                      {execution.planned_session && execution.program?.id ? (
                        <Link
                          href={`/programs/${execution.program.id}/planned-sessions/${execution.planned_session.id}/execute`}
                          className="text-blue-700 underline"
                        >
                          重新进入{TERMS_ZH.execute}
                        </Link>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-zinc-900">动作级结果（来自 execution_sets）</p>
                      {execution.unit_executions.length === 0 ? (
                        <p className="text-sm text-zinc-500">当前无动作级兼容记录。</p>
                      ) : (
                        <ul className="space-y-2">
                          {execution.unit_executions.map((unit) => {
                            const setBased = getSetBasedSnapshot(unit);
                            return (
                              <li key={unit.id} className="rounded border border-zinc-200 bg-zinc-50 p-2 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium text-zinc-900">
                                    <ExerciseNameLink
                                      name={getUnitDisplayName(unit)}
                                      exerciseLibraryItemId={getUnitExerciseLibraryItemId(unit)}
                                      className="text-blue-700 underline"
                                      unknownHintClassName="ml-1 text-[11px] text-zinc-500"
                                    />
                                  </p>
                                  <span className="rounded border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                                    {getUnitExecutionStatusLabel(unit.completion_status)}
                                  </span>
                                </div>

                                {setBased ? (
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                                    {setBased.outcome ? (
                                      <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">
                                        outcome: {setBased.outcome}
                                      </span>
                                    ) : null}
                                    {setBased.plannedSetCount !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        计划组数: {setBased.plannedSetCount}
                                      </span>
                                    ) : null}
                                    {setBased.completedPlannedCount !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        完成组数: {setBased.completedPlannedCount}
                                      </span>
                                    ) : null}
                                    {setBased.skippedPlannedCount !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        跳过组数: {setBased.skippedPlannedCount}
                                      </span>
                                    ) : null}
                                    {setBased.pendingPlannedCount !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        未完成组数: {setBased.pendingPlannedCount}
                                      </span>
                                    ) : null}
                                    {setBased.completionRatio ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        完成率: {setBased.completionRatio}
                                      </span>
                                    ) : null}
                                    {setBased.meetsTarget !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        达标: {setBased.meetsTarget ? "是" : "否"}
                                      </span>
                                    ) : null}
                                    {setBased.coreSetFailed !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        核心组失败: {setBased.coreSetFailed ? "是" : "否"}
                                      </span>
                                    ) : null}
                                    {setBased.extraSetCount !== null ? (
                                      <span className="rounded border border-zinc-300 bg-white px-2 py-1">
                                        extra 组: {setBased.extraSetCount}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-zinc-500">兼容记录尚未包含 set-based 快照。</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}

          {filteredExecutions.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              <p>当前筛选下没有训练记录。</p>
              {programFilter !== "all" ? (
                <button
                  type="button"
                  onClick={() => setProgramFilter("all")}
                  className="mt-2 text-sm text-blue-700 underline"
                >
                  切回全部训练计划
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && executions.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          还没有训练记录。请先到“已安排训练”执行一次训练。
        </p>
      ) : null}
    </section>
  );
}
