import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  deleteTemplateLibrarySplitTypeUseCase,
  updateTemplateLibrarySplitTypeUseCase,
} from "@/server/use-cases";

type RouteContext = {
  params: Promise<{
    key: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    const body = await request.json();
    const updated = await updateTemplateLibrarySplitTypeUseCase({
      ...body,
      key,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    const body = await request.json();
    const result = await deleteTemplateLibrarySplitTypeUseCase({
      ...body,
      key,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
