import { SessionExecutionWorkbenchClient } from "@/features/executions/components/session-execution-workbench-client";
import { PageContainer } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";

export const dynamic = "force-dynamic";

type SessionExecutionEntryPageProps = {
  params: Promise<{
    programId: string;
    plannedSessionId: string;
  }>;
  searchParams: Promise<{
    returnTo?: string;
    fromPlannedSessionId?: string;
  }>;
};

export default async function SessionExecutionEntryPage({
  params,
  searchParams,
}: SessionExecutionEntryPageProps) {
  const { programId, plannedSessionId } = await params;
  const { returnTo, fromPlannedSessionId } = await searchParams;

  return (
    <PageContainer className="max-w-3xl space-y-3 px-3 py-3 sm:px-4 sm:py-4 md:max-w-4xl md:space-y-4 md:py-6">
      <SessionExecutionWorkbenchClient
        userId={DEMO_USER_ID}
        programId={programId}
        plannedSessionId={plannedSessionId}
        returnTo={returnTo}
        fromPlannedSessionId={fromPlannedSessionId}
      />
    </PageContainer>
  );
}
