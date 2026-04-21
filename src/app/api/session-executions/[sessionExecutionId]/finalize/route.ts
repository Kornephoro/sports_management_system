import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { finalizeSessionExecutionFromSetsUseCase } from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    sessionExecutionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionExecutionId } = await context.params;
    const body = await request.json();

    const result = await finalizeSessionExecutionFromSetsUseCase({
      ...body,
      sessionExecutionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
