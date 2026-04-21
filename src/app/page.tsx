import { HomeDailyEntryClient } from "@/features/home/components/home-daily-entry-client";
import { PageContainer } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function Home() {
  return (
    <PageContainer className="py-8">
      <HomeDailyEntryClient userId={DEMO_USER_ID} />
    </PageContainer>
  );
}
