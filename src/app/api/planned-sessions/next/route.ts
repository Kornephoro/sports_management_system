import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { getNextOrRecentPlannedSessionUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const session = await getNextOrRecentPlannedSessionUseCase({
      userId,
    });

    return NextResponse.json(session);
  } catch (error) {
    return handleRouteError(error);
  }
}
