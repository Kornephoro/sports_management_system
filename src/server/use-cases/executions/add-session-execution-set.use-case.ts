import { z } from "zod";

import {
  createSessionExecutionSet,
  getLatestSessionExecutionSetBySessionExecutionAndPlannedUnit,
  getMaxSetIndexBySessionExecutionAndPlannedUnit,
  getPlannedSessionWithUnitsById,
  getSessionExecutionByIdForUser,
  getSessionExecutionSetByIdForUser,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const AddSessionExecutionSetInputSchema = z.object({
  userId: UuidLikeSchema,
  sessionExecutionId: UuidLikeSchema,
  plannedUnitId: UuidLikeSchema,
  basedOnSetId: UuidLikeSchema.optional(),
  isExtraSet: z.boolean().default(true),
});

export type AddSessionExecutionSetInput = z.input<typeof AddSessionExecutionSetInputSchema>;

function toOptionalNumber(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function addSessionExecutionSetUseCase(rawInput: AddSessionExecutionSetInput) {
  const input = AddSessionExecutionSetInputSchema.parse(rawInput);

  if (!input.isExtraSet) {
    throw badRequestError("Only extra sets can be added via this endpoint");
  }

  const sessionExecution = await getSessionExecutionByIdForUser(
    input.sessionExecutionId,
    input.userId,
  );
  if (!sessionExecution) {
    throw notFoundError("Session execution not found");
  }

  if (!sessionExecution.planned_session_id) {
    throw badRequestError("Session execution is not linked to a planned session");
  }

  const plannedSession = await getPlannedSessionWithUnitsById(
    sessionExecution.planned_session_id,
    input.userId,
  );

  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  const plannedUnit = plannedSession.planned_units.find((unit) => unit.id === input.plannedUnitId);
  if (!plannedUnit) {
    throw badRequestError("Planned unit does not belong to this session execution");
  }

  const basedOnSet = input.basedOnSetId
    ? await getSessionExecutionSetByIdForUser(input.basedOnSetId, input.userId)
    : await getLatestSessionExecutionSetBySessionExecutionAndPlannedUnit(
        input.sessionExecutionId,
        input.plannedUnitId,
      );

  if (input.basedOnSetId && !basedOnSet) {
    throw notFoundError("Based-on set not found");
  }

  if (basedOnSet) {
    if (basedOnSet.session_execution_id !== input.sessionExecutionId) {
      throw badRequestError("Based-on set does not belong to this session execution");
    }
    if (basedOnSet.planned_unit_id !== input.plannedUnitId) {
      throw badRequestError("Based-on set does not belong to this planned unit");
    }
  }

  const maxSetIndex = await getMaxSetIndexBySessionExecutionAndPlannedUnit(
    input.sessionExecutionId,
    input.plannedUnitId,
  );

  return createSessionExecutionSet({
    session_execution_id: input.sessionExecutionId,
    planned_unit_id: input.plannedUnitId,
    set_index: maxSetIndex + 1,
    planned_set_type: basedOnSet?.planned_set_type ?? undefined,
    planned_reps: basedOnSet?.planned_reps ?? undefined,
    planned_weight: toOptionalNumber(basedOnSet?.planned_weight),
    planned_rpe: toOptionalNumber(basedOnSet?.planned_rpe),
    planned_rest_seconds: basedOnSet?.planned_rest_seconds ?? undefined,
    planned_tempo: basedOnSet?.planned_tempo ?? undefined,
    actual_reps: basedOnSet?.actual_reps ?? undefined,
    actual_weight: toOptionalNumber(basedOnSet?.actual_weight),
    actual_rpe: toOptionalNumber(basedOnSet?.actual_rpe),
    actual_rest_seconds: basedOnSet?.actual_rest_seconds ?? undefined,
    actual_tempo: basedOnSet?.actual_tempo ?? undefined,
    status: "pending",
    is_extra_set: true,
    note: basedOnSet?.note ?? undefined,
  });
}
