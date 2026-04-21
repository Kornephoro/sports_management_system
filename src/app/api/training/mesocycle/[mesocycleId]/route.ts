import { NextRequest, NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { updateTrainingMesocycleUseCase } from "@/server/use-cases";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ mesocycleId: string }> },
) {
  try {
    const { mesocycleId } = await context.params;
    const body = await request.json();
    const result = await updateTrainingMesocycleUseCase({
      ...body,
      mesocycleId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
