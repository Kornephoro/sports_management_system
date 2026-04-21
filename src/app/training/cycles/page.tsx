import Link from "next/link";

import { AppCard, EmptyState, PageContainer } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";
import { listTrainingMesocyclesUseCase } from "@/server/use-cases";

export const dynamic = "force-dynamic";

function toDateLabel(value: string | null) {
  if (!value) return "进行中";
  return value.slice(0, 10).replaceAll("-", "/");
}

function getEndReasonLabel(value: string | null) {
  if (value === "fatigue_management") return "恢复管理";
  if (value === "goal_switch") return "切换重点";
  if (value === "injury_or_constraint") return "伤病 / 限制";
  if (value === "schedule_change") return "日程变化";
  if (value === "other") return "其他原因";
  if (value === "manual_complete") return "阶段完成";
  return "手动结束";
}

export default async function TrainingCyclesPage() {
  const data = await listTrainingMesocyclesUseCase({
    userId: DEMO_USER_ID,
  });

  return (
    <PageContainer className="py-8">
      <section className="space-y-4 pb-24">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
              周期档案
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              按中周期回看训练阶段、减载记录和归档摘要。
            </p>
          </div>
          <Link
            href="/training?view=calendar"
            className="rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
          >
            返回训练
          </Link>
        </div>

        {data.active ? (
          <AppCard className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">当前进行中</p>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                {data.active.hasActiveDeload ? "减载中" : "推进中"}
              </span>
            </div>
            <p className="text-xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
              {data.active.name}
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                开始于 {toDateLabel(data.active.startedAt)}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                已进行 {data.active.durationWeeks} 周
              </span>
              {data.active.primaryPackageName ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                  {data.active.primaryPackageName}
                </span>
              ) : null}
              {data.active.deloadCount > 0 ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">
                  减载 {data.active.deloadCount} 次
                </span>
              ) : null}
            </div>
            {data.active.notes ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{data.active.notes}</p>
            ) : null}
          </AppCard>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <AppCard className="space-y-1 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">归档周期</p>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {data.summary.archivedCount}
            </p>
          </AppCard>
          <AppCard className="space-y-1 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">累计减载</p>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {data.summary.totalDeloadCount}
            </p>
          </AppCard>
          <AppCard className="space-y-1 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">平均周期长度</p>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {data.summary.averageArchivedWeeks || "-"}
              <span className="ml-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">周</span>
            </p>
          </AppCard>
          <AppCard className="space-y-1 p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">累计记录周数</p>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {data.summary.totalTrackedWeeks}
              <span className="ml-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">周</span>
            </p>
          </AppCard>
        </div>

        <AppCard className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">归档周期</p>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
              {data.archived.length} 个
            </span>
          </div>

          {data.archived.length === 0 ? (
            <EmptyState
              title="还没有归档周期"
              hint="结束一个中周期后，它会出现在这里。"
            />
          ) : (
            <div className="space-y-3">
              {data.archived.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-base font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                        {item.name}
                      </p>
                      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {toDateLabel(item.startedAt)} - {toDateLabel(item.endedAt)}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {getEndReasonLabel(item.endReason)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
                      持续 {item.durationWeeks} 周
                    </span>
                    {item.primaryPackageName ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
                        {item.primaryPackageName}
                      </span>
                    ) : null}
                    {item.deloadCount > 0 ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
                        减载 {item.deloadCount} 次
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-50/80 p-3 dark:bg-zinc-800/60">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        起始
                      </p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {toDateLabel(item.startedAt)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        结束
                      </p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {toDateLabel(item.endedAt)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        结果
                      </p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {item.deloadCount > 0 ? `减载 ${item.deloadCount}` : "无减载"}
                      </p>
                    </div>
                  </div>
                  {item.notes ? (
                    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{item.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </AppCard>
      </section>
    </PageContainer>
  );
}
