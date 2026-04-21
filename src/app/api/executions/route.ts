import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { listRecentSessionExecutionsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = url.searchParams.get("limit") ?? undefined;
    const rawView = url.searchParams.get("view");
    const view = rawView === "summary" || rawView === "full" ? rawView : undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const executions = await listRecentSessionExecutionsUseCase({
      userId,
      limit,
      view,
    });

    return NextResponse.json(executions);
  } catch (error) {
    return handleRouteError(error);
  }
}
