"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ExerciseNameLink } from "@/features/exercise-library/exercise-link";
import { getProgramDetail, ProgramDetail } from "@/features/programs/programs-api";
import { InlineAlert } from "@/features/shared/components/ui-primitives";
import {
  generatePlannedSessions,
  listPlannedSessions,
  PlannedSessionItem,
} from "@/features/sessions/sessions-api";
import { getTrainingStatusBadgeClass } from "@/features/shared/training-semantic-ui";
import { getSessionStatusLabel, TERMS_ZH } from "@/features/shared/ui-zh";

type PlannedSessionListClientProps = {
  userId: string;
  programId: string;
};

type SessionGroupKey = "overdue" | "upcoming" | "partial" | "completed" | "skipped" | "other";

type UnitSummary = {
  total: number;
  completed: number;
  partial: number;
  skipped: number;
};

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSessionDateKey(sessionDate: string) {
  return sessionDate.slice(0, 10);
}

function getSessionGroupKey(session: PlannedSessionItem, todayKey: string): SessionGroupKey {
  const sessionDateKey = getSessionDateKey(session.session_date);
  const isOverduePending =
    sessionDateKey < todayKey &&
    session._count.session_executions === 0 &&
    (session.status === "planned" || session.status === "ready" || session.status === "partial");

  if (isOverduePending) {
    return "overdue";
  }
  if ((session.status === "planned" || session.status === "ready") && sessionDateKey >= todayKey) {
    return "upcoming";
  }
  if (session.status === "partial") {
    return "partial";
  }
  if (session.status === "completed") {
    return "completed";
  }
  if (session.status === "skipped") {
    return "skipped";
  }
  return "other";
}

function getSessionGroupLabel(group: SessionGroupKey) {
  if (group === "overdue") return "逾期待处理";
  if (group === "upcoming") return "近期待执行";
  if (group === "partial") return "部分完成";
  if (group === "completed") return "已完成";
  if (group === "skipped") return "已跳过";
  return "其他状态";
}

