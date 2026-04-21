import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { generateRecoveryAiSummaryUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await generateRecoveryAiSummaryUseCase(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
