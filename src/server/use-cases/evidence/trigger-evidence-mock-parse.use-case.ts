import { EvidenceParseStatus } from "@prisma/client";
import { z } from "zod";

import { getEvidenceAssetByIdForUser, updateEvidenceAssetById } from "@/server/repositories";
import { buildMockParsedSummary } from "@/server/services/evidence/evidence-parse-mock.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const TriggerEvidenceMockParseInputSchema = z.object({
  userId: UuidLikeSchema,
  evidenceAssetId: UuidLikeSchema,
  targetStatus: z.enum(["parsed", "needs_review"]).default("parsed"),
});

export type TriggerEvidenceMockParseInput = z.input<typeof TriggerEvidenceMockParseInputSchema>;

export async function triggerEvidenceMockParseUseCase(rawInput: TriggerEvidenceMockParseInput) {
  const input = TriggerEvidenceMockParseInputSchema.parse(rawInput);
  const asset = await getEvidenceAssetByIdForUser(input.evidenceAssetId, input.userId);

  if (!asset) {
    throw notFoundError("EvidenceAsset not found");
  }

  if (asset.parse_status !== EvidenceParseStatus.pending) {
    throw badRequestError("Mock parse can only be triggered when parse_status is pending");
  }

  return updateEvidenceAssetById(asset.id, {
    parse_status: input.targetStatus,
    parser_version: "mock-evidence-parser-v1",
    parsed_summary: buildMockParsedSummary(asset, input.targetStatus),
    confidence: input.targetStatus === "parsed" ? 0.85 : 0.6,
  });
}
