import { InjuryIncidentType, InjuryStatus, Prisma, ReturnReadinessStatus } from "@prisma/client";
import { z } from "zod";

import { createInjuryIncident } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const CreateInjuryIncidentInputSchema = z.object({
  userId: UuidLikeSchema,
  linkedSessionExecutionId: UuidLikeSchema.optional(),
  linkedUnitExecutionId: UuidLikeSchema.optional(),
  evidenceAssetId: UuidLikeSchema.optional(),
  status: z.nativeEnum(InjuryStatus).default("acute"),
  incidentType: z.nativeEnum(InjuryIncidentType).default("pain"),
  title: z.string().min(1),
  bodyRegionTags: z.array(z.string()).default([]),
  movementContextTags: z.array(z.string()).default([]),
  onsetAt: z.coerce.date().optional(),
  painLevelInitial: z.number().int().min(0).max(10).optional(),
  mechanismSummary: z.string().optional(),
  symptomSummary: z.string().optional(),
  suspectedCauses: z.array(z.string()).default([]),
  clinicalDiagnosis: z.string().optional(),
  currentRestrictions: z.array(z.string()).default([]),
  returnReadinessStatus: z.nativeEnum(ReturnReadinessStatus).default("not_ready"),
});

export type CreateInjuryIncidentInput = z.input<typeof CreateInjuryIncidentInputSchema>;

export async function createInjuryIncidentUseCase(rawInput: CreateInjuryIncidentInput) {
  const input = CreateInjuryIncidentInputSchema.parse(rawInput);

  return createInjuryIncident({
    user_id: input.userId,
    linked_session_execution_id: input.linkedSessionExecutionId,
    linked_unit_execution_id: input.linkedUnitExecutionId,
    evidence_asset_id: input.evidenceAssetId,
    status: input.status,
    incident_type: input.incidentType,
    title: input.title,
    body_region_tags: input.bodyRegionTags as Prisma.InputJsonValue,
    movement_context_tags: input.movementContextTags as Prisma.InputJsonValue,
    onset_at: input.onsetAt,
    pain_level_initial: input.painLevelInitial,
    mechanism_summary: input.mechanismSummary,
    symptom_summary: input.symptomSummary,
    suspected_causes: input.suspectedCauses as Prisma.InputJsonValue,
    clinical_diagnosis: input.clinicalDiagnosis,
    current_restrictions: input.currentRestrictions as Prisma.InputJsonValue,
    return_readiness_status: input.returnReadinessStatus,
  });
}
