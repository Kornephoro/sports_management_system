import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { listProgressionMatrixCellsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const windowParam = url.searchParams.get("window");
    const window =
      windowParam === "7" ? 7 : windowParam === "10" ? 10 : windowParam === "14" ? 14 : undefined;
    const includeRecent = url.searchParams.get("includeRecent") ?? undefined;
    const recentCount = url.searchParams.get("recentCount") ?? undefined;
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const sessions = await listProgressionMatrixCellsUseCase({
      userId,
      window,
      includeRecent,
      recentCount,
      dateFrom,
      dateTo,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    return handleRouteError(error);
  }
}
