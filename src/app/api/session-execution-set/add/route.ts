import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { addSessionExecutionSetUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await addSessionExecutionSetUseCase(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
