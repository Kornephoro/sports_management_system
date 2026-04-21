import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { listTrainingPlanningAiAnchorCandidatesUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const packageId = url.searchParams.get("packageId");

    if (!userId || !packageId) {
      throw badRequestError("Missing required query parameters: userId, packageId");
    }

    const result = await listTrainingPlanningAiAnchorCandidatesUseCase({
      userId,
      packageId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
