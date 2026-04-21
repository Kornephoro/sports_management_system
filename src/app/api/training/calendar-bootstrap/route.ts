import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { getTrainingCalendarBootstrapUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const month = url.searchParams.get("month") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const result = await getTrainingCalendarBootstrapUseCase({
      userId,
      month,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

