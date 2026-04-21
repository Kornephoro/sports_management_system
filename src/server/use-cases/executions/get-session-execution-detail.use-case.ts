import { z } from "zod";

import { getSessionExecutionWithSetsByIdForUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const GetSessionExecutionDetailInputSchema = z.object({
  userId: UuidLikeSchema,
  sessionExecutionId: UuidLikeSchema,
});

export type GetSessionExecutionDetailInput = z.input<typeof GetSessionExecutionDetailInputSchema>;

export async function getSessionExecutionDetailUseCase(rawInput: GetSessionExecutionDetailInput) {
  const input = GetSessionExecutionDetailInputSchema.parse(rawInput);

  const execution = await getSessionExecutionWithSetsByIdForUser(
    input.sessionExecutionId,
    input.userId,
  );

  if (!execution) {
    throw notFoundError("Session execution not found");
  }

  const setsByPlannedUnitId = new Map<string, typeof execution.execution_sets>();
  execution.execution_sets.forEach((setRow) => {
    if (!setRow.planned_unit_id) {
      return;
    }
    const bucket = setsByPlannedUnitId.get(setRow.planned_unit_id) ?? [];
    bucket.push(setRow);
    setsByPlannedUnitId.set(setRow.planned_unit_id, bucket);
  });

  const units = (execution.planned_session?.planned_units ?? []).map((unit) => {
    const sets = (setsByPlannedUnitId.get(unit.id) ?? []).sort((a, b) => a.set_index - b.set_index);
    return {
      planned_unit: unit,
      sets,
      all_sets_completed: sets.length > 0 && sets.every((setRow) => setRow.status === "completed"),
    };
  });

  return {
    session: {
      id: execution.id,
      user_id: execution.user_id,
      planned_session_id: execution.planned_session_id,
      program_id: execution.program_id,
      block_id: execution.block_id,
      performed_at: execution.performed_at,
      completion_status: execution.completion_status,
      actual_duration_min: execution.actual_duration_min,
      notes: execution.notes,
      created_at: execution.created_at,
      updated_at: execution.updated_at,
      program: execution.program,
      planned_session: execution.planned_session
        ? {
            id: execution.planned_session.id,
            sequence_index: execution.planned_session.sequence_index,
            session_date: execution.planned_session.session_date,
            status: execution.planned_session.status,
          }
        : null,
    },
    units,
  };
}
