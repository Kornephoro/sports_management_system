import { NextResponse } from "next/server";

import { listPlannedSessionsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    programId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { programId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const sessions = await listPlannedSessionsUseCase({
      userId,
      programId,
      dateFrom,
      dateTo,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    return handleRouteError(error);
  }
}
