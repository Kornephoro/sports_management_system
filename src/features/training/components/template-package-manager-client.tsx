"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { listTemplatePackages, TemplatePackageListItem } from "@/features/training/training-api";
import { AppCard, EmptyState, InlineAlert, SkeletonRows } from "@/features/shared/components/ui-primitives";
import { getTemplatePackageSplitTypeLabel } from "@/lib/template-package-standards";

type TemplatePackageManagerClientProps = {
  userId: string;
};

export function TemplatePackageManagerClient({ userId }: TemplatePackageManagerClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<TemplatePackageListItem[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const packageItems = await listTemplatePackages(userId, { enabled: "all" });
      setPackages(packageItems);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载计划包失败");
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
       <div className="mx-auto max-w-[480px] p-4 space-y-4">
          <SkeletonRows rows={10} />
       </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] space-y-4 p-4 pb-20">
      <AppCard className="px-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-black text-zinc-900 dark:text-zinc-50">计划包库</h1>
          <Link href="/training?view=planning" className="text-[10px] font-bold text-blue-600 dark:text-blue-400">返回编排台</Link>
        </div>
        <p className="mt-1 text-[10px] font-medium text-zinc-400">
          管理所有的训练循环计划。点击卡片可深入编辑动作序列与进阶规则。
        </p>
      </AppCard>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      <div className="grid gap-2">
        <Link 
          href="/training/template-packages/new"
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 py-3 transition-all hover:border-blue-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/30"
        >
          <span className="text-sm font-black text-zinc-400 leading-none">+</span>
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">创建全新计划包</span>
        </Link>

        {packages.length === 0 && !error ? (
          <EmptyState title="目前没有计划包" hint="点击上方按钮开始创建您的第一个。" />
        ) : (
          packages.map((item) => (
            <Link 
              key={item.id}
              href={`/training/template-packages/${item.id}`}
              className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-white p-4 transition-all active:scale-[0.98] hover:border-blue-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">{item.name}</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {getTemplatePackageSplitTypeLabel(item.splitType)}
                  </span>
                  <span className="text-[9px] font-bold text-zinc-300">•</span>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                    {item.dayCount} 个训练天
                  </span>
                </div>
              </div>
              <div className="text-zinc-300">→</div>
            </Link>
          ))
        )}
      </div>

      <AppCard className="bg-zinc-900 dark:bg-zinc-900 p-4">
        <div className="flex items-start gap-3">
          <div className="text-base">🧬</div>
          <div className="space-y-1">
            <p className="text-[11px] font-black text-white">关于进阶策略</p>
            <p className="text-[9px] font-medium text-zinc-500 leading-relaxed italic">
              所有“进步逻辑”均在计划包详情页设置。向导生成时将不再提供二次修改选项。
            </p>
          </div>
        </div>
      </AppCard>
    </div>
  );
}
