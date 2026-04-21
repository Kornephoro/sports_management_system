import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { listUpcomingPlannedSessionsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;
    const limit = url.searchParams.get("limit") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const sessions = await listUpcomingPlannedSessionsUseCase({
      userId,
      dateFrom,
      dateTo,
      limit,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    return handleRouteError(error);
  }
}
