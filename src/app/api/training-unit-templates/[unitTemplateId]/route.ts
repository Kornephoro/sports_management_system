import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  deleteTrainingUnitTemplateUseCase,
  updateTrainingUnitTemplateUseCase,
} from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    unitTemplateId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { unitTemplateId } = await context.params;
    const body = await request.json();

    const updated = await updateTrainingUnitTemplateUseCase({
      ...body,
      unitTemplateId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { unitTemplateId } = await context.params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const deleted = await deleteTrainingUnitTemplateUseCase({
      userId: userId ?? "",
      unitTemplateId,
    });

    return NextResponse.json(deleted);
  } catch (error) {
    return handleRouteError(error);
  }
}
