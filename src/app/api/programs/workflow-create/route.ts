import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createProgramWorkflowUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createProgramWorkflowUseCase(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
