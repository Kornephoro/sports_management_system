import { NextResponse } from "next/server";

import { handleRouteError } from "@/server/http/route-error-handler";
import {
  deleteTemplatePackageUseCase,
  getTemplatePackageUseCase,
  updateTemplatePackageUseCase,
} from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

type RouteContext = {
  params: Promise<{
    packageId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { packageId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const result = await getTemplatePackageUseCase({ userId, packageId });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { packageId } = await context.params;
    const body = await request.json();
    const updated = await updateTemplatePackageUseCase({
      ...body,
      packageId,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { packageId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const result = await deleteTemplatePackageUseCase({
      userId,
      packageId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
