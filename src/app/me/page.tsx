import { MePageClient } from "@/features/me/components/me-page-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function MePage() {
  return <MePageClient userId={DEMO_USER_ID} />;
}
