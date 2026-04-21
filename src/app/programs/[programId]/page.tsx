import Link from "next/link";

import { ProgramDetailClient } from "@/features/programs/components/program-detail-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

type ProgramDetailPageProps = {
  params: Promise<{
    programId: string;
  }>;
};

export default async function ProgramDetailPage({ params }: ProgramDetailPageProps) {
  const { programId } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/programs" className="text-sm text-blue-700 underline">
          返回训练计划列表
        </Link>
      </div>
      <ProgramDetailClient userId={DEMO_USER_ID} programId={programId} />
    </main>
  );
}
