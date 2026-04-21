import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createAndBindTemplateDayUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

type RouteContext = {
  params: Promise<{
    packageId: string;
    dayCode: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { packageId, dayCode } = await context.params;
    const body = await request.json();
    const userId = typeof body?.userId === "string" ? body.userId : null;
    if (!userId) {
      throw badRequestError("Missing required field: userId");
    }

    const result = await createAndBindTemplateDayUseCase({
      userId,
      packageId,
      dayCode,
      templateName: body?.templateName,
      description: body?.description,
      notes: body?.notes,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

