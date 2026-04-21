import { NextResponse } from "next/server";

import { listActiveConstraintsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = url.searchParams.get("limit") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const constraints = await listActiveConstraintsUseCase({
      userId,
      limit,
    });

    return NextResponse.json(constraints);
  } catch (error) {
    return handleRouteError(error);
  }
}
