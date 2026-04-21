import { NextResponse } from "next/server";

import {
  createSessionExecutionUseCase,
  getActiveSessionExecutionByPlannedSessionUseCase,
  getLatestSessionExecutionByPlannedSessionUseCase,
} from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    plannedSessionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const body = await request.json();
    const result = await createSessionExecutionUseCase({
      ...body,
      plannedSessionId,
    });
    return NextResponse.json(
      {
        ...result.sessionExecution,
        is_reused: result.reusedExisting,
      },
      { status: result.reusedExisting ? 200 : 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { plannedSessionId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const mode = url.searchParams.get("mode") ?? "latest";

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }
    if (mode !== "latest" && mode !== "active") {
      throw badRequestError("Unsupported mode. Supported: latest, active.");
    }

    if (mode === "active") {
      const active = await getActiveSessionExecutionByPlannedSessionUseCase({
        userId,
        plannedSessionId,
      });
      return NextResponse.json(active);
    }

    const latest = await getLatestSessionExecutionByPlannedSessionUseCase({
      userId,
      plannedSessionId,
    });

    return NextResponse.json(latest);
  } catch (error) {
    return handleRouteError(error);
  }
}
