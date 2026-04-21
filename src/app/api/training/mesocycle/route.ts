import { NextRequest, NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createTrainingMesocycleUseCase } from "@/server/use-cases";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createTrainingMesocycleUseCase(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
