import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { createTemplateLibraryItemUseCase, listTemplateLibraryItemsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const query = url.searchParams.get("query") ?? undefined;
    const enabled = url.searchParams.get("enabled") ?? undefined;
    const splitType = url.searchParams.get("splitType")?.trim() || undefined;
    const folderKey = url.searchParams.get("folderKey")?.trim() || undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const items = await listTemplateLibraryItemsUseCase({
      userId,
      query,
      enabled: enabled === "true" || enabled === "false" || enabled === "all" ? enabled : undefined,
      splitType,
      folderKey,
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await createTemplateLibraryItemUseCase(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
