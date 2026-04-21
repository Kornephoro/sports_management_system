import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { suggestExercisesUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const suggestions = await suggestExercisesUseCase(body);
    return NextResponse.json(suggestions);
  } catch (error) {
    return handleRouteError(error);
  }
}
