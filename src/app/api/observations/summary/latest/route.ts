import { NextResponse } from "next/server";

import { getLatestObservationSummaryUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const metricKeysRaw = url.searchParams.get("metricKeys");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const metricKeys = metricKeysRaw
      ? metricKeysRaw
          .split(",")
          .map((metric) => metric.trim())
          .filter((metric) => metric.length > 0)
      : undefined;

    const summary = await getLatestObservationSummaryUseCase({
      userId,
      metricKeys,
    });

    return NextResponse.json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
