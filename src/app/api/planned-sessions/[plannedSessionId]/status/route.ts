import { NextResponse } from "next/server";

import { markPlannedSessionStatusUseCase } from "@/server/use-cases";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    plannedSessionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const body = await request.json();
    const plannedSession = await markPlannedSessionStatusUseCase({
      ...body,
      plannedSessionId,
    });
    return NextResponse.json(plannedSession);
  } catch (error) {
    return handleRouteError(error);
  }
}
