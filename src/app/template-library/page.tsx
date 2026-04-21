import { TemplateLibraryPanelClient } from "@/features/template-library/components/template-library-panel-client";
import { PageContainer } from "@/features/shared/components/ui-primitives";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function TemplateLibraryPage() {
  return (
    <PageContainer className="py-4">
      <TemplateLibraryPanelClient userId={DEMO_USER_ID} />
    </PageContainer>
  );
}
