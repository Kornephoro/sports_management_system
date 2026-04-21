import { PlannedSessionPlanEditorClient } from "@/features/sessions/components/planned-session-plan-editor-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

export const dynamic = "force-dynamic";

type PlannedSessionPlanPageProps = {
  params: Promise<{
    programId: string;
    plannedSessionId: string;
  }>;
};

export default async function PlannedSessionPlanPage({ params }: PlannedSessionPlanPageProps) {
  const { programId, plannedSessionId } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <PlannedSessionPlanEditorClient
        userId={DEMO_USER_ID}
        programId={programId}
        plannedSessionId={plannedSessionId}
      />
    </main>
  );
}
