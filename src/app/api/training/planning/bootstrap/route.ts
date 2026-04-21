import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { getTrainingPlanningBootstrapUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const packageId = url.searchParams.get("packageId") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const result = await getTrainingPlanningBootstrapUseCase({
      userId,
      packageId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
