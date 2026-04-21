import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  deleteTemplateLibraryFolderUseCase,
  updateTemplateLibraryFolderUseCase,
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
    const updated = await updateTemplateLibraryFolderUseCase({
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
    const result = await deleteTemplateLibraryFolderUseCase({
      ...body,
      key,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
