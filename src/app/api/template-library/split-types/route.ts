import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  createTemplateLibrarySplitTypeUseCase,
  listTemplateLibrarySplitTypesUseCase,
} from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }
    const result = await listTemplateLibrarySplitTypesUseCase({ userId });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await createTemplateLibrarySplitTypeUseCase(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
