import { z } from "zod";

import { getLatestSessionExecutionByPlannedSessionForUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetLatestSessionExecutionByPlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
});

export type GetLatestSessionExecutionByPlannedSessionInput = z.input<
  typeof GetLatestSessionExecutionByPlannedSessionInputSchema
>;

export async function getLatestSessionExecutionByPlannedSessionUseCase(
  rawInput: GetLatestSessionExecutionByPlannedSessionInput,
) {
  const input = GetLatestSessionExecutionByPlannedSessionInputSchema.parse(rawInput);

  const latest = await getLatestSessionExecutionByPlannedSessionForUser(
    input.plannedSessionId,
    input.userId,
  );

  if (!latest) {
    return null;
  }

  return {
    id: latest.id,
    planned_session_id: latest.planned_session_id,
    completion_status: latest.completion_status,
    performed_at: latest.performed_at,
    actual_duration_min: latest.actual_duration_min,
    notes: latest.notes,
    created_at: latest.created_at,
    unit_execution_count: latest._count.unit_executions,
    is_active: false,
  };
}
