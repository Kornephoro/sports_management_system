import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { listOverduePlannedSessionsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = url.searchParams.get("limit") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const overdue = await listOverduePlannedSessionsUseCase({
      userId,
      limit,
    });

    return NextResponse.json(overdue);
  } catch (error) {
    return handleRouteError(error);
  }
}

