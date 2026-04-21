import { NextResponse } from "next/server";

import { updateEvidenceParseStatusUseCase } from "@/server/use-cases";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    evidenceAssetId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { evidenceAssetId } = await context.params;
    const body = await request.json();

    const evidenceAsset = await updateEvidenceParseStatusUseCase({
      ...body,
      evidenceAssetId,
    });

    return NextResponse.json(evidenceAsset);
  } catch (error) {
    return handleRouteError(error);
  }
}
