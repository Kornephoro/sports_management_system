import { NextResponse } from "next/server";

import { linkInjuryIncidentToConstraintUseCase } from "@/server/use-cases";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    constraintProfileId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { constraintProfileId } = await context.params;
    const body = await request.json();

    const constraint = await linkInjuryIncidentToConstraintUseCase({
      ...body,
      constraintProfileId,
    });

    return NextResponse.json(constraint);
  } catch (error) {
    return handleRouteError(error);
  }
}
