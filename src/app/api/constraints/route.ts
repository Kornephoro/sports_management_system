import { NextResponse } from "next/server";

import { createConstraintProfileUseCase } from "@/server/use-cases";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const constraint = await createConstraintProfileUseCase(body);
    return NextResponse.json(constraint, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
