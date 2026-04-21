import { z } from "zod";

import { getActiveSessionExecutionByPlannedSessionForUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetActiveSessionExecutionByPlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
});

export type GetActiveSessionExecutionByPlannedSessionInput = z.input<
  typeof GetActiveSessionExecutionByPlannedSessionInputSchema
>;

export async function getActiveSessionExecutionByPlannedSessionUseCase(
  rawInput: GetActiveSessionExecutionByPlannedSessionInput,
) {
  const input = GetActiveSessionExecutionByPlannedSessionInputSchema.parse(rawInput);

  const active = await getActiveSessionExecutionByPlannedSessionForUser(
    input.plannedSessionId,
    input.userId,
  );

  if (!active) {
    return null;
  }

  return {
    id: active.id,
    planned_session_id: active.planned_session_id,
    completion_status: active.completion_status,
    performed_at: active.performed_at,
    actual_duration_min: active.actual_duration_min,
    notes: active.notes,
    created_at: active.created_at,
    unit_execution_count: active._count.unit_executions,
    is_active: true,
  };
}

