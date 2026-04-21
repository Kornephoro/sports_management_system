import { TrainingProfilePageClient } from "@/features/onboarding/components/training-profile-page-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function TrainingProfilePage() {
  return <TrainingProfilePageClient userId={DEMO_USER_ID} />;
}
