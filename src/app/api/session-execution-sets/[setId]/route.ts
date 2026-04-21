import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { updateSessionExecutionSetUseCase } from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    setId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { setId } = await context.params;
    const body = await request.json();

    const updated = await updateSessionExecutionSetUseCase({
      ...body,
      setId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
