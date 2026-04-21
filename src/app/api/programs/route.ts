import { NextResponse } from "next/server";

import { createProgramUseCase, listProgramsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const program = await createProgramUseCase(body);
    return NextResponse.json(program, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const programs = await listProgramsUseCase({ userId });
    return NextResponse.json(programs);
  } catch (error) {
    return handleRouteError(error);
  }
}
