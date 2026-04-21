import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createTemplatePackageUseCase, listTemplatePackagesUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const query = url.searchParams.get("query") ?? undefined;
    const enabled = url.searchParams.get("enabled") ?? undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const result = await listTemplatePackagesUseCase({
      userId,
      query,
      enabled: enabled === "true" || enabled === "false" || enabled === "all" ? enabled : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await createTemplatePackageUseCase(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