function getUnitStatusSummary(units: PlannedSessionItem["planned_units"]): UnitSummary {
  return units.reduce(
    (acc, unit) => {
      acc.total += 1;
      if (unit.status === "completed") acc.completed += 1;
      else if (unit.status === "partial") acc.partial += 1;
      else if (unit.status === "skipped") acc.skipped += 1;
      return acc;
    },
    { total: 0, completed: 0, partial: 0, skipped: 0 },
  );
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

function sortSessionsForArrangement(a: PlannedSessionItem, b: PlannedSessionItem) {
  if (a.session_date < b.session_date) return -1;
  if (a.session_date > b.session_date) return 1;
  return a.sequence_index - b.sequence_index;
}

function getExerciseLibraryItemIdFromPayload(payload: Record<string, unknown>) {
  const itemId = payload.exercise_library_item_id;
  return typeof itemId === "string" ? itemId : null;
}

function buildExecuteHref(programId: string, plannedSessionId: string, resumeLatest?: boolean) {
  const query = new URLSearchParams();
  if (resumeLatest) query.set("resume", "latest");
  const base = `/programs/${programId}/planned-sessions/${plannedSessionId}/execute`;
  return query.size > 0 ? `${base}?${query.toString()}` : base;
}

export function PlannedSessionListClient({ userId, programId }: PlannedSessionListClientProps) {
  const [sessions, setSessions] = useState<PlannedSessionItem[]>([]);
  const [programDetail, setProgramDetail] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(todayDateInputValue);
  const [sessionCount, setSessionCount] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const orderedSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => session._count.session_executions === 0)
        .sort(sortSessionsForArrangement),
    [sessions],
  );

  const groupedSessions = useMemo(() => {
    const todayKey = toDateKey(new Date());
    const groups: Record<SessionGroupKey, PlannedSessionItem[]> = {
      overdue: [],
      upcoming: [],
      partial: [],
      completed: [],
      skipped: [],
      other: [],
    };
    orderedSessions.forEach((session) => {
      groups[getSessionGroupKey(session, todayKey)].push(session);
    });
    return groups;
  }, [orderedSessions]);

  const planningReadiness = useMemo(() => {
    if (!programDetail) {
      return {
        blockCount: 0,
        sessionTemplateCount: 0,
        enabledTemplateCount: 0,
        enabledTemplateWithUnitsCount: 0,
        ready: false,
      };
    }

    const sessionTemplates = programDetail.blocks.flatMap((block) => block.session_templates);
    const enabledTemplates = sessionTemplates.filter((template) => template.enabled);
    const enabledTemplatesWithUnits = enabledTemplates.filter((template) =>
      template.training_unit_templates.some((unit) => unit.is_key_unit),
    );

    return {
      blockCount: programDetail.blocks.length,
      sessionTemplateCount: sessionTemplates.length,
      enabledTemplateCount: enabledTemplates.length,
      enabledTemplateWithUnitsCount: enabledTemplatesWithUnits.length,
      ready: enabledTemplatesWithUnits.length > 0,
    };
  }, [programDetail]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextSessions, detail] = await Promise.all([
        listPlannedSessions(userId, programId),
        getProgramDetail(userId, programId),
      ]);
      setSessions(nextSessions);
      setProgramDetail(detail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载已安排训练失败");
    } finally {
      setLoading(false);
    }
  }, [programId, userId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!planningReadiness.ready) {
      setGenerateMessage("当前训练计划尚未就绪：请先启用训练日模板并至少配置一个关键训练单元。");
      return;
    }

    setGenerating(true);
    setGenerateMessage(null);

    try {
      const generated = await generatePlannedSessions(programId, {
        userId,
        startDate,
        sessionCount,
        replaceFutureUnexecuted: true,
        generationReason: "initial_generation",
      });
      setGenerateMessage(`已生成 ${generated.length} 条已安排训练。`);
      await loadSessions();
    } catch (generateError) {
      setGenerateMessage(generateError instanceof Error ? generateError.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const hasAnySession = orderedSessions.length > 0;

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.plannedSession}</h1>
      <p className="text-sm text-zinc-600">
        当前计划：{programDetail?.name ?? "-"}。建议路径：先确认本期计划，再开始实时训练。
      </p>
      <p className="text-xs text-zinc-600">计划层调整仅影响当前这一期安排，不影响模板层定义。</p>
      <p className="text-xs text-zinc-600">
        在进步矩阵中查看本次变化：
        <Link href="/progression-matrix" className="px-1 text-blue-700 underline">
          查看进步矩阵 →
        </Link>
      </p>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">当前训练计划生成就绪状态</p>
        <p className="mt-1">
          训练阶段：{planningReadiness.blockCount} | 启用训练日模板：{planningReadiness.enabledTemplateCount}/
          {planningReadiness.sessionTemplateCount} | 含训练单元模板：{planningReadiness.enabledTemplateWithUnitsCount}
        </p>
      </div>

      <form onSubmit={handleGenerate} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">生成入口</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-700">
            开始日期
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            />
          </label>
          <label className="text-sm text-zinc-700">
            生成数量
            <input
              type="number"
              min={1}
              max={30}
              value={sessionCount}
              onChange={(event) => setSessionCount(Number(event.target.value))}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={generating || !planningReadiness.ready}
          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {generating ? "生成中..." : "生成已安排训练"}
        </button>
        {generateMessage ? <p className="text-sm text-zinc-700">{generateMessage}</p> : null}
      </form>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <li key={index} className="animate-pulse rounded-md border border-zinc-200 bg-white p-4">
              <div className="h-4 w-56 rounded bg-zinc-200" />
              <div className="mt-2 h-3 w-64 rounded bg-zinc-100" />
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && hasAnySession ? (
        <div className="space-y-4">
          {(["overdue", "upcoming", "partial", "completed", "skipped", "other"] as SessionGroupKey[]).map((groupKey) => {
            const group = groupedSessions[groupKey];
            if (group.length === 0) return null;

            return (
              <section key={groupKey} className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  {getSessionGroupLabel(groupKey)} ({group.length})
                </h2>

                <ul className="space-y-3">
                  {group.map((session) => {
                    const unitSummary = getUnitStatusSummary(session.planned_units);
                    const hasSessionExecution = session._count.session_executions > 0;
                    const executeHref = buildExecuteHref(programId, session.id, hasSessionExecution);

                    return (
                      <li key={session.id} className="rounded-md border border-zinc-200 bg-white p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-zinc-900">训练 #{session.sequence_index}</p>
                          <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                            {formatSessionDateLabel(session.session_date)}
                          </span>
                          <span className={`rounded px-2 py-1 text-xs font-medium ${getTrainingStatusBadgeClass(session.status)}`}>
                            {getSessionStatusLabel(session.status)}
                          </span>
                          {groupKey === "overdue" ? (
                            <span className="rounded bg-orange-100 px-2 py-1 text-xs text-orange-700">逾期待处理</span>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm text-zinc-600">
                          训练单元：{unitSummary.total} | 已完成：{unitSummary.completed} | 部分完成：{unitSummary.partial} |
                          已跳过：{unitSummary.skipped}
                        </p>
                        <p className="mt-2 text-xs text-zinc-600">本次动作清单：</p>
                        {session.planned_units.length > 0 ? (
                          <ul className="mt-1 space-y-2">
                            {session.planned_units
                              .slice()
                              .sort((a, b) => a.sequence_no - b.sequence_no)
                              .map((unit) => (
                                <li key={unit.id} className="rounded border border-zinc-200 bg-zinc-50 p-2">
                                  <p className="text-xs text-zinc-800">
                                    <ExerciseNameLink
                                      name={unit.selected_exercise_name ?? `训练单元 #${unit.sequence_no}`}
                                      exerciseLibraryItemId={
                                        unit.exercise_library_item_id ?? getExerciseLibraryItemIdFromPayload(unit.target_payload)
                                      }
                                      className="text-blue-700 underline"
                                      unknownHintClassName="ml-1 text-[11px] text-zinc-500"
                                    />
                                  </p>
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-zinc-500">暂无动作</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {hasSessionExecution ? (
                            <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">已有训练执行记录（动作锁定）</span>
                          ) : (
                            <span className="rounded bg-zinc-100 px-2 py-1 text-zinc-600">暂无训练执行记录，可先调整动作</span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/programs/${programId}/planned-sessions/${session.id}/plan`}
                            className="text-sm text-blue-700 underline"
                          >
                            查看并确认计划（可微调）
                          </Link>
                          <Link href={executeHref} className="text-sm text-blue-700 underline">
                            {hasSessionExecution ? "继续训练" : "开始训练"}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {!loading && !error && !hasAnySession ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          当前训练计划还没有已安排训练，可先使用上方入口生成。
        </p>
      ) : null}
    </section>
  );
}
