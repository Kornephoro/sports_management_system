import Link from "next/link";

import { EvidencePanelClient } from "@/features/evidence/components/evidence-panel-client";
import { DEMO_USER_ID } from "@/lib/demo-user";

export default function EvidencePage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-blue-700 underline">
          返回首页
        </Link>
      </div>

      <EvidencePanelClient userId={DEMO_USER_ID} />
    </main>
  );
}
