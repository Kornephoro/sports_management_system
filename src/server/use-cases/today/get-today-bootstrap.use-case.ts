import { z } from "zod";

import {
  getActiveSessionExecutionByPlannedSessionForUser,
  getLatestSessionExecutionByPlannedSessionForUser,
  getNextOrRecentPlannedSessionByUser,
  listRecentSessionExecutionsByUser,
} from "@/server/repositories";
import { getStartOfTodayInAppTimeZone } from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetTodayBootstrapInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type GetTodayBootstrapInput = z.input<typeof GetTodayBootstrapInputSchema>;

function mapSessionExecutionSummary(
  execution:
    | {
        id: string;
        planned_session_id: string | null;
        completion_status: string;
        performed_at: Date;
        actual_duration_min: number | null;
        notes: string | null;
        created_at: Date;
        _count: { unit_executions: number };
      }
    | null,
  options?: { isActive?: boolean },
) {
  if (!execution) {
    return null;
  }

  return {
    id: execution.id,
    planned_session_id: execution.planned_session_id,
    completion_status: execution.completion_status,
    performed_at: execution.performed_at,
    actual_duration_min: execution.actual_duration_min,
    notes: execution.notes,
    created_at: execution.created_at,
    unit_execution_count: execution._count.unit_executions,
    is_active: options?.isActive ?? false,
  };
}

export async function getTodayBootstrapUseCase(rawInput: GetTodayBootstrapInput) {
  const input = GetTodayBootstrapInputSchema.parse(rawInput);

  const [plannedEntry, latestGlobalExecutionList] = await Promise.all([
    getNextOrRecentPlannedSessionByUser(
      input.userId,
      getStartOfTodayInAppTimeZone(),
    ),
    listRecentSessionExecutionsByUser(
      input.userId,
      1,
      "summary",
    ),
  ]);
  const latestGlobalExecution = latestGlobalExecutionList[0] ?? null;

  if (!plannedEntry) {
    return {
      plannedEntry: null,
      plannedEntryActiveExecution: null,
      plannedEntryLatestExecution: null,
      latestExecution: latestGlobalExecution,
    };
  }

  const plannedSessionId = plannedEntry.plannedSession.id;
  const [active, latest] = await Promise.all([
    getActiveSessionExecutionByPlannedSessionForUser(plannedSessionId, input.userId),
    getLatestSessionExecutionByPlannedSessionForUser(plannedSessionId, input.userId),
  ]);

  return {
    plannedEntry,
    plannedEntryActiveExecution: mapSessionExecutionSummary(active, { isActive: true }),
    plannedEntryLatestExecution: mapSessionExecutionSummary(latest, { isActive: false }),
    latestExecution: latestGlobalExecution,
  };
}
