import { z } from "zod";

import {
  getConstraintProfileByIdForUser,
  getInjuryIncidentByIdForUser,
  updateConstraintProfileById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const LinkInjuryIncidentToConstraintInputSchema = z.object({
  userId: UuidLikeSchema,
  constraintProfileId: UuidLikeSchema,
  injuryIncidentId: UuidLikeSchema,
});

export type LinkInjuryIncidentToConstraintInput = z.input<
  typeof LinkInjuryIncidentToConstraintInputSchema
>;

export async function linkInjuryIncidentToConstraintUseCase(
  rawInput: LinkInjuryIncidentToConstraintInput,
) {
  const input = LinkInjuryIncidentToConstraintInputSchema.parse(rawInput);
  const [constraint, injury] = await Promise.all([
    getConstraintProfileByIdForUser(input.constraintProfileId, input.userId),
    getInjuryIncidentByIdForUser(input.injuryIncidentId, input.userId),
  ]);

  if (!constraint) {
    throw notFoundError("ConstraintProfile not found");
  }
  if (!injury) {
    throw notFoundError("InjuryIncident not found");
  }

  return updateConstraintProfileById(constraint.id, {
    linked_injury_incident_id: injury.id,
  });
}
