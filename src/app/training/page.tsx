import { Suspense } from "react";

import { TrainingHubClient } from "@/features/training/components/training-hub-client";
import { TrainingProgressBootstrapResponse } from "@/features/training/training-api";
import { PageContainer } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";
import { getTrainingProgressBootstrapUseCase } from "@/server/use-cases";

export const dynamic = "force-dynamic";

type TrainingPageProps = {
  searchParams: Promise<{
    view?: string;
    tab?: string;
  }>;
};

export default async function TrainingPage({ searchParams }: TrainingPageProps) {
  const resolvedSearchParams = await searchParams;
  let initialProgressData: TrainingProgressBootstrapResponse | null = null;

  if (resolvedSearchParams.view === "progression") {
    try {
      initialProgressData = normalizeProgressBootstrap(await getTrainingProgressBootstrapUseCase({
        userId: DEMO_USER_ID,
      }));
    } catch {
      initialProgressData = null;
    }
  }

  return (
    <PageContainer className="py-8">
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">正在加载训练模块...</p>}>
        <TrainingHubClient userId={DEMO_USER_ID} initialProgressData={initialProgressData} />
      </Suspense>
    </PageContainer>
  );
}

function normalizeProgressBootstrap(
  payload: Awaited<ReturnType<typeof getTrainingProgressBootstrapUseCase>>,
): TrainingProgressBootstrapResponse {
  return JSON.parse(JSON.stringify(payload)) as TrainingProgressBootstrapResponse;
}
