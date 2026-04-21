import { NextResponse } from "next/server";

import { confirmParsedEvidenceUseCase } from "@/server/use-cases";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    evidenceAssetId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { evidenceAssetId } = await context.params;
    const body = await request.json();

    const result = await confirmParsedEvidenceUseCase({
      ...body,
      evidenceAssetId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
