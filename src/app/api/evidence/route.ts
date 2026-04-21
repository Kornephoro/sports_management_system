import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { listEvidenceAssetsUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = url.searchParams.get("limit") ?? undefined;
    const parseStatusRaw = url.searchParams.get("parseStatus") ?? undefined;
    const allowedParseStatuses = ["pending", "parsed", "needs_review", "confirmed", "rejected", "failed"] as const;
    const parseStatus =
      parseStatusRaw &&
      (allowedParseStatuses as readonly string[]).includes(parseStatusRaw)
        ? (parseStatusRaw as (typeof allowedParseStatuses)[number])
        : undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const evidenceAssets = await listEvidenceAssetsUseCase({
      userId,
      limit,
      parseStatus,
    });

    return NextResponse.json(evidenceAssets);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") {
      return NextResponse.json(
        {
          error: "证据列表暂时不可用（数据库连接异常），请稍后重试。",
          code: "EVIDENCE_LIST_DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    return handleRouteError(error);
  }
}
