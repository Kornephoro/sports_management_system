import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getEvidenceAssetByIdForUser, updateEvidenceAssetById } from "@/server/repositories";
import { canTransitionParseStatus } from "@/server/services/evidence/evidence-parse-status.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdatableParseStatusSchema = z.enum(["pending", "parsed", "needs_review", "failed"]);

const UpdateEvidenceParseStatusInputSchema = z.object({
  userId: UuidLikeSchema,
  evidenceAssetId: UuidLikeSchema,
  parseStatus: UpdatableParseStatusSchema,
});

export type UpdateEvidenceParseStatusInput = z.input<typeof UpdateEvidenceParseStatusInputSchema>;

export async function updateEvidenceParseStatusUseCase(rawInput: UpdateEvidenceParseStatusInput) {
  const input = UpdateEvidenceParseStatusInputSchema.parse(rawInput);
  const asset = await getEvidenceAssetByIdForUser(input.evidenceAssetId, input.userId);

  if (!asset) {
    throw notFoundError("EvidenceAsset not found");
  }

  if (!canTransitionParseStatus(asset.parse_status, input.parseStatus)) {
    throw badRequestError(`Invalid parse status transition: ${asset.parse_status} -> ${input.parseStatus}`);
  }

  return updateEvidenceAssetById(asset.id, {
    parse_status: input.parseStatus,
    ...(input.parseStatus === "pending"
      ? {
          parser_version: null,
          parsed_summary: Prisma.DbNull,
          confidence: null,
        }
      : {}),
  });
}
