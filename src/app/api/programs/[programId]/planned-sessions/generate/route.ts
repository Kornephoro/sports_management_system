import { NextResponse } from "next/server";

import { generatePlannedSessionsUseCase } from "@/server/use-cases";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    programId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { programId } = await context.params;
    const body = await request.json();
    const sessions = await generatePlannedSessionsUseCase({
      ...body,
      programId,
    });

    return NextResponse.json(sessions, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
