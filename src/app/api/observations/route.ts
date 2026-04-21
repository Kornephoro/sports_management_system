import { NextResponse } from "next/server";

import { createObservationUseCase, listObservationsByMetricUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const observation = await createObservationUseCase(body);
    return NextResponse.json(observation, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const metricKey = url.searchParams.get("metricKey");
    const limit = url.searchParams.get("limit") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }
    if (!metricKey) {
      throw badRequestError("Missing required query parameter: metricKey");
    }

    const observations = await listObservationsByMetricUseCase({
      userId,
      metricKey,
      limit,
    });

    return NextResponse.json(observations);
  } catch (error) {
    return handleRouteError(error);
  }
}
