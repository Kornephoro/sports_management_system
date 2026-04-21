import { SessionExecutionDetailClient } from "@/features/executions/components/session-execution-detail-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

type PageProps = {
  params: Promise<{
    sessionExecutionId: string;
  }>;
};

export default async function SessionExecutionDetailPage({ params }: PageProps) {
  const { sessionExecutionId } = await params;

  return (
    <main>
      <SessionExecutionDetailClient
        userId={DEMO_USER_ID}
        sessionExecutionId={sessionExecutionId}
      />
    </main>
  );
}
