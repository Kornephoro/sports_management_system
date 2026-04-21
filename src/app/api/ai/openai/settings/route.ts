import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { getOpenAiSettingsUseCase, saveOpenAiSettingsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }
    const result = await getOpenAiSettingsUseCase({ userId });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const result = await saveOpenAiSettingsUseCase(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
