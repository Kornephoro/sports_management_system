import { NextResponse } from "next/server";

import { createInjuryIncidentUseCase, listInjuryIncidentsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const injury = await createInjuryIncidentUseCase(body);
    return NextResponse.json(injury, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const statusRaw = url.searchParams.get("status") ?? undefined;
    const limit = url.searchParams.get("limit") ?? undefined;
    const allowedStatuses = ["acute", "monitoring", "recovering", "resolved", "recurring"] as const;
    const status =
      statusRaw && (allowedStatuses as readonly string[]).includes(statusRaw)
        ? (statusRaw as (typeof allowedStatuses)[number])
        : undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const injuries = await listInjuryIncidentsUseCase({
      userId,
      status,
      limit,
    });

    return NextResponse.json(injuries);
  } catch (error) {
    return handleRouteError(error);
  }
}
