"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ActionProgressVisualChip } from "@/features/progression/components/action-progress-visual-chip";
import { buildActionProgressVisualState } from "@/features/progression/progression-visual-state";
import {
  listProgressionHighlightSessions,
  ProgressionHighlightRange,
  ProgressionHighlightSession,
} from "@/features/progression-highlights/progression-highlights-api";
import { AppCard, InlineAlert, SectionBlock } from "@/features/shared/components/ui-primitives";
import { getTrainingStatusBadgeClass } from "@/features/shared/training-semantic-ui";
import { getSessionStatusLabel } from "@/features/shared/ui-zh";

type ProgressionHighlightsBoardClientProps = {
  userId: string;
};

type RangeOption = {
  key: ProgressionHighlightRange;
  label: string;
  hint: string;
};

const RANGE_OPTIONS: RangeOption[] = [
  { key: "week", label: "本周", hint: "未来 7 天未完成训练" },
  { key: "next_10", label: "未来 10 次", hint: "按队列查看最近 10 次" },
  { key: "next_14_days", label: "未来 14 天", hint: "更长窗口观察变化趋势" },
];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(dateText: string) {
  const date = new Date(dateText);
  const datePart = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${datePart} (${weekday})`;
}

function buildRangeQuery(range: ProgressionHighlightRange) {
  const today = new Date();
  if (range === "next_10") {
    return {
      dateFrom: formatDateInput(today),
      dateTo: formatDateInput(addDays(today, 90)),
      limit: 10,
    };
  }

  if (range === "next_14_days") {
    return {
      dateFrom: formatDateInput(today),
      dateTo: formatDateInput(addDays(today, 13)),
      limit: 40,
    };
  }

  return {
    dateFrom: formatDateInput(today),
    dateTo: formatDateInput(addDays(today, 6)),
    limit: 20,
  };
}

export function ProgressionHighlightsBoardClient({ userId }: ProgressionHighlightsBoardClientProps) {
  const [range, setRange] = useState<ProgressionHighlightRange>("week");
  const [changedOnly, setChangedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ProgressionHighlightSession[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rangeQuery = buildRangeQuery(range);
      const response = await listProgressionHighlightSessions(userId, rangeQuery);
      setSessions(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载动作变化失败");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [range, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    let totalUnits = 0;
    let changedUnits = 0;
    let realizationUnits = 0;
    let adjustmentUnits = 0;

    for (const session of sessions) {
      for (const unit of session.planned_units) {
        const visual = buildActionProgressVisualState(unit.progression_snapshot, {
          maxFieldChanges: 3,
        });
        totalUnits += 1;
        if (visual.status !== "no_change" || visual.changed) {
          changedUnits += 1;
        }
        if (visual.status === "realization_round") {
          realizationUnits += 1;
        }
        if (visual.status === "exception_adjustment") {
          adjustmentUnits += 1;
        }
      }
    }

    return {
      sessionCount: sessions.length,
      totalUnits,
      changedUnits,
      realizationUnits,
      adjustmentUnits,
    };
  }, [sessions]);

  return (
    <section className="space-y-4">
      <SectionBlock
        title="变化范围"
        description="训练日用于分组，变化解释只落在动作项。"
      >
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option.key)}
              className={`rounded border px-3 py-1.5 text-sm ${
                range === option.key
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
              checked={changedOnly}
              onChange={(event) => setChangedOnly(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            仅看变化动作
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          当前范围：{RANGE_OPTIONS.find((item) => item.key === range)?.hint ?? "-"}
        </p>
      </SectionBlock>

      <div className="grid gap-3 md:grid-cols-4">
        <AppCard emphasis="soft" className="space-y-1">
          <p className="text-xs text-zinc-500">训练日</p>
          <p className="text-lg font-semibold text-zinc-900">{summary.sessionCount}</p>
        </AppCard>
        <AppCard emphasis="soft" className="space-y-1">
          <p className="text-xs text-zinc-500">动作总数</p>
          <p className="text-lg font-semibold text-zinc-900">{summary.totalUnits}</p>
        </AppCard>
        <AppCard emphasis="soft" className="space-y-1">
          <p className="text-xs text-zinc-500">发生变化</p>
          <p className="text-lg font-semibold text-blue-700">{summary.changedUnits}</p>
        </AppCard>
        <AppCard emphasis="soft" className="space-y-1">
          <p className="text-xs text-zinc-500">实现轮 / 异常调整</p>
          <p className="text-lg font-semibold text-zinc-900">
            <span className="text-emerald-700">{summary.realizationUnits}</span>
            <span className="px-1 text-zinc-400">/</span>
            <span className="text-orange-700">{summary.adjustmentUnits}</span>
          </p>
        </AppCard>
      </div>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4">
              <div className="h-4 w-64 rounded bg-zinc-200" />
              <div className="mt-2 h-3 w-48 rounded bg-zinc-100" />
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && sessions.length === 0 ? (
        <InlineAlert>
          当前范围内暂无未来未完成训练。可先去
          <Link href="/programs" className="px-1 text-blue-700 underline">
            训练计划
          </Link>
          生成安排。
        </InlineAlert>
      ) : null}

      {!loading && !error && sessions.length > 0 ? (
        <ul className="space-y-4">
          {sessions.map((session) => {
            const orderedUnits = [...session.planned_units].sort((a, b) => a.sequence_no - b.sequence_no);
            const unitRows = orderedUnits
              .map((unit) => {
                const visual = buildActionProgressVisualState(unit.progression_snapshot, {
                  maxFieldChanges: 3,
                });
                return {
                  ...unit,
                  visual,
                };
              })
              .filter((unit) => (changedOnly ? unit.visual.status !== "no_change" || unit.visual.changed : true));

            if (unitRows.length === 0) {
              return null;
            }

            return (
              <li key={session.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-zinc-900">
                    {formatDateLabel(session.session_date)} | 训练 #{session.sequence_index}
                  </p>
                  <span className={`rounded px-2 py-1 text-xs ${getTrainingStatusBadgeClass(session.status)}`}>
                    {getSessionStatusLabel(session.status)}
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                    {session.program?.name ?? "未关联训练计划"}
                  </span>
                </div>

                <ul className="mt-3 space-y-2">
                  {unitRows.map((unit) => (
                    <li key={unit.id} className="rounded border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-sm font-medium text-zinc-900">
                        {unit.selected_exercise_name ?? `训练单元 #${unit.sequence_no}`}
                      </p>
                      <div className="mt-2">
                        <ActionProgressVisualChip
                          snapshot={unit.progression_snapshot}
                          maxFieldChanges={3}
                          showStatusEnglish
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
