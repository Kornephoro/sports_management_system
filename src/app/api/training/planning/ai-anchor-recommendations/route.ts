import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { generateTrainingPlanningAiAnchorsUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await generateTrainingPlanningAiAnchorsUseCase(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
