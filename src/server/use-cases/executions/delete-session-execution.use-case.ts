import { z } from "zod";

import {
  deleteSessionExecutionCascade,
  getPlannedSessionWithUnitsById,
  getSessionExecutionDeleteContext,
  listLatestUnitExecutionByPlannedUnitIds,
  listPlannedUnitStates,
  updatePlannedSessionStatus,
  updatePlannedUnitStatusByIds,
} from "@/server/repositories";
import {
  derivePlannedSessionStateFromPlannedUnits,
  mapUnitExecutionCompletionToUnitState,
} from "@/server/services/executions/execution-status.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const DeleteSessionExecutionInputSchema = z.object({
  userId: UuidLikeSchema,
  sessionExecutionId: UuidLikeSchema,
});

export type DeleteSessionExecutionInput = z.input<typeof DeleteSessionExecutionInputSchema>;

export async function deleteSessionExecutionUseCase(rawInput: DeleteSessionExecutionInput) {
  const input = DeleteSessionExecutionInputSchema.parse(rawInput);

  const sessionExecution = await getSessionExecutionDeleteContext(
    input.sessionExecutionId,
    input.userId,
  );
  if (!sessionExecution) {
    throw notFoundError("Session execution not found");
  }

  const plannedSessionId = sessionExecution.planned_session_id;
  const affectedPlannedUnitIds = Array.from(
    new Set(
      sessionExecution.unit_executions
        .map((item) => item.planned_unit_id)
        .filter((plannedUnitId): plannedUnitId is string => typeof plannedUnitId === "string"),
    ),
  );

  await deleteSessionExecutionCascade(input.sessionExecutionId, input.userId);

  if (plannedSessionId) {
    const plannedSession = await getPlannedSessionWithUnitsById(plannedSessionId, input.userId);
    if (plannedSession) {
      if (affectedPlannedUnitIds.length > 0) {
        const latestUnitExecutions = await listLatestUnitExecutionByPlannedUnitIds(
          affectedPlannedUnitIds,
          input.userId,
        );

        const latestByPlannedUnit = new Map<string, (typeof latestUnitExecutions)[number]>();
        latestUnitExecutions.forEach((item) => {
          if (!item.planned_unit_id || latestByPlannedUnit.has(item.planned_unit_id)) {
            return;
          }
          latestByPlannedUnit.set(item.planned_unit_id, item);
        });

        await updatePlannedUnitStatusByIds(
          plannedSessionId,
          affectedPlannedUnitIds.map((plannedUnitId) => {
            const latest = latestByPlannedUnit.get(plannedUnitId);
            return {
              plannedUnitId,
              status: latest
                ? mapUnitExecutionCompletionToUnitState(latest.completion_status)
                : "planned",
            };
          }),
        );
      }

      const nextUnitStates = await listPlannedUnitStates(plannedSessionId);
      const nextSessionState = derivePlannedSessionStateFromPlannedUnits(
        nextUnitStates.map((unit) => unit.status),
      );
      await updatePlannedSessionStatus(plannedSessionId, input.userId, nextSessionState);
    }
  }

  return {
    deleted: true,
    sessionExecutionId: input.sessionExecutionId,
    deletedUnitExecutionCount: sessionExecution.unit_executions.length,
  };
}
