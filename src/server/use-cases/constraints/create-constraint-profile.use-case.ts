import { ConstraintDetectedFrom, ConstraintDomain, ConstraintSeverity, ConstraintStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { createConstraintProfile } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const CreateConstraintProfileInputSchema = z.object({
  userId: UuidLikeSchema,
  status: z.nativeEnum(ConstraintStatus).default("active"),
  title: z.string().min(1),
  domain: z.nativeEnum(ConstraintDomain),
  bodyRegionTags: z.array(z.string()).default([]),
  movementTags: z.array(z.string()).default([]),
  severity: z.nativeEnum(ConstraintSeverity).default("moderate"),
  description: z.string().optional(),
  symptomSummary: z.string().optional(),
  restrictionRules: z.record(z.string(), z.unknown()).default({}),
  trainingImplications: z.record(z.string(), z.unknown()).default({}),
  rehabFocusTags: z.array(z.string()).default([]),
  maintenanceRequirement: z.unknown().optional(),
  detectedFrom: z.nativeEnum(ConstraintDetectedFrom).default("manual"),
  linkedInjuryIncidentId: UuidLikeSchema.optional(),
  startedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type CreateConstraintProfileInput = z.input<typeof CreateConstraintProfileInputSchema>;

export async function createConstraintProfileUseCase(rawInput: CreateConstraintProfileInput) {
  const input = CreateConstraintProfileInputSchema.parse(rawInput);

  return createConstraintProfile({
    user_id: input.userId,
    status: input.status,
    title: input.title,
    domain: input.domain,
    body_region_tags: input.bodyRegionTags as Prisma.InputJsonValue,
    movement_tags: input.movementTags as Prisma.InputJsonValue,
    severity: input.severity,
    description: input.description,
    symptom_summary: input.symptomSummary,
    restriction_rules: input.restrictionRules as Prisma.InputJsonValue,
    training_implications: input.trainingImplications as Prisma.InputJsonValue,
    rehab_focus_tags: input.rehabFocusTags as Prisma.InputJsonValue,
    maintenance_requirement: input.maintenanceRequirement as Prisma.InputJsonValue | undefined,
    detected_from: input.detectedFrom,
    linked_injury_incident_id: input.linkedInjuryIncidentId,
    started_at: input.startedAt,
    notes: input.notes,
  });
}
