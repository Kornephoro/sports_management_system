import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import { setTemplateLibraryItemEnabledUseCase } from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { itemId } = await context.params;
    const body = await request.json();
    const updated = await setTemplateLibraryItemEnabledUseCase({
      userId: body.userId,
      itemId,
      enabled: body.enabled,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
