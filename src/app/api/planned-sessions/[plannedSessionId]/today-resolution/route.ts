import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { resolveTodayPlannedSessionUseCase } from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    plannedSessionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const body = await request.json();

    const result = await resolveTodayPlannedSessionUseCase({
      ...body,
      plannedSessionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
