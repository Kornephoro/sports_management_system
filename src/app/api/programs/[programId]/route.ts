import { NextResponse } from "next/server";

import { getProgramDetailUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

type RouteContext = {
  params: Promise<{
    programId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { programId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const program = await getProgramDetailUseCase({
      userId,
      programId,
    });

    return NextResponse.json(program);
  } catch (error) {
    return handleRouteError(error);
  }
}
