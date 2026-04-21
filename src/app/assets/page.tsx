import Link from "next/link";

import { AppCard, PageContainer, PageHeader } from "@/features/shared/components/ui-primitives";

export default function AssetsPage() {
  return (
    <PageContainer className="space-y-6 py-8">
      <PageHeader
        title="资产"
        description="本页作为营养与训练物品清单的承载入口；当前先提供最小骨架。"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AppCard>
          <p className="text-sm font-semibold text-zinc-900">营养（预留）</p>
          <p className="mt-1 text-sm text-zinc-600">
            后续将在这里承接热量、BMR/TDEE 与减脂计算层能力。
          </p>
          <p className="mt-2 text-xs text-zinc-500">当前阶段保留入口，不进入复杂计算。</p>
        </AppCard>

        <AppCard>
          <p className="text-sm font-semibold text-zinc-900">物品清单（预留）</p>
          <p className="mt-1 text-sm text-zinc-600">
            后续将在这里承接健身房携带物品清单（Gym Carry Checklist）。
          </p>
          <p className="mt-2 text-xs text-zinc-500">当前阶段保留入口，不扩展 schema。</p>
        </AppCard>
      </div>

      <div className="text-sm">
        <Link href="/" className="text-blue-700 underline">
          返回首页每日指挥台 →
        </Link>
      </div>
    </PageContainer>
  );
}
