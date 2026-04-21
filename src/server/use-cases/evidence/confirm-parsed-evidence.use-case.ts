import { ObservationDomain } from "@prisma/client";
import { z } from "zod";

import { createObservation, getEvidenceAssetByIdForUser, updateEvidenceAssetById } from "@/server/repositories";
import {
  canConfirmParsedEvidence,
} from "@/server/services/evidence/evidence-parse-status.service";
import {
  mergeEvidenceNotes,
  resolveSuggestedObservationFromParsedSummary,
} from "@/server/services/evidence/evidence-confirmation.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const ConfirmParsedEvidenceInputSchema = z.object({
  userId: UuidLikeSchema,
  evidenceAssetId: UuidLikeSchema,
  notes: z.string().optional(),
  observationOverride: z
    .object({
      observationDomain: z.nativeEnum(ObservationDomain).optional(),
      metricKey: z.string().min(1).optional(),
      valueNumeric: z.number().optional(),
      unit: z.string().optional(),
      observedAt: z.coerce.date().optional(),
    })
    .optional(),
});

export type ConfirmParsedEvidenceInput = z.input<typeof ConfirmParsedEvidenceInputSchema>;

export async function confirmParsedEvidenceUseCase(rawInput: ConfirmParsedEvidenceInput) {
  const input = ConfirmParsedEvidenceInputSchema.parse(rawInput);
  const asset = await getEvidenceAssetByIdForUser(input.evidenceAssetId, input.userId);

  if (!asset) {
    throw notFoundError("EvidenceAsset not found");
  }

  if (!canConfirmParsedEvidence(asset.parse_status)) {
    throw badRequestError("Evidence can only be confirmed from parsed or needs_review status");
  }

  const suggested = resolveSuggestedObservationFromParsedSummary(asset);

  const observationDomain = input.observationOverride?.observationDomain ?? suggested?.observation_domain;
  const metricKey = input.observationOverride?.metricKey ?? suggested?.metric_key;
  const valueNumeric = input.observationOverride?.valueNumeric ?? suggested?.value_numeric;
  const unit = input.observationOverride?.unit ?? suggested?.unit;

  if (!observationDomain || !metricKey || valueNumeric === undefined || !unit) {
    throw badRequestError(
      "No usable observation payload found in parsed_summary. Provide observationOverride to confirm.",
    );
  }

  const observation = await createObservation({
    user_id: input.userId,
    observed_at: input.observationOverride?.observedAt ?? new Date(),
    observation_domain: observationDomain,
    metric_key: metricKey,
    value_numeric: valueNumeric,
    unit,
    source: "image_parse",
    evidence_asset_id: asset.id,
    notes: "Created from confirmed evidence (mock parse)",
  });

  const evidence = await updateEvidenceAssetById(asset.id, {
    parse_status: "confirmed",
    linked_entity_type: "observation",
    linked_entity_id: observation.id,
    notes: mergeEvidenceNotes(asset.notes, input.notes),
  });

  return {
    evidence,
    observation,
  };
}
