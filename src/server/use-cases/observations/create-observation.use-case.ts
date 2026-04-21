import { ObservationDomain, ObservationSource, Prisma } from "@prisma/client";
import { z } from "zod";

import { createObservation } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const CreateObservationInputSchema = z.object({
  userId: UuidLikeSchema,
  observedAt: z.coerce.date().default(() => new Date()),
  observationDomain: z.nativeEnum(ObservationDomain),
  metricKey: z.string().min(1),
  valueNumeric: z.number().optional(),
  valueText: z.string().optional(),
  valueJson: z.unknown().optional(),
  unit: z.string().optional(),
  source: z.nativeEnum(ObservationSource).default("manual"),
  confidence: z.number().min(0).max(1).optional(),
  linkedProgramId: UuidLikeSchema.optional(),
  linkedSessionExecutionId: UuidLikeSchema.optional(),
  evidenceAssetId: UuidLikeSchema.optional(),
  notes: z.string().optional(),
});

export type CreateObservationInput = z.input<typeof CreateObservationInputSchema>;

export async function createObservationUseCase(rawInput: CreateObservationInput) {
  const input = CreateObservationInputSchema.parse(rawInput);

  const hasValue = input.valueNumeric !== undefined || input.valueText !== undefined || input.valueJson !== undefined;
  if (!hasValue) {
    throw badRequestError("At least one value field is required: valueNumeric, valueText, or valueJson");
  }

  return createObservation({
    user_id: input.userId,
    observed_at: input.observedAt,
    observation_domain: input.observationDomain,
    metric_key: input.metricKey,
    value_numeric: input.valueNumeric,
    value_text: input.valueText,
    value_json: input.valueJson as Prisma.InputJsonValue | undefined,
    unit: input.unit,
    source: input.source,
    confidence: input.confidence,
    linked_program_id: input.linkedProgramId,
    linked_session_execution_id: input.linkedSessionExecutionId,
    evidence_asset_id: input.evidenceAssetId,
    notes: input.notes,
  });
}
