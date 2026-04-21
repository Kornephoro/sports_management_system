import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  deleteSessionExecutionUseCase,
  getSessionExecutionDetailUseCase,
  updateSessionExecutionUseCase,
} from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

type RouteContext = {
  params: Promise<{
    sessionExecutionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { sessionExecutionId } = await context.params;
    const body = await request.json();

    const updated = await updateSessionExecutionUseCase({
      ...body,
      sessionExecutionId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { sessionExecutionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const detail = await getSessionExecutionDetailUseCase({
      userId,
      sessionExecutionId,
    });

    return NextResponse.json(detail);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { sessionExecutionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const deleted = await deleteSessionExecutionUseCase({
      userId: userId ?? "",
      sessionExecutionId,
    });

    return NextResponse.json(deleted);
  } catch (error) {
    return handleRouteError(error);
  }
}
