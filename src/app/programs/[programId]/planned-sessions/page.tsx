import Link from "next/link";

import { PlannedSessionListClient } from "@/features/sessions/components/planned-session-list-client";
import { PageContainer, PageHeader } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";

type PlannedSessionsPageProps = {
  params: Promise<{
    programId: string;
  }>;
};

export default async function PlannedSessionsPage({ params }: PlannedSessionsPageProps) {
  const { programId } = await params;

  return (
    <PageContainer className="space-y-6 py-8">
      <PageHeader
        title="已安排训练"
        description="按日期和顺序查看单队列安排，并开始或继续实时训练。"
        actions={
          <>
            <Link href={`/programs/${programId}`} className="text-sm text-blue-700 underline">
              返回训练计划详情
            </Link>
          </>
        }
      />
      <PlannedSessionListClient userId={DEMO_USER_ID} programId={programId} />
    </PageContainer>
  );
}
