import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { listTrainingProgressionMatrixV2UseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const windowParam = url.searchParams.get("window");
    const window =
      windowParam === "7" ? 7 : windowParam === "10" ? 10 : windowParam === "14" ? 14 : undefined;
    const axisParam = url.searchParams.get("axis");
    const axis = axisParam === "calendar" || axisParam === "exposure" ? axisParam : undefined;
    const rowAxisParam = url.searchParams.get("rowAxis");
    const rowAxis =
      rowAxisParam === "track" || rowAxisParam === "session_type" ? rowAxisParam : undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const result = await listTrainingProgressionMatrixV2UseCase({
      userId,
      window,
      includeRecent: url.searchParams.get("includeRecent") ?? undefined,
      recentCount: url.searchParams.get("recentCount") ?? undefined,
      axis,
      rowAxis,
      sessionType: url.searchParams.get("sessionType") ?? undefined,
      movementPattern: url.searchParams.get("movementPattern") ?? undefined,
      primaryMuscle: url.searchParams.get("primaryMuscle") ?? undefined,
      onlyAbnormal: url.searchParams.get("onlyAbnormal") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
