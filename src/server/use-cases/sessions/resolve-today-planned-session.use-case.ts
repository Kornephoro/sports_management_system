import { SessionState } from "@prisma/client";
import { z } from "zod";

import {
  getPlannedSessionWithUnitsAndExecutionCountById,
  getPreviousPlannedSessionBeforeSequence,
  hasAnyUnitExecutionForPlannedSession,
  listProgramSessionDateOccupancy,
  listUnresolvedQueueSessionsByProgramFromSequence,
  updatePlannedSessionDatesBatch,
} from "@/server/repositories";
import { applyPlannedSessionSkippedOutcome } from "@/server/services/sessions/planned-session-skip-outcome.service";
import { buildQueueReschedulePlan } from "@/server/services/sessions/planned-session-queue-reschedule.service";
import {
  addDaysDateOnlyUtc,
  getStartOfTodayInAppTimeZone,
  normalizeDateOnlyUtc,
} from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const ResolveTodayActionSchema = z.enum(["today_abandon", "defer_cascade"]);

const ResolveTodayPlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  action: ResolveTodayActionSchema,
  previewOnly: z.boolean().optional(),
});

export type ResolveTodayPlannedSessionInput = z.input<typeof ResolveTodayPlannedSessionInputSchema>;

function isActionableStatus(status: SessionState) {
  return status === "planned" || status === "ready" || status === "partial";
}

export async function resolveTodayPlannedSessionUseCase(
  rawInput: ResolveTodayPlannedSessionInput,
) {
  const input = ResolveTodayPlannedSessionInputSchema.parse(rawInput);
  const today = getStartOfTodayInAppTimeZone();

  const plannedSession = await getPlannedSessionWithUnitsAndExecutionCountById(
    input.plannedSessionId,
    input.userId,
  );
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  if (!isActionableStatus(plannedSession.status)) {
    throw badRequestError("该训练已冻结，不能执行当天分流操作。");
  }

  const hasUnitExecution = await hasAnyUnitExecutionForPlannedSession(input.plannedSessionId);
  if (hasUnitExecution) {
    throw badRequestError("该训练已有执行记录，请继续训练而不是跳过/顺延。");
  }

  const plannedDate = normalizeDateOnlyUtc(plannedSession.session_date);
  if (plannedDate < today) {
    throw badRequestError("该训练已逾期，请在逾期待处理区执行操作。");
  }

  const unresolvedQueue = await listUnresolvedQueueSessionsByProgramFromSequence(
    plannedSession.program_id,
    input.userId,
    0,
  );
  const earliestUnresolved = unresolvedQueue[0];
  if (!earliestUnresolved || earliestUnresolved.id !== input.plannedSessionId) {
    throw badRequestError("请先处理当前最早待处理训练，不能跳过前序训练。");
  }

  if (input.action === "today_abandon") {
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
      action: input.action,
      queueChanged: false as const,
      shiftedCount: 0,
      nextStatus: "skipped" as const,
      plannedSessionId: input.plannedSessionId,
    };
  }

  const queueSessions = await listUnresolvedQueueSessionsByProgramFromSequence(
    plannedSession.program_id,
    input.userId,
    plannedSession.sequence_index,
  );
  if (queueSessions.length === 0) {
    throw badRequestError("未找到可顺延的训练队列。");
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

  const targetDate = addDaysDateOnlyUtc(plannedDate, 1);
  const reflowPlan = buildQueueReschedulePlan({
    queueSessions,
    targetDate,
    occupiedDates: occupancy.map((item) => item.session_date),
    previousSessionDate: previousSession?.session_date ?? null,
  });

  if (input.previewOnly) {
    return {
      action: input.action,
      previewOnly: true as const,
      queueChanged: true as const,
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

  return {
    action: input.action,
    previewOnly: false as const,
    queueChanged: true as const,
    shiftedCount: Math.max(0, reflowPlan.length - 1),
    plannedSessionId: input.plannedSessionId,
    targetDate: reflowPlan[0]?.to_date ?? targetDate,
    preview: reflowPlan.map((item) => ({
      sequenceIndex: item.sequence_index,
      fromDate: item.from_date.toISOString().slice(0, 10),
      toDate: item.to_date.toISOString().slice(0, 10),
    })),
  };
}
