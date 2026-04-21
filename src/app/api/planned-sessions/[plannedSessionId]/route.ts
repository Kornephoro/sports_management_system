import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { deletePlannedSessionUseCase, getPlannedSessionDetailUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

type RouteContext = {
  params: Promise<{
    plannedSessionId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const deleted = await deletePlannedSessionUseCase({
      userId: userId ?? "",
      plannedSessionId,
    });

    return NextResponse.json(deleted);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const plannedSession = await getPlannedSessionDetailUseCase({
      userId,
      plannedSessionId,
    });

    return NextResponse.json(plannedSession);
  } catch (error) {
    return handleRouteError(error);
  }
}
