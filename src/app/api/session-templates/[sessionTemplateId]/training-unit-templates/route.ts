import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createTrainingUnitTemplateUseCase } from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    sessionTemplateId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionTemplateId } = await context.params;
    const body = await request.json();

    const created = await createTrainingUnitTemplateUseCase({
      ...body,
      sessionTemplateId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
