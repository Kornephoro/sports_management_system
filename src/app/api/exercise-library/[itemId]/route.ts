import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  getExerciseLibraryItemUseCase,
  updateExerciseLibraryItemUseCase,
} from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { itemId } = await context.params;
    const body = await request.json();
    const updated = await updateExerciseLibraryItemUseCase({
      ...body,
      itemId,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { itemId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }
    const item = await getExerciseLibraryItemUseCase({
      userId,
      itemId,
    });
    return NextResponse.json(item);
  } catch (error) {
    return handleRouteError(error);
  }
}
