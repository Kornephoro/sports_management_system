import { NextResponse } from "next/server";

import { uploadEvidenceUseCase } from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { handleRouteError } from "@/server/http/route-error-handler";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const userId = formData.get("userId");
    const file = formData.get("file");
    const domainHint = formData.get("domainHint");
    const sourceApp = formData.get("sourceApp");
    const capturedAt = formData.get("capturedAt");
    const notes = formData.get("notes");

    if (typeof userId !== "string" || userId.length === 0) {
      throw badRequestError("Missing required field: userId");
    }

    if (!(file instanceof File)) {
      throw badRequestError("Missing required file field: file");
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const allowedDomainHints = ["training", "nutrition", "body_metric", "health", "rehab", "other"] as const;
    const safeDomainHint =
      typeof domainHint === "string" &&
      (allowedDomainHints as readonly string[]).includes(domainHint)
        ? (domainHint as (typeof allowedDomainHints)[number])
        : undefined;

    const evidenceAsset = await uploadEvidenceUseCase({
      userId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
      domainHint: safeDomainHint,
      sourceApp: typeof sourceApp === "string" ? sourceApp : undefined,
      capturedAt: typeof capturedAt === "string" && capturedAt.length > 0 ? capturedAt : undefined,
      notes: typeof notes === "string" ? notes : undefined,
    });

    return NextResponse.json(evidenceAsset, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
