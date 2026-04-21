import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { returnPlannedSessionToQueueUseCase } from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    plannedSessionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const body = await request.json();

    const plannedSession = await returnPlannedSessionToQueueUseCase({
      ...body,
      plannedSessionId,
    });

    return NextResponse.json(plannedSession);
  } catch (error) {
    return handleRouteError(error);
  }
}
