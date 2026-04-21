import { BodyPageClient } from "@/features/observations/components/body-page-client";
import { PageContainer } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function ObservationsPage() {
  return (
    <PageContainer className="py-8">
      <BodyPageClient userId={DEMO_USER_ID} />
    </PageContainer>
  );
}
