import { z } from "zod";

import { getEvidenceAssetByIdForUser, updateEvidenceAssetById } from "@/server/repositories";
import { mergeEvidenceNotes } from "@/server/services/evidence/evidence-confirmation.service";
import { canRejectParsedEvidence } from "@/server/services/evidence/evidence-parse-status.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const RejectParsedEvidenceInputSchema = z.object({
  userId: UuidLikeSchema,
  evidenceAssetId: UuidLikeSchema,
  reason: z.string().optional(),
});

export type RejectParsedEvidenceInput = z.input<typeof RejectParsedEvidenceInputSchema>;

export async function rejectParsedEvidenceUseCase(rawInput: RejectParsedEvidenceInput) {
  const input = RejectParsedEvidenceInputSchema.parse(rawInput);
  const asset = await getEvidenceAssetByIdForUser(input.evidenceAssetId, input.userId);

  if (!asset) {
    throw notFoundError("EvidenceAsset not found");
  }

  if (!canRejectParsedEvidence(asset.parse_status)) {
    throw badRequestError("Evidence can only be rejected from parsed or needs_review status");
  }

  const reasonNote = input.reason ? `Rejected reason: ${input.reason}` : "Rejected by user";

  return updateEvidenceAssetById(asset.id, {
    parse_status: "rejected",
    notes: mergeEvidenceNotes(asset.notes, reasonNote),
  });
}
