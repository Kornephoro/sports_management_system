import { z } from "zod";

import {
  getPlannedSessionWithUnitsAndExecutionCountById,
  getPreviousPlannedSessionBeforeSequence,
  hasAnyUnitExecutionForPlannedSession,
  listProgramSessionDateOccupancy,
  listUnresolvedQueueSessionsByProgramFromSequence,
  updatePlannedSessionDatesBatch,
} from "@/server/repositories";
import { buildQueueReschedulePlan } from "@/server/services/sessions/planned-session-queue-reschedule.service";
import { normalizeDateOnlyUtc } from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const ReschedulePlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  sessionDate: z.coerce.date(),
});

export type ReschedulePlannedSessionInput = z.input<typeof ReschedulePlannedSessionInputSchema>;

export async function reschedulePlannedSessionUseCase(rawInput: ReschedulePlannedSessionInput) {
  const input = ReschedulePlannedSessionInputSchema.parse(rawInput);
  const targetDate = normalizeDateOnlyUtc(input.sessionDate);

  const plannedSession = await getPlannedSessionWithUnitsAndExecutionCountById(
    input.plannedSessionId,
    input.userId,
  );
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  if (
    plannedSession.status !== "planned" &&
    plannedSession.status !== "ready" &&
    plannedSession.status !== "partial"
  ) {
    throw badRequestError("该训练已冻结，不能改期。");
  }

  const hasUnitExecution = await hasAnyUnitExecutionForPlannedSession(input.plannedSessionId);
  if (hasUnitExecution) {
    throw badRequestError("该训练已有执行记录，不能直接改期。请通过逾期待处理入口操作。");
  }

  const queueSessions = await listUnresolvedQueueSessionsByProgramFromSequence(
    plannedSession.program_id,
    input.userId,
    plannedSession.sequence_index,
  );

  if (queueSessions.length === 0) {
    throw badRequestError("未找到可重排的训练队列。");
  }

  const excludedIds = queueSessions.map((session) => session.id);
  const [occupancy, previousSession] = await Promise.all([
    listProgramSessionDateOccupancy(plannedSession.program_id, input.userId, excludedIds),
    getPreviousPlannedSessionBeforeSequence(
      plannedSession.program_id,
      input.userId,
      plannedSession.sequence_index,
    ),
  ]);

  const plan = buildQueueReschedulePlan({
    queueSessions,
    targetDate,
    occupiedDates: occupancy.map((item) => item.session_date),
    previousSessionDate: previousSession?.session_date ?? null,
  });

  await updatePlannedSessionDatesBatch(
    input.userId,
    plan.map((item) => ({
      id: item.id,
      session_date: item.to_date,
    })),
  );

  return getPlannedSessionWithUnitsAndExecutionCountById(input.plannedSessionId, input.userId);
}
