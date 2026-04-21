import { ExerciseLibraryPanelClient } from "@/features/exercise-library/components/exercise-library-panel-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function ExerciseLibraryPage() {
  return (
    <main className="mx-auto w-full max-w-[480px] px-0 py-0">
      <ExerciseLibraryPanelClient userId={DEMO_USER_ID} />
    </main>
  );
}
