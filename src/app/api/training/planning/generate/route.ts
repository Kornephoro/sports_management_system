import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { generateTrainingPlanFromPackageUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await generateTrainingPlanFromPackageUseCase(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
