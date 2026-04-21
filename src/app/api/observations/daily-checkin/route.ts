import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createDailyCheckinUseCase } from "@/server/use-cases";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createDailyCheckinUseCase(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
