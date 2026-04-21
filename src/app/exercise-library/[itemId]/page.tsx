import { ExerciseLibraryDetailClient } from "@/features/exercise-library/components/exercise-library-detail-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

type ExerciseLibraryItemDetailPageProps = {
  params: Promise<{
    itemId: string;
  }>;
};

export default async function ExerciseLibraryItemDetailPage({
  params,
}: ExerciseLibraryItemDetailPageProps) {
  const { itemId } = await params;

  return (
    <main className="mx-auto w-full max-w-[480px] px-0 py-0">
      <ExerciseLibraryDetailClient userId={DEMO_USER_ID} itemId={itemId} />
    </main>
  );
}
