import { TemplatePackageEditorClient } from "@/features/training/components/template-package-editor-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

type PageProps = {
  params: Promise<{
    packageId: string;
  }>;
};

export default async function TemplatePackageDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { packageId } = resolvedParams;

  return (
    <TemplatePackageEditorClient 
      userId={DEMO_USER_ID} 
      packageId={packageId} 
    />
  );
}
