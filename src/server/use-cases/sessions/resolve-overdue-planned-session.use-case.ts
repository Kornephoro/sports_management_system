import { SessionState } from "@prisma/client";
import { z } from "zod";

import {
  getEarliestOverdueUnresolvedPlannedSessionByProgram,
  getPreviousPlannedSessionBeforeSequence,
  hasAnyUnitExecutionForPlannedSession,
  getPlannedSessionWithUnitsAndExecutionCountById,
  listProgramSessionDateOccupancy,
  listUnresolvedQueueSessionsByProgramFromSequence,
  updatePlannedSessionDatesBatch,
  updatePlannedSessionStatus,
} from "@/server/repositories";
import { applyPlannedSessionSkippedOutcome } from "@/server/services/sessions/planned-session-skip-outcome.service";
import { buildQueueReschedulePlan } from "@/server/services/sessions/planned-session-queue-reschedule.service";
import { getStartOfTodayInAppTimeZone, normalizeDateOnlyUtc } from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const ResolveActionSchema = z.enum([
  "today_makeup",
  "skip",
  "overdue_ignore",
  "reschedule",
  "reschedule_cascade",
]);

const ResolveOverduePlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  action: ResolveActionSchema,
  sessionDate: z.coerce.date().optional(),
  shiftFollowing: z.boolean().optional(),
  previewOnly: z.boolean().optional(),
});

export type ResolveOverduePlannedSessionInput = z.input<
  typeof ResolveOverduePlannedSessionInputSchema
>;

function isActionableStatus(status: SessionState) {
  return status === "planned" || status === "ready" || status === "partial";
}

export async function resolveOverduePlannedSessionUseCase(
  rawInput: ResolveOverduePlannedSessionInput,
) {
  const input = ResolveOverduePlannedSessionInputSchema.parse(rawInput);
  const normalizedAction =
    input.action === "skip"
      ? "overdue_ignore"
      : input.action === "reschedule"
        ? "reschedule_cascade"
        : input.action;

  const plannedSession = await getPlannedSessionWithUnitsAndExecutionCountById(
    input.plannedSessionId,
    input.userId,
  );
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  const today = getStartOfTodayInAppTimeZone();
  const plannedDate = normalizeDateOnlyUtc(plannedSession.session_date);
  const hasUnitExecution = await hasAnyUnitExecutionForPlannedSession(input.plannedSessionId);
  const isOverduePending =
    plannedDate < today &&
    !hasUnitExecution &&
    isActionableStatus(plannedSession.status);

  if (!isOverduePending) {
    throw badRequestError("该训练当前不属于逾期待处理状态。");
  }

  const earliestOverdue = await getEarliestOverdueUnresolvedPlannedSessionByProgram(
    plannedSession.program_id,
    input.userId,
    today,
  );

  if (earliestOverdue && earliestOverdue.id !== input.plannedSessionId) {
    throw badRequestError(
      `请先处理最早逾期训练 #${earliestOverdue.sequence_index}（${earliestOverdue.session_date
        .toISOString()
        .slice(0, 10)}）。`,
    );
  }

  if (normalizedAction === "overdue_ignore") {
    await applyPlannedSessionSkippedOutcome({
      userId: input.userId,
      plannedSessionId: input.plannedSessionId,
      programId: plannedSession.program_id,
      plannedUnits: plannedSession.planned_units.map((unit) => ({
        progress_track_id: unit.progress_track_id,
        unit_template_id: unit.unit_template_id,
      })),
    });

    return {
      action: normalizedAction,
      shiftedCount: 0,
      nextStatus: "skipped" as const,
      plannedSessionId: input.plannedSessionId,
    };
  }

  const targetDate =
    normalizedAction === "today_makeup"
      ? today
      : input.sessionDate
        ? normalizeDateOnlyUtc(input.sessionDate)
        : null;

  if (!targetDate) {
    throw badRequestError("改期时必须提供目标日期。");
  }

  if (targetDate < today) {
    throw badRequestError("目标日期不能早于今天。");
  }

  const queueSessions = await listUnresolvedQueueSessionsByProgramFromSequence(
    plannedSession.program_id,
    input.userId,
    plannedSession.sequence_index,
  );
  const excludedIds = queueSessions.map((session) => session.id);

  const [occupancy, previousSession] = await Promise.all([
    listProgramSessionDateOccupancy(plannedSession.program_id, input.userId, excludedIds),
    getPreviousPlannedSessionBeforeSequence(
      plannedSession.program_id,
      input.userId,
      plannedSession.sequence_index,
    ),
  ]);

  const reflowPlan = buildQueueReschedulePlan({
    queueSessions,
    targetDate,
    occupiedDates: occupancy.map((item) => item.session_date),
    previousSessionDate: previousSession?.session_date ?? null,
  });

  if (input.previewOnly) {
    return {
      action: normalizedAction,
      previewOnly: true as const,
      plannedSessionId: input.plannedSessionId,
      shiftedCount: Math.max(0, reflowPlan.length - 1),
      preview: reflowPlan.map((item) => ({
        sequenceIndex: item.sequence_index,
        fromDate: item.from_date.toISOString().slice(0, 10),
        toDate: item.to_date.toISOString().slice(0, 10),
      })),
    };
  }

  await updatePlannedSessionDatesBatch(
    input.userId,
    reflowPlan.map((item) => ({
      id: item.id,
      session_date: item.to_date,
    })),
  );
  await updatePlannedSessionStatus(input.plannedSessionId, input.userId, "ready");

  return {
    action: normalizedAction,
    previewOnly: false as const,
    shiftedCount: Math.max(0, reflowPlan.length - 1),
    nextStatus: "ready" as const,
    plannedSessionId: input.plannedSessionId,
    targetDate: reflowPlan[0]?.to_date ?? targetDate,
    preview: reflowPlan.map((item) => ({
      sequenceIndex: item.sequence_index,
      fromDate: item.from_date.toISOString().slice(0, 10),
      toDate: item.to_date.toISOString().slice(0, 10),
    })),
  };
}
