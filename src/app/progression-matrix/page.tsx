import Link from "next/link";

import { ProgressionMatrixBoardClient } from "@/features/progression-matrix/components/progression-matrix-board-client";
import { PageContainer, PageHeader } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function ProgressionMatrixPage() {
  return (
    <PageContainer className="space-y-6 py-8">
      <PageHeader
        title="进步矩阵 / Progression Matrix"
        description="训练进步唯一主可视化界面：集中查看未来动作变化、原因与轨迹。"
        actions={
          <>
            <Link href="/programs" className="text-sm text-blue-700 underline">
              去训练计划
            </Link>
            <Link href="/today" className="text-sm text-blue-700 underline">
              去今日训练
            </Link>
          </>
        }
      />

      <ProgressionMatrixBoardClient userId={DEMO_USER_ID} />
    </PageContainer>
  );
}
