import { TemplateLibraryDetailClient } from "@/features/template-library/components/template-library-detail-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

type TemplateLibraryItemPageProps = {
  params: Promise<{
    itemId: string;
  }>;
};

export default async function TemplateLibraryItemPage({ params }: TemplateLibraryItemPageProps) {
  const { itemId } = await params;

  return (
    <main className="mx-auto w-full max-w-[560px] px-3 py-4 sm:px-4">
      <TemplateLibraryDetailClient userId={DEMO_USER_ID} itemId={itemId} />
    </main>
  );
}
